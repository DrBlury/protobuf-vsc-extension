/**
 * Breaking Change Detection for Protocol Buffers
 * Compares proto files against a baseline to detect breaking API changes
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { ProtoFile, MessageDefinition, EnumDefinition, ServiceDefinition, FieldDefinition, RpcDefinition } from './ast';
import { spawn } from 'child_process';
import * as path from 'path';

export interface BreakingChangeSettings {
  enabled: boolean;
  againstStrategy: 'git' | 'file' | 'none';
  againstGitRef: string;
  againstFilePath: string;
  rules: BreakingChangeRule[];
}

export type BreakingChangeRule =
  | 'FIELD_NO_DELETE'
  | 'FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED'
  | 'FIELD_NO_DELETE_UNLESS_NAME_RESERVED'
  | 'FIELD_SAME_TYPE'
  | 'FIELD_SAME_NAME'
  | 'FIELD_SAME_JSON_NAME'
  | 'FIELD_SAME_LABEL'
  | 'FIELD_SAME_ONEOF'
  | 'MESSAGE_NO_DELETE'
  | 'MESSAGE_NO_REMOVE_STANDARD_DESCRIPTOR_ACCESSOR'
  | 'MESSAGE_SAME_MESSAGE_SET_WIRE_FORMAT'
  | 'ENUM_NO_DELETE'
  | 'ENUM_VALUE_NO_DELETE'
  | 'ENUM_VALUE_NO_DELETE_UNLESS_NUMBER_RESERVED'
  | 'ENUM_VALUE_NO_DELETE_UNLESS_NAME_RESERVED'
  | 'ENUM_VALUE_SAME_NAME'
  | 'SERVICE_NO_DELETE'
  | 'RPC_NO_DELETE'
  | 'RPC_SAME_CLIENT_STREAMING'
  | 'RPC_SAME_SERVER_STREAMING'
  | 'RPC_SAME_REQUEST_TYPE'
  | 'RPC_SAME_RESPONSE_TYPE'
  | 'PACKAGE_NO_DELETE'
  | 'RESERVED_ENUM_NO_DELETE'
  | 'RESERVED_MESSAGE_NO_DELETE';

export interface BreakingChange {
  rule: BreakingChangeRule;
  severity: 'error' | 'warning';
  message: string;
  range: Range;
  oldValue?: string;
  newValue?: string;
}

const DEFAULT_SETTINGS: BreakingChangeSettings = {
  enabled: true,
  againstStrategy: 'git',
  againstGitRef: 'HEAD~1',
  againstFilePath: '',
  rules: [
    'FIELD_NO_DELETE',
    'FIELD_SAME_TYPE',
    'FIELD_SAME_NAME',
    'MESSAGE_NO_DELETE',
    'ENUM_NO_DELETE',
    'ENUM_VALUE_NO_DELETE',
    'SERVICE_NO_DELETE',
    'RPC_NO_DELETE',
    'RPC_SAME_REQUEST_TYPE',
    'RPC_SAME_RESPONSE_TYPE'
  ]
};

export class BreakingChangeDetector {
  private settings: BreakingChangeSettings = DEFAULT_SETTINGS;
  private workspaceRoot: string = '';

  updateSettings(settings: Partial<BreakingChangeSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * Check for breaking changes between current and baseline proto files
   */
  detectBreakingChanges(
    currentFile: ProtoFile,
    baselineFile: ProtoFile | null,
    _currentUri: string
  ): Diagnostic[] {
    if (!this.settings.enabled || !baselineFile) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];
    const changes = this.compareFiles(currentFile, baselineFile);

    for (const change of changes) {
      if (this.settings.rules.includes(change.rule)) {
        diagnostics.push({
          severity: change.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range: change.range,
          message: `Breaking change: ${change.message}`,
          source: 'protobuf-breaking',
          code: change.rule
        });
      }
    }

    return diagnostics;
  }

  /**
   * Get baseline file content from git
   */
  async getBaselineFromGit(filePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const ref = this.settings.againstGitRef || 'HEAD~1';

      const proc = spawn('git', ['show', `${ref}:${relativePath}`], {
        cwd: this.workspaceRoot,
        shell: true
      });

      let content = '';

      proc.stdout?.on('data', (data: Buffer) => {
        content += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        // Capture stderr for debugging purposes (not currently used)
        data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(content);
        } else {
          // File might not exist in baseline
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }

  private compareFiles(current: ProtoFile, baseline: ProtoFile): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Compare packages
    if (baseline.package && !current.package) {
      changes.push({
        rule: 'PACKAGE_NO_DELETE',
        severity: 'error',
        message: `Package '${baseline.package.name}' was deleted`,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
      });
    }

    // Compare messages
    const baselineMessages = this.indexByName(baseline.messages);
    const currentMessages = this.indexByName(current.messages);

    for (const [name, baselineMsg] of baselineMessages) {
      const currentMsg = currentMessages.get(name);

      if (!currentMsg) {
        changes.push({
          rule: 'MESSAGE_NO_DELETE',
          severity: 'error',
          message: `Message '${name}' was deleted`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
        });
      } else {
        changes.push(...this.compareMessages(currentMsg, baselineMsg));
      }
    }

    // Compare enums
    const baselineEnums = this.indexByName(baseline.enums);
    const currentEnums = this.indexByName(current.enums);

    for (const [name, baselineEnum] of baselineEnums) {
      const currentEnum = currentEnums.get(name);

      if (!currentEnum) {
        changes.push({
          rule: 'ENUM_NO_DELETE',
          severity: 'error',
          message: `Enum '${name}' was deleted`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
        });
      } else {
        changes.push(...this.compareEnums(currentEnum, baselineEnum));
      }
    }

    // Compare services
    const baselineServices = this.indexByName(baseline.services);
    const currentServices = this.indexByName(current.services);

    for (const [name, baselineService] of baselineServices) {
      const currentService = currentServices.get(name);

      if (!currentService) {
        changes.push({
          rule: 'SERVICE_NO_DELETE',
          severity: 'error',
          message: `Service '${name}' was deleted`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
        });
      } else {
        changes.push(...this.compareServices(currentService, baselineService));
      }
    }

    return changes;
  }

  private compareMessages(current: MessageDefinition, baseline: MessageDefinition): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Index baseline fields by number and name
    const baselineFieldsByNumber = new Map<number, FieldDefinition>();
    const baselineFieldsByName = new Map<string, FieldDefinition>();

    for (const field of baseline.fields) {
      baselineFieldsByNumber.set(field.number, field);
      baselineFieldsByName.set(field.name, field);
    }

    // Check for deleted fields
    for (const [number, baselineField] of baselineFieldsByNumber) {
      const currentField = current.fields.find(f => f.number === number);

      if (!currentField) {
        // Check if number is reserved
        const isReserved = current.reserved.some(r =>
          r.ranges.some(range => {
            const end = range.end === 'max' ? Infinity : range.end;
            return number >= range.start && number <= end;
          })
        );

        if (!isReserved) {
          changes.push({
            rule: 'FIELD_NO_DELETE',
            severity: 'error',
            message: `Field '${baselineField.name}' (number ${number}) was deleted without reserving the field number`,
            range: current.nameRange
          });
        }
      } else {
        // Check for type changes
        if (currentField.fieldType !== baselineField.fieldType) {
          changes.push({
            rule: 'FIELD_SAME_TYPE',
            severity: 'error',
            message: `Field '${currentField.name}' type changed from '${baselineField.fieldType}' to '${currentField.fieldType}'`,
            range: currentField.fieldTypeRange,
            oldValue: baselineField.fieldType,
            newValue: currentField.fieldType
          });
        }

        // Check for name changes (on same field number)
        if (currentField.name !== baselineField.name) {
          changes.push({
            rule: 'FIELD_SAME_NAME',
            severity: 'warning',
            message: `Field ${number} name changed from '${baselineField.name}' to '${currentField.name}'`,
            range: currentField.nameRange,
            oldValue: baselineField.name,
            newValue: currentField.name
          });
        }

        // Check for label changes
        if (currentField.modifier !== baselineField.modifier) {
          changes.push({
            rule: 'FIELD_SAME_LABEL',
            severity: 'warning',
            message: `Field '${currentField.name}' label changed from '${baselineField.modifier || 'singular'}' to '${currentField.modifier || 'singular'}'`,
            range: currentField.range
          });
        }
      }
    }

    // Check nested messages
    const baselineNestedMsgs = this.indexByName(baseline.nestedMessages);
    for (const [name, baselineNested] of baselineNestedMsgs) {
      const currentNested = current.nestedMessages.find(m => m.name === name);
      if (!currentNested) {
        changes.push({
          rule: 'MESSAGE_NO_DELETE',
          severity: 'error',
          message: `Nested message '${current.name}.${name}' was deleted`,
          range: current.nameRange
        });
      } else {
        changes.push(...this.compareMessages(currentNested, baselineNested));
      }
    }

    // Check nested enums
    const baselineNestedEnums = this.indexByName(baseline.nestedEnums);
    for (const [name, baselineNested] of baselineNestedEnums) {
      const currentNested = current.nestedEnums.find(e => e.name === name);
      if (!currentNested) {
        changes.push({
          rule: 'ENUM_NO_DELETE',
          severity: 'error',
          message: `Nested enum '${current.name}.${name}' was deleted`,
          range: current.nameRange
        });
      } else {
        changes.push(...this.compareEnums(currentNested, baselineNested));
      }
    }

    return changes;
  }

  private compareEnums(current: EnumDefinition, baseline: EnumDefinition): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Index baseline values by number
    const baselineValuesByNumber = new Map<number, string>();
    for (const value of baseline.values) {
      baselineValuesByNumber.set(value.number, value.name);
    }

    // Check for deleted values
    for (const [number, baselineName] of baselineValuesByNumber) {
      const currentValue = current.values.find(v => v.number === number);

      if (!currentValue) {
        changes.push({
          rule: 'ENUM_VALUE_NO_DELETE',
          severity: 'error',
          message: `Enum value '${baselineName}' (number ${number}) was deleted from '${current.name}'`,
          range: current.nameRange
        });
      } else if (currentValue.name !== baselineName) {
        changes.push({
          rule: 'ENUM_VALUE_SAME_NAME',
          severity: 'warning',
          message: `Enum value ${number} in '${current.name}' renamed from '${baselineName}' to '${currentValue.name}'`,
          range: currentValue.nameRange
        });
      }
    }

    return changes;
  }

  private compareServices(current: ServiceDefinition, baseline: ServiceDefinition): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Index baseline RPCs by name
    const baselineRpcs = new Map<string, RpcDefinition>();
    for (const rpc of baseline.rpcs) {
      baselineRpcs.set(rpc.name, rpc);
    }

    // Check for deleted RPCs
    for (const [name, baselineRpc] of baselineRpcs) {
      const currentRpc = current.rpcs.find(r => r.name === name);

      if (!currentRpc) {
        changes.push({
          rule: 'RPC_NO_DELETE',
          severity: 'error',
          message: `RPC '${name}' was deleted from service '${current.name}'`,
          range: current.nameRange
        });
      } else {
        // Check request type
        if (currentRpc.inputType !== baselineRpc.inputType) {
          changes.push({
            rule: 'RPC_SAME_REQUEST_TYPE',
            severity: 'error',
            message: `RPC '${name}' request type changed from '${baselineRpc.inputType}' to '${currentRpc.inputType}'`,
            range: currentRpc.inputTypeRange
          });
        }

        // Check response type
        if (currentRpc.outputType !== baselineRpc.outputType) {
          changes.push({
            rule: 'RPC_SAME_RESPONSE_TYPE',
            severity: 'error',
            message: `RPC '${name}' response type changed from '${baselineRpc.outputType}' to '${currentRpc.outputType}'`,
            range: currentRpc.outputTypeRange
          });
        }

        // Check streaming changes
        if (currentRpc.inputStream !== baselineRpc.inputStream) {
          changes.push({
            rule: 'RPC_SAME_CLIENT_STREAMING',
            severity: 'error',
            message: `RPC '${name}' client streaming changed from ${baselineRpc.inputStream} to ${currentRpc.inputStream}`,
            range: currentRpc.nameRange
          });
        }

        if (currentRpc.outputStream !== baselineRpc.outputStream) {
          changes.push({
            rule: 'RPC_SAME_SERVER_STREAMING',
            severity: 'error',
            message: `RPC '${name}' server streaming changed from ${baselineRpc.outputStream} to ${currentRpc.outputStream}`,
            range: currentRpc.nameRange
          });
        }
      }
    }

    return changes;
  }

  private indexByName<T extends { name: string }>(items: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
      map.set(item.name, item);
    }
    return map;
  }
}

export const breakingChangeDetector = new BreakingChangeDetector();
