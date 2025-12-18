/**
 * Semantic Tokens Provider for Protocol Buffers
 * Provides context-aware syntax highlighting using Tree-sitter AST
 */

import {
  SemanticTokensLegend,
  SemanticTokenTypes,
  SemanticTokenModifiers
} from 'vscode-languageserver/node';

import { SemanticTokensBuilder } from 'vscode-languageserver/node';

import {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  FieldDefinition,
  MapFieldDefinition,
  OneofDefinition,
  EnumValue,
  RpcDefinition,
  OptionStatement,
  Range as AstRange
} from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';

/**
 * Token types for Protocol Buffers semantic tokens
 */
export const tokenTypes: string[] = [
  SemanticTokenTypes.namespace,   // 0: package
  SemanticTokenTypes.type,        // 1: message type references
  SemanticTokenTypes.class,       // 2: message definitions
  SemanticTokenTypes.enum,        // 3: enum definitions
  SemanticTokenTypes.interface,   // 4: service definitions
  SemanticTokenTypes.property,    // 5: field names
  SemanticTokenTypes.enumMember,  // 6: enum values
  SemanticTokenTypes.method,      // 7: rpc methods
  SemanticTokenTypes.keyword,     // 8: keywords (message, enum, service, etc.)
  SemanticTokenTypes.string,      // 9: string literals
  SemanticTokenTypes.number,      // 10: numeric literals
  SemanticTokenTypes.comment,     // 11: comments
  SemanticTokenTypes.modifier,    // 12: modifiers (optional, repeated, required)
  SemanticTokenTypes.decorator,   // 13: options/annotations
  SemanticTokenTypes.parameter,   // 14: rpc parameters
  SemanticTokenTypes.variable,    // 15: oneof names
];

/**
 * Token modifiers for Protocol Buffers semantic tokens
 */
export const tokenModifiers: string[] = [
  SemanticTokenModifiers.declaration,    // 0: declaration
  SemanticTokenModifiers.definition,     // 1: definition
  SemanticTokenModifiers.deprecated,     // 2: deprecated
  SemanticTokenModifiers.readonly,       // 3: readonly (for field numbers)
  SemanticTokenModifiers.defaultLibrary, // 4: well-known types
];

/**
 * Semantic tokens legend for the LSP
 */
export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers
};

// Token type indices
const TOKEN_NAMESPACE = 0;
const TOKEN_TYPE = 1;
const TOKEN_CLASS = 2;
const TOKEN_ENUM = 3;
const TOKEN_INTERFACE = 4;
const TOKEN_PROPERTY = 5;
const TOKEN_ENUM_MEMBER = 6;
const TOKEN_METHOD = 7;
const TOKEN_KEYWORD = 8;
const TOKEN_STRING = 9;
const TOKEN_NUMBER = 10;
// const TOKEN_COMMENT = 11; // Reserved for future use
const TOKEN_MODIFIER = 12;
const TOKEN_DECORATOR = 13;
const TOKEN_PARAMETER = 14;
const TOKEN_VARIABLE = 15;

// Token modifier bitmasks
const MOD_DECLARATION = 1 << 0;
const MOD_DEFINITION = 1 << 1;
// const MOD_DEPRECATED = 1 << 2;
const MOD_READONLY = 1 << 3;
const MOD_DEFAULT_LIBRARY = 1 << 4;

// Well-known types that should be highlighted specially
const WELL_KNOWN_TYPES = new Set([
  'google.protobuf.Any',
  'google.protobuf.Api',
  'google.protobuf.BoolValue',
  'google.protobuf.BytesValue',
  'google.protobuf.DoubleValue',
  'google.protobuf.Duration',
  'google.protobuf.Empty',
  'google.protobuf.Enum',
  'google.protobuf.EnumValue',
  'google.protobuf.Field',
  'google.protobuf.FieldMask',
  'google.protobuf.FloatValue',
  'google.protobuf.Int32Value',
  'google.protobuf.Int64Value',
  'google.protobuf.ListValue',
  'google.protobuf.Method',
  'google.protobuf.Mixin',
  'google.protobuf.NullValue',
  'google.protobuf.Option',
  'google.protobuf.SourceContext',
  'google.protobuf.StringValue',
  'google.protobuf.Struct',
  'google.protobuf.Syntax',
  'google.protobuf.Timestamp',
  'google.protobuf.Type',
  'google.protobuf.UInt32Value',
  'google.protobuf.UInt64Value',
  'google.protobuf.Value',
]);

// Simple well-known type names (without package)
const SIMPLE_WELL_KNOWN_TYPES = new Set([
  'Any', 'Api', 'BoolValue', 'BytesValue', 'DoubleValue',
  'Duration', 'Empty', 'Enum', 'EnumValue', 'Field',
  'FieldMask', 'FloatValue', 'Int32Value', 'Int64Value',
  'ListValue', 'Method', 'Mixin', 'NullValue', 'Option',
  'SourceContext', 'StringValue', 'Struct', 'Syntax',
  'Timestamp', 'Type', 'UInt32Value', 'UInt64Value', 'Value'
]);

// Scalar types
const SCALAR_TYPES = new Set([
  'double', 'float', 'int32', 'int64', 'uint32', 'uint64',
  'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
  'bool', 'string', 'bytes'
]);

export type SemanticHighlightingMode = 'hybrid' | 'semantic';

export class SemanticTokensProvider {
  private analyzer: SemanticAnalyzer;
  private mode: SemanticHighlightingMode = 'hybrid';

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Get semantic tokens for a document
   * @param mode 'hybrid' = types/names only, 'semantic' = all tokens including keywords/scalars
   */
  getSemanticTokens(uri: string, content: string, mode: SemanticHighlightingMode = 'hybrid'): { data: number[] } {
    const file = this.analyzer.getFile(uri);
    if (!file) {
      return { data: [] };
    }

    this.mode = mode;
    const builder = new SemanticTokensBuilder();

    // Process the file in order
    this.processFile(file, content, builder);

    return builder.build();
  }

  private processFile(file: ProtoFile, content: string, builder: SemanticTokensBuilder): void {
    const lines = content.split('\n');

    // Process syntax statement
    if (file.syntax) {
      this.addKeywordToken(builder, file.syntax.range, 'syntax', lines);
      if (file.syntax.version) {
        // The version is a string literal
        this.addStringToken(builder, file.syntax.range, file.syntax.version, lines);
      }
    }

    // Process edition statement
    if (file.edition) {
      this.addKeywordToken(builder, file.edition.range, 'edition', lines);
      if (file.edition.edition) {
        this.addStringToken(builder, file.edition.range, file.edition.edition, lines);
      }
    }

    // Process package statement
    if (file.package) {
      this.addKeywordToken(builder, file.package.range, 'package', lines);
      const line = lines[file.package.range.start.line];
      if (line) {
        const nameStart = this.findPackageNameStart(line, file.package.name);
        if (nameStart >= 0) {
          this.pushToken(builder,
            file.package.range.start.line,
            nameStart,
            file.package.name.length,
            TOKEN_NAMESPACE,
            MOD_DECLARATION
          );
        }
      }
    }

    // Process imports
    for (const imp of file.imports) {
      this.addKeywordToken(builder, imp.range, 'import', lines);
      if (imp.modifier) {
        const line = lines[imp.range.start.line];
        if (line) {
          this.addKeywordAtOffset(builder, imp.range.start.line, line, imp.modifier, TOKEN_MODIFIER, 0);
        }
      }
      // Import path is a string
      this.addStringToken(builder, imp.range, imp.path, lines);
    }

    // Process options
    for (const option of file.options) {
      this.processOption(option, lines, builder);
    }

    // Process messages
    for (const message of file.messages) {
      this.processMessage(message, lines, builder);
    }

    // Process enums
    for (const enumDef of file.enums) {
      this.processEnum(enumDef, lines, builder);
    }

    // Process services
    for (const service of file.services) {
      this.processService(service, lines, builder);
    }
  }

  private processMessage(message: MessageDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[message.range.start.line];
    if (!line) {
      return;
    }

    // 'message' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, message.range.start.line, line, 'message', TOKEN_KEYWORD, 0);
    }

    // Message name
    const messageKeywordIdx = line.indexOf('message');
    const nameStart = messageKeywordIdx >= 0 ? line.indexOf(message.name, messageKeywordIdx + 7) : line.indexOf(message.name);
    if (nameStart >= 0) {
      this.pushToken(builder,
        message.range.start.line,
        nameStart,
        message.name.length,
        TOKEN_CLASS,
        MOD_DECLARATION | MOD_DEFINITION
      );
    }

    // Process nested messages
    if (message.nestedMessages) {
      for (const nested of message.nestedMessages) {
        this.processMessage(nested, lines, builder);
      }
    }

    // Process nested enums
    if (message.nestedEnums) {
      for (const enumDef of message.nestedEnums) {
        this.processEnum(enumDef, lines, builder);
      }
    }

    // Process fields
    if (message.fields) {
      for (const field of message.fields) {
        this.processField(field, lines, builder);
      }
    }

    // Process oneofs
    if (message.oneofs) {
      for (const oneof of message.oneofs) {
        this.processOneof(oneof, lines, builder);
      }
    }

    // Process map fields
    if (message.maps) {
      for (const mapField of message.maps) {
        this.processMapField(mapField, lines, builder);
      }
    }

    // Process options
    if (message.options) {
      for (const option of message.options) {
        this.processOption(option, lines, builder);
      }
    }
  }

  private processField(field: FieldDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[field.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = field.range.start.character;

    // Field modifier (optional, repeated, required) - emit in semantic mode or always for modifiers
    if (field.modifier) {
      this.addKeywordAtOffset(builder, field.range.start.line, line, field.modifier, TOKEN_MODIFIER, lineStart);
    }

    // Field type
    const typeName = field.fieldType;
    if (typeName) {
      const isScalar = SCALAR_TYPES.has(typeName);
      const isWellKnown = WELL_KNOWN_TYPES.has(typeName) || SIMPLE_WELL_KNOWN_TYPES.has(typeName);
      const typeStart = this.findTypeStart(line, typeName, lineStart);
      if (typeStart >= 0) {
        const modifiers = (isScalar || isWellKnown) ? MOD_DEFAULT_LIBRARY : 0;
        this.pushToken(builder,
          field.range.start.line,
          typeStart,
          typeName.length,
          TOKEN_TYPE,
          modifiers
        );
      }
    }

    // Field name
    const nameStart = this.findFieldNameStart(line, field.name, field.fieldType, lineStart);
    if (nameStart >= 0) {
      this.pushToken(builder,
        field.range.start.line,
        nameStart,
        field.name.length,
        TOKEN_PROPERTY,
        MOD_DECLARATION
      );
    }

    // Field number
    if (field.number !== undefined) {
      const numStr = String(field.number);
      // Search for field number after the '=' sign to avoid matching numbers in type names like int32
      const equalsIdx = line.indexOf('=', nameStart >= 0 ? nameStart + field.name.length : lineStart);
      const numStart = equalsIdx >= 0 ? line.indexOf(numStr, equalsIdx + 1) : -1;
      if (numStart >= 0) {
        this.pushToken(builder,
          field.range.start.line,
          numStart,
          numStr.length,
          TOKEN_NUMBER,
          MOD_READONLY
        );
      }
    }
  }

  private processMapField(mapField: MapFieldDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[mapField.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = mapField.range.start.character;

    // 'map' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, mapField.range.start.line, line, 'map', TOKEN_KEYWORD, lineStart);
    }

    // Key type - in semantic mode emit all types, in hybrid skip scalars
    const keyType = mapField.keyType;
    if (keyType) {
      const isKeyScalar = SCALAR_TYPES.has(keyType);
      const bracketIdx = line.indexOf('<', lineStart);
      const keyStart = bracketIdx >= 0 ? line.indexOf(keyType, bracketIdx + 1) : -1;
      if (keyStart >= 0) {
        this.pushToken(builder,
          mapField.range.start.line,
          keyStart,
          keyType.length,
          TOKEN_TYPE,
          isKeyScalar ? MOD_DEFAULT_LIBRARY : 0
        );
      }
    }

    // Value type - in semantic mode emit all types, in hybrid skip scalars
    const valueType = mapField.valueType;
    if (valueType) {
      const isScalar = SCALAR_TYPES.has(valueType);
      const commaIdx = line.indexOf(',', lineStart);
      const valueStart = commaIdx >= 0 ? line.indexOf(valueType, commaIdx + 1) : -1;
      if (valueStart >= 0) {
        const isWellKnown = WELL_KNOWN_TYPES.has(valueType) || SIMPLE_WELL_KNOWN_TYPES.has(valueType);
        this.pushToken(builder,
          mapField.range.start.line,
          valueStart,
          valueType.length,
          TOKEN_TYPE,
          (isScalar || isWellKnown) ? MOD_DEFAULT_LIBRARY : 0
        );
      }
    }

    // Field name
    const bracketCloseIdx = line.indexOf('>', lineStart);
    const nameStart = bracketCloseIdx >= 0 ? line.indexOf(mapField.name, bracketCloseIdx + 1) : -1;
    if (nameStart >= 0) {
      this.pushToken(builder,
        mapField.range.start.line,
        nameStart,
        mapField.name.length,
        TOKEN_PROPERTY,
        MOD_DECLARATION
      );
    }

    // Field number
    if (mapField.number !== undefined) {
      const numStr = String(mapField.number);
      // Search for field number after the '=' sign to avoid matching numbers in type names
      const equalsIdx = line.indexOf('=', nameStart >= 0 ? nameStart + mapField.name.length : lineStart);
      const numStart = equalsIdx >= 0 ? line.indexOf(numStr, equalsIdx + 1) : -1;
      if (numStart >= 0) {
        this.pushToken(builder,
          mapField.range.start.line,
          numStart,
          numStr.length,
          TOKEN_NUMBER,
          MOD_READONLY
        );
      }
    }
  }

  private processOneof(oneof: OneofDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[oneof.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = oneof.range.start.character;

    // 'oneof' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, oneof.range.start.line, line, 'oneof', TOKEN_KEYWORD, lineStart);
    }

    // Oneof name
    const oneofKeywordIdx = line.indexOf('oneof', lineStart);
    const nameStart = oneofKeywordIdx >= 0 ? line.indexOf(oneof.name, oneofKeywordIdx + 5) : -1;
    if (nameStart >= 0) {
      this.pushToken(builder,
        oneof.range.start.line,
        nameStart,
        oneof.name.length,
        TOKEN_VARIABLE,
        MOD_DECLARATION
      );
    }

    // Process oneof fields
    if (oneof.fields) {
      for (const field of oneof.fields) {
        this.processField(field, lines, builder);
      }
    }
  }

  private processEnum(enumDef: EnumDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[enumDef.range.start.line];
    if (!line) {
      return;
    }

    // 'enum' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, enumDef.range.start.line, line, 'enum', TOKEN_KEYWORD, 0);
    }

    // Enum name
    const enumKeywordIdx = line.indexOf('enum');
    const nameStart = enumKeywordIdx >= 0 ? line.indexOf(enumDef.name, enumKeywordIdx + 4) : -1;
    if (nameStart >= 0) {
      this.pushToken(builder,
        enumDef.range.start.line,
        nameStart,
        enumDef.name.length,
        TOKEN_ENUM,
        MOD_DECLARATION | MOD_DEFINITION
      );
    }

    // Process enum values
    if (enumDef.values) {
      for (const value of enumDef.values) {
        this.processEnumValue(value, lines, builder);
      }
    }

    // Process options
    if (enumDef.options) {
      for (const option of enumDef.options) {
        this.processOption(option, lines, builder);
      }
    }
  }

  private processEnumValue(value: EnumValue, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[value.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = value.range.start.character;

    // Enum value name
    const nameStart = line.indexOf(value.name, lineStart);
    if (nameStart >= 0) {
      this.pushToken(builder,
        value.range.start.line,
        nameStart,
        value.name.length,
        TOKEN_ENUM_MEMBER,
        MOD_DECLARATION
      );
    }

    // Enum value number
    const numStr = String(value.number);
    // Search for enum value number after the '=' sign to avoid matching numbers elsewhere
    const equalsIdx = line.indexOf('=', nameStart >= 0 ? nameStart + value.name.length : lineStart);
    const numStart = equalsIdx >= 0 ? line.indexOf(numStr, equalsIdx + 1) : -1;
    if (numStart >= 0) {
      this.pushToken(builder,
        value.range.start.line,
        numStart,
        numStr.length,
        TOKEN_NUMBER,
        MOD_READONLY
      );
    }
  }

  private processService(service: ServiceDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[service.range.start.line];
    if (!line) {
      return;
    }

    // 'service' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, service.range.start.line, line, 'service', TOKEN_KEYWORD, 0);
    }

    // Service name
    const serviceKeywordIdx = line.indexOf('service');
    const nameStart = serviceKeywordIdx >= 0 ? line.indexOf(service.name, serviceKeywordIdx + 7) : -1;
    if (nameStart >= 0) {
      this.pushToken(builder,
        service.range.start.line,
        nameStart,
        service.name.length,
        TOKEN_INTERFACE,
        MOD_DECLARATION | MOD_DEFINITION
      );
    }

    // Process RPCs
    if (service.rpcs) {
      for (const rpc of service.rpcs) {
        this.processRpc(rpc, lines, builder);
      }
    }

    // Process options
    if (service.options) {
      for (const option of service.options) {
        this.processOption(option, lines, builder);
      }
    }
  }

  private processRpc(rpc: RpcDefinition, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[rpc.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = rpc.range.start.character;

    // 'rpc' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, rpc.range.start.line, line, 'rpc', TOKEN_KEYWORD, lineStart);
    }

    // RPC name
    const rpcKeywordIdx = line.indexOf('rpc', lineStart);
    const nameStart = rpcKeywordIdx >= 0 ? line.indexOf(rpc.name, rpcKeywordIdx + 3) : -1;
    if (nameStart >= 0) {
      this.pushToken(builder,
        rpc.range.start.line,
        nameStart,
        rpc.name.length,
        TOKEN_METHOD,
        MOD_DECLARATION | MOD_DEFINITION
      );
    }

    // Request type
    if (rpc.requestType) {
      const requestStart = line.indexOf(rpc.requestType, nameStart > 0 ? nameStart + rpc.name.length : lineStart);
      if (requestStart >= 0) {
        this.pushToken(builder,
          rpc.range.start.line,
          requestStart,
          rpc.requestType.length,
          TOKEN_PARAMETER,
          0
        );
      }
    }

    // Check for 'stream' modifiers
    if (rpc.requestStreaming) {
      const returnsIdx = line.indexOf('returns');
      const streamStart = line.indexOf('stream', nameStart > 0 ? nameStart + rpc.name.length : lineStart);
      if (streamStart >= 0 && (returnsIdx < 0 || streamStart < returnsIdx)) {
        this.pushToken(builder, rpc.range.start.line, streamStart, 'stream'.length, TOKEN_MODIFIER, 0);
      }
    }

    // 'returns' keyword
    const returnsStart = line.indexOf('returns', lineStart);
    if (returnsStart >= 0) {
      this.pushToken(builder, rpc.range.start.line, returnsStart, 'returns'.length, TOKEN_KEYWORD, 0);
    }

    // Response type
    if (rpc.responseType) {
      const responseStart = line.indexOf(rpc.responseType, returnsStart > 0 ? returnsStart : lineStart);
      if (responseStart >= 0) {
        this.pushToken(builder,
          rpc.range.start.line,
          responseStart,
          rpc.responseType.length,
          TOKEN_PARAMETER,
          0
        );
      }
    }

    // Check for response 'stream' modifier
    if (rpc.responseStreaming) {
      const streamStart = line.indexOf('stream', returnsStart > 0 ? returnsStart : lineStart);
      if (streamStart >= 0) {
        this.pushToken(builder, rpc.range.start.line, streamStart, 'stream'.length, TOKEN_MODIFIER, 0);
      }
    }

    // Process RPC options
    if (rpc.options) {
      for (const option of rpc.options) {
        this.processOption(option, lines, builder);
      }
    }
  }

  private processOption(option: OptionStatement, lines: string[], builder: SemanticTokensBuilder): void {
    const line = lines[option.range.start.line];
    if (!line) {
      return;
    }

    const lineStart = option.range.start.character;

    // 'option' keyword - emit in semantic mode only
    if (this.mode === 'semantic') {
      this.addKeywordAtOffset(builder, option.range.start.line, line, 'option', TOKEN_KEYWORD, lineStart);
    }

    // Option name
    const nameStart = line.indexOf(option.name, lineStart);
    if (nameStart >= 0) {
      this.pushToken(builder,
        option.range.start.line,
        nameStart,
        option.name.length,
        TOKEN_DECORATOR,
        0
      );
    }

    // Option value - handle different types
    if (option.value !== undefined && option.value !== null) {
      const valueStr = String(option.value);
      const valueStart = line.indexOf(valueStr, nameStart > 0 ? nameStart + option.name.length : lineStart);

      if (valueStart >= 0) {
        if (typeof option.value === 'string') {
          // Check if it's a quoted string in the line
          const quotedValueStart = line.indexOf(`"${option.value}"`, nameStart > 0 ? nameStart : lineStart);
          if (quotedValueStart >= 0) {
            this.pushToken(builder,
              option.range.start.line,
              quotedValueStart,
              valueStr.length + 2,  // Include quotes
              TOKEN_STRING,
              0
            );
          }
        } else if (typeof option.value === 'number') {
          this.pushToken(builder,
            option.range.start.line,
            valueStart,
            valueStr.length,
            TOKEN_NUMBER,
            0
          );
        } else if (typeof option.value === 'boolean') {
          this.pushToken(builder,
            option.range.start.line,
            valueStart,
            valueStr.length,
            TOKEN_KEYWORD,
            0
          );
        }
      }
    }
  }

  // Helper methods

  private addKeywordToken(builder: SemanticTokensBuilder, range: AstRange, keyword: string, lines: string[]): void {
    const line = lines[range.start.line];
    if (!line) {
      return;
    }

    const keywordStart = line.indexOf(keyword);
    if (keywordStart >= 0) {
      this.pushToken(builder, range.start.line, keywordStart, keyword.length, TOKEN_KEYWORD, 0);
    }
  }

  private addKeywordAtOffset(builder: SemanticTokensBuilder, lineNum: number, line: string, keyword: string, tokenType: number, startOffset: number): void {
    const keywordStart = line.indexOf(keyword, startOffset);
    if (keywordStart >= 0) {
      this.pushToken(builder, lineNum, keywordStart, keyword.length, tokenType, 0);
    }
  }

  private addStringToken(builder: SemanticTokensBuilder, range: AstRange, value: string, lines: string[]): void {
    const line = lines[range.start.line];
    if (!line) {
      return;
    }

    // Find the quoted string
    const quotedValue = `"${value}"`;
    let stringStart = line.indexOf(quotedValue);
    if (stringStart < 0) {
      // Try single quotes
      const singleQuoted = `'${value}'`;
      stringStart = line.indexOf(singleQuoted);
    }
    if (stringStart >= 0) {
      this.pushToken(builder, range.start.line, stringStart, value.length + 2, TOKEN_STRING, 0);
    }
  }

  private findPackageNameStart(line: string, packageName: string): number {
    const packageIndex = line.indexOf('package');
    if (packageIndex >= 0) {
      return line.indexOf(packageName, packageIndex + 7);
    }
    return line.indexOf(packageName);
  }

  private findTypeStart(line: string, typeName: string, startOffset: number): number {
    // Skip modifier keywords to find the type
    const modifiers = ['optional', 'repeated', 'required'];
    let searchStart = startOffset;

    for (const mod of modifiers) {
      const modIndex = line.indexOf(mod, searchStart);
      if (modIndex >= 0 && modIndex < searchStart + 20) {
        searchStart = modIndex + mod.length;
      }
    }

    return line.indexOf(typeName, searchStart);
  }

  private findFieldNameStart(line: string, fieldName: string, typeName: string, startOffset: number): number {
    // Field name comes after the type
    const typeIndex = this.findTypeStart(line, typeName, startOffset);
    if (typeIndex >= 0) {
      return line.indexOf(fieldName, typeIndex + typeName.length);
    }
    return line.indexOf(fieldName, startOffset);
  }

  private pushToken(
    builder: SemanticTokensBuilder,
    line: number,
    startChar: number,
    length: number,
    tokenType: number,
    tokenModifiers: number
  ): void {
    if (startChar >= 0 && length > 0) {
      builder.push(line, startChar, length, tokenType, tokenModifiers);
    }
  }
}
