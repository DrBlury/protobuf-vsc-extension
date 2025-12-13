/**
 * Completion Provider for Protocol Buffers
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  Range,
  TextEdit
} from 'vscode-languageserver/node';

import { BUILTIN_TYPES, SymbolKind, SymbolInfo } from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';
import { FIELD_NUMBER } from '../utils/constants';

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
    const afterCursor = lineText.substring(position.character);
    const hasAssignmentAfterCursor = /\s*=/.test(afterCursor);
    const hasContentAfterCursor = afterCursor.trim().length > 0;
    const typePrefix = this.getTypePrefix(beforeCursor);

    // CEL expression completions - check this first as it's a specific context
    if (documentText) {
      const celContext = this.getCelContext(position, documentText);
      if (celContext) {
        return this.getCelCompletions(uri, position, beforeCursor, celContext);
      }
    }

    // Google API completions - check for HTTP, field_behavior, resource options
    if (documentText) {
      const googleApiCompletions = this.getGoogleApiCompletions(uri, position, beforeCursor, documentText);
      if (googleApiCompletions.length > 0) {
        return googleApiCompletions;
      }
    }

    // Import path completion
    if (beforeCursor.includes('import') && beforeCursor.includes('"')) {
      return this.getImportCompletions(uri);
    }

    // Type completion after field modifier or for field type
    if (this.isTypeContext(beforeCursor)) {
      completions.push(...this.getTypeCompletions(uri, position, typePrefix));
    }

    // Keyword completions
    if (this.isKeywordContext(beforeCursor)) {
      completions.push(...this.getKeywordCompletions(position, beforeCursor));
    }

    // Enum value number suggestion right after the value name
    if (this.isEnumValueContext(beforeCursor, position, documentText) && !hasAssignmentAfterCursor && !hasContentAfterCursor) {
      completions.push(...this.getEnumValueAssignmentCompletions(position, documentText));
    }

    // Field number suggestion - now with context-aware suggestions
    if (beforeCursor.match(/=\s*$/) && !hasContentAfterCursor) {
      completions.push(...this.getFieldNumberCompletions(uri, position, documentText));
    }

    // Auto-assign field number and semicolon right after field name
    if (this.isFieldAssignmentContext(beforeCursor) && !hasAssignmentAfterCursor && !hasContentAfterCursor) {
      completions.push(...this.getFieldAssignmentCompletions(uri, position, documentText));
    }

    // Field name suggestions based on type
    if (this.isFieldNameContext(beforeCursor)) {
      const typeMatch = beforeCursor.match(/(?:optional|required|repeated)?\s*([A-Za-z_][\w.<>,]+)\s+$/);
      if (typeMatch) {
        const typeName = typeMatch[1]!;
        const nameSuggestions = this.getFieldNameSuggestions(typeName);
        for (const suggestion of nameSuggestions) {
          completions.push({
            label: suggestion,
            kind: CompletionItemKind.Field,
            detail: `Suggested field name for ${typeName}`,
            insertText: `${suggestion} = `,
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '0' + suggestion
          });
        }
      }
    }

    // Option completions
    if (beforeCursor.includes('option') || beforeCursor.includes('buf.validate')) {
      completions.push(...this.getOptionCompletions(beforeCursor));
    }

    return completions;
  }

  private isTypeContext(text: string): boolean {
    const trimmed = text.trim();

    if (trimmed === '') {
      return true;
    }

    // Allow package-qualified type names like google.protobuf.Timestamp
    const typeFragment = '[A-Za-z_][\\w.]*';

    const withModifier = new RegExp(`^\\s*(?:optional|required|repeated)\\s+${typeFragment}$`);
    const bareType = new RegExp(`^\\s*${typeFragment}$`);

    return withModifier.test(text) || bareType.test(text);
  }

  private getTypePrefix(text: string): { qualifier?: string; partial?: string } | undefined {
    const match = text.match(/([A-Za-z_][\w.]*)$/);
    if (!match) {
      return undefined;
    }

    const full = match[1]!;
    const parts = full.split('.');

    if (parts.length === 1) {
      return { partial: parts[0]! };
    }

    const partial = parts.pop() || '';
    const qualifier = parts.join('.');
    return { qualifier, partial };
  }

  private isKeywordContext(text: string): boolean {
    const trimmed = text.trim();
    return trimmed === '' ||
           /^\s*\w*$/.test(trimmed) ||
           /^\s*(message|enum|service|oneof)\s+\w+\s*\{?\s*$/.test(text);
  }

  private getTypeCompletions(
    uri: string,
    position: Position,
    prefix?: { qualifier?: string; partial?: string }
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    const qualifier = prefix?.qualifier?.toLowerCase();
    const partial = prefix?.partial?.toLowerCase() || '';
    const hasQualifier = !!qualifier;
    const hasPartial = partial.length > 0;

    // Calculate the range of text to replace
    // This includes both the qualifier (e.g., "google.protobuf.") and the partial (e.g., "Time")
    const prefixLength = (prefix?.qualifier ? prefix.qualifier.length + 1 : 0) + (prefix?.partial?.length || 0);
    const replaceRange: Range = {
      start: { line: position.line, character: position.character - prefixLength },
      end: { line: position.line, character: position.character }
    };

    // Get current file's package for determining if full qualification is needed
    const currentFile = this.analyzer.getFile(uri);
    const currentPackage = currentFile?.package?.name || '';

    // Built-in types
    if (!hasQualifier) {
      for (const type of BUILTIN_TYPES) {
        if (hasPartial && !type.toLowerCase().startsWith(partial)) {
          continue;
        }
        completions.push({
          label: type,
          kind: CompletionItemKind.Keyword,
          detail: 'Built-in type',
          sortText: '0' + type,
          textEdit: TextEdit.replace(replaceRange, type)
        });
      }
    }

    // Custom types from analyzer
    const typeSymbols = this.analyzer.getTypeCompletions(uri);
    for (const symbol of typeSymbols) {
      const fullNameLower = symbol.fullName.toLowerCase();
      const nameLower = symbol.name.toLowerCase();

      if (hasQualifier) {
        const qualifierWithDot = `${qualifier}.`;
        if (!fullNameLower.startsWith(qualifierWithDot)) {
          continue;
        }

        const remainder = fullNameLower.slice(qualifierWithDot.length);
        if (hasPartial && !remainder.startsWith(partial)) {
          continue;
        }
      } else if (hasPartial) {
        if (!nameLower.startsWith(partial) && !fullNameLower.startsWith(partial)) {
          continue;
        }
      }

      // Determine whether to use short name or fully qualified name
      // Check if the short name can be resolved from the current context
      const insertText = this.getInsertTextForType(symbol, uri, currentPackage);

      completions.push({
        label: symbol.name,
        labelDetails: symbol.containerName ? { description: symbol.containerName } : undefined,
        kind: symbol.kind === SymbolKind.Message
          ? CompletionItemKind.Class
          : CompletionItemKind.Enum,
        detail: symbol.fullName,
        filterText: `${symbol.fullName} ${symbol.name}`,
        documentation: `${symbol.kind} defined in ${symbol.containerName || 'root'}`,
        sortText: '1' + symbol.name,
        textEdit: TextEdit.replace(replaceRange, insertText)
      });
    }

    return completions;
  }

  /**
   * Determine the appropriate text to insert for a type completion.
   * Returns the short name if the type is in the same package as the current file,
   * otherwise returns the fully qualified name.
   * For nested types in the same package, returns the parent-qualified name (e.g., "Outer.Inner").
   */
  private getInsertTextForType(symbol: SymbolInfo, currentUri: string, currentPackage: string): string {
    // Get the package of the file where the symbol is defined
    const symbolFile = this.analyzer.getFile(symbol.location.uri);
    const symbolPackage = symbolFile?.package?.name || '';
    
    // If both have no package (empty string), short name is fine
    if (!symbolPackage && !currentPackage) {
      return symbol.name;
    }
    
    // If the symbol is in the same package
    if (symbolPackage === currentPackage) {
      // For nested types (e.g., "test.Outer.Inner" with package "test"), 
      // return the relative path from the package: "Outer.Inner"
      if (currentPackage && symbol.fullName.startsWith(currentPackage + '.')) {
        return symbol.fullName.substring(currentPackage.length + 1);
      }
      return symbol.name;
    }
    
    // Otherwise, use fully qualified name (symbol is in a different package)
    return symbol.fullName;
  }

  private getKeywordCompletions(position: Position, context: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Only provide simple keyword completions here
    // Full snippet expansions (message, enum, service, etc.) are handled by snippets/proto.json
    // to avoid duplicate suggestions
    const simpleKeywords = [
      { label: 'optional', detail: 'Optional field modifier' },
      { label: 'required', detail: 'Required field modifier (proto2)' },
      { label: 'repeated', detail: 'Repeated field modifier' },
      { label: 'stream', detail: 'Streaming modifier' }
    ];

    // Calculate the range of the partial keyword being typed
    const partialMatch = context.match(/(\w*)$/);
    const partial = partialMatch?.[1] || '';
    const replaceRange: Range = {
      start: { line: position.line, character: position.character - partial.length },
      end: { line: position.line, character: position.character }
    };

    for (const kw of simpleKeywords) {
      completions.push({
        label: kw.label,
        kind: CompletionItemKind.Keyword,
        detail: kw.detail,
        sortText: '2' + kw.label,
        textEdit: TextEdit.replace(replaceRange, kw.label)
      });
    }

    return completions;
  }

  private getFieldNumberCompletions(uri: string, position: Position, documentText?: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Try to find the next available field number in the current context
    const protoFile = this.analyzer.getFile(uri);

    if (protoFile && documentText) {
      const nextNumber = this.findNextFieldNumber(position, documentText);
      if (nextNumber > 0) {
        completions.push({
          label: nextNumber.toString(),
          kind: CompletionItemKind.Value,
          detail: `Next available field number`,
          documentation: 'Suggested next sequential field number based on existing fields',
          sortText: '0' + nextNumber.toString().padStart(5, '0'),
          preselect: true,
          insertText: `${nextNumber};`,
          insertTextFormat: InsertTextFormat.Snippet
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
          sortText: (i + 1).toString().padStart(3, '0'),
          insertText: `${n};`,
          insertTextFormat: InsertTextFormat.Snippet
        });
      }
    });

    return completions;
  }

  private findNextFieldNumber(position: Position, documentText: string): number {
    const lines = documentText.split('\n');
    const containerBounds = this.getContainerBounds(position, lines);

    if (!containerBounds) {
      return 1;
    }

    const { start: containerStartLine, end: containerEndLine } = containerBounds;

    // Extract field numbers from lines within this container
    const usedNumbers = new Set<number>();
    const fieldNumberRegex = /=\s*(\d+)\s*[;[]/;

    // Track nested brace level to only get direct children
    let nestedLevel = 0;

    for (let i = containerStartLine + 1; i <= containerEndLine; i++) {
      const line = lines[i]!;

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
          usedNumbers.add(parseInt(match[1]!, 10));
        }
      }

      // Also check for reserved statements
      const reservedMatch = line.match(/reserved\s+(.*);/);
      if (reservedMatch && nestedLevel === 0) {
        const reservedPart = reservedMatch[1]!;
        // Parse numbers and ranges like "1, 2, 15 to 20"
        const parts = reservedPart.split(',');
        for (const part of parts) {
          const trimmed = part.trim();
          const rangeMatch = trimmed.match(/(\d+)\s+to\s+(\d+|max)/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1]!, 10);
            const end = rangeMatch[2] === 'max' ? start + 1000 : parseInt(rangeMatch[2]!, 10);
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

    // Skip reserved range
    if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
      nextNumber = 20000;
    }

    // Make sure it's not in reserved set
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    return nextNumber;
  }

  private getContainerBounds(position: Position, lines: string[]): { start: number; end: number } | undefined {
    const currentLine = position.line;

    let braceCount = 0;
    let containerStartLine = -1;

    // Walk backwards to find the matching opening brace for the current scope
    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i]!;
      for (let j = line.length - 1; j >= 0; j--) {
        const char = line[j]!;
        if (char === '}') {
          braceCount++;
        }
        if (char === '{') {
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

    if (containerStartLine < 0) {
      return undefined;
    }

    // Walk forward to find the matching closing brace
    braceCount = 1;
    let containerEndLine = lines.length - 1;

    for (let i = containerStartLine + 1; i < lines.length; i++) {
      const line = lines[i]!;
      for (const char of line) {
        if (char === '{') {
          braceCount++;
        }
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            containerEndLine = i;
            return { start: containerStartLine, end: containerEndLine };
          }
        }
      }
    }

    return { start: containerStartLine, end: containerEndLine };
  }

  private getContainerInfo(position: Position, documentText: string): { start: number; end: number; kind?: 'enum' | 'message' | 'service' } | undefined {
    const lines = documentText.split('\n');
    const bounds = this.getContainerBounds(position, lines);

    if (!bounds) {
      return undefined;
    }

    let kind: 'enum' | 'message' | 'service' | undefined;
    const lookbackStart = Math.max(0, bounds.start - 2);

    for (let i = bounds.start; i >= lookbackStart; i--) {
      const headerLine = lines[i]!;

      if (/\benum\s+[A-Za-z_][\w.]*/.test(headerLine)) {
        kind = 'enum';
        break;
      }

      if (/\bmessage\s+[A-Za-z_][\w.]*/.test(headerLine)) {
        kind = 'message';
        break;
      }

      if (/\bservice\s+[A-Za-z_][\w.]*/.test(headerLine)) {
        kind = 'service';
        break;
      }
    }

    return { ...bounds, kind };
  }

  private isFieldAssignmentContext(text: string): boolean {
    // Match a type and identifier with trailing whitespace, but no '=' yet
    const pattern = /^\s*(?:optional|required|repeated)?\s*(?!map\s*<)([A-Za-z_][\w.<>,]*)\s+([A-Za-z_][\w]*)\s*$/;
    return pattern.test(text);
  }

  private isEnumValueContext(text: string, position: Position, documentText?: string): boolean {
    if (!documentText) {
      return false;
    }

    const containerInfo = this.getContainerInfo(position, documentText);
    if (containerInfo?.kind !== 'enum') {
      return false;
    }

    const trimmed = text.trim();
    return /^[A-Z][A-Z0-9_]*$/.test(trimmed);
  }

  private isFieldNameContext(text: string): boolean {
    // Match a type with optional modifier, but no field name yet
    const pattern = /^\s*(?:optional|required|repeated)?\s*(?!map\s*<)([A-Za-z_][\w.<>,]+)\s+$/;
    return pattern.test(text);
  }

  private getFieldAssignmentCompletions(
    _uri: string,
    position: Position,
    documentText?: string
  ): CompletionItem[] {
    if (!documentText) {
      return [];
    }

    const nextNumber = this.findNextFieldNumber(position, documentText);

    return [{
      label: `= ${nextNumber};`,
      kind: CompletionItemKind.Snippet,
      detail: 'Insert next field tag and semicolon',
      documentation: 'Automatically assigns the next available field number and appends a semicolon',
      insertText: `= ${nextNumber};$0`,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '00'
    }];
  }

  private getEnumValueAssignmentCompletions(
    position: Position,
    documentText?: string
  ): CompletionItem[] {
    if (!documentText) {
      return [];
    }

    const nextNumber = this.findNextEnumValueNumber(position, documentText);

    return [{
      label: `= ${nextNumber};`,
      kind: CompletionItemKind.Snippet,
      detail: 'Insert next enum value number',
      documentation: 'Automatically assigns the next available enum value number and appends a semicolon',
      insertText: `= ${nextNumber};$0`,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '00'
    }];
  }

  private findNextEnumValueNumber(position: Position, documentText: string): number {
    const containerInfo = this.getContainerInfo(position, documentText);

    if (!containerInfo || containerInfo.kind !== 'enum') {
      return 0;
    }

    const lines = documentText.split('\n');
    const usedNumbers = new Set<number>();
    const numberRegex = /=\s*(-?\d+)\s*;/;

    for (let i = containerInfo.start + 1; i <= containerInfo.end; i++) {
      const line = lines[i]!;
      const match = line.match(numberRegex);
      if (match) {
        usedNumbers.add(parseInt(match[1]!, 10));
      }
    }

    if (usedNumbers.size === 0) {
      return 0;
    }

    const maxUsed = Math.max(...usedNumbers);
    let nextNumber = maxUsed + 1;

    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    return nextNumber;
  }

  private getOptionCompletions(beforeCursor?: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check if we're inside a buf.validate context
    if (beforeCursor) {
      const bufValidateCompletions = this.getBufValidateOptionCompletions(beforeCursor);
      if (bufValidateCompletions.length > 0) {
        return bufValidateCompletions;
      }
    }

    // Standard proto options
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

    completions.push(...options.map(opt => ({
      label: opt.name,
      kind: CompletionItemKind.Property,
      detail: `Option: ${opt.name}`,
      insertText: `${opt.name} = ${opt.value}`,
      insertTextFormat: InsertTextFormat.PlainText
    })));

    // Add buf.validate custom options as top-level suggestions
    completions.push(...this.getBufValidateTopLevelOptions());

    // Add google.api options as top-level suggestions
    completions.push(...this.getGoogleApiTopLevelOptions());

    return completions;
  }

  /**
   * Get google.api top-level option suggestions
   */
  private getGoogleApiTopLevelOptions(): CompletionItem[] {
    return [
      {
        label: '(google.api.http)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - HTTP mapping',
        documentation: 'Maps gRPC methods to HTTP REST endpoints for gRPC transcoding',
        insertText: '(google.api.http) = {\n  ${1|get,post,put,delete,patch|}: "/${2:v1}/${3:resource}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.http'
      },
      {
        label: '(google.api.field_behavior)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - Field behavior',
        documentation: 'Specifies field behavior (REQUIRED, OUTPUT_ONLY, INPUT_ONLY, IMMUTABLE, OPTIONAL)',
        insertText: '(google.api.field_behavior) = ${1|REQUIRED,OUTPUT_ONLY,INPUT_ONLY,IMMUTABLE,OPTIONAL|}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.field_behavior'
      },
      {
        label: '(google.api.resource)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - Resource descriptor',
        documentation: 'Defines the message as an API resource with type and naming pattern',
        insertText: '(google.api.resource) = {\n  type: "${1:example.googleapis.com}/${2:Resource}"\n  pattern: "${3:resources}/{${4:resource}}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.resource'
      },
      {
        label: '(google.api.resource_reference)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - Resource reference',
        documentation: 'Indicates that a field references another resource',
        insertText: '(google.api.resource_reference) = {\n  type: "${1:example.googleapis.com/Resource}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.resource_reference'
      },
      {
        label: '(google.api.method_signature)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - Method signature',
        documentation: 'Defines simplified method signatures for client library generation',
        insertText: '(google.api.method_signature) = "${1:field1,field2}"',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.method_signature'
      },
      {
        label: '(google.api.default_host)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - Default host',
        documentation: 'Specifies the default API endpoint host',
        insertText: '(google.api.default_host) = "${1:api.example.com}"',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.default_host'
      },
      {
        label: '(google.api.oauth_scopes)',
        kind: CompletionItemKind.Module,
        detail: 'google/api - OAuth scopes',
        documentation: 'Specifies OAuth scopes required for the service',
        insertText: '(google.api.oauth_scopes) = "${1:https://www.googleapis.com/auth/cloud-platform}"',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0google.api.oauth_scopes'
      }
    ];
  }

  /**
   * Get buf.validate top-level option suggestions
   */
  private getBufValidateTopLevelOptions(): CompletionItem[] {
    return [
      {
        label: '(buf.validate.message)',
        kind: CompletionItemKind.Module,
        detail: 'buf/validate - Message validation',
        documentation: 'Custom validation rules for the entire message using CEL expressions',
        insertText: '(buf.validate.message).cel = {\n  id: "${1:validation_id}"\n  message: "${2:Validation failed}"\n  expression: "${3:this.field > 0}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0buf.validate.message'
      },
      {
        label: '(buf.validate.field)',
        kind: CompletionItemKind.Module,
        detail: 'buf/validate - Field validation',
        documentation: 'Custom validation rules for a field using type-specific constraints or CEL',
        insertText: '(buf.validate.field)',
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: '0buf.validate.field'
      },
      {
        label: '(buf.validate.oneof)',
        kind: CompletionItemKind.Module,
        detail: 'buf/validate - Oneof validation',
        documentation: 'Validation rules for oneof fields (e.g., required)',
        insertText: '(buf.validate.oneof).required = ${1:true};',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0buf.validate.oneof'
      }
    ];
  }

  /**
   * Get context-aware buf.validate option completions
   */
  private getBufValidateOptionCompletions(beforeCursor: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check for buf.validate.field type-specific options
    // Pattern: (buf.validate.field).string. or (buf.validate.field).int32. etc.
    const fieldTypeMatch = beforeCursor.match(/\(buf\.validate\.field\)\.(string|bytes|int32|int64|uint32|uint64|sint32|sint64|fixed32|fixed64|sfixed32|sfixed64|float|double|bool|enum|repeated|map|any|duration|timestamp)\.$/);
    if (fieldTypeMatch) {
      const fieldType = fieldTypeMatch[1]!;
      return this.getBufValidateFieldTypeOptions(fieldType);
    }

    // Check for buf.validate.field. options
    if (beforeCursor.match(/\(buf\.validate\.field\)\.$/)) {
      return this.getBufValidateFieldOptions();
    }

    // Check for buf.validate.message. options
    if (beforeCursor.match(/\(buf\.validate\.message\)\.$/)) {
      return this.getBufValidateMessageOptions();
    }

    // Check for buf.validate. (top-level namespace)
    if (beforeCursor.match(/\(buf\.validate\.$/)) {
      return [
        {
          label: 'field',
          kind: CompletionItemKind.Module,
          detail: 'Field validation constraints',
          documentation: 'Apply validation rules to individual fields',
          insertText: 'field)',
          insertTextFormat: InsertTextFormat.PlainText,
          sortText: '0field'
        },
        {
          label: 'message',
          kind: CompletionItemKind.Module,
          detail: 'Message validation constraints',
          documentation: 'Apply validation rules to the entire message',
          insertText: 'message)',
          insertTextFormat: InsertTextFormat.PlainText,
          sortText: '0message'
        },
        {
          label: 'oneof',
          kind: CompletionItemKind.Module,
          detail: 'Oneof validation constraints',
          documentation: 'Apply validation rules to oneof fields',
          insertText: 'oneof)',
          insertTextFormat: InsertTextFormat.PlainText,
          sortText: '0oneof'
        }
      ];
    }

    return completions;
  }

  /**
   * Get buf.validate.message option completions
   */
  private getBufValidateMessageOptions(): CompletionItem[] {
    return [
      {
        label: 'cel',
        kind: CompletionItemKind.Property,
        detail: 'CEL validation expression',
        documentation: 'Custom CEL expression with id, message, and expression fields',
        insertText: 'cel = {\n  id: "${1:validation_id}"\n  message: "${2:Validation failed}"\n  expression: "${3:this.field > 0}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0cel'
      },
      {
        label: 'disabled',
        kind: CompletionItemKind.Property,
        detail: 'Disable validation',
        documentation: 'Disable all validation for this message',
        insertText: 'disabled = ${1:true}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '1disabled'
      }
    ];
  }

  /**
   * Get buf.validate.field option completions
   */
  private getBufValidateFieldOptions(): CompletionItem[] {
    const options = [
      // Common options
      { name: 'cel', detail: 'CEL validation expression', insert: 'cel = {\n  id: "${1:validation_id}"\n  message: "${2:Validation failed}"\n  expression: "${3:this > 0}"\n}', sort: '0' },
      { name: 'required', detail: 'Field must be set', insert: 'required = ${1:true}', sort: '0' },
      { name: 'ignore', detail: 'Ignore validation', insert: 'ignore = ${1:IGNORE_UNSPECIFIED}', sort: '1' },
      // Type-specific options
      { name: 'string', detail: 'String constraints', insert: 'string.', sort: '2' },
      { name: 'bytes', detail: 'Bytes constraints', insert: 'bytes.', sort: '2' },
      { name: 'int32', detail: 'Int32 constraints', insert: 'int32.', sort: '2' },
      { name: 'int64', detail: 'Int64 constraints', insert: 'int64.', sort: '2' },
      { name: 'uint32', detail: 'UInt32 constraints', insert: 'uint32.', sort: '2' },
      { name: 'uint64', detail: 'UInt64 constraints', insert: 'uint64.', sort: '2' },
      { name: 'sint32', detail: 'SInt32 constraints', insert: 'sint32.', sort: '2' },
      { name: 'sint64', detail: 'SInt64 constraints', insert: 'sint64.', sort: '2' },
      { name: 'fixed32', detail: 'Fixed32 constraints', insert: 'fixed32.', sort: '2' },
      { name: 'fixed64', detail: 'Fixed64 constraints', insert: 'fixed64.', sort: '2' },
      { name: 'sfixed32', detail: 'SFixed32 constraints', insert: 'sfixed32.', sort: '2' },
      { name: 'sfixed64', detail: 'SFixed64 constraints', insert: 'sfixed64.', sort: '2' },
      { name: 'float', detail: 'Float constraints', insert: 'float.', sort: '2' },
      { name: 'double', detail: 'Double constraints', insert: 'double.', sort: '2' },
      { name: 'bool', detail: 'Bool constraints', insert: 'bool.', sort: '2' },
      { name: 'enum', detail: 'Enum constraints', insert: 'enum.', sort: '2' },
      { name: 'repeated', detail: 'Repeated field constraints', insert: 'repeated.', sort: '2' },
      { name: 'map', detail: 'Map constraints', insert: 'map.', sort: '2' },
      { name: 'any', detail: 'Any type constraints', insert: 'any.', sort: '2' },
      { name: 'duration', detail: 'Duration constraints', insert: 'duration.', sort: '2' },
      { name: 'timestamp', detail: 'Timestamp constraints', insert: 'timestamp.', sort: '2' }
    ];

    return options.map(opt => ({
      label: opt.name,
      kind: CompletionItemKind.Property,
      detail: opt.detail,
      insertText: opt.insert,
      insertTextFormat: opt.insert.includes('$') ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
      sortText: opt.sort + opt.name
    }));
  }

  /**
   * Get buf.validate.field type-specific option completions
   */
  private getBufValidateFieldTypeOptions(fieldType: string): CompletionItem[] {
    const typeOptions: Record<string, Array<{name: string, detail: string, value?: string}>> = {
      string: [
        { name: 'const', detail: 'Must equal this value', value: '"${1:value}"' },
        { name: 'len', detail: 'Exact length', value: '${1:10}' },
        { name: 'min_len', detail: 'Minimum length', value: '${1:1}' },
        { name: 'max_len', detail: 'Maximum length', value: '${1:255}' },
        { name: 'pattern', detail: 'Regex pattern', value: '"${1:^[a-z]+$}"' },
        { name: 'prefix', detail: 'Must start with', value: '"${1:prefix}"' },
        { name: 'suffix', detail: 'Must end with', value: '"${1:suffix}"' },
        { name: 'contains', detail: 'Must contain', value: '"${1:substring}"' },
        { name: 'not_contains', detail: 'Must not contain', value: '"${1:substring}"' },
        { name: 'in', detail: 'Must be one of', value: '["${1:a}", "${2:b}"]' },
        { name: 'not_in', detail: 'Must not be one of', value: '["${1:a}", "${2:b}"]' },
        { name: 'email', detail: 'Must be valid email', value: 'true' },
        { name: 'hostname', detail: 'Must be valid hostname', value: 'true' },
        { name: 'ip', detail: 'Must be valid IP', value: 'true' },
        { name: 'ipv4', detail: 'Must be valid IPv4', value: 'true' },
        { name: 'ipv6', detail: 'Must be valid IPv6', value: 'true' },
        { name: 'uri', detail: 'Must be valid URI', value: 'true' },
        { name: 'uri_ref', detail: 'Must be valid URI reference', value: 'true' },
        { name: 'address', detail: 'Must be valid address (host or IP)', value: 'true' },
        { name: 'uuid', detail: 'Must be valid UUID', value: 'true' },
        { name: 'tuuid', detail: 'Must be valid trimmed UUID', value: 'true' },
        { name: 'ip_with_prefixlen', detail: 'IP with prefix length', value: 'true' },
        { name: 'ipv4_with_prefixlen', detail: 'IPv4 with prefix length', value: 'true' },
        { name: 'ipv6_with_prefixlen', detail: 'IPv6 with prefix length', value: 'true' },
        { name: 'ip_prefix', detail: 'IP prefix', value: 'true' },
        { name: 'ipv4_prefix', detail: 'IPv4 prefix', value: 'true' },
        { name: 'ipv6_prefix', detail: 'IPv6 prefix', value: 'true' },
        { name: 'host_and_port', detail: 'Host and port', value: 'true' },
        { name: 'well_known_regex', detail: 'Well-known regex', value: '${1:KNOWN_REGEX_HTTP_HEADER_NAME}' }
      ],
      bytes: [
        { name: 'const', detail: 'Must equal this value' },
        { name: 'len', detail: 'Exact length', value: '${1:16}' },
        { name: 'min_len', detail: 'Minimum length', value: '${1:1}' },
        { name: 'max_len', detail: 'Maximum length', value: '${1:1024}' },
        { name: 'pattern', detail: 'Regex pattern', value: '"${1:pattern}"' },
        { name: 'prefix', detail: 'Must start with' },
        { name: 'suffix', detail: 'Must end with' },
        { name: 'contains', detail: 'Must contain' },
        { name: 'in', detail: 'Must be one of' },
        { name: 'not_in', detail: 'Must not be one of' },
        { name: 'ip', detail: 'Must be valid IP bytes', value: 'true' },
        { name: 'ipv4', detail: 'Must be valid IPv4 bytes', value: 'true' },
        { name: 'ipv6', detail: 'Must be valid IPv6 bytes', value: 'true' }
      ],
      int32: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      int64: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      uint32: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      uint64: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      sint32: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      sint64: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      fixed32: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      fixed64: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      sfixed32: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      sfixed64: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}, ${3:3}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      float: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0.0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100.0}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100.0}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0.0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0.0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1.0}, ${2:2.0}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0.0}]' },
        { name: 'finite', detail: 'Must be finite (not NaN or Inf)', value: 'true' }
      ],
      double: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0.0}' },
        { name: 'lt', detail: 'Less than', value: '${1:100.0}' },
        { name: 'lte', detail: 'Less than or equal', value: '${1:100.0}' },
        { name: 'gt', detail: 'Greater than', value: '${1:0.0}' },
        { name: 'gte', detail: 'Greater than or equal', value: '${1:0.0}' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1.0}, ${2:2.0}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0.0}]' },
        { name: 'finite', detail: 'Must be finite (not NaN or Inf)', value: 'true' }
      ],
      bool: [
        { name: 'const', detail: 'Must equal this value', value: '${1:true}' }
      ],
      enum: [
        { name: 'const', detail: 'Must equal this value', value: '${1:0}' },
        { name: 'defined_only', detail: 'Must be a defined enum value', value: 'true' },
        { name: 'in', detail: 'Must be one of', value: '[${1:1}, ${2:2}]' },
        { name: 'not_in', detail: 'Must not be one of', value: '[${1:0}]' }
      ],
      repeated: [
        { name: 'min_items', detail: 'Minimum items', value: '${1:1}' },
        { name: 'max_items', detail: 'Maximum items', value: '${1:100}' },
        { name: 'unique', detail: 'Items must be unique', value: 'true' },
        { name: 'items', detail: 'Constraints for each item' }
      ],
      map: [
        { name: 'min_pairs', detail: 'Minimum key-value pairs', value: '${1:1}' },
        { name: 'max_pairs', detail: 'Maximum key-value pairs', value: '${1:100}' },
        { name: 'keys', detail: 'Constraints for keys' },
        { name: 'values', detail: 'Constraints for values' }
      ],
      any: [
        { name: 'in', detail: 'Type URLs must be one of', value: '["${1:type.googleapis.com/Example}"]' },
        { name: 'not_in', detail: 'Type URLs must not be one of', value: '["${1:type.googleapis.com/Forbidden}"]' }
      ],
      duration: [
        { name: 'const', detail: 'Must equal this duration' },
        { name: 'lt', detail: 'Less than', value: '{ seconds: ${1:60} }' },
        { name: 'lte', detail: 'Less than or equal', value: '{ seconds: ${1:60} }' },
        { name: 'gt', detail: 'Greater than', value: '{ seconds: ${1:0} }' },
        { name: 'gte', detail: 'Greater than or equal', value: '{ seconds: ${1:0} }' },
        { name: 'in', detail: 'Must be one of' },
        { name: 'not_in', detail: 'Must not be one of' }
      ],
      timestamp: [
        { name: 'const', detail: 'Must equal this timestamp' },
        { name: 'lt', detail: 'Less than' },
        { name: 'lte', detail: 'Less than or equal' },
        { name: 'gt', detail: 'Greater than' },
        { name: 'gte', detail: 'Greater than or equal' },
        { name: 'lt_now', detail: 'Must be in the past', value: 'true' },
        { name: 'gt_now', detail: 'Must be in the future', value: 'true' },
        { name: 'within', detail: 'Must be within duration of now', value: '{ seconds: ${1:3600} }' }
      ]
    };

    const options = typeOptions[fieldType] || [];

    return options.map((opt, index) => ({
      label: opt.name,
      kind: CompletionItemKind.Property,
      detail: opt.detail,
      insertText: opt.value ? `${opt.name} = ${opt.value}` : `${opt.name} = `,
      insertTextFormat: opt.value?.includes('$') ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
      sortText: String(index).padStart(2, '0')
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
      'google/protobuf/wrappers.proto',
      // Additional common Google APIs
      'google/rpc/code.proto',
      'google/rpc/status.proto',
      'google/rpc/error_details.proto',
      'google/type/date.proto',
      'google/type/timeofday.proto',
      'google/type/datetime.proto',
      'google/type/latlng.proto',
      'google/type/money.proto',
      'google/type/color.proto',
      'google/type/postal_address.proto',
      'google/type/phone_number.proto',
      'google/type/localized_text.proto',
      'google/type/expr.proto',
      'google/api/http.proto',
      'google/api/annotations.proto',
      'google/api/field_behavior.proto',
      'google/api/resource.proto',
      'google/api/client.proto',
      'google/api/launch_stage.proto',
      'google/api/visibility.proto',
      'google/longrunning/operations.proto',
      'google/logging/type/http_request.proto',
      'google/logging/type/log_severity.proto',
      'google/cloud/audit/audit_log.proto'
    ];

    for (const path of googleTypes) {
      completions.push({
        label: path,
        kind: CompletionItemKind.File,
        detail: 'Google well-known type',
        insertText: path
      });
    }

    // Add files from workspace with smart path suggestions
    for (const [uri] of this.analyzer.getAllFiles()) {
      if (uri !== currentUri) {
        const importPath = this.analyzer.getImportPathForFile(currentUri, uri);
        const fileName = uri.split('/').pop() || uri;

        // Suggest both the smart path and the simple filename
        if (importPath !== fileName) {
          completions.push({
            label: importPath,
            kind: CompletionItemKind.File,
            detail: 'Workspace proto file (recommended path)',
            insertText: importPath,
            sortText: '0' + importPath
          });
        }

        completions.push({
          label: fileName,
          kind: CompletionItemKind.File,
          detail: 'Workspace proto file',
          insertText: fileName,
          sortText: '1' + fileName
        });
      }
    }

    return completions;
  }

  /**
   * Get field name suggestions based on type
   */
  getFieldNameSuggestions(typeName: string): string[] {
    const suggestions: string[] = [];

    // Common patterns based on type
    const typePatterns: Record<string, string[]> = {
      'string': ['name', 'id', 'title', 'description', 'value', 'text', 'content', 'message', 'label'],
      'int32': ['count', 'size', 'number', 'index', 'id', 'value', 'amount', 'quantity'],
      'int64': ['id', 'timestamp', 'count', 'size', 'number', 'value'],
      'bool': ['enabled', 'active', 'visible', 'is_valid', 'has_value', 'is_set'],
      'bytes': ['data', 'content', 'payload', 'body', 'value'],
      'Timestamp': ['created_at', 'updated_at', 'timestamp', 'time', 'date'],
      'google.protobuf.Timestamp': ['created_at', 'updated_at', 'deleted_at', 'timestamp', 'time', 'expire_time', 'start_time', 'end_time'],
      'Duration': ['duration', 'timeout', 'interval', 'period'],
      'google.protobuf.Duration': ['duration', 'timeout', 'interval', 'period', 'ttl', 'delay', 'max_duration'],
      'Date': ['date', 'birth_date', 'created_date', 'updated_date'],
      'FieldMask': ['update_mask', 'field_mask', 'read_mask'],
      'google.protobuf.FieldMask': ['update_mask', 'field_mask', 'read_mask', 'output_mask']
    };

    // Direct match
    if (typePatterns[typeName]) {
      suggestions.push(...typePatterns[typeName]);
    }

    // Check if it's a message type (PascalCase)
    if (/^[A-Z]/.test(typeName)) {
      // Convert PascalCase to snake_case suggestions
      const snakeCase = typeName
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      suggestions.push(snakeCase, `${snakeCase}_id`, `${snakeCase}_value`);
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Check if the cursor is inside a CEL expression (buf.validate option)
   * Returns context info including the parent message name for field lookups
   */
  private getCelContext(
    position: Position,
    documentText: string
  ): { messageName: string; inExpression: boolean } | undefined {
    const lines = documentText.split('\n');
    const currentLine = position.line;

    // Track brace depth to find if we're inside an option block
    let optionBraceDepth = 0;
    let inCelOption = false;
    let messageName: string | undefined;
    let messageStartLine = -1;

    // First, find which message we're in
    let braceDepth = 0;
    for (let i = 0; i <= currentLine; i++) {
      const line = lines[i]!;
      const trimmedLine = line.trim();

      // Track message declarations
      const messageMatch = trimmedLine.match(/^message\s+(\w+)\s*\{/);
      if (messageMatch) {
        if (braceDepth === 0) {
          messageName = messageMatch[1];
          messageStartLine = i;
        }
        braceDepth++;
        continue;
      }

      // Track enum/service declarations (these reset our message context at same level)
      if (/^(enum|service)\s+\w+\s*\{/.test(trimmedLine) && braceDepth === 0) {
        messageName = undefined;
        messageStartLine = -1;
      }

      // Count braces on the line
      for (const char of line) {
        if (char === '{') {
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
          if (braceDepth === 0) {
            // Exited the message
            messageName = undefined;
            messageStartLine = -1;
          }
        }
      }
    }

    if (!messageName) {
      return undefined;
    }

    // Now check if we're inside a CEL option block
    optionBraceDepth = 0;
    inCelOption = false;

    for (let i = messageStartLine; i <= currentLine; i++) {
      const line = lines[i]!;
      const trimmedLine = line.trim();

      // Check for buf.validate CEL option start
      if (trimmedLine.includes('option') &&
          (trimmedLine.includes('buf.validate') || trimmedLine.includes('.cel'))) {
        if (trimmedLine.includes('{')) {
          inCelOption = true;
          optionBraceDepth = 1;
          // Count any additional braces on the same line
          for (let j = line.indexOf('{') + 1; j < line.length; j++) {
            if (line[j] === '{') { optionBraceDepth++; }
            if (line[j] === '}') { optionBraceDepth--; }
          }
          continue;
        }
      }

      if (inCelOption) {
        for (const char of line) {
          if (char === '{') { optionBraceDepth++; }
          if (char === '}') { optionBraceDepth--; }
        }
        if (optionBraceDepth === 0) {
          inCelOption = false;
        }
      }
    }

    if (!inCelOption) {
      return undefined;
    }

    // Check if we're inside an expression string (between quotes)
    const lineUpToCursor = lines[currentLine]!.substring(0, position.character);
    const inExpression = this.isInsideCelExpressionString(lineUpToCursor);

    return { messageName, inExpression };
  }

  /**
   * Check if we're inside a CEL expression string
   */
  private isInsideCelExpressionString(text: string): boolean {
    // Count unescaped quotes to determine if we're inside a string
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
        inString = !inString;
      }
    }
    return inString;
  }

  /**
   * Get CEL-specific completions
   */
  private getCelCompletions(
    uri: string,
    _position: Position,
    beforeCursor: string,
    context: { messageName: string; inExpression: boolean }
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    if (context.inExpression) {
      // Inside a CEL expression string - provide field and function completions

      // Check if user is typing after "this."
      if (beforeCursor.match(/this\.\s*$/)) {
        completions.push(...this.getCelFieldCompletions(uri, context.messageName));
      }
      // Also suggest "this" if they haven't started yet
      else if (beforeCursor.match(/[\s(!"']\s*$/) || beforeCursor.match(/^\s*"$/)) {
        completions.push({
          label: 'this',
          kind: CompletionItemKind.Variable,
          detail: 'Reference to current message',
          documentation: 'Use "this" to access fields of the current message in CEL expressions',
          insertText: 'this.',
          sortText: '0this'
        });
        completions.push(...this.getCelFunctionCompletions());
      }
      // Provide general CEL functions
      else {
        completions.push(...this.getCelFunctionCompletions());
        // Also suggest this. for field access
        if (!beforeCursor.includes('this.')) {
          completions.push({
            label: 'this',
            kind: CompletionItemKind.Variable,
            detail: 'Reference to current message',
            insertText: 'this.',
            sortText: '0this'
          });
        }
      }
    } else {
      // Inside CEL option block but not in an expression string
      // Provide CEL option field completions
      completions.push(...this.getCelOptionFieldCompletions(beforeCursor));
    }

    return completions;
  }

  /**
   * Get field completions for CEL expressions based on the message
   */
  private getCelFieldCompletions(uri: string, messageName: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const protoFile = this.analyzer.getFile(uri);

    if (!protoFile) {
      return completions;
    }

    // Find the message definition
    const findMessage = (
      messages: import('../core/ast').MessageDefinition[],
      name: string
    ): import('../core/ast').MessageDefinition | undefined => {
      for (const msg of messages) {
        if (msg.name === name) {
          return msg;
        }
        const nested = findMessage(msg.nestedMessages, name);
        if (nested) {
          return nested;
        }
      }
      return undefined;
    };

    const message = findMessage(protoFile.messages, messageName);
    if (!message) {
      return completions;
    }

    // Add field completions
    for (const field of message.fields) {
      completions.push({
        label: field.name,
        kind: CompletionItemKind.Field,
        detail: `${field.fieldType}${field.modifier ? ` (${field.modifier})` : ''}`,
        documentation: `Field ${field.name} with type ${field.fieldType}`,
        insertText: field.name,
        sortText: '0' + field.name
      });
    }

    // Add map field completions
    for (const mapField of message.maps) {
      completions.push({
        label: mapField.name,
        kind: CompletionItemKind.Field,
        detail: `map<${mapField.keyType}, ${mapField.valueType}>`,
        documentation: `Map field ${mapField.name}`,
        insertText: mapField.name,
        sortText: '0' + mapField.name
      });
    }

    // Add oneof field completions
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        completions.push({
          label: field.name,
          kind: CompletionItemKind.Field,
          detail: `${field.fieldType} (oneof ${oneof.name})`,
          documentation: `Oneof field ${field.name} in ${oneof.name}`,
          insertText: field.name,
          sortText: '0' + field.name
        });
      }
    }

    return completions;
  }

  /**
   * Get CEL function completions
   */
  private getCelFunctionCompletions(): CompletionItem[] {
    const celFunctions = [
      // Field presence
      { name: 'has', snippet: 'has(this.${1:field})', detail: 'Check if field is set', doc: 'Returns true if the field is set (not default value)' },

      // String functions
      { name: 'size', snippet: 'size(${1:value})', detail: 'Get size/length', doc: 'Returns the size of a string, bytes, list, or map' },
      { name: 'startsWith', snippet: '${1:string}.startsWith(${2:prefix})', detail: 'Check string prefix', doc: 'Returns true if string starts with prefix' },
      { name: 'endsWith', snippet: '${1:string}.endsWith(${2:suffix})', detail: 'Check string suffix', doc: 'Returns true if string ends with suffix' },
      { name: 'contains', snippet: '${1:string}.contains(${2:substring})', detail: 'Check substring', doc: 'Returns true if string contains substring' },
      { name: 'matches', snippet: '${1:string}.matches(${2:regex})', detail: 'Regex match', doc: 'Returns true if string matches the regex pattern' },

      // List functions
      { name: 'all', snippet: '${1:list}.all(${2:x}, ${3:predicate})', detail: 'Check all elements', doc: 'Returns true if predicate is true for all elements' },
      { name: 'exists', snippet: '${1:list}.exists(${2:x}, ${3:predicate})', detail: 'Check any element', doc: 'Returns true if predicate is true for any element' },
      { name: 'exists_one', snippet: '${1:list}.exists_one(${2:x}, ${3:predicate})', detail: 'Check exactly one', doc: 'Returns true if predicate is true for exactly one element' },
      { name: 'filter', snippet: '${1:list}.filter(${2:x}, ${3:predicate})', detail: 'Filter list', doc: 'Returns elements where predicate is true' },
      { name: 'map', snippet: '${1:list}.map(${2:x}, ${3:transform})', detail: 'Map list', doc: 'Transforms each element' },

      // Type conversions and denotations
      { name: 'int', snippet: 'int(${1:value})', detail: 'Convert to int', doc: 'Converts value to integer' },
      { name: 'uint', snippet: 'uint(${1:value})', detail: 'Convert to uint', doc: 'Converts value to unsigned integer' },
      { name: 'double', snippet: 'double(${1:value})', detail: 'Convert to double', doc: 'Converts value to double' },
      { name: 'string', snippet: 'string(${1:value})', detail: 'Convert to string', doc: 'Converts value to string' },
      { name: 'bytes', snippet: 'bytes(${1:value})', detail: 'Convert to bytes', doc: 'Converts value to bytes' },
      { name: 'bool', snippet: 'bool(${1:value})', detail: 'Convert to bool', doc: 'Converts value to boolean' },
      { name: 'type', snippet: 'type(${1:value})', detail: 'Get type', doc: 'Returns the type of the value' },
      { name: 'dyn', snippet: 'dyn(${1:value})', detail: 'Type denotation (dynamic)', doc: 'Disables strong type agreement checks during type-checking' },
      { name: 'list', snippet: 'list(${1:value})', detail: 'Type denotation (list)', doc: 'Type denotation for list type' },
      { name: 'map', snippet: 'map(${1:key}, ${2:value})', detail: 'Type denotation (map)', doc: 'Type denotation for map type' },
      { name: 'null_type', snippet: 'null_type(${1:value})', detail: 'Type denotation (null)', doc: 'Type denotation for null type' },

      // Duration/Timestamp conversions
      { name: 'duration', snippet: 'duration(${1:value})', detail: 'Create duration', doc: 'Creates a duration from a string like "1h30m" or "3600s"' },
      { name: 'timestamp', snippet: 'timestamp(${1:value})', detail: 'Create timestamp', doc: 'Creates a timestamp from a string (RFC3339 format)' },

      // Timestamp getter methods
      { name: 'getDate', snippet: '${1:timestamp}.getDate(${2:timezone?})', detail: 'Get date from timestamp', doc: 'Get the date component of a timestamp (optionally with timezone)' },
      { name: 'getDayOfMonth', snippet: '${1:timestamp}.getDayOfMonth(${2:timezone?})', detail: 'Get day of month', doc: 'Get the day of month (1-31) from a timestamp' },
      { name: 'getDayOfWeek', snippet: '${1:timestamp}.getDayOfWeek(${2:timezone?})', detail: 'Get day of week', doc: 'Get the day of week (0=Sunday, 6=Saturday) from a timestamp' },
      { name: 'getDayOfYear', snippet: '${1:timestamp}.getDayOfYear(${2:timezone?})', detail: 'Get day of year', doc: 'Get the day of year (1-366) from a timestamp' },
      { name: 'getFullYear', snippet: '${1:timestamp}.getFullYear(${2:timezone?})', detail: 'Get full year', doc: 'Get the full year from a timestamp' },
      { name: 'getHours', snippet: '${1:timestamp}.getHours(${2:timezone?})', detail: 'Get hours', doc: 'Get the hours component (0-23) from a timestamp, or convert duration to hours' },
      { name: 'getMilliseconds', snippet: '${1:timestamp}.getMilliseconds(${2:timezone?})', detail: 'Get milliseconds', doc: 'Get the milliseconds component from a timestamp or duration' },
      { name: 'getMinutes', snippet: '${1:timestamp}.getMinutes(${2:timezone?})', detail: 'Get minutes', doc: 'Get the minutes component from a timestamp, or convert duration to minutes' },
      { name: 'getMonth', snippet: '${1:timestamp}.getMonth(${2:timezone?})', detail: 'Get month', doc: 'Get the month (0-11, 0=January) from a timestamp' },
      { name: 'getSeconds', snippet: '${1:timestamp}.getSeconds(${2:timezone?})', detail: 'Get seconds', doc: 'Get the seconds component from a timestamp, or convert duration to seconds' },
    ];

    return celFunctions.map(fn => ({
      label: fn.name,
      kind: CompletionItemKind.Function,
      detail: fn.detail,
      documentation: fn.doc,
      insertText: fn.snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '1' + fn.name
    }));
  }

  /**
   * Get CEL option field completions (id, message, expression, etc.)
   */
  private getCelOptionFieldCompletions(beforeCursor: string): CompletionItem[] {
    // Check if we're at a position where we'd type a field name
    const trimmed = beforeCursor.trim();
    if (trimmed.endsWith('{') || trimmed.endsWith(',') || trimmed.endsWith(';') || trimmed === '') {
      return [
        {
          label: 'id',
          kind: CompletionItemKind.Property,
          detail: 'CEL rule identifier',
          documentation: 'Unique identifier for this validation rule',
          insertText: 'id: "${1:RuleName}"',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '0id'
        },
        {
          label: 'message',
          kind: CompletionItemKind.Property,
          detail: 'Error message',
          documentation: 'Human-readable error message when validation fails',
          insertText: 'message: "${1:Validation failed}"',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '1message'
        },
        {
          label: 'expression',
          kind: CompletionItemKind.Property,
          detail: 'CEL expression',
          documentation: 'CEL expression that evaluates to true for valid data or returns error string',
          insertText: 'expression:\n      "${1:this.field != \\"\\"}"',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '2expression'
        }
      ];
    }

    return [];
  }

  // ============================================================================
  // Google API Completions
  // ============================================================================

  /**
   * Get Google API completions (HTTP annotations, field behaviors, resources)
   */
  private getGoogleApiCompletions(
    _uri: string,
    position: Position,
    beforeCursor: string,
    documentText: string
  ): CompletionItem[] {
    // Check for google.api.http context
    const httpCompletions = this.getGoogleApiHttpCompletions(beforeCursor, documentText, position);
    if (httpCompletions.length > 0) {
      return httpCompletions;
    }

    // Check for google.api.field_behavior context
    const fieldBehaviorCompletions = this.getGoogleApiFieldBehaviorCompletions(beforeCursor);
    if (fieldBehaviorCompletions.length > 0) {
      return fieldBehaviorCompletions;
    }

    // Check for google.api.resource context
    const resourceCompletions = this.getGoogleApiResourceCompletions(beforeCursor, documentText, position);
    if (resourceCompletions.length > 0) {
      return resourceCompletions;
    }

    // Check for google.api.resource_reference context
    const resourceRefCompletions = this.getGoogleApiResourceReferenceCompletions(beforeCursor);
    if (resourceRefCompletions.length > 0) {
      return resourceRefCompletions;
    }

    return [];
  }

  /**
   * Check if inside a google.api.http block
   */
  private isInsideGoogleApiHttpBlock(position: Position, documentText: string): boolean {
    const lines = documentText.split('\n');
    let braceDepth = 0;
    let inHttpOption = false;

    for (let i = 0; i <= position.line; i++) {
      const line = lines[i]!;

      // Check for google.api.http option start
      if (line.includes('google.api.http') && line.includes('=')) {
        const httpIndex = line.indexOf('google.api.http');
        const braceIndex = line.indexOf('{', httpIndex);
        if (braceIndex !== -1) {
          inHttpOption = true;
          braceDepth = 1;
          // Count any additional braces on the same line after the opening brace
          for (let j = braceIndex + 1; j < line.length; j++) {
            if (line[j] === '{') { braceDepth++; }
            if (line[j] === '}') { braceDepth--; }
          }
          continue;
        }
      }

      if (inHttpOption) {
        for (const char of line) {
          if (char === '{') { braceDepth++; }
          if (char === '}') { braceDepth--; }
        }
        if (braceDepth <= 0) {
          inHttpOption = false;
        }
      }
    }

    return inHttpOption && braceDepth > 0;
  }

  /**
   * Get google.api.http completions
   */
  private getGoogleApiHttpCompletions(
    beforeCursor: string,
    documentText: string,
    position: Position
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check if we're typing the option name
    if (beforeCursor.match(/option\s*\(google\.api\.$/)) {
      return [{
        label: 'http',
        kind: CompletionItemKind.Property,
        detail: 'Google API HTTP annotation',
        documentation: 'Maps RPC methods to HTTP REST endpoints',
        insertText: 'http) = {\n  ${1|get,post,put,delete,patch|}: "/${2:v1}/${3:resource}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0http'
      }];
    }

    // Check if inside google.api.http block
    if (this.isInsideGoogleApiHttpBlock(position, documentText)) {
      const trimmed = beforeCursor.trim();

      // At the start of a line or after opening brace - suggest HTTP methods
      if (trimmed === '' || trimmed.endsWith('{') || trimmed.endsWith(';')) {
        completions.push(
          {
            label: 'get',
            kind: CompletionItemKind.Property,
            detail: 'HTTP GET method',
            documentation: 'Maps to HTTP GET request. Used for reading resources.',
            insertText: 'get: "/${1:v1}/${2:resources}/{${3:id}}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '0get'
          },
          {
            label: 'post',
            kind: CompletionItemKind.Property,
            detail: 'HTTP POST method',
            documentation: 'Maps to HTTP POST request. Used for creating resources.',
            insertText: 'post: "/${1:v1}/${2:resources}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '1post'
          },
          {
            label: 'put',
            kind: CompletionItemKind.Property,
            detail: 'HTTP PUT method',
            documentation: 'Maps to HTTP PUT request. Used for full resource updates.',
            insertText: 'put: "/${1:v1}/${2:resources}/{${3:id}}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '2put'
          },
          {
            label: 'delete',
            kind: CompletionItemKind.Property,
            detail: 'HTTP DELETE method',
            documentation: 'Maps to HTTP DELETE request. Used for deleting resources.',
            insertText: 'delete: "/${1:v1}/${2:resources}/{${3:id}}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '3delete'
          },
          {
            label: 'patch',
            kind: CompletionItemKind.Property,
            detail: 'HTTP PATCH method',
            documentation: 'Maps to HTTP PATCH request. Used for partial resource updates.',
            insertText: 'patch: "/${1:v1}/${2:resources}/{${3:id}}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '4patch'
          },
          {
            label: 'custom',
            kind: CompletionItemKind.Property,
            detail: 'Custom HTTP method',
            documentation: 'Custom HTTP method (e.g., for non-standard verbs)',
            insertText: 'custom: {\n  kind: "${1:CUSTOM_METHOD}"\n  path: "/${2:v1}/${3:resources}:${4:action}"\n}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '5custom'
          },
          {
            label: 'body',
            kind: CompletionItemKind.Property,
            detail: 'Request body mapping',
            documentation: 'Specifies which request field maps to the HTTP body. Use "*" for entire request.',
            insertText: 'body: "${1:*}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '6body'
          },
          {
            label: 'response_body',
            kind: CompletionItemKind.Property,
            detail: 'Response body mapping',
            documentation: 'Specifies which response field maps to the HTTP response body.',
            insertText: 'response_body: "${1:field_name}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '7response_body'
          },
          {
            label: 'additional_bindings',
            kind: CompletionItemKind.Property,
            detail: 'Additional HTTP bindings',
            documentation: 'Define additional HTTP mappings for the same RPC method.',
            insertText: 'additional_bindings {\n  ${1|get,post,put,delete,patch|}: "/${2:v1}/${3:alternate_path}"\n}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '8additional_bindings'
          }
        );
      }

      // After a method keyword and colon - suggest path patterns
      if (beforeCursor.match(/(?:get|post|put|delete|patch)\s*:\s*"$/)) {
        completions.push(
          {
            label: '/v1/{resource}',
            kind: CompletionItemKind.Value,
            detail: 'Simple resource path',
            insertText: '/v1/${1:resources}/{${2:id}}',
            insertTextFormat: InsertTextFormat.Snippet
          },
          {
            label: '/v1/{parent}/children',
            kind: CompletionItemKind.Value,
            detail: 'Nested resource path',
            insertText: '/v1/${1:parents}/{${2:parent_id}}/${3:children}',
            insertTextFormat: InsertTextFormat.Snippet
          },
          {
            label: '/v1/{resource}:action',
            kind: CompletionItemKind.Value,
            detail: 'Custom action path',
            insertText: '/v1/${1:resources}/{${2:id}}:${3:action}',
            insertTextFormat: InsertTextFormat.Snippet
          }
        );
      }
    }

    return completions;
  }

  /**
   * Get google.api.field_behavior completions
   */
  private getGoogleApiFieldBehaviorCompletions(beforeCursor: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check if typing (google.api.field_behavior)
    if (beforeCursor.match(/\[\s*\(google\.api\.field_behavior\)\s*=\s*$/)) {
      const behaviors = [
        { name: 'REQUIRED', doc: 'Field must be set by the client before the request is processed' },
        { name: 'OUTPUT_ONLY', doc: 'Field is set by the server and should not be specified by the client' },
        { name: 'INPUT_ONLY', doc: 'Field is set by the client but not returned by the server' },
        { name: 'IMMUTABLE', doc: 'Field can only be set once and cannot be updated afterward' },
        { name: 'OPTIONAL', doc: 'Field is explicitly optional (for documentation purposes)' },
        { name: 'NON_EMPTY_DEFAULT', doc: 'Field has a non-empty default value' },
        { name: 'IDENTIFIER', doc: 'Field uniquely identifies a resource' },
        { name: 'UNORDERED_LIST', doc: 'Repeated field values are unordered' }
      ];

      for (const behavior of behaviors) {
        completions.push({
          label: behavior.name,
          kind: CompletionItemKind.EnumMember,
          detail: 'Field behavior',
          documentation: behavior.doc,
          insertText: behavior.name,
          sortText: '0' + behavior.name
        });
      }
    }

    // Check if typing the option name
    if (beforeCursor.match(/\[\s*\(google\.api\.$/)) {
      completions.push({
        label: 'field_behavior',
        kind: CompletionItemKind.Property,
        detail: 'Field behavior annotation',
        documentation: 'Specifies the behavior of a field (REQUIRED, OUTPUT_ONLY, etc.)',
        insertText: 'field_behavior) = ${1|REQUIRED,OUTPUT_ONLY,INPUT_ONLY,IMMUTABLE,OPTIONAL|}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0field_behavior'
      });
    }

    return completions;
  }

  /**
   * Check if inside a google.api.resource block
   */
  private isInsideGoogleApiResourceBlock(position: Position, documentText: string): boolean {
    const lines = documentText.split('\n');
    let braceDepth = 0;
    let inResourceOption = false;

    for (let i = 0; i <= position.line; i++) {
      const line = lines[i]!;

      // Check for google.api.resource option start
      if (line.includes('google.api.resource') && line.includes('=') && !line.includes('resource_reference')) {
        const resourceIndex = line.indexOf('google.api.resource');
        const braceIndex = line.indexOf('{', resourceIndex);
        if (braceIndex !== -1) {
          inResourceOption = true;
          braceDepth = 1;
          for (let j = braceIndex + 1; j < line.length; j++) {
            if (line[j] === '{') { braceDepth++; }
            if (line[j] === '}') { braceDepth--; }
          }
          continue;
        }
      }

      if (inResourceOption) {
        for (const char of line) {
          if (char === '{') { braceDepth++; }
          if (char === '}') { braceDepth--; }
        }
        if (braceDepth <= 0) {
          inResourceOption = false;
        }
      }
    }

    return inResourceOption && braceDepth > 0;
  }

  /**
   * Get google.api.resource completions
   */
  private getGoogleApiResourceCompletions(
    beforeCursor: string,
    documentText: string,
    position: Position
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check if typing the option name
    if (beforeCursor.match(/option\s*\(google\.api\.$/)) {
      completions.push({
        label: 'resource',
        kind: CompletionItemKind.Property,
        detail: 'Resource descriptor',
        documentation: 'Defines this message as an API resource with type and pattern',
        insertText: 'resource) = {\n  type: "${1:example.googleapis.com}/${2:Resource}"\n  pattern: "${3:resources}/{${4:resource}}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '0resource'
      });
    }

    // Check if inside google.api.resource block
    if (this.isInsideGoogleApiResourceBlock(position, documentText)) {
      const trimmed = beforeCursor.trim();

      if (trimmed === '' || trimmed.endsWith('{') || trimmed.endsWith(';')) {
        completions.push(
          {
            label: 'type',
            kind: CompletionItemKind.Property,
            detail: 'Resource type name',
            documentation: 'The resource type name in the format {service}/{resource}',
            insertText: 'type: "${1:example.googleapis.com}/${2:Resource}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '0type'
          },
          {
            label: 'pattern',
            kind: CompletionItemKind.Property,
            detail: 'Resource name pattern',
            documentation: 'Pattern for the resource name (e.g., "projects/{project}/locations/{location}/resources/{resource}")',
            insertText: 'pattern: "${1:resources}/{${2:resource}}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '1pattern'
          },
          {
            label: 'name_field',
            kind: CompletionItemKind.Property,
            detail: 'Name field',
            documentation: 'The field that contains the resource name (defaults to "name")',
            insertText: 'name_field: "${1:name}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '2name_field'
          },
          {
            label: 'plural',
            kind: CompletionItemKind.Property,
            detail: 'Plural name',
            documentation: 'Plural name of the resource (e.g., "users")',
            insertText: 'plural: "${1:resources}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '3plural'
          },
          {
            label: 'singular',
            kind: CompletionItemKind.Property,
            detail: 'Singular name',
            documentation: 'Singular name of the resource (e.g., "user")',
            insertText: 'singular: "${1:resource}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '4singular'
          },
          {
            label: 'history',
            kind: CompletionItemKind.Property,
            detail: 'Resource history',
            documentation: 'The historical or future-versioning behavior of the resource pattern',
            insertText: 'history: ${1|ORIGINALLY_SINGLE_PATTERN,FUTURE_MULTI_PATTERN|}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '5history'
          },
          {
            label: 'style',
            kind: CompletionItemKind.Property,
            detail: 'Resource style',
            documentation: 'Style of resource (DECLARATIVE_FRIENDLY for terraform-style resources)',
            insertText: 'style: ${1|DECLARATIVE_FRIENDLY|}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '6style'
          }
        );
      }
    }

    return completions;
  }

  /**
   * Get google.api.resource_reference completions
   */
  private getGoogleApiResourceReferenceCompletions(beforeCursor: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Check if typing (google.api.resource_reference)
    if (beforeCursor.match(/\[\s*\(google\.api\.resource_reference\)\s*=\s*\{?\s*$/)) {
      completions.push(
        {
          label: 'type',
          kind: CompletionItemKind.Property,
          detail: 'Resource type reference',
          documentation: 'Reference to a specific resource type (e.g., "example.googleapis.com/Resource")',
          insertText: 'type: "${1:example.googleapis.com/Resource}"',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '0type'
        },
        {
          label: 'child_type',
          kind: CompletionItemKind.Property,
          detail: 'Child resource type',
          documentation: 'Reference to the resource type that is the child in a parent-child relationship',
          insertText: 'child_type: "${1:example.googleapis.com/ChildResource}"',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '1child_type'
        }
      );
    }

    // Check if typing the option name on a field
    if (beforeCursor.match(/\[\s*\(google\.api\.$/)) {
      completions.push({
        label: 'resource_reference',
        kind: CompletionItemKind.Property,
        detail: 'Resource reference',
        documentation: 'Indicates this field references another resource',
        insertText: 'resource_reference) = {\n  type: "${1:example.googleapis.com/Resource}"\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '1resource_reference'
      });
    }

    return completions;
  }
}
