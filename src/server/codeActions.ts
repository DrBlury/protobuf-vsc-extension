/**
 * Code Actions Provider for Protocol Buffers
 * Provides quick fixes and refactoring actions
 */

import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  Range,
  TextEdit,
  Position
} from 'vscode-languageserver/node';
import { ProtoFile } from './ast';
import { SemanticAnalyzer } from './analyzer';

export interface CodeActionContext {
  diagnostics: Diagnostic[];
  only?: CodeActionKind[];
}

export class CodeActionsProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getCodeActions(
    uri: string,
    range: Range,
    context: CodeActionContext,
    documentText: string
  ): CodeAction[] {
    const actions: CodeAction[] = [];

    // Generate quick fixes for diagnostics
    for (const diagnostic of context.diagnostics) {
      const fixes = this.getQuickFixes(uri, diagnostic, documentText);
      actions.push(...fixes);
    }

    // Add refactoring actions based on selection
    const refactorings = this.getRefactoringActions(uri, range, documentText);
    actions.push(...refactorings);

    return actions;
  }

  private getQuickFixes(uri: string, diagnostic: Diagnostic, documentText: string): CodeAction[] {
    const fixes: CodeAction[] = [];
    const message = diagnostic.message.toLowerCase();

    // Fix naming conventions
    if (message.includes('should be pascalcase')) {
      const word = this.getWordAtRange(documentText, diagnostic.range);
      if (word) {
        const pascalCase = this.toPascalCase(word);
        fixes.push(this.createQuickFix(
          `Convert to PascalCase: ${pascalCase}`,
          uri,
          diagnostic.range,
          pascalCase,
          diagnostic
        ));
      }
    }

    if (message.includes('should be snake_case')) {
      const word = this.getWordAtRange(documentText, diagnostic.range);
      if (word) {
        const snakeCase = this.toSnakeCase(word);
        fixes.push(this.createQuickFix(
          `Convert to snake_case: ${snakeCase}`,
          uri,
          diagnostic.range,
          snakeCase,
          diagnostic
        ));
      }
    }

    if (message.includes('should be screaming_snake_case')) {
      const word = this.getWordAtRange(documentText, diagnostic.range);
      if (word) {
        const screamingSnakeCase = this.toScreamingSnakeCase(word);
        fixes.push(this.createQuickFix(
          `Convert to SCREAMING_SNAKE_CASE: ${screamingSnakeCase}`,
          uri,
          diagnostic.range,
          screamingSnakeCase,
          diagnostic
        ));
      }
    }

    // Fix unknown type - suggest import
    if (message.includes('unknown type')) {
      const typeMatch = message.match(/unknown type '([^']+)'/);
      if (typeMatch) {
        const typeName = typeMatch[1];
        const importActions = this.suggestImportsForType(uri, typeName, documentText);
        fixes.push(...importActions);
      }
    }

    // Fix first enum value should be 0
    if (message.includes('first enum value should be 0')) {
      fixes.push(this.createQuickFix(
        'Add UNKNOWN = 0 as first enum value',
        uri,
        diagnostic.range,
        '', // Will be handled specially
        diagnostic,
        this.getAddEnumZeroValueEdit(documentText, diagnostic.range)
      ));
    }

    // Fix required is deprecated
    if (message.includes("'required' is deprecated")) {
      const lines = documentText.split('\n');
      const line = lines[diagnostic.range.start.line];
      const newLine = line.replace(/\brequired\b/, 'optional');

      fixes.push(this.createQuickFix(
        "Replace 'required' with 'optional'",
        uri,
        {
          start: { line: diagnostic.range.start.line, character: 0 },
          end: { line: diagnostic.range.start.line, character: line.length }
        },
        newLine,
        diagnostic
      ));

      // Also offer to remove the modifier entirely (proto3 style)
      const noModifierLine = line.replace(/\brequired\s+/, '');
      fixes.push(this.createQuickFix(
        "Remove 'required' modifier (proto3 style)",
        uri,
        {
          start: { line: diagnostic.range.start.line, character: 0 },
          end: { line: diagnostic.range.start.line, character: line.length }
        },
        noModifierLine,
        diagnostic
      ));
    }

    // Fix duplicate field number
    if (message.includes('duplicate field number')) {
      const file = this.analyzer.getFile(uri);
      if (file) {
        const nextNumber = this.findNextAvailableFieldNumber(file, documentText, diagnostic.range);

        // Find the field number in the line and suggest changing it
        const lines = documentText.split('\n');
        const line = lines[diagnostic.range.start.line];
        const numberMatch = line.match(/=\s*(\d+)/);

        if (numberMatch) {
          const newLine = line.replace(/=\s*\d+/, `= ${nextNumber}`);
          fixes.push(this.createQuickFix(
            `Change field number to ${nextNumber}`,
            uri,
            {
              start: { line: diagnostic.range.start.line, character: 0 },
              end: { line: diagnostic.range.start.line, character: line.length }
            },
            newLine,
            diagnostic
          ));
        }
      }
    }

    // Fix reserved field number usage
    if (message.includes('field number') && message.includes('is reserved')) {
      const file = this.analyzer.getFile(uri);
      if (file) {
        const nextNumber = this.findNextAvailableFieldNumber(file, documentText, diagnostic.range);

        const lines = documentText.split('\n');
        const line = lines[diagnostic.range.start.line];

        if (line) {
          const newLine = line.replace(/=\s*\d+/, `= ${nextNumber}`);
          fixes.push(this.createQuickFix(
            `Change field number to ${nextNumber}`,
            uri,
            {
              start: { line: diagnostic.range.start.line, character: 0 },
              end: { line: diagnostic.range.start.line, character: line.length }
            },
            newLine,
            diagnostic
          ));
        }
      }
    }

    return fixes;
  }

  private getRefactoringActions(uri: string, range: Range, documentText: string): CodeAction[] {
    const actions: CodeAction[] = [];
    const lines = documentText.split('\n');
    const line = lines[range.start.line];

    if (!line) {
      return actions;
    }

    // Extract message refactoring
    const messageMatch = line.match(/^\s*(message)\s+(\w+)/);
    if (messageMatch) {
      actions.push({
        title: 'Extract nested types to top level',
        kind: CodeActionKind.RefactorExtract,
        disabled: { reason: 'Not yet implemented' }
      });
    }

    // Add field option
    const fieldMatch = line.match(/^\s*(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/);
    if (fieldMatch) {
      actions.push({
        title: 'Add deprecated option',
        kind: CodeActionKind.RefactorRewrite,
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: range.start.line, character: line.indexOf(';') },
                end: { line: range.start.line, character: line.indexOf(';') + 1 }
              },
              newText: ' [deprecated = true];'
            }]
          }
        }
      });

      actions.push({
        title: 'Add json_name option',
        kind: CodeActionKind.RefactorRewrite,
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: range.start.line, character: line.indexOf(';') },
                end: { line: range.start.line, character: line.indexOf(';') + 1 }
              },
              newText: ` [json_name = "${this.toCamelCase(fieldMatch[2])}"];`
            }]
          }
        }
      });
    }

    // Sort fields by number
    if (this.isInsideMessage(documentText, range.start.line)) {
      actions.push({
        title: 'Sort fields by number',
        kind: CodeActionKind.SourceOrganizeImports,
        disabled: { reason: 'Use the Format Document command instead' }
      });
    }

    return actions;
  }

  private suggestImportsForType(uri: string, typeName: string, documentText: string): CodeAction[] {
    const actions: CodeAction[] = [];
    const allSymbols = this.analyzer.getAllSymbols();

    // Find symbols that match the type name
    const matchingSymbols = allSymbols.filter(s =>
      s.name === typeName || s.fullName.endsWith(`.${typeName}`)
    );

    // Find the import insertion point
    const insertPosition = this.findImportInsertPosition(documentText);

    for (const symbol of matchingSymbols) {
      // Get the file path for import
      const symbolUri = symbol.location.uri;
      if (symbolUri === uri) {
        continue; // Don't suggest importing from same file
      }

      const fileName = symbolUri.split('/').pop() || symbolUri;

      actions.push({
        title: `Add import "${fileName}"`,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: insertPosition,
                end: insertPosition
              },
              newText: `import "${fileName}";\n`
            }]
          }
        }
      });
    }

    // Also suggest Google well-known types if applicable
    const googleTypes: { [key: string]: string } = {
      'Any': 'google/protobuf/any.proto',
      'Duration': 'google/protobuf/duration.proto',
      'Empty': 'google/protobuf/empty.proto',
      'FieldMask': 'google/protobuf/field_mask.proto',
      'Struct': 'google/protobuf/struct.proto',
      'Timestamp': 'google/protobuf/timestamp.proto',
      'Value': 'google/protobuf/struct.proto',
      'ListValue': 'google/protobuf/struct.proto',
      'BoolValue': 'google/protobuf/wrappers.proto',
      'BytesValue': 'google/protobuf/wrappers.proto',
      'DoubleValue': 'google/protobuf/wrappers.proto',
      'FloatValue': 'google/protobuf/wrappers.proto',
      'Int32Value': 'google/protobuf/wrappers.proto',
      'Int64Value': 'google/protobuf/wrappers.proto',
      'StringValue': 'google/protobuf/wrappers.proto',
      'UInt32Value': 'google/protobuf/wrappers.proto',
      'UInt64Value': 'google/protobuf/wrappers.proto'
    };

    // Check both with and without google.protobuf prefix
    const simpleTypeName = typeName.replace(/^google\.protobuf\./, '');

    if (googleTypes[simpleTypeName]) {
      const importPath = googleTypes[simpleTypeName];

      // Check if already imported
      if (!documentText.includes(`"${importPath}"`)) {
        actions.push({
          title: `Add import "${importPath}"`,
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [{
                range: {
                  start: insertPosition,
                  end: insertPosition
                },
                newText: `import "${importPath}";\n`
              }]
            }
          }
        });
      }
    }

    return actions;
  }

  private findImportInsertPosition(documentText: string): Position {
    const lines = documentText.split('\n');
    let lastImportLine = -1;
    let syntaxLine = -1;
    let packageLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('syntax')) {
        syntaxLine = i;
      } else if (trimmed.startsWith('package')) {
        packageLine = i;
      } else if (trimmed.startsWith('import')) {
        lastImportLine = i;
      } else if (trimmed.startsWith('message') || trimmed.startsWith('enum') ||
                 trimmed.startsWith('service') || trimmed.startsWith('option')) {
        break;
      }
    }

    // Insert after last import, or after package, or after syntax
    let insertLine = 0;
    if (lastImportLine >= 0) {
      insertLine = lastImportLine + 1;
    } else if (packageLine >= 0) {
      insertLine = packageLine + 1;
    } else if (syntaxLine >= 0) {
      insertLine = syntaxLine + 1;
    }

    return { line: insertLine, character: 0 };
  }

  private createQuickFix(
    title: string,
    uri: string,
    range: Range,
    newText: string,
    diagnostic: Diagnostic,
    customEdit?: TextEdit[]
  ): CodeAction {
    return {
      title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [uri]: customEdit || [{
            range,
            newText
          }]
        }
      }
    };
  }

  private getAddEnumZeroValueEdit(documentText: string, range: Range): TextEdit[] {
    // Find the opening brace of the enum
    const lines = documentText.split('\n');
    let braceLineIndex = -1;

    for (let i = range.start.line; i >= 0; i--) {
      if (lines[i].includes('{')) {
        braceLineIndex = i;
        break;
      }
    }

    if (braceLineIndex < 0) {
      return [];
    }

    // Get the enum name for generating the UNKNOWN value name
    const enumMatch = lines[braceLineIndex].match(/enum\s+(\w+)/);
    const enumName = enumMatch ? enumMatch[1] : 'ENUM';
    const unknownName = `${enumName.toUpperCase()}_UNKNOWN`;

    // Insert after the opening brace
    const braceIndex = lines[braceLineIndex].indexOf('{');
    const indent = '  '; // Default 2-space indent

    return [{
      range: {
        start: { line: braceLineIndex, character: braceIndex + 1 },
        end: { line: braceLineIndex, character: braceIndex + 1 }
      },
      newText: `\n${indent}${unknownName} = 0;`
    }];
  }

  private findNextAvailableFieldNumber(_file: ProtoFile, documentText: string, range: Range): number {
    const lines = documentText.split('\n');
    const usedNumbers = new Set<number>();

    // Find the containing message
    let braceCount = 0;
    let messageStartLine = -1;

    for (let i = range.start.line; i >= 0; i--) {
      const line = lines[i];
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === '}') {
          braceCount++;
        }
        if (line[j] === '{') {
          braceCount--;
          if (braceCount < 0) {
            messageStartLine = i;
            break;
          }
        }
      }
      if (messageStartLine >= 0) {
        break;
      }
    }

    // Collect used field numbers in the message
    braceCount = 1;
    for (let i = messageStartLine + 1; i < lines.length && braceCount > 0; i++) {
      const line = lines[i];

      // Track nesting
      for (const char of line) {
        if (char === '{') {
          braceCount++;
        }
        if (char === '}') {
          braceCount--;
        }
      }

      // Only look at direct children (braceCount === 1)
      if (braceCount === 1) {
        const numberMatch = line.match(/=\s*(\d+)\s*[;[]/);
        if (numberMatch) {
          usedNumbers.add(parseInt(numberMatch[1], 10));
        }
      }
    }

    // Find next available number
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
      // Skip reserved range
      if (nextNumber >= 19000 && nextNumber <= 19999) {
        nextNumber = 20000;
      }
    }

    return nextNumber;
  }

  private getWordAtRange(documentText: string, range: Range): string | null {
    const lines = documentText.split('\n');
    const line = lines[range.start.line];
    if (!line) {
      return null;
    }

    return line.substring(range.start.character, range.end.character);
  }

  private isInsideMessage(documentText: string, lineNumber: number): boolean {
    const lines = documentText.split('\n');
    let braceCount = 0;

    for (let i = 0; i < lineNumber; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
        }
        if (char === '}') {
          braceCount--;
        }
      }
    }

    return braceCount > 0;
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[_-](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  private toScreamingSnakeCase(str: string): string {
    return this.toSnakeCase(str).toUpperCase();
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[_-](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  }
}
