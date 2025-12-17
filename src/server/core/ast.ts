/**
 * Abstract Syntax Tree types for Protocol Buffers
 */

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface ProtoNode {
  type: string;
  range: Range;
  parent?: ProtoNode;
  comments?: string;
}

export interface ProtoFile extends ProtoNode {
  type: 'file';
  syntax?: SyntaxStatement;
  edition?: EditionStatement;
  package?: PackageStatement;
  imports: ImportStatement[];
  options: OptionStatement[];
  messages: MessageDefinition[];
  enums: EnumDefinition[];
  services: ServiceDefinition[];
  extends: ExtendDefinition[];
}

export interface SyntaxStatement extends ProtoNode {
  type: 'syntax';
  version: 'proto2' | 'proto3';
}

export interface EditionStatement extends ProtoNode {
  type: 'edition';
  edition: string;
}

export interface PackageStatement extends ProtoNode {
  type: 'package';
  name: string;
}

export interface ImportStatement extends ProtoNode {
  type: 'import';
  path: string;
  modifier?: 'weak' | 'public';
}

export interface OptionStatement extends ProtoNode {
  type: 'option';
  name: string;
  value: string | number | boolean;
}

export interface MessageDefinition extends ProtoNode {
  type: 'message';
  name: string;
  nameRange: Range;
  fields: FieldDefinition[];
  nestedMessages: MessageDefinition[];
  nestedEnums: EnumDefinition[];
  oneofs: OneofDefinition[];
  options: OptionStatement[];
  reserved: ReservedStatement[];
  extensions: ExtensionsStatement[];
  maps: MapFieldDefinition[];
  groups: GroupFieldDefinition[];
}

export interface FieldDefinition extends ProtoNode {
  type: 'field';
  modifier?: 'optional' | 'required' | 'repeated';
  fieldType: string;
  fieldTypeRange: Range;
  name: string;
  nameRange: Range;
  number: number;
  options?: FieldOption[];
}

export interface MapFieldDefinition extends ProtoNode {
  type: 'map';
  keyType: string;
  valueType: string;
  valueTypeRange: Range;
  name: string;
  nameRange: Range;
  number: number;
}

export interface GroupFieldDefinition extends ProtoNode {
  type: 'group';
  modifier?: 'optional' | 'required' | 'repeated';
  name: string;
  nameRange: Range;
  number: number;
  fields: FieldDefinition[];
  nestedMessages: MessageDefinition[];
  nestedEnums: EnumDefinition[];
  oneofs: OneofDefinition[];
  options: OptionStatement[];
  reserved: ReservedStatement[];
  extensions: ExtensionsStatement[];
  maps: MapFieldDefinition[];
  groups: GroupFieldDefinition[];
}

export interface FieldOption extends ProtoNode {
  type: 'field_option';
  name: string;
  value: string | number | boolean;
}

export interface OneofDefinition extends ProtoNode {
  type: 'oneof';
  name: string;
  nameRange: Range;
  fields: FieldDefinition[];
}

export interface EnumDefinition extends ProtoNode {
  type: 'enum';
  name: string;
  nameRange: Range;
  values: EnumValue[];
  options: OptionStatement[];
  reserved: ReservedStatement[];
}

export interface EnumValue extends ProtoNode {
  type: 'enum_value';
  name: string;
  nameRange: Range;
  number: number;
  options?: FieldOption[];
}

export interface ServiceDefinition extends ProtoNode {
  type: 'service';
  name: string;
  nameRange: Range;
  rpcs: RpcDefinition[];
  options: OptionStatement[];
}

export interface RpcDefinition extends ProtoNode {
  type: 'rpc';
  name: string;
  nameRange: Range;
  requestType: string;
  requestTypeRange: Range;
  requestStreaming: boolean;
  responseType: string;
  responseTypeRange: Range;
  responseStreaming: boolean;
  options: OptionStatement[];
  // Legacy field names for backward compatibility
  inputType?: string;
  inputTypeRange?: Range;
  inputStream?: boolean;
  outputType?: string;
  outputTypeRange?: Range;
  outputStream?: boolean;
}

export interface ExtendDefinition extends ProtoNode {
  type: 'extend';
  extendType: string;
  extendTypeRange: Range;
  fields: FieldDefinition[];
  groups: GroupFieldDefinition[];
  // Legacy field names for backward compatibility
  messageName?: string;
  messageNameRange?: Range;
}

export interface ReservedStatement extends ProtoNode {
  type: 'reserved';
  ranges: ReservedRange[];
  names: string[];
}

export interface ReservedRange {
  start: number;
  end: number | 'max';
}

export interface ExtensionsStatement extends ProtoNode {
  type: 'extensions';
  ranges: ReservedRange[];
}

// Helper types for symbol resolution
export interface SymbolInfo {
  name: string;
  fullName: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

export enum SymbolKind {
  Message = 'message',
  Enum = 'enum',
  Service = 'service',
  Rpc = 'rpc',
  Field = 'field',
  EnumValue = 'enumValue',
  Oneof = 'oneof',
  Package = 'package'
}

// Built-in protobuf types
export const BUILTIN_TYPES = [
  'double',
  'float',
  'int32',
  'int64',
  'uint32',
  'uint64',
  'sint32',
  'sint64',
  'fixed32',
  'fixed64',
  'sfixed32',
  'sfixed64',
  'bool',
  'string',
  'bytes'
];

export const MAP_KEY_TYPES = [
  'int32',
  'int64',
  'uint32',
  'uint64',
  'sint32',
  'sint64',
  'fixed32',
  'fixed64',
  'sfixed32',
  'sfixed64',
  'bool',
  'string'
];

export const PROTOBUF_KEYWORDS = [
  'syntax',
  'edition',
  'package',
  'import',
  'weak',
  'public',
  'option',
  'message',
  'enum',
  'service',
  'rpc',
  'returns',
  'stream',
  'oneof',
  'extend',
  'extensions',
  'reserved',
  'to',
  'max',
  'optional',
  'required',
  'repeated',
  'map',
  'group',
  'true',
  'false'
];

// Reserved field number ranges
// Note: These are kept for backward compatibility. New code should import from constants.ts
import { FIELD_NUMBER } from '../utils/constants';
export const MIN_FIELD_NUMBER = FIELD_NUMBER.MIN;
export const MAX_FIELD_NUMBER = FIELD_NUMBER.MAX;
export const RESERVED_RANGE_START = FIELD_NUMBER.RESERVED_RANGE_START;
export const RESERVED_RANGE_END = FIELD_NUMBER.RESERVED_RANGE_END;
