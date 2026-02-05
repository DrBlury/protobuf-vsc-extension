/**
 * Branch coverage tests for breaking change detector
 * Tests specific branches and edge cases not covered by main tests
 */

import { BreakingChangeDetector, BreakingChangeSettings } from '../breaking';
import { ProtoParser } from '../../core/parser';
import { spawn } from 'child_process';

jest.mock('child_process');

describe('BreakingChangeDetector Branch Coverage', () => {
  let detector: BreakingChangeDetector;
  let parser: ProtoParser;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    detector = new BreakingChangeDetector();
    parser = new ProtoParser();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  describe('getBaseline default ref', () => {
    it('should use default ref when againstGitRef is empty', async () => {
      detector.setWorkspaceRoot('/workspace');
      // Explicitly set empty ref to trigger default
      detector.updateSettings({ againstGitRef: '' });

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('syntax = "proto3";')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              // Trigger stderr callback to cover that branch
              setTimeout(() => callback(Buffer.from('warning')), 0);
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

      const result = await detector.getBaseline('/workspace/test.proto');
      expect(result).toBe('syntax = "proto3";');
      // Verify spawn was called with default ref HEAD~1
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['show', 'HEAD~1:test.proto'],
        expect.objectContaining({ cwd: '/workspace' })
      );
    });
  });

  describe('detectBreakingChanges rule filtering', () => {
    it('should filter changes based on enabled rules', () => {
      // Only enable MESSAGE_NO_DELETE rule
      detector.updateSettings({
        enabled: true,
        rules: ['MESSAGE_NO_DELETE'],
      });

      const current = parser.parse('syntax = "proto3";', 'file:///test.proto');
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string name = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      // Should only report MESSAGE_NO_DELETE, not FIELD_NO_DELETE
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('MESSAGE_NO_DELETE');
    });

    it('should not report changes for disabled rules', () => {
      detector.updateSettings({
        enabled: true,
        rules: [], // No rules enabled
      });

      const current = parser.parse('syntax = "proto3";', 'file:///test.proto');
      const baseline = parser.parse('syntax = "proto3"; message Test {}', 'file:///test.proto');

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(0);
    });

    it('should report warning severity for FIELD_SAME_NAME', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_SAME_NAME'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string new_name = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string old_name = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      // FIELD_SAME_NAME has warning severity
      expect(diagnostics[0].severity).toBe(2); // Warning = 2 in DiagnosticSeverity
    });

    it('should report error severity for FIELD_SAME_TYPE', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_SAME_TYPE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          int32 id = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string id = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      // FIELD_SAME_TYPE has error severity
      expect(diagnostics[0].severity).toBe(1); // Error = 1 in DiagnosticSeverity
    });
  });

  describe('compareMessages reserved range with max', () => {
    it('should handle reserved range with max value', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          reserved 100 to max;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string name = 100;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      // Field 100 is reserved (100 to max), so should not report deletion
      const deleteErrors = diagnostics.filter(d => d.message.includes('deleted without reserving'));
      expect(deleteErrors.length).toBe(0);
    });

    it('should detect deletion when field not in reserved range', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          reserved 10 to 20;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string name = 5;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      // Field 5 is not in reserved range 10-20, should report deletion
      const deleteErrors = diagnostics.filter(d => d.message.includes('deleted without reserving'));
      expect(deleteErrors.length).toBe(1);
    });
  });

  describe('compareMessages field label changes', () => {
    it('should detect label change from singular to repeated', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_SAME_LABEL'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          repeated string tags = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string tags = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('FIELD_SAME_LABEL');
    });

    it('should detect label change from repeated to optional', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_SAME_LABEL'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          optional string name = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          repeated string name = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('FIELD_SAME_LABEL');
    });
  });

  describe('compareEnums value changes', () => {
    it('should detect enum value rename with ENUM_VALUE_SAME_NAME rule', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['ENUM_VALUE_SAME_NAME'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        enum Status {
          UNKNOWN = 0;
          ACTIVE_NEW = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        enum Status {
          UNKNOWN = 0;
          ACTIVE_OLD = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('ENUM_VALUE_SAME_NAME');
      expect(diagnostics[0].message).toContain('renamed');
    });
  });

  describe('compareServices RPC changes', () => {
    it('should detect RPC deletion with RPC_NO_DELETE rule', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['RPC_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(GetUserRequest) returns (GetUserResponse);
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(GetUserRequest) returns (GetUserResponse);
          rpc DeleteUser(DeleteUserRequest) returns (DeleteUserResponse);
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('RPC_NO_DELETE');
      expect(diagnostics[0].message).toContain('DeleteUser');
    });

    it('should detect client streaming change with RPC_SAME_CLIENT_STREAMING', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['RPC_SAME_CLIENT_STREAMING'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc StreamData(stream DataRequest) returns (DataResponse);
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc StreamData(DataRequest) returns (DataResponse);
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('RPC_SAME_CLIENT_STREAMING');
      expect(diagnostics[0].message).toContain('client streaming');
    });

    it('should detect server streaming change with RPC_SAME_SERVER_STREAMING', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['RPC_SAME_SERVER_STREAMING'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc StreamData(DataRequest) returns (stream DataResponse);
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc StreamData(DataRequest) returns (DataResponse);
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('RPC_SAME_SERVER_STREAMING');
      expect(diagnostics[0].message).toContain('server streaming');
    });

    it('should detect request type change with RPC_SAME_REQUEST_TYPE', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['RPC_SAME_REQUEST_TYPE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(NewUserRequest) returns (UserResponse);
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(OldUserRequest) returns (UserResponse);
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('RPC_SAME_REQUEST_TYPE');
    });

    it('should detect response type change with RPC_SAME_RESPONSE_TYPE', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['RPC_SAME_RESPONSE_TYPE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(UserRequest) returns (NewUserResponse);
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service TestService {
          rpc GetUser(UserRequest) returns (OldUserResponse);
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('RPC_SAME_RESPONSE_TYPE');
    });
  });

  describe('nested structures changes', () => {
    it('should detect nested message changes', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_SAME_TYPE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          message Inner {
            int32 id = 1;
          }
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          message Inner {
            string id = 1;
          }
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('FIELD_SAME_TYPE');
    });

    it('should detect nested enum changes', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['ENUM_VALUE_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          enum Status {
            UNKNOWN = 0;
          }
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          enum Status {
            UNKNOWN = 0;
            ACTIVE = 1;
          }
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('ENUM_VALUE_NO_DELETE');
    });

    it('should detect deeply nested message deletion', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['MESSAGE_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          message Middle {}
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Outer {
          message Middle {
            message Inner {}
          }
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].message).toContain('Inner');
    });
  });

  describe('multiple services', () => {
    it('should detect service deletion', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['SERVICE_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        service ServiceA {}
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        service ServiceA {}
        service ServiceB {}
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('SERVICE_NO_DELETE');
      expect(diagnostics[0].message).toContain('ServiceB');
    });
  });

  describe('multiple enums', () => {
    it('should detect enum deletion', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['ENUM_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        enum StatusA { UNKNOWN_A = 0; }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        enum StatusA { UNKNOWN_A = 0; }
        enum StatusB { UNKNOWN_B = 0; }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('ENUM_NO_DELETE');
      expect(diagnostics[0].message).toContain('StatusB');
    });
  });

  describe('package changes', () => {
    it('should detect package deletion when package exists in baseline', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['PACKAGE_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {}
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        package myapi.v1;
        message Test {}
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('PACKAGE_NO_DELETE');
      expect(diagnostics[0].message).toContain('myapi.v1');
    });

    it('should not report package deletion when no baseline package', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['PACKAGE_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {}
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {}
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('complex reserved ranges', () => {
    it('should handle multiple reserved ranges', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {
          reserved 1 to 5, 10, 20 to 30;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string a = 3;
          string b = 10;
          string c = 25;
          string d = 100;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      // Fields 3, 10, 25 are reserved; field 100 is not
      const deleteErrors = diagnostics.filter(d => d.message.includes('deleted without reserving'));
      expect(deleteErrors.length).toBe(1);
      expect(deleteErrors[0].message).toContain('100');
    });

    it('should handle no reserved fields', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['FIELD_NO_DELETE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message Test {}
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message Test {
          string name = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('FIELD_NO_DELETE');
    });
  });

  describe('settings edge cases', () => {
    it('should handle partial settings update', () => {
      detector.updateSettings({ enabled: true });
      detector.updateSettings({ againstStrategy: 'file' });
      detector.updateSettings({ againstFilePath: '/path/to/baseline.proto' });

      // Verify detector still works after multiple updates
      const current = parser.parse('syntax = "proto3"; message Test {}', 'file:///test.proto');
      const baseline = parser.parse('syntax = "proto3"; message Test {}', 'file:///test.proto');

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics).toEqual([]);
    });

    it('should handle all rules enabled', () => {
      const allRules: BreakingChangeSettings['rules'] = [
        'FIELD_NO_DELETE',
        'FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED',
        'FIELD_NO_DELETE_UNLESS_NAME_RESERVED',
        'FIELD_SAME_TYPE',
        'FIELD_SAME_NAME',
        'FIELD_SAME_JSON_NAME',
        'FIELD_SAME_LABEL',
        'FIELD_SAME_ONEOF',
        'MESSAGE_NO_DELETE',
        'MESSAGE_NO_REMOVE_STANDARD_DESCRIPTOR_ACCESSOR',
        'MESSAGE_SAME_MESSAGE_SET_WIRE_FORMAT',
        'ENUM_NO_DELETE',
        'ENUM_VALUE_NO_DELETE',
        'ENUM_VALUE_NO_DELETE_UNLESS_NUMBER_RESERVED',
        'ENUM_VALUE_NO_DELETE_UNLESS_NAME_RESERVED',
        'ENUM_VALUE_SAME_NAME',
        'SERVICE_NO_DELETE',
        'RPC_NO_DELETE',
        'RPC_SAME_CLIENT_STREAMING',
        'RPC_SAME_SERVER_STREAMING',
        'RPC_SAME_REQUEST_TYPE',
        'RPC_SAME_RESPONSE_TYPE',
        'PACKAGE_NO_DELETE',
        'RESERVED_ENUM_NO_DELETE',
        'RESERVED_MESSAGE_NO_DELETE',
      ];

      detector.updateSettings({
        enabled: true,
        rules: allRules,
      });

      const current = parser.parse('syntax = "proto3"; message Test {}', 'file:///test.proto');
      const baseline = parser.parse('syntax = "proto3"; message Test {}', 'file:///test.proto');

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('git baseline edge cases', () => {
    it('should handle stderr output', async () => {
      detector.setWorkspaceRoot('/workspace');
      detector.updateSettings({ againstGitRef: 'main' });

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('syntax = "proto3";')), 0);
            }
            return mockProcess.stdout;
          }),
        },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              // Git may output warnings to stderr even on success
              setTimeout(() => callback(Buffer.from('warning: some git warning')), 0);
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

      const result = await detector.getBaseline('/workspace/test.proto');
      expect(result).toBe('syntax = "proto3";');
    });

    it('should handle multiple data chunks', async () => {
      detector.setWorkspaceRoot('/workspace');
      detector.updateSettings({ againstGitRef: 'HEAD~1' });

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => {
                callback(Buffer.from('syntax = '));
                callback(Buffer.from('"proto3";'));
              }, 0);
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

      const result = await detector.getBaseline('/workspace/test.proto');
      expect(result).toBe('syntax = "proto3";');
    });
  });

  describe('indexByName edge cases', () => {
    it('should handle empty arrays', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['MESSAGE_NO_DELETE', 'ENUM_NO_DELETE', 'SERVICE_NO_DELETE'],
      });

      const current = parser.parse('syntax = "proto3";', 'file:///test.proto');
      const baseline = parser.parse('syntax = "proto3";', 'file:///test.proto');

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      expect(diagnostics.length).toBe(0);
    });

    it('should handle messages with same name correctly', () => {
      detector.updateSettings({
        enabled: true,
        rules: ['MESSAGE_NO_DELETE', 'FIELD_SAME_TYPE'],
      });

      const current = parser.parse(
        `
        syntax = "proto3";
        message User {
          int32 age = 1;
        }
      `,
        'file:///test.proto'
      );
      const baseline = parser.parse(
        `
        syntax = "proto3";
        message User {
          string age = 1;
        }
      `,
        'file:///test.proto'
      );

      const diagnostics = detector.detectBreakingChanges(current, baseline);
      // Should detect type change, not deletion
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe('FIELD_SAME_TYPE');
    });
  });
});
