/**
 * Completion Provider for Protocol Buffers
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position
} from 'vscode-languageserver/node';

import { BUILTIN_TYPES, SymbolKind, ProtoFile } from './ast';
import { SemanticAnalyzer } from './analyzer';

export class CompletionProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getCompletions(
    uri: string,
    position: Position,
    lineText: string,
    _triggerCharacter?: string,
    documentText?: string
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Determine context
    const beforeCursor = lineText.substring(0, position.character);

    // Import path completion
    if (beforeCursor.includes('import') && beforeCursor.includes('"')) {
      return this.getImportCompletions(uri);
    }

    // Type completion after field modifier or for field type
    if (this.isTypeContext(beforeCursor)) {
      completions.push(...this.getTypeCompletions(uri));
    }

    // Keyword completions
    if (this.isKeywordContext(beforeCursor)) {
      completions.push(...this.getKeywordCompletions(beforeCursor));
    }

    // Field number suggestion - now with context-aware suggestions
    if (beforeCursor.match(/=\s*$/)) {
      completions.push(...this.getFieldNumberCompletions(uri, position, documentText));
    }

    // Option completions
    if (beforeCursor.includes('option')) {
      completions.push(...this.getOptionCompletions());
    }

    return completions;
  }

  private isTypeContext(text: string): boolean {
    return /^\s*(optional|required|repeated)?\s*$/.test(text) ||
           /^\s*(optional|required|repeated)\s+\w*$/.test(text) ||
           /^\s*\w*$/.test(text.trim());
  }

  private isKeywordContext(text: string): boolean {
    const trimmed = text.trim();
    return trimmed === '' ||
           /^\s*\w*$/.test(trimmed) ||
           /^\s*(message|enum|service|oneof)\s+\w+\s*\{?\s*$/.test(text);
  }

  private getTypeCompletions(uri: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Built-in types
    for (const type of BUILTIN_TYPES) {
      completions.push({
        label: type,
        kind: CompletionItemKind.Keyword,
        detail: 'Built-in type',
        sortText: '0' + type
      });
    }

    // Custom types from analyzer
    const typeSymbols = this.analyzer.getTypeCompletions(uri);
    for (const symbol of typeSymbols) {
      completions.push({
        label: symbol.name,
        kind: symbol.kind === SymbolKind.Message
          ? CompletionItemKind.Class
          : CompletionItemKind.Enum,
        detail: symbol.fullName,
        documentation: `${symbol.kind} defined in ${symbol.containerName || 'root'}`,
        sortText: '1' + symbol.name
      });
    }

    return completions;
  }

  private getKeywordCompletions(_context: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Top-level keywords
    const topLevelKeywords = [
      { label: 'syntax', snippet: 'syntax = "proto3";', detail: 'Syntax declaration' },
      { label: 'edition', snippet: 'edition = "${1:2023}";', detail: 'Edition declaration' },
      { label: 'package', snippet: 'package ${1:name};', detail: 'Package declaration' },
      { label: 'import', snippet: 'import "${1:path}";', detail: 'Import statement' },
      { label: 'option', snippet: 'option ${1:name} = ${2:value};', detail: 'Option declaration' },
      { label: 'message', snippet: 'message ${1:Name} {\n\t$0\n}', detail: 'Message declaration' },
      { label: 'enum', snippet: 'enum ${1:Name} {\n\t${2:UNKNOWN} = 0;\n\t$0\n}', detail: 'Enum declaration' },
      { label: 'service', snippet: 'service ${1:Name} {\n\t$0\n}', detail: 'Service declaration' }
    ];

    // Inside message keywords
    const messageKeywords = [
      { label: 'optional', snippet: 'optional ${1:type} ${2:name} = ${3:1};', detail: 'Optional field' },
      { label: 'required', snippet: 'required ${1:type} ${2:name} = ${3:1};', detail: 'Required field (proto2)' },
      { label: 'repeated', snippet: 'repeated ${1:type} ${2:name} = ${3:1};', detail: 'Repeated field' },
      { label: 'oneof', snippet: 'oneof ${1:name} {\n\t$0\n}', detail: 'Oneof declaration' },
      { label: 'map', snippet: 'map<${1:key_type}, ${2:value_type}> ${3:name} = ${4:1};', detail: 'Map field' },
      { label: 'reserved', snippet: 'reserved ${1:numbers_or_names};', detail: 'Reserved declaration' }
    ];

    // Service keywords
    const serviceKeywords = [
      { label: 'rpc', snippet: 'rpc ${1:Name}(${2:Request}) returns (${3:Response});', detail: 'RPC method' },
      { label: 'stream', snippet: 'stream', detail: 'Streaming modifier' }
    ];

    const allKeywords = [...topLevelKeywords, ...messageKeywords, ...serviceKeywords];

    for (const kw of allKeywords) {
      completions.push({
        label: kw.label,
        kind: CompletionItemKind.Keyword,
        detail: kw.detail,
        insertText: kw.snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '2' + kw.label
      });
    }

    return completions;
  }

  private getFieldNumberCompletions(uri: string, position: Position, documentText?: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Try to find the next available field number in the current context
    const protoFile = this.analyzer.getFile(uri);

    if (protoFile && documentText) {
      const nextNumber = this.findNextFieldNumber(protoFile, position, documentText);
      if (nextNumber > 0) {
        completions.push({
          label: nextNumber.toString(),
          kind: CompletionItemKind.Value,
          detail: `Next available field number`,
          documentation: 'Suggested next sequential field number based on existing fields',
          sortText: '0' + nextNumber.toString().padStart(5, '0'),
          preselect: true
        });
      }
    }

    // Also suggest common field numbers as fallback
    [1, 2, 3, 4, 5, 10, 100].forEach((n, i) => {
      if (!completions.some(c => c.label === n.toString())) {
        completions.push({
          label: n.toString(),
          kind: CompletionItemKind.Value,
          detail: `Field number ${n}`,
          sortText: (i + 1).toString().padStart(3, '0')
        });
      }
    });

    return completions;
  }

  private findNextFieldNumber(_protoFile: ProtoFile, position: Position, documentText: string): number {
    const lines = documentText.split('\n');

    // Alternative approach: scan the document text directly to find field numbers
    // in the current block context
    const currentLine = position.line;

    // Find the containing message/enum by scanning backwards for opening brace
    let braceCount = 0;
    let containerStartLine = -1;
    let containerEndLine = -1;

    // Find container start
    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i];
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === '}') {
          braceCount++;
        }
        if (line[j] === '{') {
          braceCount--;
          if (braceCount < 0) {
            containerStartLine = i;
            break;
          }
        }
      }
      if (containerStartLine >= 0) {
        break;
      }
    }

    // Find container end
    braceCount = 1; // We're inside the container
    for (let i = containerStartLine + 1; i < lines.length; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') {
          braceCount++;
        }
        if (line[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            containerEndLine = i;
            break;
          }
        }
      }
      if (containerEndLine >= 0) {
        break;
      }
    }

    if (containerStartLine < 0) {
      return 1;
    }

    // Extract field numbers from lines within this container
    const usedNumbers = new Set<number>();
    const fieldNumberRegex = /=\s*(\d+)\s*[;[]/;

    // Track nested brace level to only get direct children
    let nestedLevel = 0;

    for (let i = containerStartLine + 1; i <= (containerEndLine >= 0 ? containerEndLine : lines.length - 1); i++) {
      const line = lines[i];

      // Track brace level
      for (const char of line) {
        if (char === '{') {
          nestedLevel++;
        }
        if (char === '}') {
          nestedLevel--;
        }
      }

      // Only collect from direct level (nestedLevel should be 0 after processing the line if it's a direct child)
      // But for oneof fields (nestedLevel = 1), we still want to count them
      if (nestedLevel <= 1) {
        const match = line.match(fieldNumberRegex);
        if (match) {
          usedNumbers.add(parseInt(match[1], 10));
        }
      }

      // Also check for reserved statements
      const reservedMatch = line.match(/reserved\s+(.*);/);
      if (reservedMatch && nestedLevel === 0) {
        const reservedPart = reservedMatch[1];
        // Parse numbers and ranges like "1, 2, 15 to 20"
        const parts = reservedPart.split(',');
        for (const part of parts) {
          const trimmed = part.trim();
          const rangeMatch = trimmed.match(/(\d+)\s+to\s+(\d+|max)/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = rangeMatch[2] === 'max' ? start + 1000 : parseInt(rangeMatch[2], 10);
            for (let n = start; n <= Math.min(end, start + 1000); n++) {
              usedNumbers.add(n);
            }
          } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num)) {
              usedNumbers.add(num);
            }
          }
        }
      }
    }

    // Find the next available number
    if (usedNumbers.size === 0) {
      return 1;
    }

    const maxUsed = Math.max(...usedNumbers);
    let nextNumber = maxUsed + 1;

    // Skip reserved range (19000-19999)
    if (nextNumber >= 19000 && nextNumber <= 19999) {
      nextNumber = 20000;
    }

    // Make sure it's not in reserved set
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    return nextNumber;
  }

  private getOptionCompletions(): CompletionItem[] {
    const options = [
      { name: 'java_package', value: '"com.example"' },
      { name: 'java_outer_classname', value: '"ClassName"' },
      { name: 'java_multiple_files', value: 'true' },
      { name: 'go_package', value: '"path/to/package"' },
      { name: 'optimize_for', value: 'SPEED' },
      { name: 'deprecated', value: 'true' },
      { name: 'allow_alias', value: 'true' },
      { name: 'cc_enable_arenas', value: 'true' },
      { name: 'objc_class_prefix', value: '"PREFIX"' },
      { name: 'csharp_namespace', value: '"Namespace"' },
      { name: 'swift_prefix', value: '"PREFIX"' },
      { name: 'php_namespace', value: '"Namespace"' },
      { name: 'ruby_package', value: '"Package"' }
    ];

    return options.map(opt => ({
      label: opt.name,
      kind: CompletionItemKind.Property,
      detail: `Option: ${opt.name}`,
      insertText: `${opt.name} = ${opt.value}`,
      insertTextFormat: InsertTextFormat.PlainText
    }));
  }

  private getImportCompletions(currentUri: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Google well-known types
    const googleTypes = [
      'google/protobuf/any.proto',
      'google/protobuf/api.proto',
      'google/protobuf/descriptor.proto',
      'google/protobuf/duration.proto',
      'google/protobuf/empty.proto',
      'google/protobuf/field_mask.proto',
      'google/protobuf/source_context.proto',
      'google/protobuf/struct.proto',
      'google/protobuf/timestamp.proto',
      'google/protobuf/type.proto',
      'google/protobuf/wrappers.proto'
    ];

    for (const path of googleTypes) {
      completions.push({
        label: path,
        kind: CompletionItemKind.File,
        detail: 'Google well-known type',
        insertText: path
      });
    }

    // Add files from workspace
    for (const uri of this.analyzer.getAllFiles().keys()) {
      if (uri !== currentUri) {
        const fileName = uri.split('/').pop() || uri;
        completions.push({
          label: fileName,
          kind: CompletionItemKind.File,
          detail: 'Workspace proto file',
          insertText: fileName
        });
      }
    }

    return completions;
  }
}
