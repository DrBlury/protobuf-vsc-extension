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
  GroupFieldDefinition,
  OptionStatement,
  BUILTIN_TYPES,
  MAP_KEY_TYPES,
  MIN_FIELD_NUMBER,
  MAX_FIELD_NUMBER,
  RESERVED_RANGE_START,
  RESERVED_RANGE_END
} from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';
import { ERROR_CODES, DIAGNOSTIC_SOURCE } from '../utils/constants';
import { logger } from '../utils/logger';
import { bufConfigProvider } from '../services/bufConfig';

export interface DiagnosticsSettings {
  namingConventions: boolean;
  referenceChecks: boolean;
  importChecks: boolean;
  fieldTagChecks: boolean;
  duplicateFieldChecks: boolean;
  discouragedConstructs: boolean;
  deprecatedUsage: boolean;
  unusedSymbols: boolean;
  circularDependencies: boolean;
  documentationComments: boolean;
}

const DEFAULT_SETTINGS: DiagnosticsSettings = {
  namingConventions: true,
  referenceChecks: true,
  importChecks: true,
  fieldTagChecks: true,
  duplicateFieldChecks: true,
  discouragedConstructs: true,
  deprecatedUsage: true,
  unusedSymbols: false, // Off by default as it can be noisy
  circularDependencies: true,
  documentationComments: true
};

export class DiagnosticsProvider {
  private analyzer: SemanticAnalyzer;
  private settings: DiagnosticsSettings = DEFAULT_SETTINGS;
  private currentDocumentText?: string;

  // Common patterns for external dependency directories
  private static readonly EXTERNAL_DEP_PATTERNS = [
    '/.buf-deps/',      // Buf exported dependencies
    '/vendor/',         // Go vendor directory
    '/third_party/',    // Common third-party directory
    '/external/',       // External dependencies
    '/node_modules/',   // Node modules (unlikely for proto but possible)
  ];

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Check if a file is in an external dependency directory
   * These files should not be validated as they are managed by external tools
   */
  private isExternalDependencyFile(uri: string): boolean {
    const normalizedUri = uri.replace(/\\/g, '/');
    return DiagnosticsProvider.EXTERNAL_DEP_PATTERNS.some(pattern =>
      normalizedUri.includes(pattern)
    );
  }

  updateSettings(settings: Partial<DiagnosticsSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  validate(uri: string, file: ProtoFile, documentText?: string): Diagnostic[] {
    // Skip validation for external dependency files (e.g., .buf-deps, vendor directories)
    // These are generated/exported files that should be validated by their source tools
    if (this.isExternalDependencyFile(uri)) {
      return [];
    }

    // Store document text for documentation comment checking
    this.currentDocumentText = documentText;
    const diagnostics: Diagnostic[] = [];
    const packageName = file.package?.name || '';

    this.validateSyntaxOrEdition(uri, file, diagnostics);

    this.validatePackagePathConsistency(uri, file, diagnostics);

    // Collect type usages for downstream checks (imports, unused imports, numbering continuity helpers)
    const usedTypeUris = this.collectUsedTypeUris(file, uri);

    logger.verbose(`Validating file ${uri}: ${file.messages.length} messages, ${file.enums.length} enums, ${file.services.length} services`);

    // Validate messages
    for (const message of file.messages) {
      this.validateMessage(uri, message, packageName, diagnostics);
      this.validateOptionTypes(message.options, diagnostics);
      this.validateExtensions(uri, message, diagnostics);
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

    // Check for deprecated field/enum usage
    if (this.settings.deprecatedUsage) {
      this.validateDeprecatedUsage(uri, file, diagnostics);
    }

    // Check for unused symbols
    if (this.settings.unusedSymbols) {
      this.validateUnusedSymbols(uri, file, diagnostics);
    }

    // Check for circular import dependencies
    if (this.settings.circularDependencies) {
      this.validateCircularDependencies(uri, file, diagnostics);
    }

    // Validate proto3 field presence semantics
    this.validateProto3FieldPresence(uri, file, diagnostics);

    // Validate documentation comments
    if (this.settings.documentationComments) {
      this.validateDocumentationComments(uri, file, diagnostics);
    }

    return diagnostics;
  }

  private validateSyntaxOrEdition(_uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const hasSyntax = !!file.syntax;
    const hasEdition = !!file.edition;

    if (!hasSyntax && !hasEdition) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(file.range),
        message: 'Missing syntax or edition declaration (e.g., syntax = "proto3";)',
        source: DIAGNOSTIC_SOURCE,
        code: ERROR_CODES.MISSING_SYNTAX
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
      const dir = segments[segments.length - 2]!;
      const pkgSegments = file.package.name.split('.');
      if (!pkgSegments.includes(dir)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: this.toRange(file.package.range),
          message: `Package '${file.package.name}' does not appear to match directory '${dir}'`,
          source: DIAGNOSTIC_SOURCE
        });
      }
    } catch {
      // Ignore path issues
    }
  }

  private validateMissingSemicolons(_uri: string, text: string, diagnostics: Diagnostic[]): void {
    const lines = text.split('\n');

    const fieldLike = /^(?:optional|required|repeated)?\s*([A-Za-z_][\w<>.,]*)\s+([A-Za-z_][\w]*)(?:\s*=\s*\d+)?/;
    const mapLike = /^\s*map\s*<[^>]+>\s+[A-Za-z_][\w]*(?:\s*=\s*\d+)?/;
    const enumValueLike = /^(?:[A-Za-z_][\w]*)\s*=\s*-?\d+(?:\s*\[.*\])?/;

    // Track multi-line inline options (braces/brackets inside field options [...])
    // This is separate from message/enum structural braces
    let inlineOptionDepth = 0;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        inBlockComment = true;
        continue;
      }

      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }

      // Skip lines if we're inside a multi-line inline option from a previous line
      if (inlineOptionDepth > 0) {
        // Count brackets and braces to track when we exit the multi-line option
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBraces = (lineWithoutComments.match(/\{/g) || []).length;
        const closeBraces = (lineWithoutComments.match(/\}/g) || []).length;
        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        inlineOptionDepth += (openBraces - closeBraces) + (openBrackets - closeBrackets);
        continue;
      }

      if (/^(message|enum|service|oneof)\b/.test(trimmed) || trimmed.startsWith('option') ||
          trimmed.startsWith('import') || trimmed.startsWith('syntax') || trimmed.startsWith('edition') ||
          trimmed.startsWith('reserved') || trimmed.startsWith('rpc') || trimmed.startsWith('package')) {
        continue;
      }

      // Allow inline comments after a semicolon: `... = 1; // comment`
      const withoutLineComment = trimmed.replace(/\/\/.*$/, '').trim();
      const withoutBlockComment = withoutLineComment.replace(/\/\*.*\*\/$/, '').trim();
      if (withoutBlockComment.endsWith(';') || withoutBlockComment.endsWith('{') || withoutBlockComment.endsWith('}')) {
        continue;
      }

      // Check if this line starts a multi-line inline option
      // Pattern: field definition with `[` followed by `{` but not closed on same line
      if (trimmed.includes('[') && trimmed.includes('{')) {
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBraces = (lineWithoutComments.match(/\{/g) || []).length;
        const closeBraces = (lineWithoutComments.match(/\}/g) || []).length;
        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        const netOpen = (openBraces - closeBraces) + (openBrackets - closeBrackets);
        if (netOpen > 0) {
          // This line starts a multi-line inline option - skip it
          inlineOptionDepth = netOpen;
          continue;
        }
      }

      // Also check for multi-line bracket options like `field = 1 [\n  option\n];`
      if (trimmed.includes('[') && !trimmed.includes(']')) {
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        if (openBrackets > closeBrackets) {
          inlineOptionDepth = openBrackets - closeBrackets;
          continue;
        }
      }

      const looksLikeField = fieldLike.test(trimmed) || mapLike.test(trimmed) || (
        // Enum values inside enum blocks: NAME = NUMBER [options]
        enumValueLike.test(trimmed)
      );
      if (!looksLikeField) {
        continue;
      }

      // Look ahead: check if the next non-empty, non-comment line starts with '['
      // This handles cases like:
      //   string name = 2 // comment
      //       [(option) = {...}];
      let nextLineStartsOption = false;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]!.trim();
        if (nextLine === '' || nextLine.startsWith('//')) {
          continue; // Skip empty lines and comments
        }
        if (nextLine.startsWith('[')) {
          nextLineStartsOption = true;
          // Also set inlineOptionDepth to track this multi-line option
          const lineWithoutStrings = nextLine.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
          const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
          const openBraces = (lineWithoutComments.match(/\{/g) || []).length;
          const closeBraces = (lineWithoutComments.match(/\}/g) || []).length;
          const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
          const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;
          inlineOptionDepth = (openBraces - closeBraces) + (openBrackets - closeBrackets);
        }
        break; // Only check the first non-empty, non-comment line
      }
      if (nextLineStartsOption) {
        continue;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line!.length }
        },
        message: 'Missing semicolon',
        source: DIAGNOSTIC_SOURCE
      });
    }
  }

  /**
   * Helper to create a field-like object for duplicate checking.
   * Maps and groups use field numbers but aren't FieldDefinitions.
   * Note: fieldTypeRange uses item.range since these items don't have
   * a separate type location. This is acceptable for error reporting.
   */
  private asFieldForDuplicateCheck(item: {
    name: string;
    nameRange: Range;
    number: number;
    range: Range;
  }, typeName: string): FieldDefinition {
    return {
      type: 'field',
      name: item.name,
      nameRange: item.nameRange,
      number: item.number,
      range: item.range,
      fieldType: typeName,
      fieldTypeRange: item.range  // Use item.range as proxy for type range
    } as FieldDefinition;
  }

  private validateMessage(
    uri: string,
    message: MessageDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;
    logger.verbose(`Validating message '${fullName}' with ${message.fields.length} fields, ${message.oneofs.length} oneofs`);

    // Check naming convention (PascalCase)
    if (this.settings.namingConventions && !this.isPascalCase(message.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(message.nameRange),
        message: `Message name '${message.name}' should be PascalCase`,
        source: DIAGNOSTIC_SOURCE,
        code: ERROR_CODES.INVALID_MESSAGE_NAME
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

      // Add to duplicate detection
      if (!fieldNumbers.has(mapField.number)) {
        fieldNumbers.set(mapField.number, []);
      }
      fieldNumbers.get(mapField.number)!.push(this.asFieldForDuplicateCheck(mapField, 'map'));

      if (!fieldNames.has(mapField.name)) {
        fieldNames.set(mapField.name, []);
      }
      fieldNames.get(mapField.name)!.push(this.asFieldForDuplicateCheck(mapField, 'map'));
    }

    // Validate groups (proto2)
    for (const group of message.groups) {
      this.validateGroup(uri, group, fullName, diagnostics, reservedNumbers, reservedNames);

      // Add to duplicate detection
      if (!fieldNumbers.has(group.number)) {
        fieldNumbers.set(group.number, []);
      }
      fieldNumbers.get(group.number)!.push(this.asFieldForDuplicateCheck(group, 'group'));

      if (!fieldNames.has(group.name)) {
        fieldNames.set(group.name, []);
      }
      fieldNames.get(group.name)!.push(this.asFieldForDuplicateCheck(group, 'group'));
    }

    // Check for duplicate field numbers
    if (this.settings.fieldTagChecks) {
      logger.verbose(`Checking for duplicate field numbers in message '${fullName}': ${fieldNumbers.size} unique numbers, fieldTagChecks=${this.settings.fieldTagChecks}`);
      for (const [number, fields] of fieldNumbers) {
        if (fields.length > 1) {
          logger.verbose(`Found duplicate field number ${number} used by ${fields.length} fields in '${fullName}'`);
          for (const field of fields) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: this.toRange(field.range),
              message: `Duplicate field number ${number}`,
              source: DIAGNOSTIC_SOURCE,
              code: ERROR_CODES.DUPLICATE_FIELD_NUMBER
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
              source: DIAGNOSTIC_SOURCE,
              code: ERROR_CODES.DUPLICATE_FIELD_NAME
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
          source: DIAGNOSTIC_SOURCE
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
        source: DIAGNOSTIC_SOURCE,
        code: ERROR_CODES.INVALID_FIELD_NAME
      });
    }

    // Check field number range
    if (this.settings.fieldTagChecks) {
      if (field.number < MIN_FIELD_NUMBER || field.number > MAX_FIELD_NUMBER) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is out of valid range (${MIN_FIELD_NUMBER}-${MAX_FIELD_NUMBER})`,
          source: DIAGNOSTIC_SOURCE,
          code: ERROR_CODES.FIELD_NUMBER_OUT_OF_RANGE
        });
      } else if (field.number >= RESERVED_RANGE_START && field.number <= RESERVED_RANGE_END) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is in reserved range (${RESERVED_RANGE_START}-${RESERVED_RANGE_END})`,
          source: DIAGNOSTIC_SOURCE,
          code: ERROR_CODES.FIELD_NUMBER_IN_RESERVED_RANGE
        });
      }

      // Check if using reserved number
      if (reservedNumbers.has(field.number)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.range),
          message: `Field number ${field.number} is reserved`,
          source: DIAGNOSTIC_SOURCE,
          code: ERROR_CODES.FIELD_NUMBER_RESERVED
        });
      }

      // Check if using reserved name
      if (reservedNames.has(field.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(field.nameRange),
          message: `Field name '${field.name}' is reserved`,
          source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE,
          code: ERROR_CODES.UNDEFINED_TYPE
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
          source: DIAGNOSTIC_SOURCE,
          code: ERROR_CODES.DISCOURAGED_CONSTRUCT
        });
      }
    }

    // Check field options for syntax errors
    if (field.options) {
      for (const option of field.options) {
        if (typeof option.value === 'string' && option.value.startsWith('{')) {
          // Check for invalid aggregate option value syntax
          // Aggregate values should start with '{ identifier' not '{ ;' or '{ }'
          const trimmedValue = option.value.replace(/^\{\s*/, '');
          if (trimmedValue.startsWith(';')) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: this.toRange(field.range),
              message: `Invalid syntax in option '${option.name}': unexpected semicolon after opening brace`,
              source: DIAGNOSTIC_SOURCE,
              code: ERROR_CODES.PARSE_ERROR
            });
          }
        }
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
        source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
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
        source: DIAGNOSTIC_SOURCE
      });
    }

    // Check field number
    if (this.settings.fieldTagChecks) {
      if (mapField.number < MIN_FIELD_NUMBER || mapField.number > MAX_FIELD_NUMBER) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.range),
          message: `Field number ${mapField.number} is out of valid range`,
          source: DIAGNOSTIC_SOURCE
        });
      }

      if (reservedNumbers.has(mapField.number)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.range),
          message: `Field number ${mapField.number} is reserved`,
          source: DIAGNOSTIC_SOURCE
        });
      }

      if (reservedNames.has(mapField.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(mapField.nameRange),
          message: `Field name '${mapField.name}' is reserved`,
          source: DIAGNOSTIC_SOURCE
        });
      }
    }
  }

  private validateGroup(
    uri: string,
    group: GroupFieldDefinition,
    containerName: string,
    diagnostics: Diagnostic[],
    reservedNumbers: Set<number>,
    reservedNames: Set<string>
  ): void {
    // Check naming convention (PascalCase for group names)
    if (this.settings.namingConventions && !this.isPascalCase(group.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(group.nameRange),
        message: `Group name '${group.name}' should be PascalCase`,
        source: DIAGNOSTIC_SOURCE
      });
    }

    // Check field number
    if (this.settings.fieldTagChecks) {
      if (group.number < MIN_FIELD_NUMBER || group.number > MAX_FIELD_NUMBER) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(group.range),
          message: `Group number ${group.number} is out of valid range`,
          source: DIAGNOSTIC_SOURCE
        });
      }

      if (reservedNumbers.has(group.number)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(group.range),
          message: `Group number ${group.number} is reserved`,
          source: DIAGNOSTIC_SOURCE
        });
      }

      if (reservedNames.has(group.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: this.toRange(group.nameRange),
          message: `Group name '${group.name}' is reserved`,
          source: DIAGNOSTIC_SOURCE
        });
      }
    }

    // Warn that groups are deprecated
    if (this.settings.discouragedConstructs) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: this.toRange(group.range),
        message: 'Groups are deprecated in proto2. Consider using nested messages instead.',
        source: DIAGNOSTIC_SOURCE
      });
    }

    // Validate fields within the group recursively
    // Groups are like messages, so we can validate them similarly
    const fullName = containerName ? `${containerName}.${group.name}` : group.name;

    // Collect reserved numbers and names from group
    const groupReservedNumbers = new Set<number>();
    const groupReservedNames = new Set<string>();
    for (const reserved of group.reserved) {
      for (const range of reserved.ranges) {
        const end = range.end === 'max' ? MAX_FIELD_NUMBER : range.end;
        for (let i = range.start; i <= end; i++) {
          groupReservedNumbers.add(i);
        }
      }
      for (const name of reserved.names) {
        groupReservedNames.add(name);
      }
    }

    // Validate fields in group
    for (const field of group.fields) {
      this.validateField(uri, field, fullName, diagnostics, groupReservedNumbers, groupReservedNames);
    }

    // Validate nested messages
    for (const nestedMessage of group.nestedMessages) {
      this.validateMessage(uri, nestedMessage, fullName, diagnostics);
    }

    // Validate nested enums
    for (const nestedEnum of group.nestedEnums) {
      this.validateEnum(uri, nestedEnum, fullName, diagnostics);
    }
  }

  private validateEnum(
    _uri: string,
    enumDef: EnumDefinition,
    _prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    // Check naming convention (PascalCase)
    if (this.settings.namingConventions && !this.isPascalCase(enumDef.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(enumDef.nameRange),
        message: `Enum name '${enumDef.name}' should be PascalCase`,
        source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
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
        range: this.toRange(enumDef.values[0]!.range),
        message: `First enum value should be 0 in proto3`,
        source: DIAGNOSTIC_SOURCE
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
            source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
        });
      }

      if (stringOptions.has(opt.name) && typeof opt.value !== 'string') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(opt.range),
          message: `Option '${opt.name}' expects a string value`,
          source: DIAGNOSTIC_SOURCE
        });
      }

      const enumSet = enumOptions.get(opt.name);
      if (enumSet && (typeof opt.value !== 'string' || !enumSet.has(String(opt.value)))) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(opt.range),
          message: `Option '${opt.name}' expects one of: ${Array.from(enumSet).join(', ')}`,
          source: DIAGNOSTIC_SOURCE
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
        source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
        });
      }

        if (!rpc.inputType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.range),
            message: `RPC '${rpc.name}' is missing request type`,
            source: DIAGNOSTIC_SOURCE
          });
        }

        if (!rpc.outputType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(rpc.range),
            message: `RPC '${rpc.name}' is missing response type`,
            source: DIAGNOSTIC_SOURCE
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
            source: DIAGNOSTIC_SOURCE
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
            source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
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
        // Check if this looks like a buf registry dependency
        const isBufDep = this.isBufRegistryImport(imp.importPath);
        const hint = isBufDep
          ? `. This looks like a Buf registry dependency. Run 'buf export' or use the quick fix to export dependencies.`
          : '';
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: rangeInfo ? this.toRange(rangeInfo.range) : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: `Import '${imp.importPath}' cannot be resolved${hint}`,
          source: DIAGNOSTIC_SOURCE
        });
      }
    }

    // Check resolved BSR imports that aren't in buf.yaml deps
    // This warns users when they've exported deps locally but haven't added them to buf.yaml
    const bufConfig = bufConfigProvider.findBufConfig(uri);
    const bufDeps = bufConfig?.deps || [];

    for (const imp of importsWithResolutions) {
      if (imp.resolvedUri && this.isBufRegistryImport(imp.importPath)) {
        const suggestedModule = this.suggestBufModule(imp.importPath);
        if (suggestedModule && !bufDeps.some(dep => dep.includes(suggestedModule) || suggestedModule.includes(dep))) {
          const rangeInfo = importByPath.get(imp.importPath);
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: rangeInfo ? this.toRange(rangeInfo.range) : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            message: `Import '${imp.importPath}' resolves but '${suggestedModule}' is not in buf.yaml dependencies. Add it to ensure consistent builds.`,
            source: DIAGNOSTIC_SOURCE,
            code: ERROR_CODES.MISSING_BUF_DEPENDENCY
          });
        }
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
          source: DIAGNOSTIC_SOURCE
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
          source: DIAGNOSTIC_SOURCE
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
            source: DIAGNOSTIC_SOURCE
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

    if (importedVia) {
      // Already imported, but check if the path is meaningfully different. Allow extra directory prefixes
      // (common when proto_path points above the proto root) but flag imports that drop required segments.
      if (suggestedImport && !this.areImportPathsCompatible(importedVia.importPath, suggestedImport)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range,
          message: `Type '${typeName}' should be imported via "${suggestedImport}" (found "${importedVia.importPath}")`,
          source: DIAGNOSTIC_SOURCE
        });
        return;
      }

      // Import resolved successfully, no further action needed.
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
    let prev = sorted[0]!.number;

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]!.number;

      if (current <= prev) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(sorted[i]!.range),
          message: `Field number ${current} is not strictly increasing (previous ${prev}). Consider renumbering`,
          source: DIAGNOSTIC_SOURCE
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
            range: this.toRange(sorted[i]!.range),
            message: `Gap in field numbers between ${prev} and ${current}. Run renumber to close gaps`,
            source: DIAGNOSTIC_SOURCE
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
        const a = ranges[i]!;
        const b = ranges[j]!;
        const aEnd = a.end === 'max' ? MAX_FIELD_NUMBER : a.end;
        const bEnd = b.end === 'max' ? MAX_FIELD_NUMBER : b.end;
        const overlap = Math.max(a.start, b.start) <= Math.min(aEnd, bEnd);
        if (overlap) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: this.toRange(message.range),
            message: `Reserved ranges overlap (${a.start}-${aEnd} overlaps ${b.start}-${bEnd})`,
            source: DIAGNOSTIC_SOURCE
          });
        }
      }
    }
  }

  private areImportPathsCompatible(actualImport: string, canonicalImport: string): boolean {
    const normalizedActual = actualImport.replace(/\\/g, '/');
    const normalizedCanonical = canonicalImport.replace(/\\/g, '/');

    if (normalizedActual === normalizedCanonical) {
      return true;
    }

    if (normalizedActual.endsWith(`/${normalizedCanonical}`) || normalizedActual.endsWith(normalizedCanonical)) {
      return true;
    }

    return false;
  }

  private getSuggestedImportPath(currentUri: string, definitionUri: string): string | undefined {
    if (definitionUri.startsWith('builtin:///')) {
      return definitionUri.replace('builtin:///', '');
    }

    try {
      return this.analyzer.getImportPathForFile(currentUri, definitionUri);
    } catch {
      return undefined;
    }
  }

  private toRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }): Range {
    return {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character }
    };
  }

  /**
   * Check for usage of deprecated fields and enum values
   */
  private validateDeprecatedUsage(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const packageName = file.package?.name || '';

    // Check message fields
    for (const message of file.messages) {
      this.checkDeprecatedFields(uri, message, packageName, diagnostics);
    }

    // Check enum values
    for (const enumDef of file.enums) {
      this.checkDeprecatedEnumValues(uri, enumDef, packageName, diagnostics);
    }
  }

  private checkDeprecatedFields(
    uri: string,
    message: MessageDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check all fields in this message
    for (const field of message.fields) {
      if (field.options?.some(opt => opt.name === 'deprecated' && opt.value === true)) {
        // Find all usages of this deprecated field
        const references = this.analyzer.findReferences(`${fullName}.${field.name}`);
        for (const ref of references) {
          if (ref.uri !== uri) {
            // Only warn in files that use the deprecated field
            continue;
          }
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: this.toRange(ref.range),
            message: `Field '${field.name}' is deprecated`,
            source: DIAGNOSTIC_SOURCE,
            code: 'deprecated-field'
          });
        }
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.checkDeprecatedFields(uri, nested, fullName, diagnostics);
    }
  }

  private checkDeprecatedEnumValues(
    uri: string,
    enumDef: EnumDefinition,
    prefix: string,
    diagnostics: Diagnostic[]
  ): void {
    const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;

    for (const value of enumDef.values) {
      if (value.options?.some(opt => opt.name === 'deprecated' && opt.value === true)) {
        const references = this.analyzer.findReferences(`${fullName}.${value.name}`);
        for (const ref of references) {
          if (ref.uri !== uri) {
            continue;
          }
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: this.toRange(ref.range),
            message: `Enum value '${value.name}' is deprecated`,
            source: DIAGNOSTIC_SOURCE,
            code: 'deprecated-enum-value'
          });
        }
      }
    }
  }

  /**
   * Check for unused messages, enums, and services
   */
  private validateUnusedSymbols(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const packageName = file.package?.name || '';

    // Collect all referenced symbols
    const referencedSymbols = new Set<string>();

    // Check messages
    for (const message of file.messages) {
      this.collectReferencedSymbols(message, packageName, referencedSymbols);
    }

    // Check services
    for (const service of file.services) {
      const serviceFullName = packageName ? `${packageName}.${service.name}` : service.name;
      referencedSymbols.add(serviceFullName);
      for (const rpc of service.rpcs) {
        if (rpc.inputType) {
          referencedSymbols.add(rpc.inputType);
        }
        if (rpc.outputType) {
          referencedSymbols.add(rpc.outputType);
        }
      }
    }

    // Check if messages are used
    for (const message of file.messages) {
      const fullName = packageName ? `${packageName}.${message.name}` : message.name;
      if (!referencedSymbols.has(fullName) && !referencedSymbols.has(message.name)) {
        // Check if it's referenced from other files
        const references = this.analyzer.findReferences(fullName);
        const externalRefs = references.filter(r => r.uri !== uri);
        if (externalRefs.length === 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: this.toRange(message.nameRange),
            message: `Message '${message.name}' is defined but never used`,
            source: DIAGNOSTIC_SOURCE,
            code: 'unused-symbol'
          });
        }
      }
    }

    // Check if enums are used
    for (const enumDef of file.enums) {
      const fullName = packageName ? `${packageName}.${enumDef.name}` : enumDef.name;
      if (!referencedSymbols.has(fullName) && !referencedSymbols.has(enumDef.name)) {
        const references = this.analyzer.findReferences(fullName);
        const externalRefs = references.filter(r => r.uri !== uri);
        if (externalRefs.length === 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: this.toRange(enumDef.nameRange),
            message: `Enum '${enumDef.name}' is defined but never used`,
            source: DIAGNOSTIC_SOURCE,
            code: 'unused-symbol'
          });
        }
      }
    }
  }

  private collectReferencedSymbols(
    message: MessageDefinition,
    prefix: string,
    referenced: Set<string>
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;
    referenced.add(fullName);

    for (const field of message.fields) {
      if (!BUILTIN_TYPES.includes(field.fieldType)) {
        referenced.add(field.fieldType);
      }
    }

    for (const mapField of message.maps) {
      if (!BUILTIN_TYPES.includes(mapField.valueType)) {
        referenced.add(mapField.valueType);
      }
    }

    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        if (!BUILTIN_TYPES.includes(field.fieldType)) {
          referenced.add(field.fieldType);
        }
      }
    }

    for (const nested of message.nestedMessages) {
      this.collectReferencedSymbols(nested, fullName, referenced);
    }
  }

  /**
   * Validate extension ranges
   */
  private validateExtensions(
    _uri: string,
    message: MessageDefinition,
    diagnostics: Diagnostic[]
  ): void {
    for (const ext of message.extensions) {
      for (const range of ext.ranges) {
        const end = range.end === 'max' ? MAX_FIELD_NUMBER : range.end;

        // Check range validity
        if (range.start < MIN_FIELD_NUMBER || range.start > MAX_FIELD_NUMBER) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(ext.range),
            message: `Extension range start ${range.start} is out of valid range (${MIN_FIELD_NUMBER}-${MAX_FIELD_NUMBER})`,
            source: DIAGNOSTIC_SOURCE
          });
        }

        if (end < MIN_FIELD_NUMBER || end > MAX_FIELD_NUMBER) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(ext.range),
            message: `Extension range end ${end} is out of valid range (${MIN_FIELD_NUMBER}-${MAX_FIELD_NUMBER})`,
            source: DIAGNOSTIC_SOURCE
          });
        }

        if (range.start > end) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(ext.range),
            message: `Extension range start ${range.start} is greater than end ${end}`,
            source: DIAGNOSTIC_SOURCE
          });
        }

        // Check for overlap with reserved ranges
        for (const reserved of message.reserved) {
          for (const reservedRange of reserved.ranges) {
            const reservedEnd = reservedRange.end === 'max' ? MAX_FIELD_NUMBER : reservedRange.end;
            const overlap = Math.max(range.start, reservedRange.start) <= Math.min(end, reservedEnd);
            if (overlap) {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: this.toRange(ext.range),
                message: `Extension range ${range.start}-${end} overlaps with reserved range ${reservedRange.start}-${reservedEnd}`,
                source: DIAGNOSTIC_SOURCE
              });
            }
          }
        }

        // Check for overlap with field numbers
        const allFields = [
          ...message.fields,
          ...message.maps,
          ...message.oneofs.flatMap(o => o.fields)
        ];

        for (const field of allFields) {
          if (field.number >= range.start && field.number <= end) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: this.toRange(ext.range),
              message: `Extension range ${range.start}-${end} overlaps with field number ${field.number}`,
              source: DIAGNOSTIC_SOURCE
            });
          }
        }
      }
    }
  }

  /**
   * Check for circular import dependencies
   */
  private validateCircularDependencies(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const cycle: string[] = [];

    const checkCycle = (currentUri: string): boolean => {
      if (visiting.has(currentUri)) {
        // Found a cycle
        cycle.push(currentUri);
        return true;
      }

      if (visited.has(currentUri)) {
        return false;
      }

      visiting.add(currentUri);
      const currentFile = this.analyzer.getFile(currentUri);
      if (!currentFile) {
        visiting.delete(currentUri);
        visited.add(currentUri);
        return false;
      }

      const importedUris = this.analyzer.getImportedFileUris(currentUri);
      for (const importedUri of importedUris) {
        if (checkCycle(importedUri)) {
          cycle.push(currentUri);
          return true;
        }
      }

      visiting.delete(currentUri);
      visited.add(currentUri);
      return false;
    };

    if (checkCycle(uri)) {
      // Report the cycle
      const cycleStr = cycle.reverse().join(' -> ');
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: this.toRange(file.range),
        message: `Circular import dependency detected: ${cycleStr}`,
        source: DIAGNOSTIC_SOURCE,
        code: 'circular-dependency'
      });
    }
  }

  /**
   * Validate proto3 field presence semantics
   * In proto3, fields have implicit presence - warn about common mistakes
   * In editions, 'optional' and 'required' keywords are not allowed
   */
  private validateProto3FieldPresence(uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    const isProto3 = file.syntax?.version === 'proto3';
    const isEdition = !!file.edition;

    if (!isProto3 && !isEdition) {
      return; // Only validate proto3 and editions
    }

    for (const message of file.messages) {
      this.checkProto3MessageFields(uri, message, diagnostics, isEdition);
    }
  }

  private checkProto3MessageFields(
    uri: string,
    message: MessageDefinition,
    diagnostics: Diagnostic[],
    isEdition: boolean
  ): void {
    for (const field of message.fields) {
      if (isEdition) {
        // In editions, 'optional' and 'required' keywords are NOT allowed
        // Use features.field_presence = EXPLICIT instead
        if (field.modifier === 'optional') {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(field.range),
            message: `'optional' label is not allowed in editions. Use 'features.field_presence = EXPLICIT' option instead.`,
            source: DIAGNOSTIC_SOURCE,
            code: ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
          });
        } else if (field.modifier === 'required') {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(field.range),
            message: `'required' label is not allowed in editions. Use 'features.field_presence = LEGACY_REQUIRED' option instead.`,
            source: DIAGNOSTIC_SOURCE,
            code: ERROR_CODES.INVALID_FIELD_MODIFIER
          });
        }
      } else {
        // Proto3: 'required' is not allowed
        if (field.modifier === 'required') {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: this.toRange(field.range),
            message: `'required' fields are not allowed in proto3. Use 'optional' for explicit presence tracking.`,
            source: DIAGNOSTIC_SOURCE,
            code: 'proto3-required'
          });
        }
      }

      // Warn about implicit presence for scalar fields
      if (!field.modifier && !BUILTIN_TYPES.includes(field.fieldType)) {
        // This is fine, but could be a hint
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.checkProto3MessageFields(uri, nested, diagnostics, isEdition);
    }
  }

  /**
   * Validate documentation comments
   * Check for missing documentation on public APIs
   */
  private validateDocumentationComments(_uri: string, file: ProtoFile, diagnostics: Diagnostic[]): void {
    // Check top-level messages (public API)
    for (const message of file.messages) {
      if (!this.hasDocumentationComment(message.range, file)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: this.toRange(message.nameRange),
          message: `Consider adding documentation comment for message '${message.name}'`,
          source: DIAGNOSTIC_SOURCE,
          code: 'missing-documentation'
        });
      }
    }

    // Check top-level enums
    for (const enumDef of file.enums) {
      if (!this.hasDocumentationComment(enumDef.range, file)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: this.toRange(enumDef.nameRange),
          message: `Consider adding documentation comment for enum '${enumDef.name}'`,
          source: DIAGNOSTIC_SOURCE,
          code: 'missing-documentation'
        });
      }
    }

    // Check services (definitely need documentation)
    for (const service of file.services) {
      if (!this.hasDocumentationComment(service.range, file)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: this.toRange(service.nameRange),
          message: `Service '${service.name}' should have documentation`,
          source: DIAGNOSTIC_SOURCE,
          code: 'missing-documentation'
        });
      }

      // Check RPCs
      for (const rpc of service.rpcs) {
        if (!this.hasDocumentationComment(rpc.range, file)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: this.toRange(rpc.nameRange),
            message: `RPC '${rpc.name}' should have documentation`,
            source: DIAGNOSTIC_SOURCE,
            code: 'missing-documentation'
          });
        }
      }
    }
  }

  private hasDocumentationComment(range: { start: { line: number; character: number }; end: { line: number; character: number } }, _file: ProtoFile): boolean {
    if (!this.currentDocumentText) {
      return false;
    }

    const lines = this.currentDocumentText.split('\n');
    const definitionLine = range.start.line;

    // Check the line before the definition
    if (definitionLine > 0) {
      const prevLine = lines[definitionLine - 1]!.trim();
      // Check for single-line comment
      if (prevLine.startsWith('//') || prevLine.startsWith('///')) {
        return true;
      }
    }

    // Check 2 lines before (for multi-line comments)
    if (definitionLine > 1) {
      const prevLine2 = lines[definitionLine - 2]!.trim();
      if (prevLine2.includes('/*') || prevLine2.includes('/**')) {
        return true;
      }
    }

    // Check for inline comment on the same line (before the definition)
    const currentLine = lines[definitionLine] || '';
    const beforeDefinition = currentLine.substring(0, range.start.character);
    if (beforeDefinition.includes('//') || beforeDefinition.includes('/*')) {
      return true;
    }

    return false;
  }

  /**
   * Check if an import path looks like it comes from the Buf Schema Registry
   * Common patterns:
   * - buf/validate/validate.proto (protovalidate)
   * - buf/... (any buf.build module)
   * - google/api/... (googleapis)
   * - google/type/... (googleapis)
   * - google/rpc/... (googleapis)
   * - grpc/... (grpc modules)
   * - envoy/... (envoy proxy)
   * - validate/validate.proto (protoc-gen-validate)
   */
  private isBufRegistryImport(importPath: string): boolean {
    const bufRegistryPatterns = [
      /^buf\//,                    // buf.build/bufbuild/* modules
      /^google\/api\//,            // googleapis - google/api
      /^google\/type\//,           // googleapis - google/type
      /^google\/rpc\//,            // googleapis - google/rpc
      /^google\/cloud\//,          // googleapis - google/cloud
      /^google\/logging\//,        // googleapis - google/logging
      /^grpc\//,                   // grpc modules
      /^envoy\//,                  // envoy proxy
      /^validate\/validate\.proto$/,  // protoc-gen-validate (PGV)
      /^xds\//,                    // xDS API
      /^opencensus\//,             // OpenCensus
      /^opentelemetry\//,          // OpenTelemetry
      /^cosmos\//,                 // Cosmos SDK
      /^tendermint\//,             // Tendermint
    ];

    return bufRegistryPatterns.some(pattern => pattern.test(importPath));
  }

  /**
   * Suggest a Buf Schema Registry module for an import path
   */
  private suggestBufModule(importPath: string): string | null {
    // Map of import path patterns to BSR modules
    const moduleMap: { pattern: RegExp; module: string }[] = [
      // Google APIs
      { pattern: /^google\/api\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/type\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/rpc\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/cloud\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/logging\//, module: 'buf.build/googleapis/googleapis' },

      // Buf Validate (protovalidate)
      { pattern: /^buf\/validate\//, module: 'buf.build/bufbuild/protovalidate' },

      // Legacy protoc-gen-validate
      { pattern: /^validate\/validate\.proto$/, module: 'buf.build/envoyproxy/protoc-gen-validate' },

      // gRPC
      { pattern: /^grpc\//, module: 'buf.build/grpc/grpc' },

      // Envoy
      { pattern: /^envoy\//, module: 'buf.build/envoyproxy/envoy' },

      // xDS
      { pattern: /^xds\//, module: 'buf.build/cncf/xds' },

      // OpenCensus
      { pattern: /^opencensus\//, module: 'buf.build/opencensus/opencensus' },

      // OpenTelemetry
      { pattern: /^opentelemetry\//, module: 'buf.build/open-telemetry/opentelemetry' },

      // Cosmos SDK
      { pattern: /^cosmos\//, module: 'buf.build/cosmos/cosmos-sdk' },
      { pattern: /^tendermint\//, module: 'buf.build/cosmos/cosmos-sdk' },

      // Connect RPC
      { pattern: /^connectrpc\//, module: 'buf.build/connectrpc/connect' },
    ];

    for (const { pattern, module } of moduleMap) {
      if (pattern.test(importPath)) {
        return module;
      }
    }

    return null;
  }
}
