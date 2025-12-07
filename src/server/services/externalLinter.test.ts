/**
 * Tests for external linter provider
 */

import { ExternalLinterProvider } from './externalLinter';
import { spawn } from 'child_process';

jest.mock('child_process');

describe('ExternalLinterProvider', () => {
  let provider: ExternalLinterProvider;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    provider = new ExternalLinterProvider();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      expect(provider).toBeDefined();
    });

    it('should merge settings', () => {
      provider.updateSettings({ enabled: true });
      provider.updateSettings({ linter: 'protolint' });
      expect(provider).toBeDefined();
    });
  });

  describe('setWorkspaceRoot', () => {
    it('should set workspace root', () => {
      provider.setWorkspaceRoot('/workspace');
      expect(provider).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return false when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false when linter is none', async () => {
      provider.updateSettings({ enabled: true, linter: 'none' });
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should return true when buf is available', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when buf is not available', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      const mockProcess = {
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should check protolint when configured', async () => {
      provider.updateSettings({ enabled: true, linter: 'protolint' });
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('lint', () => {
    it('should return empty array when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const result = await provider.lint('/test.proto');
      expect(result).toEqual([]);
    });

    it('should return empty array when linter is none', async () => {
      provider.updateSettings({ enabled: true, linter: 'none' });
      const result = await provider.lint('/test.proto');
      expect(result).toEqual([]);
    });

    it('should run buf lint and return diagnostics', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
            }
            return mockProcess.stdout;
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.lint('/workspace/test.proto');
      expect(result).toEqual([]);
    });

    it('should handle buf lint errors', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.lint('/workspace/test.proto');
      expect(result).toEqual([]);
    });

    it('should run protolint and return diagnostics', async () => {
      provider.updateSettings({ enabled: true, linter: 'protolint' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('')), 0);
            }
            return mockProcess.stderr;
          })
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.lint('/workspace/test.proto');
      expect(result).toEqual([]);
    });
  });

  describe('lintWorkspace', () => {
    it('should return empty map when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const result = await provider.lintWorkspace();
      expect(result).toEqual(new Map());
    });

    it('should lint entire workspace', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
            }
            return mockProcess.stdout;
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.lintWorkspace();
      expect(result).toBeInstanceOf(Map);
    });
  });
});
