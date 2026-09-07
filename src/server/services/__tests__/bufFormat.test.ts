import { EventEmitter } from 'events';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { BufFormatProvider } from '../bufFormat';

jest.mock('child_process');

function processMock() {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
}

describe('BufFormatProvider', () => {
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
  beforeEach(() => jest.clearAllMocks());

  it('formats the unsaved buffer through an isolated temporary file and removes it', async () => {
    const source = 'syntax = "proto3"; message Unsaved { string value = 1; }';
    let inputPath = '';
    mockSpawn.mockImplementation((_command, args) => {
      inputPath = args![1]!;
      expect(args![0]).toBe('format');
      expect(fs.readFileSync(inputPath, 'utf8')).toBe(source);
      const proc = processMock();
      setImmediate(() => {
        proc.stdout.emit('data', Buffer.from('formatted'));
        proc.emit('close', 0);
      });
      return proc as ReturnType<typeof spawn>;
    });
    const provider = new BufFormatProvider();
    provider.setBufPath('/tools with spaces/buf');
    expect(await provider.format(source, '/project/unsaved.proto')).toBe('formatted');
    expect(mockSpawn).toHaveBeenCalledWith(
      '/tools with spaces/buf',
      ['format', inputPath],
      expect.objectContaining({ cwd: '/project' })
    );
    expect(fs.existsSync(inputPath)).toBe(false);
  });

  it('decodes UTF-8 after combining output chunks', async () => {
    mockSpawn.mockImplementation(() => {
      const proc = processMock();
      setImmediate(() => {
        const bytes = Buffer.from('// €');
        proc.stdout.emit('data', bytes.subarray(0, 4));
        proc.stdout.emit('data', bytes.subarray(4));
        proc.emit('close', 0);
      });
      return proc as ReturnType<typeof spawn>;
    });
    expect(await new BufFormatProvider().format('// €')).toBe('// €');
  });

  it.each(['error', 'close'])('cleans up and returns null after %s', async event => {
    let inputPath = '';
    mockSpawn.mockImplementation((_command, args) => {
      inputPath = args![1]!;
      const proc = processMock();
      setImmediate(() => proc.emit(event, event === 'error' ? new Error('ENOENT') : 1));
      return proc as ReturnType<typeof spawn>;
    });
    expect(await new BufFormatProvider().format('message Test {}')).toBeNull();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(inputPath)).toBe(false);
  });
});
