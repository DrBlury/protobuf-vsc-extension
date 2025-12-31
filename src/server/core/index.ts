/**
 * Core module barrel exports
 * Parser, Analyzer, AST types, and Templates
 */

export { ProtoParser } from './parser';
export { TreeSitterProtoParser, initTreeSitterParser, isTreeSitterInitialized } from './treeSitterParser';
export type { IProtoParser } from './parserFactory';
export { ParserFactory } from './parserFactory';
export { SemanticAnalyzer } from './analyzer';
export { TemplateProvider } from './templates';

// AST types
export type {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  FieldDefinition,
  RpcDefinition,
  OptionStatement,
  ImportStatement,
  SyntaxStatement,
  PackageStatement,
  Range,
  Position,
  EnumValue,
  OneofDefinition,
  ExtendDefinition,
  ReservedStatement,
  MapFieldDefinition
} from './ast';

export { SymbolKind } from './ast';
