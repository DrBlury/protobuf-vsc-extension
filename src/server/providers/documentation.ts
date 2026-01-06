/**
 * Documentation Provider for Protocol Buffers
 * Generates structured documentation data for live preview
 */

import type { SemanticAnalyzer } from '../core/analyzer';
import type {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  FieldDefinition,
  EnumValue,
  RpcDefinition,
  MapFieldDefinition,
  OptionStatement
} from '../core/ast';
import type {
  DocumentationData,
  DocumentationElement,
  DocumentationField,
  DocumentationEnumValue,
  DocumentationRpc
} from '../../shared/documentation';

export class DocumentationProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Generate documentation data for a proto file
   */
  getDocumentation(uri: string): DocumentationData | null {
    const file = this.analyzer.getFile(uri);
    if (!file) {
      return null;
    }

    return this.buildDocumentationData(uri, file);
  }

  private buildDocumentationData(uri: string, file: ProtoFile): DocumentationData {
    // Extract filename from URI
    const fileName = uri.split('/').pop() || uri;

    return {
      uri,
      fileName,
      syntax: file.syntax?.version,
      edition: file.edition?.edition,
      package: file.package?.name,
      imports: file.imports.map(imp => imp.path),
      messages: file.messages.map(msg => this.buildMessageDoc(msg)),
      enums: file.enums.map(enm => this.buildEnumDoc(enm)),
      services: file.services.map(svc => this.buildServiceDoc(svc)),
      fileComments: file.comments,
      options: file.options.map(opt => this.formatOption(opt))
    };
  }

  private buildMessageDoc(message: MessageDefinition, parentName?: string): DocumentationElement {
    const fullName = parentName ? `${parentName}.${message.name}` : message.name;

    // Collect all fields including map fields and oneof fields
    const fields: DocumentationField[] = [];

    // Regular fields
    for (const field of message.fields) {
      fields.push(this.buildFieldDoc(field));
    }

    // Map fields
    for (const mapField of message.maps) {
      fields.push(this.buildMapFieldDoc(mapField));
    }

    // Oneof fields (flattened but marked with oneof name)
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        const fieldDoc = this.buildFieldDoc(field);
        fieldDoc.options = fieldDoc.options || [];
        fieldDoc.options.push(`oneof: ${oneof.name}`);
        fields.push(fieldDoc);
      }
    }

    // Sort fields by number
    fields.sort((a, b) => a.number - b.number);

    return {
      kind: 'message',
      name: message.name,
      fullName,
      comments: message.comments,
      deprecated: this.isDeprecated(message.options),
      fields,
      nestedMessages: message.nestedMessages.map(nm => this.buildMessageDoc(nm, fullName)),
      nestedEnums: message.nestedEnums.map(ne => this.buildEnumDoc(ne, fullName)),
      options: message.options.map(opt => this.formatOption(opt))
    };
  }

  private buildFieldDoc(field: FieldDefinition): DocumentationField {
    return {
      name: field.name,
      type: field.fieldType,
      number: field.number,
      modifier: field.modifier,
      comments: field.comments,
      deprecated: this.isFieldDeprecated(field.options),
      options: field.options?.map(opt => `${opt.name} = ${opt.value}`)
    };
  }

  private buildMapFieldDoc(mapField: MapFieldDefinition): DocumentationField {
    return {
      name: mapField.name,
      type: `map<${mapField.keyType}, ${mapField.valueType}>`,
      number: mapField.number,
      comments: mapField.comments,
      deprecated: false
    };
  }

  private buildEnumDoc(enumDef: EnumDefinition, parentName?: string): DocumentationElement {
    const fullName = parentName ? `${parentName}.${enumDef.name}` : enumDef.name;

    return {
      kind: 'enum',
      name: enumDef.name,
      fullName,
      comments: enumDef.comments,
      deprecated: this.isDeprecated(enumDef.options),
      values: enumDef.values.map(val => this.buildEnumValueDoc(val)),
      options: enumDef.options.map(opt => this.formatOption(opt))
    };
  }

  private buildEnumValueDoc(value: EnumValue): DocumentationEnumValue {
    return {
      name: value.name,
      number: value.number,
      comments: value.comments,
      deprecated: this.isFieldDeprecated(value.options)
    };
  }

  private buildServiceDoc(service: ServiceDefinition): DocumentationElement {
    return {
      kind: 'service',
      name: service.name,
      fullName: service.name,
      comments: service.comments,
      deprecated: this.isDeprecated(service.options),
      rpcs: service.rpcs.map(rpc => this.buildRpcDoc(rpc)),
      options: service.options.map(opt => this.formatOption(opt))
    };
  }

  private buildRpcDoc(rpc: RpcDefinition): DocumentationRpc {
    return {
      name: rpc.name,
      requestType: rpc.requestType,
      responseType: rpc.responseType,
      requestStreaming: rpc.requestStreaming,
      responseStreaming: rpc.responseStreaming,
      comments: rpc.comments,
      deprecated: this.isDeprecated(rpc.options)
    };
  }

  private isDeprecated(options: OptionStatement[]): boolean {
    return options.some(opt => opt.name === 'deprecated' && opt.value === true);
  }

  private isFieldDeprecated(options?: Array<{ name: string; value: string | number | boolean }>): boolean {
    return options?.some(opt => opt.name === 'deprecated' && opt.value === true) ?? false;
  }

  private formatOption(opt: OptionStatement): string {
    const value = typeof opt.value === 'string' ? `"${opt.value}"` : String(opt.value);
    return `${opt.name} = ${value}`;
  }
}
