/**
 * Tests for buf format provider
 */

import { BufFormatProvider } from '../bufFormat';
import { spawn } from 'child_process';

jest.mock('child_process');

/**
 * Helper to flush promises and advance fake timers
 */
async function flushPromisesAndTimers(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(20);
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('BufFormatProvider', () => {
  let provider: BufFormatProvider;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    provider = new BufFormatProvider();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setBufPath', () => {
    it('should set buf path', () => {
      provider.setBufPath('/usr/bin/buf');
      expect(provider).toBeDefined();
    });
  });

  describe('format', () => {
    it('should format text successfully', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('formatted text')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        stdin: {
          write: jest.fn(),
          end: jest.fn(),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.format('message Test {}');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe('formatted text');
      expect(mockProcess.stdin.write).toHaveBeenCalledWith('message Test {}', 'utf8');
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.format('message Test {}');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should return null on non-zero exit code', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.format('message Test {}');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should include file path when provided', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('formatted')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const formatPromise = provider.format('message Test {}', '/path/to/file.proto');
      await flushPromisesAndTimers();
      await formatPromise;
      expect(mockSpawn).toHaveBeenCalledWith('buf', ['format', '--path', 'file.proto'], expect.any(Object));
    });
  });
});
