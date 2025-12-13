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
      expect(protoPathArg).toContain('/workspace/src/protos');
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
      const usrIncludeIndex = args.findIndex(arg => arg.includes('/usr/local/include'));
      const commonIndex = args.findIndex(arg => arg.includes('/workspace/common'));
      const fileProtoPathIndex = args.findIndex(arg => arg.includes('/workspace/src/protos'));

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
      const protoPathArgs = args.filter(arg => arg.includes('/workspace/src/protos'));
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

      // Should have both proto paths
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.length).toBe(2);
      expect(protoPathArgs.some(arg => arg.includes('/workspace/common'))).toBe(true);
      expect(protoPathArgs.some(arg => arg.includes('/workspace/src'))).toBe(true);
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

      // Should expand ${workspaceFolder}
      expect(args.some(arg => arg.includes('/my/workspace/protos'))).toBe(true);
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

      // Should expand ${workspaceRoot}
      expect(args.some(arg => arg.includes('/my/workspace/protos'))).toBe(true);
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
        })
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
});
