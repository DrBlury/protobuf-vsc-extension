/**
 * Branch coverage tests for protoc compiler service
 * Tests specific branches and edge cases not covered by main tests
 */

import { ProtocCompiler } from '../protoc';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process');
jest.mock('fs');

describe('ProtocCompiler Branch Coverage', () => {
  let compiler: ProtocCompiler;
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    compiler = new ProtocCompiler();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    mockFs = fs as jest.Mocked<typeof fs>;
    jest.clearAllMocks();

    // Default mock for fs.existsSync
    mockFs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    compiler.cancelAll();
  });

  describe('isAvailable fallback to shell', () => {
    it('should fallback to shell when spawn error occurs and useShell is false', async () => {
      // First spawn fails with error
      let firstCall = true;
      mockSpawn.mockImplementation(() => {
        if (firstCall) {
          firstCall = false;
          const errorProcess = {
            on: jest.fn((event: string, callback: () => void) => {
              if (event === 'error') {
                setTimeout(() => callback(), 0);
              }
              return errorProcess;
            }),
          } as any;
          return errorProcess;
        }
        // Second spawn (with shell) succeeds
        const successProcess = {
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 0);
            }
            return successProcess;
          }),
        } as any;
        return successProcess;
      });

      const result = await compiler.isAvailable();
      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should return false when both spawn attempts fail', async () => {
      // Both spawns fail with error
      mockSpawn.mockImplementation(() => {
        const errorProcess = {
          on: jest.fn((event: string, callback: () => void) => {
            if (event === 'error') {
              setTimeout(() => callback(), 0);
            }
            return errorProcess;
          }),
        } as any;
        return errorProcess;
      });

      const result = await compiler.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getVersion shell fallback', () => {
    it('should fallback to shell when initial spawn fails', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First spawn fails with error
          const errorProcess = {
            on: jest.fn((event: string, callback: () => void) => {
              if (event === 'error') {
                setTimeout(() => callback(), 0);
              }
              return errorProcess;
            }),
          } as any;
          return errorProcess;
        }
        // Second spawn (with shell) succeeds
        const successProcess = {
          stdout: {
            on: jest.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('libprotoc 3.21.0')), 0);
              }
              return successProcess.stdout;
            }),
          },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
            return successProcess;
          }),
        } as any;
        return successProcess;
      });

      const result = await compiler.getVersion();
      expect(result).toBe('3.21.0');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should return null when shell fallback also fails', async () => {
      mockSpawn.mockImplementation(() => {
        const errorProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: () => void) => {
            if (event === 'error') {
              setTimeout(() => callback(), 0);
            }
            return errorProcess;
          }),
        } as any;
        return errorProcess;
      });

      const result = await compiler.getVersion();
      expect(result).toBeNull();
    });

    it('should return null when shell fallback exits with non-zero code', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First spawn fails with error
          const errorProcess = {
            on: jest.fn((event: string, callback: () => void) => {
              if (event === 'error') {
                setTimeout(() => callback(), 0);
              }
              return errorProcess;
            }),
          } as any;
          return errorProcess;
        }
        // Second spawn exits with non-zero code
        const failProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(1), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const result = await compiler.getVersion();
      expect(result).toBeNull();
    });
  });

  describe('script detection', () => {
    it('should detect shell script by extension', async () => {
      compiler.updateSettings({ path: '/path/to/protoc.sh' });

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/protoc.sh', ['--version'], { shell: true });
    });

    it('should detect batch file on Windows', async () => {
      compiler.updateSettings({ path: 'protoc.bat' });

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      expect(mockSpawn).toHaveBeenCalledWith('protoc.bat', ['--version'], { shell: true });
    });

    it('should detect python script', async () => {
      compiler.updateSettings({ path: '/path/to/protoc.py' });

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/protoc.py', ['--version'], { shell: true });
    });

    it('should detect shebang in extensionless file', async () => {
      compiler.updateSettings({ path: '/path/to/protoc-wrapper' });

      // Mock fs for shebang detection
      mockFs.existsSync.mockReturnValue(true);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockImplementation((_fd: number, buffer: any) => {
        const shebang = '#!/bin/bash\necho hello';
        buffer.write(shebang);
        return shebang.length;
      });
      mockFs.closeSync.mockReturnValue(undefined);

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/protoc-wrapper', ['--version'], { shell: true });
    });

    it('should not use shell for regular executable', async () => {
      compiler.updateSettings({ path: '/usr/bin/protoc' });

      mockFs.existsSync.mockReturnValue(false);

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');

      // Should be called with shell: false for regular executable
      expect(mockSpawn).toHaveBeenCalled();
      const call = mockSpawn.mock.calls[0];
      expect(call[2]).toMatchObject({ shell: false });
    });
  });

  describe('hasShebang edge cases', () => {
    it('should return false for non-existent file', async () => {
      compiler.updateSettings({ path: '/nonexistent/protoc' });
      mockFs.existsSync.mockReturnValue(false);

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      // Should not use shell since file doesn't exist
      expect(mockSpawn).toHaveBeenCalledWith('/nonexistent/protoc', ['--version'], { shell: false });
    });

    it('should return false for file with less than 2 bytes', async () => {
      compiler.updateSettings({ path: '/path/to/tiny-file' });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(1); // Only 1 byte read
      mockFs.closeSync.mockReturnValue(undefined);

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      // Should not use shell since file is too small
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/tiny-file', ['--version'], { shell: false });
    });

    it('should handle fs errors gracefully', async () => {
      compiler.updateSettings({ path: '/path/to/unreadable' });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.openSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      // Should not use shell since fs read failed
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/unreadable', ['--version'], { shell: false });
    });

    it('should return false for file without shebang', async () => {
      compiler.updateSettings({ path: '/path/to/binary' });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockImplementation((_fd: number, buffer: any) => {
        const content = 'ELF binary content';
        buffer.write(content);
        return content.length;
      });
      mockFs.closeSync.mockReturnValue(undefined);

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.isAvailable();
      // Should not use shell since no shebang
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/binary', ['--version'], { shell: false });
    });
  });

  describe('quotePathIfNeeded', () => {
    it('should quote paths with double quotes', async () => {
      compiler.updateSettings({
        options: ['--go_out=/path/with"quote/output'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();

      const args = mockSpawn.mock.calls[0][1] as string[];
      // Should have escaped quotes
      const goOutArg = args.find(arg => arg.includes('go_out'));
      expect(goOutArg).toBeDefined();
    });

    it('should quote paths with single quotes', async () => {
      compiler.updateSettings({
        options: ["--go_out=/path/with'apostrophe/output"],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should allow parent traversal in output paths', async () => {
      compiler.updateSettings({
        options: ['--go_out=../gen'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should allow paths with parentheses', async () => {
      compiler.updateSettings({
        options: ['--go_out=/path/Program Files (x86)/out'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');
      const args = mockSpawn.mock.calls[0][1] as string[];
      const goOutArg = args.find(arg => arg.startsWith('--go_out='));
      expect(goOutArg).toBeDefined();
      expect(goOutArg).toMatch(/--go_out=".*Program Files \(x86\).*"/);
    });
  });

  describe('compileAll edge cases', () => {
    it('should return success with message when no proto files found', async () => {
      compiler.setWorkspaceRoot('/empty-workspace');
      compiler.updateSettings({ compileAllPath: '/empty-workspace' });

      // Mock findProtoFiles to return empty array
      const originalFindProtoFiles = (compiler as any).findProtoFiles.bind(compiler);
      (compiler as any).findProtoFiles = () => [];

      const result = await compiler.compileAll();

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('No .proto files found');
      expect(result.fileCount).toBe(0);

      // Restore
      (compiler as any).findProtoFiles = originalFindProtoFiles;
    });

    it('should include fileCount in result', async () => {
      compiler.setWorkspaceRoot('/workspace');
      compiler.updateSettings({ compileAllPath: '/workspace' });

      // Mock findProtoFiles
      (compiler as any).findProtoFiles = () => ['/workspace/a.proto', '/workspace/b.proto'];

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileAll();
      expect(result.fileCount).toBe(2);
    });
  });

  describe('parseErrors with suggestions', () => {
    it('should suggest proto_path for google/protobuf import errors', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(
                () => callback(Buffer.from('test.proto:1:1: Import "google/protobuf/timestamp.proto" was not found.')),
                0
              );
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.success).toBe(false);
      // Should include a suggestion about google well-known types
      const suggestion = result.errors.find(e => e.message.includes('Tip:'));
      expect(suggestion).toBeDefined();
      expect(suggestion?.message).toContain('Google well-known types');
    });

    it('should suggest googleapis for google/type import errors', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(
                () => callback(Buffer.from('test.proto:1:1: Import "google/type/money.proto" was not found.')),
                0
              );
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.success).toBe(false);
      const suggestion = result.errors.find(e => e.message.includes('Tip:'));
      expect(suggestion).toBeDefined();
      expect(suggestion?.message).toContain('Google common types');
    });

    it('should suggest googleapis for google/api import errors', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(
                () => callback(Buffer.from('test.proto:1:1: Import "google/api/annotations.proto" was not found.')),
                0
              );
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.success).toBe(false);
      const suggestion = result.errors.find(e => e.message.includes('Tip:'));
      expect(suggestion).toBeDefined();
      expect(suggestion?.message).toContain('Google API types');
    });

    it('should suggest proto_path for generic import not found', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test.proto:1:1: File not found: common/types.proto')), 0);
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.success).toBe(false);
      const suggestion = result.errors.find(e => e.message.includes('Tip:'));
      expect(suggestion).toBeDefined();
      expect(suggestion?.message).toContain('--proto_path');
    });

    it('should suggest for type not defined errors', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test.proto:5:10: "MyType" is not defined')), 0);
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.success).toBe(false);
      const suggestion = result.errors.find(e => e.message.includes('Tip:'));
      expect(suggestion).toBeDefined();
      expect(suggestion?.message).toContain('Type not found');
    });

    it('should parse warning severity from error message', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test.proto:5:10: warning: deprecated field usage')), 0);
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      const warningError = result.errors.find(e => e.severity === 'warning');
      expect(warningError).toBeDefined();
    });

    it('should parse errors without column number', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test.proto:10: Missing semicolon')), 0);
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors.find(e => e.message.includes('Missing semicolon'));
      expect(error).toBeDefined();
      expect(error?.line).toBe(10);
      expect(error?.column).toBe(1); // Default column
    });
  });

  describe('validate', () => {
    it('should validate proto file without output directive', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.validate('/workspace/test.proto');
      expect(result.success).toBe(true);

      const args = mockSpawn.mock.calls[0][1] as string[];
      // Should have descriptor_set_out for validation
      expect(args.some(arg => arg.includes('descriptor_set_out'))).toBe(true);
    });

    it('should use user proto paths in validation', async () => {
      const testPath = path.resolve('/usr/local/include');
      compiler.updateSettings({
        options: [`--proto_path=${testPath}`],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.validate('/workspace/test.proto');

      const args = mockSpawn.mock.calls[0][1] as string[];
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      expect(protoPathArgs.some(arg => arg.includes(testPath))).toBe(true);
    });

    it('should add file directory when not covered by user paths', async () => {
      const otherPath = path.resolve('/other/path');
      const workspaceProtosPath = path.resolve('/workspace/protos');
      compiler.updateSettings({
        options: [`--proto_path=${otherPath}`],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.validate('/workspace/protos/test.proto');

      const args = mockSpawn.mock.calls[0][1] as string[];
      const protoPathArgs = args.filter(arg => arg.startsWith('--proto_path='));
      // Should have both user path and file directory
      expect(protoPathArgs.some(arg => arg.includes(otherPath))).toBe(true);
      expect(protoPathArgs.some(arg => arg.includes(workspaceProtosPath))).toBe(true);
    });
  });

  describe('output truncation', () => {
    it('should truncate stdout when exceeding limit', async () => {
      // Create a very large output
      const largeOutput = 'x'.repeat(11 * 1024 * 1024); // 11 MB

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(largeOutput)), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      // Should have truncation warning
      expect(result.errors.some(e => e.message.includes('truncated'))).toBe(true);
    });

    it('should truncate stderr when exceeding limit', async () => {
      const largeError = 'error: '.repeat(2 * 1024 * 1024); // Large error output

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(largeError)), 0);
            }
            return mockProcess.stderr;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await compiler.compileFile('/workspace/test.proto');
      expect(result.errors.some(e => e.message.includes('truncated'))).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should timeout and kill process', async () => {
      jest.useFakeTimers();

      compiler.updateSettings({ timeout: 100 });

      const mockKill = jest.fn();
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: mockKill,
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = compiler.compileFile('/workspace/test.proto');

      // Advance past timeout
      jest.advanceTimersByTime(150);

      // Simulate close after kill
      const closeCallback = mockProcess.on.mock.calls.find((call: unknown[]) => call[0] === 'close')?.[1];
      if (closeCallback) {
        closeCallback(null);
      }

      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
      expect(mockKill).toHaveBeenCalledWith('SIGTERM');

      jest.useRealTimers();
    });
  });

  describe('runProtoc spawn error fallback', () => {
    it('should fallback to shell on spawn error', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First spawn fails with error
          const errorProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('ENOENT')), 0);
              }
              return errorProcess;
            }),
            kill: jest.fn(),
          } as any;
          return errorProcess;
        }
        // Subsequent spawns succeed (response file approach)
        const successProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 0);
            }
            return successProcess;
          }),
          kill: jest.fn(),
        } as any;
        return successProcess;
      });

      // Mock fs for response file
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockReturnValue(undefined);

      await compiler.compileFile('/workspace/test.proto');
      // Should have attempted fallback
      expect(mockSpawn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('findProtoFiles', () => {
    it('should skip hidden directories', async () => {
      // Track calls to ensure recursion is controlled
      let callCount = 0;
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        callCount++;
        if (callCount > 10) {
          return [];
        } // Prevent infinite recursion

        if (dir.toString() === '/workspace') {
          return [
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dir.toString().includes('src')) {
          return [{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any;
        }
        return [];
      });

      const findProtoFiles = (compiler as any).findProtoFiles.bind(compiler);
      const files = findProtoFiles('/workspace');

      // Should have found test.proto
      expect(files.length).toBe(1);
      expect(files[0]).toContain('test.proto');
    });

    it('should skip node_modules', async () => {
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        if (dir.toString() === '/workspace') {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'test.proto', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      const findProtoFiles = (compiler as any).findProtoFiles.bind(compiler);
      const files = findProtoFiles('/workspace');

      // Should only have test.proto, not anything from node_modules
      expect(files.length).toBe(1);
      expect(files[0]).toContain('test.proto');
    });

    it('should handle permission errors gracefully', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const findProtoFiles = (compiler as any).findProtoFiles.bind(compiler);
      const files = findProtoFiles('/workspace');

      expect(files).toEqual([]);
    });
  });

  describe('expandVariables', () => {
    it('should expand env variables', async () => {
      const originalEnv = process.env.MY_PROTO_PATH;
      const customPath = path.resolve('/my/custom/path');
      process.env.MY_PROTO_PATH = customPath;

      compiler.updateSettings({
        options: ['--proto_path=${env.MY_PROTO_PATH}'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args.some(arg => arg.includes(customPath))).toBe(true);

      // Restore
      if (originalEnv === undefined) {
        delete process.env.MY_PROTO_PATH;
      } else {
        process.env.MY_PROTO_PATH = originalEnv;
      }
    });

    it('should handle missing env variables', async () => {
      delete process.env.NONEXISTENT_VAR;

      compiler.updateSettings({
        options: ['--proto_path=${env.NONEXISTENT_VAR}/protos'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');

      const args = mockSpawn.mock.calls[0][1] as string[];
      // Should have replaced with empty string
      expect(args.some(arg => arg.includes('${env.NONEXISTENT_VAR}'))).toBe(false);
    });

    it('should handle config variables (return empty)', async () => {
      compiler.updateSettings({
        options: ['--proto_path=${config.myPath}'],
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
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      await compiler.compileFile('/workspace/test.proto');

      const args = mockSpawn.mock.calls[0][1] as string[];
      // Config variables are replaced with empty string
      expect(args.some(arg => arg.includes('${config.'))).toBe(false);
    });
  });
});
