import * as vscode from 'vscode';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough, Readable } from 'stream';
import * as path from 'path';
import { BinaryDecoderProvider } from '../binaryDecoder';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  createReadStream: jest.fn(),
  readdirSync: jest.fn(),
}));
jest.mock('child_process', () => ({ spawn: jest.fn() }));

describe('BinaryDecoderProvider decoding', () => {
  let provider: BinaryDecoderProvider;
  let process: EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: jest.Mock };

  const decode = (type?: string) =>
    (
      provider as unknown as {
        decodeBinary(
          uri: vscode.Uri,
          messageType?: string
        ): Promise<{ rawDecode: string; isNamed: boolean; decodedAs?: string }>;
      }
    ).decodeBinary(vscode.Uri.file('/workspace/data/request.pb'), type);

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new BinaryDecoderProvider(
      {} as vscode.ExtensionContext,
      { appendLine: jest.fn() } as unknown as vscode.OutputChannel
    );
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from([8, 1]));
    (fs.statSync as jest.Mock).mockReturnValue({ size: 2 });
    (fs.createReadStream as jest.Mock).mockImplementation(() => Readable.from([Buffer.from([8, 1])]));
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({ uri: vscode.Uri.file('/workspace') });
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: (key: string) => (key === 'includes' ? ['${workspaceFolder}/imports', 'relative-includes'] : undefined),
    });
    (spawn as jest.Mock).mockImplementation(() => {
      process = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: jest.fn(),
      });
      const child = process;
      child.stdin.on('finish', () => {
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('value: 1'));
          child.emit('close', 0);
        });
      });
      return child;
    });
  });

  it('passes the selected schema to protoc when the binary lives in another directory', async () => {
    const schema = vscode.Uri.file('/workspace/protos/request.proto');
    (provider as unknown as { messageTypeIndex: Map<string, vscode.Uri> }).messageTypeIndex.set(
      'example.Request',
      schema
    );

    const result = await decode(' example.Request ');

    expect(result).toEqual(
      expect.objectContaining({ rawDecode: 'value: 1', isNamed: true, decodedAs: 'example.Request' })
    );
    expect(spawn).toHaveBeenCalledWith(
      'protoc',
      [
        '-I/workspace/data',
        '-I/workspace',
        `-I${path.resolve('/workspace', 'imports')}`,
        `-I${path.resolve('/workspace', 'relative-includes')}`,
        '-I/workspace/protos',
        '--decode=example.Request',
        schema.fsPath,
      ],
      { cwd: '/workspace/data' }
    );
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('protobuf', schema);
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });

  it('uses the selected schema workspace for include expansion in multi-root projects', async () => {
    const schema = vscode.Uri.file('/second/protos/request.proto');
    (provider as unknown as { messageTypeIndex: Map<string, vscode.Uri> }).messageTypeIndex.set(
      'example.Request',
      schema
    );
    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({ uri: vscode.Uri.file('/second') });

    await decode('example.Request');

    expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(schema);
    expect((spawn as jest.Mock).mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        '-I/second',
        `-I${path.resolve('/second', 'imports')}`,
        `-I${path.resolve('/second', 'relative-includes')}`,
        schema.fsPath,
      ])
    );
  });

  it('reports binary read stream failures without an unhandled stream error', async () => {
    (fs.createReadStream as jest.Mock).mockImplementation(
      () =>
        new Readable({
          read() {
            this.destroy(new Error('binary no longer exists'));
          },
        })
    );

    const result = await decode();

    expect(result.rawDecode).toContain('binary no longer exists');
    expect(result.isNamed).toBe(false);
    expect(process.kill).toHaveBeenCalled();
  });

  it('reports a closed protoc input pipe without an unhandled stream error', async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      process = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: jest.fn(),
      });
      process.stdin.destroy(new Error('write EPIPE'));
      return process;
    });

    const result = await decode();

    expect(result.rawDecode).toMatch(/write EPIPE|closed or destroyed stream/);
    expect(result.isNamed).toBe(false);
  });

  it('rejects oversized binary files before reading or starting protoc', async () => {
    (fs.statSync as jest.Mock).mockReturnValue({ size: 16 * 1024 * 1024 + 1 });

    await expect(decode()).rejects.toThrow('supports files up to 16 MiB');
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('bounds protoc output and terminates the child process', async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      process = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: jest.fn(),
      });
      process.stdin.on('finish', () => {
        process.stdout.emit('data', Buffer.alloc(4 * 1024 * 1024 + 1));
      });
      return process;
    });

    const result = await decode();

    expect(result.rawDecode).toContain('output exceeded 4 MiB');
    expect(process.kill).toHaveBeenCalled();
  });

  it('truncates the hex preview independently of the accepted input size', () => {
    const hexDump = (provider as unknown as { generateHexDump(buffer: Buffer): string }).generateHexDump(
      Buffer.alloc(64 * 1024 + 32)
    );

    expect(hexDump).toContain('hex preview truncated after 64 KiB');
    expect(hexDump).not.toContain('00010000');
  });
});
