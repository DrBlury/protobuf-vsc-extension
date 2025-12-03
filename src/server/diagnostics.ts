/**
 * Diagnostics Provider for Protocol Buffers
 * Provides real-time validation and error checking
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range
} from 'vscode-languageserver/node';

import {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  FieldDefinition,
  BUILTIN_TYPES,
  MAP_KEY_TYPES,
  MIN_FIELD_NUMBER,
  MAX_FIELD_NUMBER,
  RESERVED_RANGE_START,
  RESERVED_RANGE_END,
  ReservedRange
} from './ast';
import { SemanticAnalyzer } from './analyzer';

export interface DiagnosticsSettings {
  namingConventions: boolean;
  referenceChecks: boolean;
  importChecks: boolean;
  fieldTagChecks: boolean;
  duplicateFieldChecks: boolean;
  discouragedConstructs: boolean;
}

const DEFAULT_SETTINGS: DiagnosticsSettings = {
  namingConventions: true,
  referenceChecks: true,
  importChecks: true,
  fieldTagChecks: true,
  duplicateFieldChecks: true,
  discouragedConstructs: true
};

export class DiagnosticsProvider {
  private analyzer: SemanticAnalyzer;
  private settings: DiagnosticsSettings = DEFAULT_SETTINGS;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  updateSettings(settings: Partial<DiagnosticsSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  validate(uri: string, file: ProtoFile): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const packageName = file.package?.name || '';

    // Validate messages
    for (const message of file.messages) {
      this.validateMessage(uri, message, packageName, diagnostics);
    }

    // Validate enums
    for (const enumDef of file.enums) {
      this.validateEnum(uri, enumDef, packageName, diagnostics);
    }

    // Validate services
    for (const service of file.services) {
      this.validateService(uri, service, packageName, diagnostics);
    }

    // Validate imports
    if (this.settings.importChecks) {
      this.validateImports(uri, file, diagnostics);
    }

    return diagnostics;
  }

  private validateMessage(
    uri: string,
    message: MessageDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check naming convention (PascalCase)
    if (this.settings.namingConventions && !this.isPascalCase(message.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(message.nameRange),
        message: `Message name '${message.name}' should be PascalCase`,
        source: 'protobuf'
      });
    }

    // Collect all field numbers and names for duplicate checking
    const fieldNumbers = new Map<number, FieldDefinition[]>();
    const fieldNames = new Map<string, FieldDefinition[]>();
    const reservedNumbers = new Set<number>();
    const reservedNames = new Set<string>();

    // Collect reserved numbers and names
    for (const reserved of message.reserved) {
      for (const range of reserved.ranges) {
        const end = range.end === 'max' ? MAX_FIELD_NUMBER : range.end;
        for (let i = range.start; i <= end; i++) {
          reservedNumbers.add(i);
        }
      }
      for (const name of reserved.names) {
        reservedNames.add(name);
      }
    }

    // Validate fields
    const allFields = [
      ...message.fields,
      ...message.oneofs.flatMap(o => o.fields)
    ];

    for (const field of allFields) {
      this.validateField(uri, field, fullName, diagnostics, reservedNumbers, reservedNames);

      // Collect for duplicate checking
      if (!fieldNumbers.has(field.number)) {
        fieldNumbers.set(field.number, []);
      }
      fieldNumbers.get(field.number)!.push(field);

      if (!fieldNames.has(field.name)) {
        fieldNames.set(field.name, []);
      }
      fieldNames.get(field.name)!.push(field);
    }

    // Validate map fields
    for (const mapField of message.maps) {
      this.validateMapField(uri, mapField, fullName, diagnostics, reservedNumbers, reservedNames);

      if (!fieldNumbers.has(mapField.number)) {
        fieldNumbers.set(mapField.number, []);
      }

      if (!fieldNames.has(mapField.name)) {
        fieldNames.set(mapField.name, []);
      }
    }

    // Check for duplicate field numbers
    if (this.settings.fieldTagChecks) {
      for (const [number, fields] of fieldNumbers) {
        if (fields.length > 1) {
          for (const field of fields) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: this.toRange(field.range),
              message: `Duplicate field number ${number}`,
              source: 'protobuf'
            });
          }
        }
      }
    }

    // Check for duplicate field names
    if (this.settings.duplicateFieldChecks) {
      for (const [name, fields] of fieldNames) {
        if (fields.length > 1) {
          for (const field of fields) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: this.toRange(field.nameRange),
              message: `Duplicate field name '${name}'`,
              source: 'protobuf'
            });
          }
        }
      }
    }

    // Validate nested messages
    for (const nested of message.nestedMessages) {
      this.validateMessage(uri, nested, fullName, diagnostics);
    }

    // Validate nested enums
    for (const nested of message.nestedEnums) {
      this.validateEnum(uri, nested, fullName, diagnostics);
    }

    // Validate oneofs
    for (const oneof of message.oneofs) {
      if (this.settings.namingConventions && !this.isSnakeCase(oneof.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(oneof.nameRange),
          message: `Oneof name '${oneof.name}' should be snake_case`,
          source: 'protobuf'
        });
      }
    }
  }

  private validateField(
    uri: string,
    field: FieldDefinition,
    containerName: string,
    diagnostics: Diagnostic[],
    reservedNumbers: Set<number>,
    reservedNames: Set<string>
  ): void {
    // Check naming convention (snake_case)
    if (this.settings.namingConventions && !this.isSnakeCase(field.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(field.nameRange),
        message: `Field name '${field.name}' should be snake_case`,
        source: 'protobuf'
      });
    }

    // Check field number range
    if (this.settings.fieldTagChecks) {
      if (field.number < MIN_FIELD_NUMBER || field.number > MAX_FIELD_NUMBER) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is out of valid range (${MIN_FIELD_NUMBER}-${MAX_FIELD_NUMBER})`,
          source: 'protobuf'
        });
      } else if (field.number >= RESERVED_RANGE_START && field.number <= RESERVED_RANGE_END) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is in reserved range (${RESERVED_RANGE_START}-${RESERVED_RANGE_END})`,
          source: 'protobuf'
        });
      }

      // Check if using reserved number
      if (reservedNumbers.has(field.number)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is reserved`,
          source: 'protobuf'
        });
      }

      // Check if using reserved name
      if (reservedNames.has(field.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.nameRange),
          message: `Field name '${field.name}' is reserved`,
          source: 'protobuf'
        });
      }
    }

    // Check type reference
    if (this.settings.referenceChecks && !BUILTIN_TYPES.includes(field.fieldType)) {
      const symbol = this.analyzer.resolveType(field.fieldType, uri, containerName);
      if (!symbol) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.fieldTypeRange),
          message: `Unknown type '${field.fieldType}'`,
          source: 'protobuf'
        });
      }
    }

    // Check for discouraged constructs
    if (this.settings.discouragedConstructs) {
      if (field.modifier === 'required') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(field.range),
          message: `'required' is deprecated in proto3. Consider using 'optional' or no modifier`,
          source: 'protobuf'
        });
      }
    }
  }

  private validateMapField(
    uri: string,
    mapField: any,
    containerName: string,
    diagnostics: Diagnostic[],
    reservedNumbers: Set<number>,
    reservedNames: Set<string>
  ): void {
    // Check key type
    if (!MAP_KEY_TYPES.includes(mapField.keyType)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: this.toRange(mapField.range),
        message: `Invalid map key type '${mapField.keyType}'. Map keys must be integral or string types`,
        source: 'protobuf'
      });
    }

    // Check value type reference
    if (this.settings.referenceChecks && !BUILTIN_TYPES.includes(mapField.valueType)) {
      const symbol = this.analyzer.resolveType(mapField.valueType, uri, containerName);
      if (!symbol) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.valueTypeRange),
          message: `Unknown type '${mapField.valueType}'`,
          source: 'protobuf'
        });
      }
    }

    // Check naming convention
    if (this.settings.namingConventions && !this.isSnakeCase(mapField.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(mapField.nameRange),
        message: `Field name '${mapField.name}' should be snake_case`,
        source: 'protobuf'
      });
    }

    // Check field number
    if (this.settings.fieldTagChecks) {
      if (mapField.number < MIN_FIELD_NUMBER || mapField.number > MAX_FIELD_NUMBER) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.range),
          message: `Field number ${mapField.number} is out of valid range`,
          source: 'protobuf'
        });
      }

      if (reservedNumbers.has(mapField.number)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.range),
          message: `Field number ${mapField.number} is reserved`,
          source: 'protobuf'
        });
      }

      if (reservedNames.has(mapField.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.nameRange),
          message: `Field name '${mapField.name}' is reserved`,
          source: 'protobuf'
        });
      }
    }
  }

  private validateEnum(
    uri: string,
    enumDef: EnumDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    // Check naming convention (PascalCase)
    if (this.settings.namingConventions && !this.isPascalCase(enumDef.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(enumDef.nameRange),
        message: `Enum name '${enumDef.name}' should be PascalCase`,
        source: 'protobuf'
      });
    }

    // Check enum values
    const valueNumbers = new Map<number, string[]>();
    let hasZeroValue = false;

    for (const value of enumDef.values) {
      // Check naming convention (SCREAMING_SNAKE_CASE)
      if (this.settings.namingConventions && !this.isScreamingSnakeCase(value.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(value.nameRange),
          message: `Enum value '${value.name}' should be SCREAMING_SNAKE_CASE`,
          source: 'protobuf'
        });
      }

      // Collect for duplicate checking
      if (!valueNumbers.has(value.number)) {
        valueNumbers.set(value.number, []);
      }
      valueNumbers.get(value.number)!.push(value.name);

      if (value.number === 0) {
        hasZeroValue = true;
      }
    }

    // Check for first value being 0 (required for proto3)
    if (this.settings.discouragedConstructs && !hasZeroValue && enumDef.values.length > 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(enumDef.values[0].range),
        message: `First enum value should be 0 in proto3`,
        source: 'protobuf'
      });
    }

    // Check for duplicate values (allowed with allow_alias option)
    const hasAllowAlias = enumDef.options.some(o => o.name === 'allow_alias' && o.value === true);
    if (!hasAllowAlias) {
      for (const [number, names] of valueNumbers) {
        if (names.length > 1) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(enumDef.range),
            message: `Duplicate enum value ${number} for ${names.join(', ')}. Use option allow_alias = true; to allow aliases`,
            source: 'protobuf'
          });
        }
      }
    }
  }

  private validateService(
    uri: string,
    service: ServiceDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    // Check naming convention (PascalCase)
    if (this.settings.namingConventions && !this.isPascalCase(service.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(service.nameRange),
        message: `Service name '${service.name}' should be PascalCase`,
        source: 'protobuf'
      });
    }

    // Validate RPCs
    for (const rpc of service.rpcs) {
      // Check naming convention (PascalCase)
      if (this.settings.namingConventions && !this.isPascalCase(rpc.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(rpc.nameRange),
          message: `RPC name '${rpc.name}' should be PascalCase`,
          source: 'protobuf'
        });
      }

      // Check input type reference
      if (this.settings.referenceChecks) {
        const inputSymbol = this.analyzer.resolveType(rpc.inputType, uri, prefix);
        if (!inputSymbol) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.inputTypeRange),
            message: `Unknown type '${rpc.inputType}'`,
            source: 'protobuf'
          });
        }

        // Check output type reference
        const outputSymbol = this.analyzer.resolveType(rpc.outputType, uri, prefix);
        if (!outputSymbol) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.outputTypeRange),
            message: `Unknown type '${rpc.outputType}'`,
            source: 'protobuf'
          });
        }
      }
    }
  }

  private validateImports(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    // Basic import validation - check for empty paths
    for (const imp of file.imports) {
      if (!imp.path || imp.path.trim() === '') {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(imp.range),
          message: `Empty import path`,
          source: 'protobuf'
        });
      }
    }
  }

  private isPascalCase(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  private isSnakeCase(name: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  private isScreamingSnakeCase(name: string): boolean {
    return /^[A-Z][A-Z0-9_]*$/.test(name);
  }

  private toRange(range: any): Range {
    return {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character }
    };
  }
}
