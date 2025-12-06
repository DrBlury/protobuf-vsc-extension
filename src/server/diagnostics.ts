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
  OneofDefinition,
  FieldDefinition,
  OptionStatement,
  BUILTIN_TYPES,
  MAP_KEY_TYPES,
  MIN_FIELD_NUMBER,
  MAX_FIELD_NUMBER,
  RESERVED_RANGE_START,
  RESERVED_RANGE_END
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

  validate(uri: string, file: ProtoFile, documentText?: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const packageName = file.package?.name || '';

    this.validateSyntaxOrEdition(uri, file, diagnostics);

    this.validatePackagePathConsistency(uri, file, diagnostics);

    // Collect type usages for downstream checks (imports, unused imports, numbering continuity helpers)
    const usedTypeUris = this.collectUsedTypeUris(file, uri);

    // Validate messages
    for (const message of file.messages) {
      this.validateMessage(uri, message, packageName, diagnostics);
      this.validateOptionTypes(message.options, diagnostics);
    }

    // Validate enums
    for (const enumDef of file.enums) {
      this.validateEnum(uri, enumDef, packageName, diagnostics);
      this.validateOptionTypes(enumDef.options, diagnostics);
    }

    // Validate services
    for (const service of file.services) {
      this.validateService(uri, service, packageName, diagnostics);
      this.validateOptionTypes(service.options, diagnostics);
    }

    // Validate imports
    if (this.settings.importChecks) {
      this.validateImports(uri, file, diagnostics, usedTypeUris);
    }

    // File-level options
    this.validateOptionTypes(file.options, diagnostics);

    // Heuristic: detect field-like lines missing semicolons to drive quick fixes
    if (documentText) {
      this.validateMissingSemicolons(uri, documentText, diagnostics);
    }

    return diagnostics;
  }

  private validateSyntaxOrEdition(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const hasSyntax = !!file.syntax;
    const hasEdition = !!file.edition;

    if (!hasSyntax && !hasEdition) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(file.range),
        message: 'Missing syntax or edition declaration (e.g., syntax = "proto3";)',
        source: 'protobuf'
      });
    }
  }

  private validatePackagePathConsistency(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    if (!file.package?.name) {
      return;
    }

    try {
      const fsPath = decodeURI(uri.replace('file://', ''));
      const segments = fsPath.split(/[\\/]+/);
      if (segments.length < 2) {
        return;
      }
      const dir = segments[segments.length - 2];
      const pkgSegments = file.package.name.split('.');
      if (!pkgSegments.includes(dir)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: this.toRange(file.package.range),
          message: `Package '${file.package.name}' does not appear to match directory '${dir}'`,
          source: 'protobuf'
        });
      }
    } catch (_e) {
      // Ignore path issues
    }
  }

  private validateMissingSemicolons(uri: string, text: string, diagnostics: Diagnostic[]): void {
    const lines = text.split('\n');

    const fieldLike = /^(?:optional|required|repeated)?\s*([A-Za-z_][\w<>.,]*)\s+([A-Za-z_][\w]*)(?:\s*=\s*\d+)?/;
    const mapLike = /^\s*map\s*<[^>]+>\s+[A-Za-z_][\w]*(?:\s*=\s*\d+)?/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        continue;
      }

      if (/^(message|enum|service|oneof)\b/.test(trimmed) || trimmed.startsWith('option') ||
          trimmed.startsWith('import') || trimmed.startsWith('syntax') || trimmed.startsWith('edition') ||
          trimmed.startsWith('reserved') || trimmed.startsWith('rpc') || trimmed.startsWith('package')) {
        continue;
      }

      if (trimmed.endsWith(';') || trimmed.endsWith('{') || trimmed.endsWith('}')) {
        continue;
      }

      const looksLikeField = fieldLike.test(trimmed) || mapLike.test(trimmed);
      if (!looksLikeField) {
        continue;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        message: 'Field is missing semicolon',
        source: 'protobuf'
      });
    }
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

    // Check numbering continuity (gaps/out-of-order) including oneof fields
    this.checkFieldNumberContinuity(message, diagnostics, reservedNumbers);

    // Check for overlapping reserved ranges
    this.checkReservedOverlap(message, diagnostics);

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
          this.validateOneof(oneof, diagnostics);
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
      } else {
        this.ensureImported(uri, field.fieldType, symbol.location.uri, this.toRange(field.fieldTypeRange), diagnostics);
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
    mapField: {
      keyType: string;
      valueType: string;
      name: string;
      number: number;
      range: Range;
      nameRange: Range;
      valueTypeRange: Range;
    },
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
      } else {
        this.ensureImported(uri, mapField.valueType, symbol.location.uri, this.toRange(mapField.valueTypeRange), diagnostics);
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

  private validateOptionTypes(options: OptionStatement[], diagnostics: Diagnostic[]): void {
    const boolOptions = new Set(['deprecated', 'java_multiple_files', 'cc_enable_arenas', 'java_string_check_utf8', 'allow_alias']);
    const stringOptions = new Set(['java_package', 'java_outer_classname', 'go_package', 'objc_class_prefix', 'csharp_namespace', 'swift_prefix', 'php_namespace', 'ruby_package']);
    const enumOptions = new Map<string, Set<string>>([
      ['optimize_for', new Set(['SPEED', 'CODE_SIZE', 'LITE_RUNTIME'])]
    ]);

    for (const opt of options) {
      if (boolOptions.has(opt.name) && typeof opt.value !== 'boolean') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(opt.range),
          message: `Option '${opt.name}' expects a boolean value`,
          source: 'protobuf'
        });
      }

      if (stringOptions.has(opt.name) && typeof opt.value !== 'string') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(opt.range),
          message: `Option '${opt.name}' expects a string value`,
          source: 'protobuf'
        });
      }

      const enumSet = enumOptions.get(opt.name);
      if (enumSet && (typeof opt.value !== 'string' || !enumSet.has(String(opt.value)))) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(opt.range),
          message: `Option '${opt.name}' expects one of: ${Array.from(enumSet).join(', ')}`,
          source: 'protobuf'
        });
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

        if (!rpc.inputType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.range),
            message: `RPC '${rpc.name}' is missing request type`,
            source: 'protobuf'
          });
        }

        if (!rpc.outputType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.range),
            message: `RPC '${rpc.name}' is missing response type`,
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
        } else {
          this.ensureImported(uri, rpc.inputType, inputSymbol.location.uri, this.toRange(rpc.inputTypeRange), diagnostics);
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
        } else {
          this.ensureImported(uri, rpc.outputType, outputSymbol.location.uri, this.toRange(rpc.outputTypeRange), diagnostics);
        }
      }
    }
  }

  private validateImports(uri: string, file: ProtoFile, diagnostics: Diagnostic[], usedTypeUris: Set<string>): void {
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

    const importByPath = new Map<string, typeof file.imports[number]>();
    for (const imp of file.imports) {
      importByPath.set(imp.path, imp);
    }

    const importsWithResolutions = this.analyzer.getImportsWithResolutions(uri);

    // Unresolved imports
    for (const imp of importsWithResolutions) {
      if (!imp.resolvedUri) {
        const rangeInfo = importByPath.get(imp.importPath);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: rangeInfo ? this.toRange(rangeInfo.range) : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: `Import '${imp.importPath}' cannot be resolved`,
          source: 'protobuf'
        });
      }
    }

    // Unused imports (resolved, not public, not referenced)
    for (const imp of importsWithResolutions) {
      if (!imp.resolvedUri) {
        continue;
      }
      const rangeInfo = importByPath.get(imp.importPath);
      const modifier = rangeInfo?.modifier;
      if (modifier === 'public') {
        continue; // public imports are re-exported; skip
      }
      if (!usedTypeUris.has(imp.resolvedUri)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: rangeInfo ? this.toRange(rangeInfo.range) : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: `Unused import '${imp.importPath}'`,
          source: 'protobuf'
        });
      }
    }
  }

  private validateOneof(oneof: OneofDefinition, diagnostics: Diagnostic[]): void {
    const numbers = new Map<number, FieldDefinition[]>();

    for (const field of oneof.fields) {
      if (field.modifier && field.modifier !== 'optional') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(field.range),
          message: `Field '${field.name}' in oneof '${oneof.name}' should not use modifier '${field.modifier}'`,
          source: 'protobuf'
        });
      }

      if (!numbers.has(field.number)) {
        numbers.set(field.number, []);
      }
      numbers.get(field.number)!.push(field);
    }

    for (const [num, fields] of numbers) {
      if (fields.length > 1) {
        for (const f of fields) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(f.range),
            message: `Oneof '${oneof.name}' has duplicate field number ${num}`,
            source: 'protobuf'
          });
        }
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

  private ensureImported(
    currentUri: string,
    typeName: string,
    definitionUri: string,
    range: Range,
    diagnostics: Diagnostic[]
  ): void {
    const imported = new Set(this.analyzer.getImportedFileUris(currentUri));
    imported.add(currentUri);

    const importsWithResolution = this.analyzer.getImportsWithResolutions(currentUri);
    const importedVia = importsWithResolution.find(i => i.resolvedUri === definitionUri);
    const suggestedImport = this.getSuggestedImportPath(currentUri, definitionUri);

    // If the canonical path is already declared as an import (even if unresolved), don't flag it
    if (suggestedImport && importsWithResolution.some(i => i.importPath === suggestedImport)) {
      return;
    }

    // Already imported, but via a mismatched path (e.g., "date.proto" instead of "google/type/date.proto")
    if (importedVia && suggestedImport && importedVia.importPath !== suggestedImport) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: `Type '${typeName}' should be imported via "${suggestedImport}" (found "${importedVia.importPath}")`,
        source: 'protobuf'
      });
      return;
    }

    // Already imported correctly
    if (imported.has(definitionUri)) {
      return;
    }

    const suggestionText = suggestedImport ? ` Add: import "${suggestedImport}";` : '';

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range,
      message: `Type '${typeName}' is not imported.${suggestionText}`.trim(),
      source: 'protobuf'
    });
  }

  private collectUsedTypeUris(file: ProtoFile, uri: string): Set<string> {
    const used = new Set<string>();

    const visitMessage = (message: MessageDefinition, container: string) => {
      const containerName = container ? `${container}.${message.name}` : message.name;

      for (const field of message.fields) {
        this.addResolvedTypeUri(field.fieldType, uri, containerName, used);
      }

      for (const mapField of message.maps) {
        this.addResolvedTypeUri(mapField.valueType, uri, containerName, used);
      }

      for (const oneof of message.oneofs) {
        for (const field of oneof.fields) {
          this.addResolvedTypeUri(field.fieldType, uri, containerName, used);
        }
      }

      for (const nested of message.nestedMessages) {
        visitMessage(nested, containerName);
      }

      for (const nestedEnum of message.nestedEnums) {
        // enums themselves do not introduce type usages here
        void nestedEnum;
      }
    };

    for (const message of file.messages) {
      visitMessage(message, file.package?.name || '');
    }

    for (const service of file.services) {
      const prefix = file.package?.name || '';
      for (const rpc of service.rpcs) {
        this.addResolvedTypeUri(rpc.inputType, uri, prefix, used);
        this.addResolvedTypeUri(rpc.outputType, uri, prefix, used);
      }
    }

    for (const enumDef of file.enums) {
      void enumDef;
    }

    return used;
  }

  private addResolvedTypeUri(typeName: string, uri: string, containerName: string, bucket: Set<string>): void {
    if (!typeName || BUILTIN_TYPES.includes(typeName)) {
      return;
    }
    const symbol = this.analyzer.resolveType(typeName, uri, containerName);
    if (symbol) {
      bucket.add(symbol.location.uri);
    }
  }

  private checkFieldNumberContinuity(message: MessageDefinition, diagnostics: Diagnostic[], reservedNumbers: Set<number>): void {
    const fields = [
      ...message.fields,
      ...message.maps,
      ...message.oneofs.flatMap(o => o.fields)
    ];

    if (fields.length === 0) {
      return;
    }

    const sorted = [...fields].sort((a, b) => a.number - b.number);
    let prev = sorted[0].number;

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i].number;

      if (current <= prev) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(sorted[i].range),
          message: `Field number ${current} is not strictly increasing (previous ${prev}). Consider renumbering`,
          source: 'protobuf'
        });
      }

      const gap = current - prev - 1;
      if (gap > 0) {
        const missingNumbers = [] as number[];
        for (let n = prev + 1; n < current; n++) {
          if ((n >= RESERVED_RANGE_START && n <= RESERVED_RANGE_END) || reservedNumbers.has(n)) {
            continue;
          }
          missingNumbers.push(n);
        }

        if (missingNumbers.length > 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: this.toRange(sorted[i].range),
            message: `Gap in field numbers between ${prev} and ${current}. Run renumber to close gaps`,
            source: 'protobuf'
          });
        }
      }

      prev = current;
    }
  }

  private checkReservedOverlap(message: MessageDefinition, diagnostics: Diagnostic[]): void {
    const ranges = message.reserved.map(r => r.ranges).flat();
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        const aEnd = a.end === 'max' ? MAX_FIELD_NUMBER : a.end;
        const bEnd = b.end === 'max' ? MAX_FIELD_NUMBER : b.end;
        const overlap = Math.max(a.start, b.start) <= Math.min(aEnd, bEnd);
        if (overlap) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: this.toRange(message.range),
            message: `Reserved ranges overlap (${a.start}-${aEnd} overlaps ${b.start}-${bEnd})`,
            source: 'protobuf'
          });
        }
      }
    }
  }

  private getSuggestedImportPath(currentUri: string, definitionUri: string): string | undefined {
    if (definitionUri.startsWith('builtin:///')) {
      return definitionUri.replace('builtin:///', '');
    }

    try {
      return this.analyzer.getImportPathForFile(currentUri, definitionUri);
    } catch (_e) {
      return undefined;
    }
  }

  private toRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }): Range {
    return {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character }
    };
  }
}
