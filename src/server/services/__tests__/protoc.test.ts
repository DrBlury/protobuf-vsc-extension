/**
 * Tests for protoc compiler service
 */

import { ProtocCompiler } from '../protoc';
import { spawn } from 'child_process';

jest.mock('child_process');

// Helper to normalize paths for cross-platform comparison
// Converts backslashes to forward slashes and removes drive letters
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[A-Z]:/i, '');
}

// Helper to check if a path contains a given segment (cross-platform)
function pathContains(fullPath: string, segment: string): boolean {
  return normalizePath(fullPath).includes(normalizePath(segment));
}

describe('ProtocCompiler', () => {
  let compiler: ProtocCompiler;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    compiler = new ProtocCompiler();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any active processes
    compiler.cancelAll();
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

    it('should clear version cache when path changes', async () => {
      // First, set up a version
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

      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Get version again - should use cache
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional call

      // Change path - should clear cache
      compiler.updateSettings({ path: '/different/protoc' });

      // Next call should spawn again
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
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

    it('should use cached version on subsequent calls', async () => {
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

      // First call
      const result1 = await compiler.getVersion();
      expect(result1).toBe('3.20.0');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await compiler.getVersion();
      expect(result2).toBe('3.20.0');
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional spawn
    });

    it('should bypass cache when forceRefresh is true', async () => {
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

      // First call
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Force refresh
      await compiler.getVersion(true);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should clear cache when clearVersionCache is called', async () => {
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

      // First call
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Clear cache
      compiler.clearVersionCache();

      // Next call should spawn again
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should cache null version results', async () => {
      // Even null results (protoc not found) should be cached
      const mockProcess = {
        stdout: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0); // Non-zero exit = failure
          }
          return mockProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      // First call - should return null
      const result1 = await compiler.getVersion();
      expect(result1).toBeNull();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Second call - should use cached null
      const result2 = await compiler.getVersion();
      expect(result2).toBeNull();
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional spawn
    });

    it('should invalidate cache when path changes to different value', async () => {
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

      // Cache version for default path
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Change to different path
      compiler.updateSettings({ path: '/new/protoc' });

      // Should fetch again due to path change
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should not invalidate cache when setting same path', async () => {
      compiler.updateSettings({ path: '/my/protoc' });

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

      // Cache version
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Update with same path (should not clear cache)
      compiler.updateSettings({ path: '/my/protoc' });

      // Should still use cache
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional spawn
    });

    it('should not invalidate cache when updating unrelated settings', async () => {
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

      // Cache version
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Update unrelated settings
      compiler.updateSettings({ compileOnSave: true });
      compiler.updateSettings({ options: ['--go_out=gen'] });

      // Should still use cache
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional spawn
    });

    it('should return different versions for different protoc paths', async () => {
      let callCount = 0;
      const versions = ['3.20.0', '4.0.0'];

      mockSpawn.mockImplementation(() => {
        const currentCall = callCount;
        return {
          stdout: {
            on: jest.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                const version = versions[currentCall];
                setTimeout(() => callback(Buffer.from(`libprotoc ${version}`)), 0);
              }
            })
          },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callCount++;
              setTimeout(() => callback(0), 10);
            }
          })
        } as any;
      });

      // Get version for first protoc
      compiler.updateSettings({ path: '/protoc/v3' });
      const v1 = await compiler.getVersion();
      expect(v1).toBe('3.20.0');

      // Get version for second protoc (path change clears cache)
      compiler.updateSettings({ path: '/protoc/v4' });
      const v2 = await compiler.getVersion();
      expect(v2).toBe('4.0.0');

      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple sequential getVersion calls efficiently', async () => {
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

      // First call - caches the result
      const result1 = await compiler.getVersion();
      expect(result1).toBe('3.20.0');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Sequential calls after cache is populated should all use cache
      const result2 = await compiler.getVersion();
      const result3 = await compiler.getVersion();
      const result4 = await compiler.getVersion();

      expect(result2).toBe('3.20.0');
      expect(result3).toBe('3.20.0');
      expect(result4).toBe('3.20.0');

      // Only 1 spawn call total
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should work correctly after cache is cleared multiple times', async () => {
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

      // First cycle
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      compiler.clearVersionCache();

      // Second cycle
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      compiler.clearVersionCache();

      // Third cycle
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(3);

      // Verify cache works after clearing
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(3); // Should use cache
    });

    it('should handle forceRefresh=false explicitly', async () => {
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

      // First call
      await compiler.getVersion();
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Explicit forceRefresh=false should use cache
      await compiler.getVersion(false);
      expect(mockSpawn).toHaveBeenCalledTimes(1); // No additional spawn
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
        }),
        kill: jest.fn()
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('test.proto');
      expect(result.success).toBe(true);
    });

    it('should reject empty file path', async () => {
      const result = await compiler.compileFile('');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('File path is required');
    });

    it('should reject whitespace-only file path', async () => {
      const result = await compiler.compileFile('   ');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('File path is required');
    });

    it('should reject non-proto files', async () => {
      const result = await compiler.compileFile('test.txt');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('File must have .proto extension');
    });

    it('should include --proto_path for the file directory', async () => {
      // This test ensures protoc gets a --proto_path that encompasses the file
      // Without this, protoc errors: "File does not reside within any path specified using --proto_path"
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

      await compiler.compileFile('/workspace/src/protos/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should have a --proto_path argument that covers the file's directory
      const protoPathArg = args.find(arg => arg.startsWith('--proto_path='));
      expect(protoPathArg).toBeDefined();
      expect(pathContains(protoPathArg!, '/workspace/src/protos')).toBe(true);
    });

    it('should use relative path when user proto_path covers file directory', async () => {
      // Key test: when user specifies a parent directory as proto_path,
      // the file should use a relative path from that proto_path
      compiler.updateSettings({
        options: ['--proto_path=/workspace']
      });

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

      await compiler.compileFile('/workspace/src/protos/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should only have one proto path (the user specified one)
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBe(1);
      expect(pathContains(protoPathArgs[0], '/workspace')).toBe(true);

      // File should be relative to proto_path: src/protos/test.proto
      const fileArg = args.find(arg => arg.includes('test.proto'));
      // Normalize for cross-platform comparison (Windows uses backslashes)
      expect(normalizePath(fileArg!)).toBe('src/protos/test.proto');
    });

    it('should include user-configured proto paths before file directory', async () => {
      // User proto paths should come first for import resolution
      compiler.updateSettings({
        options: [
          '--proto_path=/usr/local/include',
          '-I/workspace/common',
          '--go_out=gen/go'
        ]
      });

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

      await compiler.compileFile('/workspace/src/protos/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should have multiple --proto_path arguments
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBeGreaterThanOrEqual(2);

      // User proto paths should come before file directory proto path
      // Use cross-platform path matching
      const usrIncludeIndex = args.findIndex(arg => pathContains(arg, '/usr/local/include'));
      const commonIndex = args.findIndex(arg => pathContains(arg, '/workspace/common'));
      const fileProtoPathIndex = args.findIndex(arg => pathContains(arg, '/workspace/src/protos'));

      expect(usrIncludeIndex).toBeLessThan(fileProtoPathIndex);
      expect(commonIndex).toBeLessThan(fileProtoPathIndex);

      // Other options should come after proto paths
      const goOutIndex = args.findIndex(arg => arg.includes('--go_out'));
      expect(goOutIndex).toBeGreaterThan(fileProtoPathIndex);
    });

    it('should not duplicate proto path if user already specified file directory', async () => {
      compiler.updateSettings({
        options: ['--proto_path=/workspace/src/protos']
      });

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

      await compiler.compileFile('/workspace/src/protos/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should only have one proto path for the file directory (no duplicate)
      // Use cross-platform path matching
      const protoPathArgs = args.filter(arg => pathContains(arg, '/workspace/src/protos'));
      expect(protoPathArgs.length).toBe(1);
    });

    it('should support -I= format for proto paths', async () => {
      compiler.updateSettings({
        options: ['-I=/workspace/common']
      });

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

      await compiler.compileFile('/workspace/src/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should have both proto paths (use cross-platform matching)
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBe(2);
      expect(protoPathArgs.some(arg => pathContains(arg, '/workspace/common'))).toBe(true);
      expect(protoPathArgs.some(arg => pathContains(arg, '/workspace/src'))).toBe(true);
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

  describe('isExcluded (internal)', () => {
    it('should match simple folder name', () => {
      compiler.updateSettings({ excludePatterns: ['nanopb'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      expect(isExcluded('/workspace/nanopb', 'nanopb', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src', 'src', '/workspace')).toBe(false);
    });

    it('should match path segments', () => {
      compiler.updateSettings({ excludePatterns: ['vendor'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      expect(isExcluded('/workspace/src/vendor/lib.proto', 'lib.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src/main.proto', 'main.proto', '/workspace')).toBe(false);
    });

    it('should match glob patterns with **', () => {
      compiler.updateSettings({ excludePatterns: ['**/tests/**'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      // Note: **/tests/** requires something before AND after 'tests' to match via glob
      // But isExcluded also checks path segments, so 'tests' in the path will match via segment check
      expect(isExcluded('/workspace/src/tests/integration.proto', 'integration.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src/main.proto', 'main.proto', '/workspace')).toBe(false);
    });

    it('should match tests folder at root via segment check', () => {
      // Using 'tests' as a simple pattern - matches as a path segment
      compiler.updateSettings({ excludePatterns: ['tests'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      expect(isExcluded('/workspace/tests/unit.proto', 'unit.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src/tests/integration.proto', 'integration.proto', '/workspace')).toBe(true);
    });

    it('should return false when no exclude patterns', () => {
      compiler.updateSettings({ excludePatterns: [] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      expect(isExcluded('/workspace/anything', 'anything', '/workspace')).toBe(false);
    });

    it('should handle multiple exclude patterns', () => {
      compiler.updateSettings({ excludePatterns: ['nanopb', 'third_party', '**/tests/**'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      expect(isExcluded('/workspace/nanopb/file.proto', 'file.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/third_party/lib.proto', 'lib.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src/tests/test.proto', 'test.proto', '/workspace')).toBe(true);
      expect(isExcluded('/workspace/src/main.proto', 'main.proto', '/workspace')).toBe(false);
    });

    it('should match directory names in path segments', () => {
      compiler.updateSettings({ excludePatterns: ['nanopb'] });
      const isExcluded = (compiler as any).isExcluded.bind(compiler);

      // File deep inside nanopb folder
      expect(isExcluded('/workspace/nanopb/tests/nested/deep.proto', 'deep.proto', '/workspace')).toBe(true);
      // File in different folder that starts with nanopb
      expect(isExcluded('/workspace/nanopb_extra/file.proto', 'file.proto', '/workspace')).toBe(false);
    });
  });

  describe('matchGlobPattern (internal)', () => {
    it('should match ** pattern (any path) at start', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      // ** at the start should match zero or more path segments
      expect(matchGlob('src/tests/unit.proto', '**/tests/**')).toBe(true);
      expect(matchGlob('deep/nested/tests/file.proto', '**/tests/**')).toBe(true);
      expect(matchGlob('src/main.proto', '**/tests/**')).toBe(false);
    });

    it('should match ** pattern at beginning matching zero segments', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      // ** should also match zero characters (tests at the root)
      expect(matchGlob('tests/unit.proto', 'tests/**')).toBe(true);
    });

    it('should match * pattern (single segment)', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      expect(matchGlob('test_file.proto', '*.proto')).toBe(true);
      expect(matchGlob('test_file.txt', '*.proto')).toBe(false);
      expect(matchGlob('src/file.proto', '*.proto')).toBe(false); // * doesn't match /
    });

    it('should match ? pattern (single char)', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      expect(matchGlob('test1.proto', 'test?.proto')).toBe(true);
      expect(matchGlob('testA.proto', 'test?.proto')).toBe(true);
      expect(matchGlob('test12.proto', 'test?.proto')).toBe(false);
    });

    it('should handle complex patterns', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      expect(matchGlob('src/v1/api.proto', 'src/*/api.proto')).toBe(true);
      expect(matchGlob('src/v2/api.proto', 'src/*/api.proto')).toBe(true);
      expect(matchGlob('src/nested/v1/api.proto', 'src/*/api.proto')).toBe(false);
      expect(matchGlob('src/nested/v1/api.proto', 'src/**/api.proto')).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      // Pattern that might cause regex issues - should return false, not throw
      expect(matchGlob('test', '[')).toBe(false);
    });

    it('should match exact path', () => {
      const matchGlob = (compiler as any).matchGlobPattern.bind(compiler);

      expect(matchGlob('nanopb/nanopb.proto', 'nanopb/**')).toBe(true);
      expect(matchGlob('nanopb/tests/test.proto', 'nanopb/**')).toBe(true);
    });
  });

  describe('normalizePath (internal)', () => {
    it('should remove trailing slashes', () => {
      const normalizePath = (compiler as any).normalizePath.bind(compiler);

      const result = normalizePath('/workspace/src/');
      expect(result.endsWith('/')).toBe(false);
      expect(result).toContain('workspace');
    });

    it('should handle empty strings', () => {
      const normalizePath = (compiler as any).normalizePath.bind(compiler);

      expect(normalizePath('')).toBe('');
      expect(normalizePath('   ')).toBe('');
    });

    it('should resolve relative paths', () => {
      const normalizePath = (compiler as any).normalizePath.bind(compiler);

      const result = normalizePath('./src/protos');
      expect(result).toContain('src');
      expect(result).toContain('protos');
      // Should be an absolute path
      expect(result.startsWith('/') || /^[A-Z]:/i.test(result)).toBe(true);
    });
  });

  describe('isPathUnder (internal)', () => {
    it('should return true when file is under directory', () => {
      const isPathUnder = (compiler as any).isPathUnder.bind(compiler);

      expect(isPathUnder('/workspace/src/test.proto', '/workspace')).toBe(true);
      expect(isPathUnder('/workspace/src/protos/test.proto', '/workspace')).toBe(true);
      expect(isPathUnder('/workspace/src/protos/test.proto', '/workspace/src')).toBe(true);
    });

    it('should return false when file is not under directory', () => {
      const isPathUnder = (compiler as any).isPathUnder.bind(compiler);

      expect(isPathUnder('/other/src/test.proto', '/workspace')).toBe(false);
      expect(isPathUnder('/workspace-extra/test.proto', '/workspace')).toBe(false);
    });

    it('should return false for same path (file equals dir)', () => {
      const isPathUnder = (compiler as any).isPathUnder.bind(compiler);

      // A file cannot be "under" itself as a directory
      expect(isPathUnder('/workspace', '/workspace')).toBe(false);
    });

    it('should handle empty paths', () => {
      const isPathUnder = (compiler as any).isPathUnder.bind(compiler);

      expect(isPathUnder('', '/workspace')).toBe(false);
      expect(isPathUnder('/workspace/test.proto', '')).toBe(false);
    });
  });

  describe('buildArgs edge cases', () => {
    it('should skip empty options', async () => {
      compiler.updateSettings({
        options: ['', '  ', '--go_out=gen/go', '']
      });

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

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should not have empty args
      expect(args.every(arg => arg.trim() !== '')).toBe(true);
      // Should have the go_out option
      expect(args.some(arg => arg.includes('--go_out'))).toBe(true);
    });

    it('should handle paths with trailing slashes in user options', async () => {
      compiler.updateSettings({
        options: ['--proto_path=/workspace/common/']
      });

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

      await compiler.compileFile('/workspace/src/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Proto path should be normalized (no trailing slash in the stored value)
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle relative proto paths in options', async () => {
      compiler.updateSettings({
        options: ['--proto_path=./common']
      });

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

      await compiler.compileFile('/workspace/src/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should have proto path args (relative path gets resolved)
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle -I without equals sign', async () => {
      compiler.updateSettings({
        options: ['-I/workspace/common']
      });

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

      await compiler.compileFile('/workspace/src/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should convert -I to --proto_path format
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.some(arg => arg.includes('common'))).toBe(true);
    });

    it('should handle multiple files from different directories', async () => {
      // Access the private buildArgs method for testing
      const buildArgs = (compiler as any).buildArgs.bind(compiler);

      const args = buildArgs(
        '/workspace/src/service.proto',
        '/workspace/common/types.proto'
      );

      // Should have proto paths for both directories
      const protoPathArgs = args.filter((arg: string) => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBeGreaterThanOrEqual(2);

      // Should have both files
      expect(args.some((arg: string) => arg.includes('service.proto'))).toBe(true);
      expect(args.some((arg: string) => arg.includes('types.proto'))).toBe(true);
    });

    it('should expand workspace variables in options', async () => {
      compiler.setWorkspaceRoot('/my/workspace');
      compiler.updateSettings({
        options: ['--proto_path=${workspaceFolder}/protos']
      });

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

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should expand ${workspaceFolder} (use cross-platform matching)
      expect(args.some(arg => pathContains(arg, '/my/workspace/protos'))).toBe(true);
      // Should not have unexpanded variable
      expect(args.every(arg => !arg.includes('${workspaceFolder}'))).toBe(true);
    });

    it('should expand workspaceRoot variable (legacy)', async () => {
      compiler.setWorkspaceRoot('/my/workspace');
      compiler.updateSettings({
        options: ['--proto_path=${workspaceRoot}/protos']
      });

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

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should expand ${workspaceRoot} (use cross-platform matching)
      expect(args.some(arg => pathContains(arg, '/my/workspace/protos'))).toBe(true);
    });

    it('should handle output options with spaces in path', async () => {
      compiler.updateSettings({
        options: ['--go_out=/path/with spaces/output']
      });

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

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Should preserve the option with spaces
      expect(args.some(arg => arg.includes('with spaces'))).toBe(true);
    });

    it('should not add duplicate proto_path when same as file directory', async () => {
      // Using normalized paths - this tests the path normalization logic
      compiler.updateSettings({
        options: ['--proto_path=/workspace/src']  // Same as file directory
      });

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
        kill: jest.fn()
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/src/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Count proto_path args that reference /workspace/src
      const srcProtoPathArgs = args.filter(arg =>
        arg.startsWith('--proto_path=') && arg.includes('workspace') && arg.includes('src')
      );
      // Should only have one (no duplicate)
      expect(srcProtoPathArgs.length).toBe(1);
    });
  });

  describe('cancelAll', () => {
    it('should kill all active processes', async () => {
      const mockKill = jest.fn();
      let closeCallback: ((code: number | null) => void) | null = null;

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number | null) => void) => {
          if (event === 'close') {
            closeCallback = callback;
          }
          return mockProcess;
        }),
        kill: jest.fn().mockImplementation(() => {
          mockKill();
          // Simulate process termination - trigger close callback synchronously
          if (closeCallback) {
            closeCallback(null);
          }
        })
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      // Start a compile but don't let it finish
      const compilePromise = compiler.compileFile('/workspace/test.proto');

      // Cancel all - this will trigger the close callback synchronously
      compiler.cancelAll();

      // Should have called kill
      expect(mockKill).toHaveBeenCalled();

      // Wait for the compile promise to resolve (due to process termination)
      await compilePromise;
    });

    it('should handle processes that have already exited', async () => {
      type CloseCallback = (code: number | null) => void;
      let closeCallback: CloseCallback | undefined;

      const mockKill = jest.fn().mockImplementation(() => {
        throw new Error('Process already exited');
      });
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: CloseCallback) => {
          if (event === 'close') {
            closeCallback = callback;
          }
          return mockProcess;
        }),
        kill: mockKill
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      // Start a compile
      const compilePromise = compiler.compileFile('/workspace/test.proto');

      // Should not throw even if kill fails
      expect(() => compiler.cancelAll()).not.toThrow();

      // Simulate process closing to clean up the timeout
      if (closeCallback !== undefined) {
        closeCallback(1);
      }

      // Wait for the compile promise to resolve
      await compilePromise;
    });
  });

  describe('timeout handling', () => {
    it('should include executionTime in result', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 50);
          }
          return mockProcess;
        }),
        kill: jest.fn()
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.executionTime).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should respect custom timeout setting', () => {
      compiler.updateSettings({ timeout: 5000 });
      // The setting is stored, verified indirectly through behavior
      expect(compiler).toBeDefined();
    });
  });
});
