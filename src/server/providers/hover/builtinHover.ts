/**
 * Built-in types and keyword descriptions for hover
 */

import { Hover, MarkupContent, MarkupKind } from 'vscode-languageserver/node';

/**
 * Descriptions for built-in protobuf scalar types
 */
export const BUILTIN_TYPE_DESCRIPTIONS: Record<string, string> = {
  double: '64-bit floating point number',
  float: '32-bit floating point number',
  int32: '32-bit signed integer. Uses variable-length encoding. Inefficient for negative numbers.',
  int64: '64-bit signed integer. Uses variable-length encoding. Inefficient for negative numbers.',
  uint32: '32-bit unsigned integer. Uses variable-length encoding.',
  uint64: '64-bit unsigned integer. Uses variable-length encoding.',
  sint32: '32-bit signed integer. Uses variable-length encoding. Efficient for negative numbers.',
  sint64: '64-bit signed integer. Uses variable-length encoding. Efficient for negative numbers.',
  fixed32: '32-bit unsigned integer. Always 4 bytes. More efficient than uint32 if values are often > 2^28.',
  fixed64: '64-bit unsigned integer. Always 8 bytes. More efficient than uint64 if values are often > 2^56.',
  sfixed32: '32-bit signed integer. Always 4 bytes.',
  sfixed64: '64-bit signed integer. Always 8 bytes.',
  bool: 'Boolean value (true or false)',
  string: 'UTF-8 encoded or 7-bit ASCII text string',
  bytes: 'Arbitrary byte sequence'
};

/**
 * Descriptions for protobuf keywords
 */
export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  syntax: 'Declares the protobuf syntax version (proto2 or proto3)',
  edition: 'Declares the protobuf edition (e.g., 2023)',
  package: 'Declares the package namespace for the proto file',
  import: 'Imports definitions from another proto file',
  option: 'Sets a file-level, message-level, field-level, or service-level option',
  message: 'Defines a message type (structured data)',
  enum: 'Defines an enumeration type',
  service: 'Defines a service for RPC methods',
  rpc: 'Defines an RPC method within a service',
  returns: 'Specifies the return type of an RPC method',
  stream: 'Indicates streaming for RPC input or output',
  oneof: 'Defines a oneof field group where only one field can be set',
  extend: 'Extends a message with additional fields (proto2)',
  extensions: 'Declares extension field number ranges (proto2)',
  reserved: 'Reserves field numbers or names that cannot be used',
  optional: 'Field modifier indicating the field is optional',
  required: 'Field modifier indicating the field is required (proto2, deprecated)',
  repeated: 'Field modifier indicating the field can have multiple values',
  map: 'Defines a map field with key-value pairs',
  group: 'Defines a group field (proto2, deprecated). Groups combine a message type and field in one declaration. Use nested messages instead.',
  weak: 'Import modifier for weak dependencies',
  public: 'Import modifier to re-export imported definitions'
};

/**
 * Get hover for built-in type
 */
export function getBuiltinTypeHover(type: string): Hover {
  const content: MarkupContent = {
    kind: MarkupKind.Markdown,
    value: [
      `**${type}**`,
      '',
      BUILTIN_TYPE_DESCRIPTIONS[type] || 'Built-in protobuf scalar type'
    ].join('\n')
  };

  return { contents: content };
}

/**
 * Get hover for keyword
 */
export function getKeywordHover(word: string): Hover | null {
  if (KEYWORD_DESCRIPTIONS[word]) {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${word}**`,
        '',
        KEYWORD_DESCRIPTIONS[word]
      ].join('\n')
    };

    return { contents: content };
  }

  return null;
}
