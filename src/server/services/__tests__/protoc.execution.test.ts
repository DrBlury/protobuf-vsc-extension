import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { ProtocCompiler } from '../protoc';

jest.mock('child_process');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('protoc process execution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('settles after one failed fallback instead of recursively creating response files', async () => {
    const responseFiles: string[] = [];
    mockSpawn.mockImplementation((_command, args) => {
      const response = args?.find(arg => arg.startsWith('@') || arg.startsWith("'@") || arg.startsWith('"@'));
      if (response) {
        responseFiles.push(response.replace(/^['"]?@/, '').replace(/['"]$/, ''));
      }
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
      });
      setImmediate(() => {
        proc.emit('error', new Error('missing executable'));
        proc.emit('close', -2);
      });
      return proc as unknown as ReturnType<typeof spawn>;
    });
    const compiler = new ProtocCompiler();
    compiler.updateSettings({ path: 'missing-protoc-executable' });
    const result = await compiler.compileFile('/workspace/test.proto');
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('missing executable');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    for (const file of responseFiles) {
      expect(fs.existsSync(file)).toBe(false);
    }
  });

  it('does not let the original failed process close discard successful fallback output', async () => {
    let calls = 0;
    mockSpawn.mockImplementation(() => {
      const first = calls++ === 0;
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
      });
      setImmediate(() => {
        if (first) {
          proc.emit('error', new Error('ENOENT'));
          proc.emit('close', -2);
        } else {
          proc.stdout.emit('data', Buffer.from('compiled'));
          proc.emit('close', 0);
        }
      });
      return proc as unknown as ReturnType<typeof spawn>;
    });
    const result = await new ProtocCompiler().compileFile('/workspace/test.proto');
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('compiled');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});
