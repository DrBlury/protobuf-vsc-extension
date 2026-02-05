/**
 * Tests for external linter provider
 */

import { ExternalLinterProvider } from '../externalLinter';
import { spawn } from 'child_process';
import { pathToUri } from '../../utils/utils';

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

describe('ExternalLinterProvider', () => {
  let provider: ExternalLinterProvider;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    provider = new ExternalLinterProvider();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
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
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
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
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
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
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe(true);
    });

    it('should check api-linter when configured', async () => {
      provider.updateSettings({ enabled: true, linter: 'api-linter' });
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
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
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
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
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
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

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should run api-linter and return diagnostics', async () => {
      provider.updateSettings({ enabled: true, linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should use api-linter config when configured', async () => {
      provider.updateSettings({
        enabled: true,
        linter: 'api-linter',
        apiLinterConfigPath: '/workspace/api-linter.yaml',
      });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const lintPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      await lintPromise;

      // Verify api-linter was called with config flag
      expect(mockSpawn).toHaveBeenCalled();
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[0]).toBe('api-linter');
      expect(callArgs[1]).toContain('--config');
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
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lintWorkspace();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe('parseBufOutput', () => {
    it('should parse valid JSON output', () => {
      const output =
        '{"path":"test.proto","start_line":10,"start_column":5,"end_line":10,"end_column":20,"type":"FAILURE","message":"Test error"}\n';
      const results = (provider as any).parseBufOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('test.proto');
      expect(results[0].line).toBe(10);
      expect(results[0].column).toBe(5);
      expect(results[0].message).toBe('Test error');
      expect(results[0].rule).toBe('FAILURE');
    });

    it('should handle multiple JSON lines', () => {
      const output =
        '{"path":"a.proto","start_line":1,"start_column":1,"type":"FAILURE","message":"Error 1"}\n{"path":"b.proto","start_line":5,"start_column":10,"type":"WARNING","message":"Warning 1"}\n';
      const results = (provider as any).parseBufOutput(output);
      expect(results).toHaveLength(2);
    });

    it('should skip non-JSON lines when parsing', () => {
      // Note: The current implementation catches individual line JSON.parse failures
      // but doesn't fall back to regex - it just skips those lines
      const output = 'test.proto:10:5:Some error message\n';
      const results = (provider as any).parseBufOutput(output);
      // Non-JSON lines are skipped, regex fallback not triggered
      expect(results).toHaveLength(0);
    });

    it('should handle empty output', () => {
      const results = (provider as any).parseBufOutput('');
      expect(results).toHaveLength(0);
    });

    it('should handle malformed JSON lines gracefully', () => {
      const output = '{"path":"test.proto","start_line":10}\nnot valid json\n';
      const results = (provider as any).parseBufOutput(output);
      expect(results).toHaveLength(1);
    });
  });

  describe('parseProtolintOutput', () => {
    it('should parse valid JSON output', () => {
      const output = JSON.stringify({
        lints: [
          {
            filename: 'test.proto',
            line: 10,
            column: 5,
            message: 'Test error',
            rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
            severity: 'error',
          },
        ],
      });
      const results = (provider as any).parseProtolintOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('test.proto');
      expect(results[0].line).toBe(10);
      expect(results[0].column).toBe(5);
      expect(results[0].severity).toBe('error');
    });

    it('should parse warning severity', () => {
      const output = JSON.stringify({
        lints: [{ filename: 'test.proto', line: 5, column: 1, message: 'Warning', rule: 'RULE', severity: 'warning' }],
      });
      const results = (provider as any).parseProtolintOutput(output);
      expect(results[0].severity).toBe('warning');
    });

    it('should fall back to regex when JSON parsing fails', () => {
      const output = '[test.proto:10:5] Some message (FIELD_NAMES_LOWER_SNAKE_CASE)\n';
      const results = (provider as any).parseProtolintOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('test.proto');
      expect(results[0].line).toBe(10);
      expect(results[0].column).toBe(5);
    });

    it('should handle empty lints array', () => {
      const output = JSON.stringify({ lints: [] });
      const results = (provider as any).parseProtolintOutput(output);
      expect(results).toHaveLength(0);
    });
  });

  describe('parseApiLinterOutput', () => {
    it('should parse valid JSON array output', () => {
      const output = JSON.stringify([
        {
          file_path: 'test.proto',
          problems: [
            {
              message: 'Field name should be lower_snake_case',
              rule_id: 'core::0140::lower-snake',
              location: {
                start_position: { line_number: 10, column_number: 3 },
                end_position: { line_number: 10, column_number: 15 },
              },
            },
          ],
        },
      ]);
      const results = (provider as any).parseApiLinterOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('test.proto');
      expect(results[0].line).toBe(10);
      expect(results[0].column).toBe(3);
      expect(results[0].rule).toBe('core::0140::lower-snake');
    });

    it('should include suggestion in message', () => {
      const output = JSON.stringify([
        {
          file_path: 'test.proto',
          problems: [
            {
              message: 'Field name issue',
              suggestion: 'Consider using lower_snake_case',
              rule_id: 'core::0140',
              location: { start_position: { line_number: 1, column_number: 1 } },
            },
          ],
        },
      ]);
      const results = (provider as any).parseApiLinterOutput(output);
      expect(results[0].message).toContain('Consider using lower_snake_case');
    });

    it('should fall back to regex when JSON parsing fails', () => {
      const output = 'test.proto:10:5: Field name should be lower_snake_case\n';
      const results = (provider as any).parseApiLinterOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('test.proto');
    });

    it('should handle empty problems array', () => {
      const output = JSON.stringify([{ file_path: 'test.proto', problems: [] }]);
      const results = (provider as any).parseApiLinterOutput(output);
      expect(results).toHaveLength(0);
    });
  });

  describe('matchesFile', () => {
    it('should match files with same name', () => {
      const result = (provider as any).matchesFile('/path/to/test.proto', 'test.proto');
      expect(result).toBe(true);
    });

    it('should match files with different case', () => {
      const result = (provider as any).matchesFile('/PATH/TO/Test.proto', '/path/to/test.proto');
      expect(result).toBe(true);
    });

    it('should match relative path against absolute', () => {
      const result = (provider as any).matchesFile('test.proto', '/workspace/test.proto');
      expect(result).toBe(true);
    });

    it('should not match different files with same basename', () => {
      const result = (provider as any).matchesFile('/path/a.proto', '/path/b.proto');
      expect(result).toBe(false);
    });
  });

  describe('resolveFileUri', () => {
    it('should return file URI for absolute path', () => {
      provider.setWorkspaceRoot('/workspace');
      const result = (provider as any).resolveFileUri('/workspace/test.proto');
      expect(result).toBe(pathToUri('/workspace/test.proto'));
    });

    it('should join relative path with workspace root', () => {
      provider.setWorkspaceRoot('/workspace');
      const result = (provider as any).resolveFileUri('test.proto');
      expect(result).toBe(pathToUri('/workspace/test.proto'));
    });

    it('should handle nested relative paths', () => {
      provider.setWorkspaceRoot('/workspace');
      const result = (provider as any).resolveFileUri('proto/test.proto');
      expect(result).toBe(pathToUri('/workspace/proto/test.proto'));
    });
  });

  describe('convertResult', () => {
    it('should convert error severity', () => {
      provider.updateSettings({ linter: 'buf' });
      const result = (provider as any).convertResult({
        file: 'test.proto',
        line: 10,
        column: 5,
        rule: 'TEST',
        message: 'Error message',
        severity: 'error',
      });
      expect(result.severity).toBe(1); // DiagnosticSeverity.Error
      expect(result.message).toBe('Error message');
    });

    it('should convert info severity', () => {
      provider.updateSettings({ linter: 'buf' });
      const result = (provider as any).convertResult({
        file: 'test.proto',
        line: 10,
        column: 5,
        rule: 'TEST',
        message: 'Info message',
        severity: 'info',
      });
      expect(result.severity).toBe(3); // DiagnosticSeverity.Information
    });

    it('should convert warning severity by default', () => {
      provider.updateSettings({ linter: 'buf' });
      const result = (provider as any).convertResult({
        file: 'test.proto',
        line: 10,
        column: 5,
        rule: 'TEST',
        message: 'Warning message',
        severity: 'warning',
      });
      expect(result.severity).toBe(2); // DiagnosticSeverity.Warning
    });

    it('should handle missing end position', () => {
      provider.updateSettings({ linter: 'buf' });
      const result = (provider as any).convertResult({
        file: 'test.proto',
        line: 10,
        column: 5,
        rule: 'TEST',
        message: 'Message',
        severity: 'warning',
      });
      expect(result.range.end.line).toBe(9);
    });
  });

  describe('getAvailableRules', () => {
    it('should return empty array for none linter', async () => {
      provider.updateSettings({ linter: 'none' });
      const result = await provider.getAvailableRules();
      expect(result).toEqual([]);
    });

    it('should return protolint rules', async () => {
      provider.updateSettings({ linter: 'protolint' });
      const result = await provider.getAvailableRules();
      expect(result).toContain('ENUM_FIELD_NAMES_PREFIX');
      expect(result).toContain('FIELD_NAMES_LOWER_SNAKE_CASE');
      expect(result).toHaveLength(17);
    });

    it('should get buf rules via spawn', async () => {
      provider.updateSettings({ linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('ENUM_PASCAL_CASE\nFIELD_LOWER_SNAKE_CASE\n')), 0);
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

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('ENUM_PASCAL_CASE');
      expect(result).toContain('FIELD_LOWER_SNAKE_CASE');
    });

    it('should get buf rules via shell fallback on error', async () => {
      provider.updateSettings({ linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails with error
          const failProcess = {
            stdout: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('RULE_ONE\nRULE_TWO\n')), 0);
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
        }
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('RULE_ONE');
    });

    it('should return empty array when buf rules shell fallback fails', async () => {
      provider.updateSettings({ linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should get api-linter rules via spawn', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(
                () =>
                  callback(
                    Buffer.from(
                      JSON.stringify([{ name: 'core::0140::lower-snake' }, { name: 'core::0131::request-body' }])
                    )
                  ),
                0
              );
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

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('core::0140::lower-snake');
      expect(result).toContain('core::0131::request-body');
    });

    it('should get api-linter rules with text fallback', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('not valid json')), 0);
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

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('not valid json');
    });

    it('should handle api-linter rules non-array JSON', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('{"not": "array"}')), 0);
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

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should get api-linter rules via shell fallback on error', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails with error
          const failProcess = {
            stdout: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds with JSON
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from(JSON.stringify([{ name: 'core::0140::lower-snake' }]))), 0);
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
        }
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('core::0140::lower-snake');
    });

    it('should handle api-linter shell fallback with non-array JSON', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            stdout: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback returns non-array JSON
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('{"not": "array"}')), 0);
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
        }
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should handle api-linter shell fallback with invalid JSON', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            stdout: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback returns invalid JSON (falls back to text parsing)
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('rule1\nrule2\n')), 0);
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
        }
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toContain('rule1');
      expect(result).toContain('rule2');
    });

    it('should return empty array when api-linter shell fallback fails', async () => {
      provider.updateSettings({ linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.getAvailableRules();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });
  });

  describe('isAvailable edge cases', () => {
    it('should handle unknown linter type', async () => {
      provider.updateSettings({ enabled: true, linter: 'none' });
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should return true via shell fallback when initial spawn fails', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails with error, triggering shell fallback
          const failProcess = {
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds
          const successProcess = {
            on: jest.fn((event: string, callback: (code: number) => void) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 0);
              }
              return successProcess;
            }),
          } as any;
          return successProcess;
        }
      });

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe(true);
    });

    it('should return false when shell fallback exits with non-zero code', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback exits with non-zero
          const failShellProcess = {
            on: jest.fn((event: string, callback: (code: number) => void) => {
              if (event === 'close') {
                setTimeout(() => callback(1), 0);
              }
              return failShellProcess;
            }),
          } as any;
          return failShellProcess;
        }
      });

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe(false);
    });

    it('should return false when shell fallback also errors', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe(false);
    });

    it('should return false when first spawn exits with non-zero code', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });

      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.isAvailable();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBe(false);
    });
  });

  describe('lint with shell fallback', () => {
    it('should run buf lint via shell fallback on error', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('[]')), 0);
                }
                return successProcess.stdout;
              }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (code: number) => void) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
              return successProcess;
            }),
          } as any;
          return successProcess;
        }
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should return empty array when buf shell fallback fails', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should run protolint via shell fallback on error', async () => {
      provider.updateSettings({ enabled: true, linter: 'protolint' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('{"lints":[]}')), 0);
                }
                return successProcess.stdout;
              }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (code: number) => void) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
              return successProcess;
            }),
          } as any;
          return successProcess;
        }
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should return empty array when protolint shell fallback fails', async () => {
      provider.updateSettings({ enabled: true, linter: 'protolint' });
      provider.setWorkspaceRoot('/workspace');

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should run api-linter via shell fallback on error', async () => {
      provider.updateSettings({ enabled: true, linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          const failProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (err?: Error) => void) => {
              if (event === 'error') {
                setTimeout(() => callback(new Error('spawn failed')), 0);
              }
              return failProcess;
            }),
          } as any;
          return failProcess;
        } else {
          // Shell fallback succeeds
          const successProcess = {
            stdout: {
              on: jest.fn((event: string, callback: (data: Buffer) => void) => {
                if (event === 'data') {
                  setTimeout(() => callback(Buffer.from('[]')), 0);
                }
                return successProcess.stdout;
              }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event: string, callback: (code: number) => void) => {
              if (event === 'close') {
                setTimeout(() => callback(0), 10);
              }
              return successProcess;
            }),
          } as any;
          return successProcess;
        }
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });

    it('should return empty array when api-linter shell fallback fails', async () => {
      provider.updateSettings({ enabled: true, linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      mockSpawn.mockImplementation(() => {
        const failProcess = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (err?: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('spawn failed')), 0);
            }
            return failProcess;
          }),
        } as any;
        return failProcess;
      });

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toEqual([]);
    });
  });

  describe('lintWorkspace with results', () => {
    it('should group results by file URI', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockOutput = [
        '{"path":"a.proto","start_line":1,"start_column":1,"type":"FAILURE","message":"Error in a"}',
        '{"path":"b.proto","start_line":2,"start_column":1,"type":"FAILURE","message":"Error in b"}',
        '{"path":"a.proto","start_line":5,"start_column":1,"type":"FAILURE","message":"Second error in a"}',
      ].join('\n');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(mockOutput)), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lintWorkspace();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result.size).toBe(2);
      expect(result.get(pathToUri('/workspace/a.proto'))).toHaveLength(2);
      expect(result.get(pathToUri('/workspace/b.proto'))).toHaveLength(1);
    });

    it('should run protolint workspace lint', async () => {
      provider.updateSettings({ enabled: true, linter: 'protolint' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('{"lints":[]}')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lintWorkspace();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBeInstanceOf(Map);
    });

    it('should run api-linter workspace lint', async () => {
      provider.updateSettings({ enabled: true, linter: 'api-linter' });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lintWorkspace();
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe('buf lint with config paths', () => {
    it('should use user-configured buf config path', async () => {
      provider.updateSettings({
        enabled: true,
        linter: 'buf',
        bufConfigPath: '/custom/buf.yaml',
      });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const lintPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      await lintPromise;

      expect(mockSpawn).toHaveBeenCalled();
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[1]).toContain('--config');
      expect(callArgs[1]).toContain('/custom/buf.yaml');
    });

    it('should allow relative buf config paths with parent traversal', async () => {
      provider.updateSettings({
        enabled: true,
        linter: 'buf',
        bufConfigPath: '../configs/buf.yaml',
      });
      provider.setWorkspaceRoot('/workspace/project');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('[]')), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const lintPromise = provider.lint('/workspace/project/test.proto');
      await flushPromisesAndTimers();
      await lintPromise;

      expect(mockSpawn).toHaveBeenCalled();
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[1]).toContain('--config');
      expect(callArgs[1]).toContain('../configs/buf.yaml');
    });

    it('should use protolint config path when configured', async () => {
      provider.updateSettings({
        enabled: true,
        linter: 'protolint',
        protolintConfigPath: '/custom/.protolint.yaml',
      });
      provider.setWorkspaceRoot('/workspace');

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
          return mockProcess;
        }),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const lintPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      await lintPromise;

      expect(mockSpawn).toHaveBeenCalled();
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[1]).toContain('-config_path');
      expect(callArgs[1]).toContain('/custom/.protolint.yaml');
    });
  });

  describe('convertToDiagnostics', () => {
    it('should filter results for current file', async () => {
      provider.updateSettings({ enabled: true, linter: 'buf' });
      provider.setWorkspaceRoot('/workspace');

      const mockOutput = [
        '{"path":"test.proto","start_line":1,"start_column":1,"type":"FAILURE","message":"Error in test"}',
        '{"path":"other.proto","start_line":2,"start_column":1,"type":"FAILURE","message":"Error in other"}',
      ].join('\n');

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(mockOutput)), 0);
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
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = provider.lint('/workspace/test.proto');
      await flushPromisesAndTimers();
      const result = await resultPromise;
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Error in test');
    });
  });
});
