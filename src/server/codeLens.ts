/**
 * Code Lens Provider for Protocol Buffers
 * Shows reference counts and other metadata above symbols
 */

import {
  CodeLens,
  Range,
  Command
} from 'vscode-languageserver/node';
import { ProtoFile, MessageDefinition, EnumDefinition, ServiceDefinition } from './ast';
import { SemanticAnalyzer } from './analyzer';

export class CodeLensProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getCodeLenses(uri: string, file: ProtoFile): CodeLens[] {
    const lenses: CodeLens[] = [];

    // Add code lenses for messages
    for (const message of file.messages) {
      lenses.push(...this.getMessageCodeLenses(uri, message, file.package?.name || ''));
    }

    // Add code lenses for enums
    for (const enumDef of file.enums) {
      lenses.push(...this.getEnumCodeLenses(uri, enumDef, file.package?.name || ''));
    }

    // Add code lenses for services
    for (const service of file.services) {
      lenses.push(...this.getServiceCodeLenses(uri, service, file.package?.name || ''));
    }

    return lenses;
  }

  private getMessageCodeLenses(
    uri: string,
    message: MessageDefinition,
    prefix: string
  ): CodeLens[] {
    const lenses: CodeLens[] = [];
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Count references
    const references = this.analyzer.findReferences(fullName);
    const externalRefs = references.filter(r => r.uri !== uri);
    const internalRefs = references.filter(r => r.uri === uri);

    if (references.length > 0 || message.fields.length > 0) {
      lenses.push({
        range: {
          start: { line: message.nameRange.start.line, character: 0 },
          end: { line: message.nameRange.start.line, character: 0 }
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${message.fields.length} field${message.fields.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: message.nameRange.start.line,
                character: message.nameRange.start.character
              }
            }
          ]
        }
      });
    }

    // Add lenses for nested messages
    for (const nested of message.nestedMessages) {
      lenses.push(...this.getMessageCodeLenses(uri, nested, fullName));
    }

    return lenses;
  }

  private getEnumCodeLenses(
    uri: string,
    enumDef: EnumDefinition,
    prefix: string
  ): CodeLens[] {
    const lenses: CodeLens[] = [];
    const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;

    const references = this.analyzer.findReferences(fullName);
    const externalRefs = references.filter(r => r.uri !== uri);
    const internalRefs = references.filter(r => r.uri === uri);

    if (references.length > 0 || enumDef.values.length > 0) {
      lenses.push({
        range: {
          start: { line: enumDef.nameRange.start.line, character: 0 },
          end: { line: enumDef.nameRange.start.line, character: 0 }
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${enumDef.values.length} value${enumDef.values.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: enumDef.nameRange.start.line,
                character: enumDef.nameRange.start.character
              }
            }
          ]
        }
      });
    }

    return lenses;
  }

  private getServiceCodeLenses(
    uri: string,
    service: ServiceDefinition,
    prefix: string
  ): CodeLens[] {
    const lenses: CodeLens[] = [];
    const fullName = prefix ? `${prefix}.${service.name}` : service.name;

    const references = this.analyzer.findReferences(fullName);
    const externalRefs = references.filter(r => r.uri !== uri);
    const internalRefs = references.filter(r => r.uri === uri);

    if (references.length > 0 || service.rpcs.length > 0) {
      lenses.push({
        range: {
          start: { line: service.nameRange.start.line, character: 0 },
          end: { line: service.nameRange.start.line, character: 0 }
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${service.rpcs.length} RPC${service.rpcs.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: service.nameRange.start.line,
                character: service.nameRange.start.character
              }
            }
          ]
        }
      });
    }

    return lenses;
  }
}
