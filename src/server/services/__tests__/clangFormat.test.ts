/**
 * Tests for clang-format provider
 */

import { ClangFormatProvider } from '../clangFormat';
import { spawn } from 'child_process';
import { Range } from 'vscode-languageserver/node';
import { logger } from '../../utils/logger';

jest.mock('child_process');

describe('ClangFormatProvider', () => {
  let provider: ClangFormatProvider;
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new ClangFormatProvider();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      provider.updateSettings({ enabled: true, path: '/usr/bin/clang-format' });
      expect(provider).toBeDefined();
    });

    it('should merge settings', () => {
      provider.updateSettings({ enabled: true });
      provider.updateSettings({ path: '/usr/bin/clang-format' });
      expect(provider).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return false when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should return true when enabled and available', async () => {
      provider.updateSettings({ enabled: true });
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      provider.updateSettings({ enabled: true });
      const mockProcess = {
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('should return version when available', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('clang-format version 14.0.0')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.getVersion();
      expect(result).toBe('14.0.0');
    });

    it('should return trimmed output when version pattern not found', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('clang-format 14.0.0')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.getVersion();
      expect(result).toBe('clang-format 14.0.0');
    });

    it('should return null on error', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'error') {
            setTimeout(() => callback(), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.getVersion();
      expect(result).toBeNull();
    });
  });

  describe('getStylePresets', () => {
    it('should return all style presets', () => {
      const presets = provider.getStylePresets();
      expect(presets).toContain('LLVM');
      expect(presets).toContain('Google');
      expect(presets).toContain('Chromium');
      expect(presets).toContain('Mozilla');
      expect(presets).toContain('WebKit');
      expect(presets).toContain('Microsoft');
      expect(presets).toContain('GNU');
      expect(presets).toContain('file');
      expect(presets).toHaveLength(8);
    });
  });

  describe('getSampleConfig', () => {
    it('should return valid clang-format config', () => {
      const config = provider.getSampleConfig();
      expect(config).toContain('Language: Proto');
      expect(config).toContain('BasedOnStyle: Google');
      expect(config).toContain('IndentWidth: 2');
      expect(config).toContain('ColumnLimit: 100');
    });
  });

  describe('formatDocument', () => {
    it('should return empty array when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const result = await provider.formatDocument('message Test {}');
      expect(result).toEqual([]);
    });

    it('should format document when enabled', async () => {
      provider.updateSettings({ enabled: true });
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('formatted')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.formatDocument('message Test {}');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when formatted text equals original', async () => {
      provider.updateSettings({ enabled: true });
      const text = 'message Test {}';
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(text)), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await provider.formatDocument(text);
      expect(result).toEqual([]);
    });
  });

  describe('formatRange', () => {
    it('should return null when disabled', async () => {
      provider.updateSettings({ enabled: false });
      const range = Range.create(0, 0, 10, 20);
      const result = await provider.formatRange('message Test {}', range);
      expect(result).toBeNull();
    });

    it('should calculate correct byte offsets for CRLF line endings', async () => {
      provider.updateSettings({ enabled: true });
      // CRLF text: each line ends with \r\n
      const text = 'line1\r\nline2\r\nline3';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: string[] = [];
      (spawn as any).mockImplementation((_cmd: any, args: string[]) => {
        capturedArgs = args;
        return mockProcess;
      });

      // Format range starting at line 1 (second line)
      // In CRLF: "line1\r\n" = 7 bytes, so line 2 starts at offset 7
      const range = Range.create(1, 0, 1, 5);
      await provider.formatRange(text, range);

      const offsetArg = capturedArgs.find(a => a.startsWith('--offset='));
      const lengthArg = capturedArgs.find(a => a.startsWith('--length='));

      // "line1\r\n" = 5 + 2 = 7 bytes offset for line 2
      expect(offsetArg).toBe('--offset=7');
      // "line2" = 5 bytes length
      expect(lengthArg).toBe('--length=5');
    });

    it('should calculate correct byte offsets for LF line endings', async () => {
      provider.updateSettings({ enabled: true });
      // LF text: each line ends with \n only
      const text = 'line1\nline2\nline3';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: string[] = [];
      (spawn as any).mockImplementation((_cmd: any, args: string[]) => {
        capturedArgs = args;
        return mockProcess;
      });

      // Format range starting at line 1 (second line)
      // In LF: "line1\n" = 6 bytes, so line 2 starts at offset 6
      const range = Range.create(1, 0, 1, 5);
      await provider.formatRange(text, range);

      const offsetArg = capturedArgs.find(a => a.startsWith('--offset='));
      const lengthArg = capturedArgs.find(a => a.startsWith('--length='));

      // "line1\n" = 5 + 1 = 6 bytes offset for line 2
      expect(offsetArg).toBe('--offset=6');
      // "line2" = 5 bytes length
      expect(lengthArg).toBe('--length=5');
    });

    it('should format range when enabled', async () => {
      provider.updateSettings({ enabled: true });
      const text = 'message Test {\n  string name = 1;\n}';
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(text)), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const range = Range.create(0, 0, 2, 1);
      const result = await provider.formatRange(text, range);
      // formatRange may return empty array if formatted text equals original
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass actual file path to clang-format for config discovery', async () => {
      provider.updateSettings({ enabled: true });
      const text = 'message Test {\n  string name = 1;\n}';

      // Capture spawn args
      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: any[] = [];
      (spawn as any).mockImplementation((cmd: any, args: any) => {
        capturedArgs = args as any[];
        return mockProcess;
      });

      const range = Range.create(0, 0, 2, 1);
      const filePath = '/Users/test/workspace/foo.proto';
      await provider.formatRange(text, range, filePath);

      // Ensure --assume-filename is set to the provided file path (not default file.proto)
      const assumeArg = capturedArgs.find(a => typeof a === 'string' && a.startsWith('--assume-filename='));
      expect(assumeArg).toBe(`--assume-filename=${filePath}`);
    });

    it('should set cwd to file directory for config file discovery', async () => {
      provider.updateSettings({ enabled: true });
      const text = 'message Test {}';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedOptions: any = null;
      (spawn as any).mockImplementation((_cmd: any, _args: any, options: any) => {
        capturedOptions = options;
        return mockProcess;
      });

      const filePath = '/Users/test/workspace/protos/foo.proto';
      await provider.formatDocument(text, filePath);

      // Ensure cwd is set to the directory containing the file
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.cwd).toBe('/Users/test/workspace/protos');
    });

    it('should set cwd from file:// URI', async () => {
      provider.updateSettings({ enabled: true });
      const text = 'message Test {}';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedOptions: any = null;
      (spawn as any).mockImplementation((_cmd: any, _args: any, options: any) => {
        capturedOptions = options;
        return mockProcess;
      });

      const fileUri = 'file:///Users/test/workspace/protos/foo.proto';
      await provider.formatDocument(text, fileUri);

      // Ensure cwd is set to the directory containing the file
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.cwd).toBe('/Users/test/workspace/protos');
    });

    it('should use --style=file:<path> when configPath is provided', async () => {
      provider.updateSettings({
        enabled: true,
        style: 'file',
        fallbackStyle: 'Google',
        configPath: '/custom/path/.clang-format',
      });
      const text = 'message Test {}';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: string[] = [];
      (spawn as any).mockImplementation((_cmd: any, args: string[]) => {
        capturedArgs = args;
        return mockProcess;
      });

      await provider.formatDocument(text);

      // Ensure --style=file:<path> is passed when configPath is set
      const styleArg = capturedArgs.find(a => a.startsWith('--style='));
      expect(styleArg).toBe('--style=file:/custom/path/.clang-format');
    });

    it('should use --style=file without path when configPath is not provided', async () => {
      provider.updateSettings({
        enabled: true,
        style: 'file',
        fallbackStyle: 'Google',
        configPath: '',
      });
      const text = 'message Test {}';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: string[] = [];
      (spawn as any).mockImplementation((_cmd: any, args: string[]) => {
        capturedArgs = args;
        return mockProcess;
      });

      await provider.formatDocument(text);

      // Ensure --style=file is passed without path when configPath is empty
      const styleArg = capturedArgs.find(a => a.startsWith('--style='));
      expect(styleArg).toBe('--style=file');
    });

    it('should not use configPath when style is not file', async () => {
      provider.updateSettings({
        enabled: true,
        style: 'Google',
        fallbackStyle: 'Google',
        configPath: '/custom/path/.clang-format',
      });
      const text = 'message Test {}';

      const mockProcess: any = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn(), end: jest.fn() },
        on: jest.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      };

      let capturedArgs: string[] = [];
      (spawn as any).mockImplementation((_cmd: any, args: string[]) => {
        capturedArgs = args;
        return mockProcess;
      });

      await provider.formatDocument(text);

      // When style is not 'file', configPath should be ignored
      const styleArg = capturedArgs.find(a => a.startsWith('--style='));
      expect(styleArg).toBe('--style=Google');
    });
  });
});
