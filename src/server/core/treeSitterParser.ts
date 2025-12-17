/**
 * Tree-sitter Parser Adapter for Protocol Buffers
 * 
 * This adapter uses Tree-sitter for parsing .proto files into our AST format.
 * It provides better error recovery and more robust parsing than the custom parser.
 */

import { Parser, Point, Language, Node } from 'web-tree-sitter';
import {
  ProtoFile,
  SyntaxStatement,
  EditionStatement,
  PackageStatement,
  ImportStatement,
  OptionStatement,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  ExtendDefinition,
  FieldDefinition,
  MapFieldDefinition,
  GroupFieldDefinition,
  OneofDefinition,
  EnumValue,
  RpcDefinition,
  ReservedStatement,
  ExtensionsStatement,
  Range,
  Position,
} from './ast';

let parserInstance: Parser | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the Tree-sitter parser
 * This should be called once at extension activation
 */
export async function initTreeSitterParser(wasmPath: string): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await Parser.init();
      parserInstance = new Parser();
      const Proto = await Language.load(wasmPath);
      parserInstance.setLanguage(Proto);
      console.log('Tree-sitter parser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Tree-sitter parser:', error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if Tree-sitter parser is initialized
 */
export function isTreeSitterInitialized(): boolean {
  return parserInstance !== null;
}

/**
 * Get the singleton parser instance
 */
function getParser(): Parser {
  if (!parserInstance) {
    throw new Error('Tree-sitter parser not initialized. Call initTreeSitterParser() first.');
  }
  return parserInstance;
}

/**
 * Convert Tree-sitter Point to our Position format
 */
function pointToPosition(point: Point): Position {
  return {
    line: point.row,
    character: point.column
  };
}

/**
 * Convert Tree-sitter node to our Range format
 */
function nodeToRange(node: Node): Range {
  return {
    start: pointToPosition(node.startPosition),
    end: pointToPosition(node.endPosition)
  };
}

/**
 * Extract text content from a node
 */
function getText(node: Node): string {
  return node.text;
}

/**
 * Get child node by field name
 */
function getField(node: Node, fieldName: string): Node | null {
  return node.childForFieldName(fieldName);
}

/**
 * Get all children of a specific type
 */
function getChildren(node: Node, type?: string): Node[] {
  const children: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && (!type || child.type === type)) {
      children.push(child);
    }
  }
  return children;
}

/**
 * Parse a proto file using Tree-sitter
 */
export class TreeSitterProtoParser {
  parse(content: string, _uri: string): ProtoFile {
    const parser = getParser();
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error('Failed to parse proto file');
    }
    return this.convertToAST(tree.rootNode);
  }

  private convertToAST(root: Node): ProtoFile {
    const file: ProtoFile = {
      type: 'file',
      range: nodeToRange(root),
      imports: [],
      options: [],
      messages: [],
      enums: [],
      services: [],
      extends: []
    };

    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (!child) continue;

      try {
        switch (child.type) {
          case 'syntax':
            file.syntax = this.parseSyntax(child);
            break;
          case 'edition':
            file.edition = this.parseEdition(child);
            break;
          case 'package':
            file.package = this.parsePackage(child);
            break;
          case 'import':
            file.imports.push(this.parseImport(child));
            break;
          case 'option':
            file.options.push(this.parseOption(child));
            break;
          case 'message':
            file.messages.push(this.parseMessage(child));
            break;
          case 'enum':
            file.enums.push(this.parseEnum(child));
            break;
          case 'service':
            file.services.push(this.parseService(child));
            break;
          case 'extend':
            file.extends.push(this.parseExtend(child));
            break;
        }
      } catch (error) {
        // Log but continue parsing - Tree-sitter provides error recovery
        console.error(`Error parsing ${child.type} at line ${child.startPosition.row}:`, error);
      }
    }

    return file;
  }

  private parseSyntax(node: Node): SyntaxStatement {
    const text = getText(node);
    const version = text.includes('proto2') ? 'proto2' : 'proto3';

    return {
      type: 'syntax',
      version,
      range: nodeToRange(node)
    };
  }

  private parseEdition(node: Node): EditionStatement {
    const text = getText(node);
    const match = text.match(/edition\s*=\s*["']?([^"';]+)["']?/);
    const edition = match ? match[1] : '2023';

    return {
      type: 'edition',
      edition,
      range: nodeToRange(node)
    };
  }

  private parsePackage(node: Node): PackageStatement {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    return {
      type: 'package',
      name,
      range: nodeToRange(node)
    };
  }

  private parseImport(node: Node): ImportStatement {
    const text = getText(node);
    const pathMatch = text.match(/["']([^"']+)["']/);
    const path = pathMatch ? pathMatch[1] : '';
    
    let modifier: 'weak' | 'public' | undefined;
    if (text.includes('weak')) modifier = 'weak';
    else if (text.includes('public')) modifier = 'public';

    return {
      type: 'import',
      path,
      modifier,
      range: nodeToRange(node)
    };
  }

  private parseOption(node: Node): OptionStatement {
    const text = getText(node);
    const match = text.match(/option\s+([^\s=]+)\s*=\s*([^;]+);/);
    
    if (!match) {
      return {
        type: 'option',
        name: '',
        value: '',
        range: nodeToRange(node)
      };
    }

    const name = match[1].trim();
    const valueText = match[2].trim();
    
    // Parse value based on type
    let value: string | number | boolean = valueText;
    if (valueText === 'true') value = true;
    else if (valueText === 'false') value = false;
    else if (/^-?\d+$/.test(valueText)) value = parseInt(valueText, 10);
    else if (/^-?\d+\.\d+$/.test(valueText)) value = parseFloat(valueText);
    else value = valueText.replace(/["']/g, '');

    return {
      type: 'option',
      name,
      value,
      range: nodeToRange(node)
    };
  }

  private parseMessage(node: Node): MessageDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';
    const bodyNode = getField(node, 'body');

    const message: MessageDefinition = {
      type: 'message',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      range: nodeToRange(node),
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: []
    };

    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        try {
          switch (child.type) {
            case 'field':
              message.fields.push(this.parseField(child));
              break;
            case 'map_field':
              message.maps.push(this.parseMapField(child));
              break;
            case 'oneof':
              message.oneofs.push(this.parseOneof(child));
              break;
            case 'option':
              message.options.push(this.parseOption(child));
              break;
            case 'reserved':
              message.reserved.push(this.parseReserved(child));
              break;
            case 'extensions':
              message.extensions.push(this.parseExtensions(child));
              break;
            case 'message':
              message.nestedMessages.push(this.parseMessage(child));
              break;
            case 'enum':
              message.nestedEnums.push(this.parseEnum(child));
              break;
            case 'group':
              message.groups.push(this.parseGroup(child));
              break;
          }
        } catch (error) {
          console.error(`Error parsing message child ${child.type}:`, error);
        }
      }
    }

    return message;
  }

  private parseField(node: Node): FieldDefinition {
    const text = getText(node);
    const match = text.match(/(optional|required|repeated)?\s*(\w+(?:\.\w+)*)\s+(\w+)\s*=\s*(\d+)/);
    
    if (!match) {
      return {
        type: 'field',
        fieldType: 'string',
        fieldTypeRange: nodeToRange(node),
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const modifier = match[1] as 'optional' | 'required' | 'repeated' | undefined;
    const fieldType = match[2] || 'string';
    const name = match[3] || '';
    const number = parseInt(match[4] || '0', 10);

    return {
      type: 'field',
      modifier,
      fieldType,
      fieldTypeRange: nodeToRange(node),
      name,
      nameRange: nodeToRange(node),
      number,
      range: nodeToRange(node)
    };
  }

  private parseMapField(node: Node): MapFieldDefinition {
    const text = getText(node);
    const match = text.match(/map<\s*(\w+)\s*,\s*(\w+(?:\.\w+)*)\s*>\s+(\w+)\s*=\s*(\d+)/);
    
    if (!match) {
      return {
        type: 'map',
        keyType: 'string',
        valueType: 'string',
        valueTypeRange: nodeToRange(node),
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const keyType = match[1] || 'string';
    const valueType = match[2] || 'string';
    const name = match[3] || '';
    const number = parseInt(match[4] || '0', 10);

    return {
      type: 'map',
      keyType,
      valueType,
      valueTypeRange: nodeToRange(node),
      name,
      nameRange: nodeToRange(node),
      number,
      range: nodeToRange(node)
    };
  }

  private parseOneof(node: Node): OneofDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    const oneof: OneofDefinition = {
      type: 'oneof',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      fields: [],
      range: nodeToRange(node)
    };

    const fields = getChildren(node, 'oneof_field');
    for (const fieldNode of fields) {
      oneof.fields.push(this.parseField(fieldNode));
    }

    return oneof;
  }

  private parseGroup(node: Node): GroupFieldDefinition {
    const text = getText(node);
    const match = text.match(/(optional|required|repeated)?\s*group\s+(\w+)\s*=\s*(\d+)/);

    const modifier = match?.[1] as 'optional' | 'required' | 'repeated' | undefined;
    const name = match?.[2] || '';
    const number = match?.[3] ? parseInt(match[3], 10) : 0;

    return {
      type: 'group',
      modifier,
      name,
      nameRange: nodeToRange(node),
      number,
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: [],
      range: nodeToRange(node)
    };
  }

  private parseEnum(node: Node): EnumDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';
    const bodyNode = getField(node, 'body');

    const enumDef: EnumDefinition = {
      type: 'enum',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      values: [],
      options: [],
      reserved: [],
      range: nodeToRange(node)
    };

    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        try {
          switch (child.type) {
            case 'enum_field':
              enumDef.values.push(this.parseEnumValue(child));
              break;
            case 'option':
              enumDef.options.push(this.parseOption(child));
              break;
            case 'reserved':
              enumDef.reserved.push(this.parseReserved(child));
              break;
          }
        } catch (error) {
          console.error(`Error parsing enum child ${child.type}:`, error);
        }
      }
    }

    return enumDef;
  }

  private parseEnumValue(node: Node): EnumValue {
    const text = getText(node);
    const match = text.match(/(\w+)\s*=\s*(-?\d+)/);
    
    if (!match) {
      return {
        type: 'enum_value',
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const name = match[1];
    const number = parseInt(match[2], 10);

    return {
      type: 'enum_value',
      name,
      nameRange: nodeToRange(node),
      number,
      range: nodeToRange(node)
    };
  }

  private parseService(node: Node): ServiceDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    const service: ServiceDefinition = {
      type: 'service',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      rpcs: [],
      options: [],
      range: nodeToRange(node)
    };

    const rpcNodes = getChildren(node, 'rpc');
    for (const rpcNode of rpcNodes) {
      try {
        service.rpcs.push(this.parseRpc(rpcNode));
      } catch (error) {
        console.error('Error parsing RPC:', error);
      }
    }

    return service;
  }

  private parseRpc(node: Node): RpcDefinition {
    const text = getText(node);
    const match = text.match(/rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+(?:\.\w+)*)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+(?:\.\w+)*)\s*\)/);
    
    if (!match) {
      return {
        type: 'rpc',
        name: '',
        nameRange: nodeToRange(node),
        requestType: '',
        requestTypeRange: nodeToRange(node),
        responseType: '',
        responseTypeRange: nodeToRange(node),
        requestStreaming: false,
        responseStreaming: false,
        options: [],
        range: nodeToRange(node)
      };
    }

    const name = match[1];
    const requestStreaming = !!match[2];
    const requestType = match[3];
    const responseStreaming = !!match[4];
    const responseType = match[5];

    return {
      type: 'rpc',
      name,
      nameRange: nodeToRange(node),
      requestType,
      requestTypeRange: nodeToRange(node),
      responseType,
      responseTypeRange: nodeToRange(node),
      requestStreaming,
      responseStreaming,
      options: [],
      // Backward compatibility
      inputType: requestType,
      inputTypeRange: nodeToRange(node),
      outputType: responseType,
      outputTypeRange: nodeToRange(node),
      inputStream: requestStreaming,
      outputStream: responseStreaming,
      range: nodeToRange(node)
    };
  }

  private parseExtend(node: Node): ExtendDefinition {
    const text = getText(node);
    const match = text.match(/extend\s+(\w+(?:\.\w+)*)/);
    const extendType = match ? match[1] : '';

    return {
      type: 'extend',
      extendType,
      extendTypeRange: nodeToRange(node),
      fields: [],
      groups: [],
      // Backward compatibility
      messageName: extendType,
      messageNameRange: nodeToRange(node),
      range: nodeToRange(node)
    };
  }

  private parseReserved(node: Node): ReservedStatement {
    const text = getText(node);
    const reserved: ReservedStatement = {
      type: 'reserved',
      ranges: [],
      names: [],
      range: nodeToRange(node)
    };

    // Try to parse as ranges
    const rangePattern = /(\d+)(?:\s+to\s+(\d+|max))?/g;
    const rangeMatches = Array.from(text.matchAll(rangePattern));
    for (const match of rangeMatches) {
      const start = parseInt(match[1], 10);
      if (match[2]) {
        const end = match[2] === 'max' ? 536870911 : parseInt(match[2], 10);
        reserved.ranges.push({ start, end });
      } else {
        reserved.ranges.push({ start, end: start });
      }
    }

    // Try to parse as field names
    const namePattern = /["']([^"']+)["']/g;
    const nameMatches = Array.from(text.matchAll(namePattern));
    for (const match of nameMatches) {
      reserved.names.push(match[1]);
    }

    return reserved;
  }

  private parseExtensions(node: Node): ExtensionsStatement {
    const text = getText(node);
    const extensions: ExtensionsStatement = {
      type: 'extensions',
      ranges: [],
      range: nodeToRange(node)
    };

    const rangePattern = /(\d+)(?:\s+to\s+(\d+|max))?/g;
    const rangeMatches = Array.from(text.matchAll(rangePattern));
    for (const match of rangeMatches) {
      const start = parseInt(match[1], 10);
      if (match[2]) {
        const end = match[2] === 'max' ? 536870911 : parseInt(match[2], 10);
        extensions.ranges.push({ start, end });
      } else {
        extensions.ranges.push({ start, end: start });
      }
    }

    return extensions;
  }
}

// Export a singleton instance
export const treeSitterParser = new TreeSitterProtoParser();
