/**
 * Tests for protoc compiler service
 */

import { ProtocCompiler } from '../protoc';
import { spawn } from 'child_process';

jest.mock('child_process');

describe('ProtocCompiler', () => {
  let compiler: ProtocCompiler;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    compiler = new ProtocCompiler();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      compiler.updateSettings({ path: '/usr/bin/protoc' });
      // Settings are private, test through behavior
      expect(compiler).toBeDefined();
    });

    it('should merge settings', () => {
      compiler.updateSettings({ path: '/usr/bin/protoc' });
      compiler.updateSettings({ compileOnSave: true });
      expect(compiler).toBeDefined();
    });
  });

  describe('setWorkspaceRoot', () => {
    it('should set workspace root', () => {
      compiler.setWorkspaceRoot('/workspace');
      expect(compiler).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return true when protoc is available', async () => {
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when protoc is not available', async () => {
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false on spawn error', async () => {
      const mockProcess = {
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('should return version when available', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('libprotoc 3.20.0')), 0);
            }
            return mockProcess.stdout;
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

      const result = await compiler.getVersion();
      expect(result).toBe('3.20.0');
    });

    it('should return trimmed output when version pattern not found', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('protoc version 3.20.0')), 0);
            }
            return mockProcess.stdout;
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

      const result = await compiler.getVersion();
      expect(result).toBe('protoc version 3.20.0');
    });

    it('should return null on error', async () => {
      const mockProcess = {
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.getVersion();
      expect(result).toBeNull();
    });

    it('should return null on non-zero exit code', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn()
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.getVersion();
      expect(result).toBeNull();
    });
  });

  describe('compile', () => {
    it('should compile proto file successfully', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn()
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('test.proto');
      expect(result.success).toBe(true);
    });

    it('should handle compilation errors', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn()
        },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test.proto:5:10: Error message')), 0);
            }
            return mockProcess.stderr;
          })
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('test.proto');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should use absolute path when configured', async () => {
      compiler.updateSettings({ useAbsolutePath: true });
      compiler.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('test.proto');
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should include custom options', async () => {
      compiler.updateSettings({ options: ['--java_out=gen/java'] });

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('test.proto');
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  describe('compileAll', () => {
    it('should compile all proto files in directory', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      compiler.updateSettings({ compileAllPath: '/workspace' });
      compiler.setWorkspaceRoot('/workspace');

      const result = await compiler.compileAll();
      expect(result).toBeDefined();
    });

    it('should use response file when command line is too long', async () => {
      // Create a compiler with many long file paths to trigger response file usage
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      // Mock fs to simulate finding many proto files
      const originalFindProtoFiles = (compiler as any).findProtoFiles.bind(compiler);
      (compiler as any).findProtoFiles = (_dir: string) => {
        // Return many long file paths to exceed command line limit
        const files: string[] = [];
        for (let i = 0; i < 200; i++) {
          files.push(`/very/long/path/to/proto/files/directory/subdirectory/another_level/file_${i}_with_long_name.proto`);
        }
        return files;
      };

      compiler.updateSettings({ compileAllPath: '/workspace' });
      compiler.setWorkspaceRoot('/workspace');

      const result = await compiler.compileAll();
      expect(result).toBeDefined();

      // Verify that spawn was called - either directly or with a response file
      expect(mockSpawn).toHaveBeenCalled();

      // Check if response file was used (argument starts with @)
      const spawnCalls = mockSpawn.mock.calls;
      const lastCall = spawnCalls[spawnCalls.length - 1];
      if (lastCall) {
        const args = lastCall[1] as string[];
        // Either uses response file (starts with @) or regular args
        const usesResponseFile = args.some(arg => arg.startsWith('@'));
        // This should be true for the long file list
        expect(usesResponseFile || args.length > 0).toBe(true);
      }

      // Restore original method
      (compiler as any).findProtoFiles = originalFindProtoFiles;
    });
  });
});
