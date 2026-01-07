/**
 * Code Lens Provider for Protocol Buffers
 * Shows reference counts and other metadata above symbols
 */

import type { CodeLens } from 'vscode-languageserver/node';
import type { ProtoFile, MessageDefinition, EnumDefinition, ServiceDefinition, FieldOption } from '../core/ast';
import type { SemanticAnalyzer } from '../core/analyzer';

/**
 * Check if a field option is a protovalidate/buf.validate option
 */
function isProtovalidateOption(option: FieldOption): boolean {
  const name = option.name.toLowerCase();
  return name.includes('buf.validate') || name.includes('validate.') || name.includes('protovalidate');
}

/**
 * Extract rule text from field options
 */
function getProtovalidateRuleText(options: FieldOption[]): string {
  const validateOptions = options.filter(isProtovalidateOption);
  if (validateOptions.length === 0) {
    return '';
  }

  return validateOptions.map(opt => `${opt.name} = ${opt.value}`).join(', ');
}

/**
 * Determine the rule type from options
 */
function getProtovalidateRuleType(options: FieldOption[]): string {
  for (const opt of options) {
    const name = opt.name.toLowerCase();
    if (name.includes('string')) {
      return 'string';
    }
    if (name.includes('int') || name.includes('float') || name.includes('double')) {
      return 'numeric';
    }
    if (name.includes('repeated') || name.includes('items')) {
      return 'repeated';
    }
    if (name.includes('cel') || name.includes('expression')) {
      return 'cel';
    }
    if (name.includes('required')) {
      return 'required';
    }
  }
  return 'constraint';
}

export class CodeLensProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getCodeLenses(uri: string, file: ProtoFile): CodeLens[] {
    const lenses: CodeLens[] = [];

    // Check if file imports protovalidate
    const hasProtovalidateImport = file.imports.some(
      imp => imp.path.includes('buf/validate') || imp.path.includes('validate/validate.proto')
    );

    // Add code lenses for messages
    for (const message of file.messages) {
      lenses.push(...this.getMessageCodeLenses(uri, message, file.package?.name || '', hasProtovalidateImport));
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
    prefix: string,
    hasProtovalidateImport: boolean = false
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
          end: { line: message.nameRange.start.line, character: 0 },
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${message.fields.length} field${message.fields.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: message.nameRange.start.line,
                character: message.nameRange.start.character,
              },
            },
          ],
        },
      });
    }

    // Add protovalidate playground hints for fields with validation rules
    if (hasProtovalidateImport) {
      lenses.push(...this.getProtovalidateCodeLenses(uri, message, fullName));
    }

    // Add lenses for nested messages
    for (const nested of message.nestedMessages) {
      lenses.push(...this.getMessageCodeLenses(uri, nested, fullName, hasProtovalidateImport));
    }

    return lenses;
  }

  /**
   * Get code lenses for protovalidate rules on fields
   */
  private getProtovalidateCodeLenses(uri: string, message: MessageDefinition, messageName: string): CodeLens[] {
    const lenses: CodeLens[] = [];

    for (const field of message.fields) {
      if (field.options && field.options.length > 0) {
        const hasValidateOption = field.options.some(isProtovalidateOption);
        if (hasValidateOption) {
          const ruleText = getProtovalidateRuleText(field.options);
          const ruleType = getProtovalidateRuleType(field.options);

          lenses.push({
            range: {
              start: { line: field.range.start.line, character: 0 },
              end: { line: field.range.start.line, character: 0 },
            },
            command: {
              title: '$(beaker) Test in Protovalidate Playground',
              command: 'protobuf.openProtovalidatePlayground',
              arguments: [
                {
                  fieldName: field.name,
                  messageName: messageName,
                  ruleType: ruleType,
                  ruleText: ruleText,
                  lineNumber: field.range.start.line,
                  filePath: uri,
                },
              ],
            },
          });
        }
      }
    }

    // Check oneof fields too
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        if (field.options && field.options.length > 0) {
          const hasValidateOption = field.options.some(isProtovalidateOption);
          if (hasValidateOption) {
            const ruleText = getProtovalidateRuleText(field.options);
            const ruleType = getProtovalidateRuleType(field.options);

            lenses.push({
              range: {
                start: { line: field.range.start.line, character: 0 },
                end: { line: field.range.start.line, character: 0 },
              },
              command: {
                title: '$(beaker) Test in Protovalidate Playground',
                command: 'protobuf.openProtovalidatePlayground',
                arguments: [
                  {
                    fieldName: field.name,
                    messageName: messageName,
                    ruleType: ruleType,
                    ruleText: ruleText,
                    lineNumber: field.range.start.line,
                    filePath: uri,
                  },
                ],
              },
            });
          }
        }
      }
    }

    return lenses;
  }

  private getEnumCodeLenses(uri: string, enumDef: EnumDefinition, prefix: string): CodeLens[] {
    const lenses: CodeLens[] = [];
    const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;

    const references = this.analyzer.findReferences(fullName);
    const externalRefs = references.filter(r => r.uri !== uri);
    const internalRefs = references.filter(r => r.uri === uri);

    if (references.length > 0 || enumDef.values.length > 0) {
      lenses.push({
        range: {
          start: { line: enumDef.nameRange.start.line, character: 0 },
          end: { line: enumDef.nameRange.start.line, character: 0 },
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${enumDef.values.length} value${enumDef.values.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: enumDef.nameRange.start.line,
                character: enumDef.nameRange.start.character,
              },
            },
          ],
        },
      });
    }

    return lenses;
  }

  private getServiceCodeLenses(uri: string, service: ServiceDefinition, prefix: string): CodeLens[] {
    const lenses: CodeLens[] = [];
    const fullName = prefix ? `${prefix}.${service.name}` : service.name;

    const references = this.analyzer.findReferences(fullName);
    const externalRefs = references.filter(r => r.uri !== uri);
    const internalRefs = references.filter(r => r.uri === uri);

    if (references.length > 0 || service.rpcs.length > 0) {
      lenses.push({
        range: {
          start: { line: service.nameRange.start.line, character: 0 },
          end: { line: service.nameRange.start.line, character: 0 },
        },
        command: {
          title: `${references.length} reference${references.length !== 1 ? 's' : ''} (${externalRefs.length} external, ${internalRefs.length} internal) | ${service.rpcs.length} RPC${service.rpcs.length !== 1 ? 's' : ''}`,
          command: 'protobuf.findReferences',
          arguments: [
            {
              uri,
              position: {
                line: service.nameRange.start.line,
                character: service.nameRange.start.character,
              },
            },
          ],
        },
      });
    }

    return lenses;
  }
}
