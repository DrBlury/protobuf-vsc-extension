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
import { ProtoFile } from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';
import { RenumberProvider } from './renumber';
import { FIELD_NUMBER } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Split text into lines, handling both CRLF (\r\n) and LF (\n) line endings.
 */
function splitLines(text: string): string[] {
  return text.split('\n').map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

export interface CodeActionContext {
  diagnostics: Diagnostic[];
  only?: CodeActionKind[];
}

export interface CodeActionsSettings {
  renumberOnFormat?: boolean;
  formatterEnabled?: boolean;
}

const DEFAULT_SETTINGS: CodeActionsSettings = {
  renumberOnFormat: false,
  formatterEnabled: true
};

export class CodeActionsProvider {
  private analyzer: SemanticAnalyzer;
  private renumberProvider: RenumberProvider;
  private settings: CodeActionsSettings = DEFAULT_SETTINGS;

  constructor(analyzer: SemanticAnalyzer, renumberProvider: RenumberProvider) {
    this.analyzer = analyzer;
    this.renumberProvider = renumberProvider;
  }

  updateSettings(settings: Partial<CodeActionsSettings>): void {
    this.settings = { ...this.settings, ...settings };
    logger.info(`CodeActionsProvider settings updated: renumberOnFormat=${this.settings.renumberOnFormat}`);
  }

  getCodeActions(
    uri: string,
    range: Range,
    context: CodeActionContext,
    documentText: string
  ): CodeAction[] {
    const actions: CodeAction[] = [];

    const requestedKinds = context.only;

    // Generate quick fixes for diagnostics
    for (const diagnostic of context.diagnostics) {
      const fixes = this.getQuickFixes(uri, diagnostic, documentText);
      actions.push(...fixes);
    }

    // Source-organize imports: add missing imports in one go so users can hook this to codeActionsOnSave
    if (!requestedKinds || requestedKinds.some(k => k === CodeActionKind.SourceOrganizeImports || k.startsWith(CodeActionKind.SourceOrganizeImports))) {
      const missingImports = this.extractMissingImportPaths(context.diagnostics, documentText);
      if (missingImports.length > 0) {
          actions.push(this.createAddMissingImportsAction(uri, missingImports, documentText));
      }
      const fixImports = this.createFixImportsAction(uri, context.diagnostics, documentText);
      if (fixImports) {
          actions.push(fixImports);
      }
      // Add organize imports action (sort and remove duplicates)
      const organizeImports = this.createOrganizeImportsAction(uri, documentText);
      if (organizeImports) {
          actions.push(organizeImports);
      }
    }

    // Source.fixAll: Fix all editions-related issues (optional/required modifiers)
    if (!requestedKinds || requestedKinds.some(k => k === CodeActionKind.SourceFixAll || k.startsWith(CodeActionKind.SourceFixAll))) {
      const editionsFixAction = this.createFixEditionsModifiersAction(uri, documentText);
      if (editionsFixAction) {
        actions.push(editionsFixAction);
      }
    }

    // Add refactoring actions based on selection
    const refactorings = this.getRefactoringActions(uri, range, documentText);
    actions.push(...refactorings);

    // Source action to renumber/complete missing field tags across the document
    if (!requestedKinds || requestedKinds.some(k => k === CodeActionKind.Source || k.startsWith(CodeActionKind.Source))) {
      if (this.settings.renumberOnFormat) {
        const renumberAction = this.createRenumberDocumentAction(uri, documentText);
        if (renumberAction) {
          actions.push(renumberAction);
        }

        const messageName = this.findEnclosingMessageName(range, documentText);
        if (messageName) {
          const addNumbers = this.createNumberFieldsInMessageAction(uri, documentText, range, messageName);
          if (addNumbers) {
            actions.push(addNumbers);
          }
        }
      } else {
        logger.info('Skipping renumber source actions because renumberOnFormat=false');
      }

      // Only provide semicolon fix when formatter is enabled
      if (this.settings.formatterEnabled) {
        const semicolonAction = this.createAddMissingSemicolonsAction(uri, documentText);
        if (semicolonAction) {
          actions.push(semicolonAction);
        }
      } else {
        logger.info('Skipping semicolon source action because formatterEnabled=false');
      }
    }

    // Quick-fix: renumber only the current enum if applicable
    // Check enum first - if inside an enum, don't show message renumber action
    const enumName = this.findEnclosingEnumName(range, documentText);
    if (enumName) {
      const enumRenumber = this.createRenumberEnumAction(uri, documentText, enumName);
      if (enumRenumber) {
        actions.push(enumRenumber);
      }
    } else {
      // Quick-fix: renumber only the current message if applicable
      // Only add this if there's no diagnostic-triggered renumber action already added
      const messageName = this.findEnclosingMessageName(range, documentText);
      const hasRenumberDiagnostic = context.diagnostics.some(d => {
        const msg = d.message.toLowerCase();
        return msg.includes('not strictly increasing') ||
               msg.includes('gap in field numbers') ||
               (msg.includes('duplicate field number') && msg.includes('oneof'));
      });
      if (messageName && !hasRenumberDiagnostic) {
        const messageRenumber = this.createRenumberMessageAction(uri, documentText, messageName);
        if (messageRenumber) {
          actions.push(messageRenumber);
        }
      }
    }

    // Generate scaffolding actions based on selection
    const scaffolding = this.getScaffoldingActions(uri, range, documentText);
    actions.push(...scaffolding);

    return actions;
  }

  private getScaffoldingActions(_uri: string, range: Range, documentText: string): CodeAction[] {
    const actions: CodeAction[] = [];
    const lines = splitLines(documentText);
    const line = lines[range.start.line];

    if (!line) {
      return actions;
    }

    // Oneof Switch Scaffolding
    const oneofMatch = line.match(/^\s*oneof\s+(\w+)\s*\{/);
    if (oneofMatch?.[1]) {
        const oneofName = oneofMatch[1];

        // Find fields inside the oneof
        const fields: string[] = [];
        let braceDepth = 1;
        for (let i = range.start.line + 1; i < lines.length; i++) {
            const l = lines[i]!.trim();
            if (l.includes('{')) {
                braceDepth++;
            }
            if (l.includes('}')) {
                braceDepth--;
            }
            if (braceDepth === 0) {
                break;
            }

            // Very simple field match
            const fieldMatch = l.match(/^(?:[\w.]+\s+)?(\w+)\s*=\s*\d+/);
            if (fieldMatch && fieldMatch[1] && !l.startsWith('//') && !l.startsWith('option')) {
                fields.push(fieldMatch[1]);
            }
        }

        if (fields.length > 0) {
            // TypeScript Snippet
            const tsSnippet = `switch (message.${oneofName ?? ''}.case) {\n` +
                fields.map(f => `  case '${f}':\n    // Handle ${f}\n    break;`).join('\n') +
                `\n  default:\n    // Handle default\n}`;

            // Go Snippet
            const goSnippet = `switch v := message.Get${this.toPascalCase(oneofName ?? '')}().(type) {\n` +
                fields.map(f => `case *${this.toPascalCase(f)}:\n\t// Handle ${f}`).join('\n') +
                `\ndefault:\n\t// Handle default\n}`;

            actions.push({
                title: 'Copy TypeScript Switch Snippet',
                kind: CodeActionKind.Refactor,
                command: {
                    title: 'Copy to Clipboard',
                    command: 'protobuf.copyToClipboard',
                    arguments: [tsSnippet]
                }
            });

             actions.push({
                title: 'Copy Go Switch Snippet',
                kind: CodeActionKind.Refactor,
                command: {
                    title: 'Copy to Clipboard',
                    command: 'protobuf.copyToClipboard',
                    arguments: [goSnippet]
                }
            });
        }
    }

    return actions;
  }

  private createRenumberDocumentAction(uri: string, documentText: string): CodeAction | null {
    const edits = this.renumberProvider.renumberDocument(documentText, uri);
    if (edits.length === 0) {
      return null;
    }

    return {
      title: 'Assign/normalize field numbers',
      kind: CodeActionKind.SourceFixAll,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  private createRenumberMessageAction(
    uri: string,
    documentText: string,
    messageName: string
  ): CodeAction | null {
    const edits = this.renumberProvider.renumberMessage(documentText, uri, messageName);
    if (edits.length === 0) {
      return null;
    }

    return {
      title: `Renumber fields in message ${messageName}`,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  private createRenumberEnumAction(
    uri: string,
    documentText: string,
    enumName: string
  ): CodeAction | null {
    const edits = this.renumberProvider.renumberEnum(documentText, uri, enumName);
    if (edits.length === 0) {
      return null;
    }

    return {
      title: `Renumber values in enum ${enumName}`,
      kind: CodeActionKind.QuickFix,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  private createAddMissingSemicolonsAction(uri: string, documentText: string): CodeAction | null {
    const lines = splitLines(documentText);
    const edits: TextEdit[] = [];

    const fieldLike = /^(?:optional|required|repeated)?\s*([A-Za-z_][\w<>.,]*)\s+([A-Za-z_][\w]*)(?:\s*=\s*\d+)?/;
    const mapLike = /^\s*map\s*<[^>]+>\s+[A-Za-z_][\w]*(?:\s*=\s*\d+)?/;

    // Track multi-line inline options (braces/brackets inside field options [...])
    let inlineOptionDepth = 0;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        inBlockComment = true;
        continue;
      }

      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }

      // Skip lines if we're inside a multi-line inline option from a previous line
      if (inlineOptionDepth > 0) {
        // Count brackets and braces to track when we exit the multi-line option
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBraces = (lineWithoutComments.match(/\{/g) || []).length;
        const closeBraces = (lineWithoutComments.match(/\}/g) || []).length;
        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        inlineOptionDepth += (openBraces - closeBraces) + (openBrackets - closeBrackets);
        continue;
      }

      if (/^(message|enum|service|oneof)\b/.test(trimmed) || trimmed.startsWith('option') ||
          trimmed.startsWith('import') || trimmed.startsWith('syntax') || trimmed.startsWith('edition') ||
          trimmed.startsWith('reserved') || trimmed.startsWith('rpc') || trimmed.startsWith('package')) {
        continue;
      }

      if (trimmed.endsWith(';') || trimmed.endsWith('{') || trimmed.endsWith('}')) {
        continue;
      }

      // Check if this line starts a multi-line inline option
      if (trimmed.includes('[') && trimmed.includes('{')) {
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBraces = (lineWithoutComments.match(/\{/g) || []).length;
        const closeBraces = (lineWithoutComments.match(/\}/g) || []).length;
        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        const netOpen = (openBraces - closeBraces) + (openBrackets - closeBrackets);
        if (netOpen > 0) {
          inlineOptionDepth = netOpen;
          continue;
        }
      }

      // Also check for multi-line bracket options
      if (trimmed.includes('[') && !trimmed.includes(']')) {
        const lineWithoutStrings = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const lineWithoutComments = lineWithoutStrings.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        const openBrackets = (lineWithoutComments.match(/\[/g) || []).length;
        const closeBrackets = (lineWithoutComments.match(/\]/g) || []).length;

        if (openBrackets > closeBrackets) {
          inlineOptionDepth = openBrackets - closeBrackets;
          continue;
        }
      }

      const enumValueLike = /^(?:[A-Za-z_][\w]*)\s*=\s*-?\d+(?:\s*\[.*\])?/;
      const looksLikeField = fieldLike.test(trimmed) || mapLike.test(trimmed) || enumValueLike.test(trimmed);
      if (!looksLikeField) {
        continue;
      }

      // Look ahead: check if the next non-empty, non-comment line starts with '['
      // This handles cases like:
      //   string name = 2 // comment
      //       [(option) = {...}];
      let nextLineStartsOption = false;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]!.trim();
        if (nextLine === '' || nextLine.startsWith('//')) {
          continue; // Skip empty lines and comments
        }
        if (nextLine.startsWith('[')) {
          nextLineStartsOption = true;
          // Don't pre-count here - let the main loop handle it when it processes that line
        }
        break; // Only check the first non-empty, non-comment line
      }
      if (nextLineStartsOption) {
        continue;
      }

      // Check for inline comments and insert semicolon before them
      const commentIdx = (() => {
        const slIdx = trimmed.indexOf('//');
        const blkIdx = trimmed.indexOf('/*');
        if (slIdx === -1) {return blkIdx;}
        if (blkIdx === -1) {return slIdx;}
        return Math.min(slIdx, blkIdx);
      })();

      let newText: string;
      if (commentIdx >= 0) {
        // Extract parts before and after comment marker in the trimmed line
        const beforeCommentTrimmed = trimmed.slice(0, commentIdx).trim();
        const comment = trimmed.slice(commentIdx);

        // Clean up any existing semicolons and add exactly one
        const cleanedBefore = beforeCommentTrimmed.replace(/;+$/, '');
        const needsSemi = !cleanedBefore.endsWith(';');
        const fixedLine = needsSemi ? `${cleanedBefore};` : cleanedBefore;

        // Calculate indentation from original line
        const indent = line.slice(0, line.length - trimmed.length);
        newText = `${indent}${fixedLine} ${comment}`;
      } else {
        // No comment: clean up any existing semicolons and add one
        const cleanedLine = line.trimEnd().replace(/;+$/, '');
        newText = cleanedLine.endsWith(';') ? cleanedLine : `${cleanedLine};`;
      }

      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newText
      });
    }

    if (edits.length === 0) {
      return null;
    }

    return {
      title: 'Add missing semicolons to proto fields',
      kind: CodeActionKind.SourceFixAll,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  /**
   * Create an action to fix all editions-specific issues:
   * - Convert 'optional' to features.field_presence = EXPLICIT
   * - Convert 'required' to features.field_presence = LEGACY_REQUIRED
   */
  private createFixEditionsModifiersAction(uri: string, documentText: string): CodeAction | null {
    const lines = splitLines(documentText);
    const edits: TextEdit[] = [];

    // Check if this is an editions file
    const isEditions = lines.some(line => line.trim().startsWith('edition'));
    if (!isEditions) {
      return null;
    }

    // Pattern to match fields with optional/required modifiers
    const optionalFieldPattern = /^(\s*)optional\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/;
    const requiredFieldPattern = /^(\s*)required\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Check for 'optional' fields
      const optionalMatch = line.match(optionalFieldPattern);
      if (optionalMatch) {
        const [, indent, type, name, number, existingOptions] = optionalMatch;
        let newLine: string;
        if (existingOptions) {
          const optionsContent = existingOptions.slice(1, -1).trim();
          newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [${optionsContent}, features.field_presence = EXPLICIT];`;
        } else {
          newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [features.field_presence = EXPLICIT];`;
        }
        edits.push({
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length }
          },
          newText: newLine
        });
        continue;
      }

      // Check for 'required' fields
      const requiredMatch = line.match(requiredFieldPattern);
      if (requiredMatch) {
        const [, indent, type, name, number, existingOptions] = requiredMatch;
        let newLine: string;
        if (existingOptions) {
          const optionsContent = existingOptions.slice(1, -1).trim();
          newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [${optionsContent}, features.field_presence = LEGACY_REQUIRED];`;
        } else {
          newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [features.field_presence = LEGACY_REQUIRED];`;
        }
        edits.push({
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length }
          },
          newText: newLine
        });
      }
    }

    if (edits.length === 0) {
      return null;
    }

    return {
      title: 'Fix editions modifiers (convert optional/required to features.field_presence)',
      kind: CodeActionKind.SourceFixAll,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  private findEnclosingMessageName(range: Range, documentText: string): string | null {
    const lines = splitLines(documentText);
    let braceDepth = 0;

    for (let i = range.start.line; i >= 0; i--) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      for (const ch of line) {
        if (ch === '{') {
          braceDepth--;
        }
        if (ch === '}') {
          braceDepth++;
        }
      }

      const match = line.match(/\bmessage\s+(\w+)/);
      if (match && braceDepth <= 0) {
        return match[1] ?? null;
      }
    }

    return null;
  }

  private findEnclosingEnumName(range: Range, documentText: string): string | null {
    const lines = splitLines(documentText);
    let braceDepth = 0;

    for (let i = range.start.line; i >= 0; i--) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      for (const ch of line) {
        if (ch === '{') {
          braceDepth--;
        }
        if (ch === '}') {
          braceDepth++;
        }
      }

      const match = line.match(/\benum\s+(\w+)/);
      if (match && braceDepth <= 0) {
        return match[1] ?? null;
      }
    }

    return null;
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

    if (message.includes('missing semicolon')) {
      const lines = splitLines(documentText);
      const line = lines[diagnostic.range.start.line] || '';

      fixes.push({
        title: 'Add semicolon',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: diagnostic.range.start.line, character: 0 },
                end: { line: diagnostic.range.start.line, character: line.length }
              },
              newText: `${line.trimEnd()};`
            }]
          }
        }
      });
    }

    if (message.includes('missing syntax or edition declaration')) {
      const insertPos = { line: 0, character: 0 };
      fixes.push({
        title: 'Insert syntax = "proto3";',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: { start: insertPos, end: insertPos },
              newText: 'syntax = "proto3";\n'
            }]
          }
        }
      });
    }

    if (message.includes('package') && message.includes('does not appear to match directory')) {
      const lines = splitLines(documentText);
      const pkgLine = diagnostic.range.start.line;
      const pkgLineText = lines[pkgLine] || '';
      const suggested = this.inferPackageFromUri(uri) || 'package.name';

      fixes.push({
        title: `Set package to '${suggested}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: pkgLine, character: 0 },
                end: { line: pkgLine, character: pkgLineText.length }
              },
              newText: `package ${suggested};`
            }]
          }
        }
      });
    }

    if (message.includes('duplicate field number') && message.includes('oneof')) {
      const messageName = this.findEnclosingMessageName(diagnostic.range, documentText);
      if (messageName) {
        const renumber = this.createRenumberMessageAction(uri, documentText, messageName);
        if (renumber) {
          fixes.push(renumber);
        }
      }
    }

    if (message.includes('should not use modifier') && message.includes('oneof')) {
      const lines = splitLines(documentText);
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex] || '';
      const newLine = line.replace(/\b(optional|required|repeated)\s+/, '');
      fixes.push({
        title: 'Remove modifier from oneof field',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
              },
              newText: newLine
            }]
          }
        }
      });
    }

    if (message.includes('rpc') && message.includes('missing request type')) {
      const edit = this.fillRpcType(uri, diagnostic.range, documentText, 'request');
      if (edit) {
        fixes.push(edit);
      }
    }

    if (message.includes('rpc') && message.includes('missing response type')) {
      const edit = this.fillRpcType(uri, diagnostic.range, documentText, 'response');
      if (edit) {
        fixes.push(edit);
      }
    }

    if (message.includes('expects a boolean value')) {
      fixes.push(this.replaceOptionValue(uri, diagnostic, documentText, 'true'));
    }

    if (message.includes('expects a string value')) {
      fixes.push(this.replaceOptionValue(uri, diagnostic, documentText, '""'));
    }

    if (message.includes('expects one of:')) {
      const match = diagnostic.message.match(/expects one of: (.*)$/i);
      const first = match?.[1]?.split(',')[0]?.trim() ?? 'SPEED';
      fixes.push(this.replaceOptionValue(uri, diagnostic, documentText, first));
    }

    // Handle unresolved imports - use original message for regex extraction
    if (message.includes('cannot be resolved') && message.includes('import')) {
      const lines = splitLines(documentText);
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex] || '';

      // Extract the import path from the original diagnostic message (not lowercased)
      const importMatch = diagnostic.message.match(/Import '([^']+)' cannot be resolved/i);
      const importPath = importMatch?.[1] ?? '';

      // Check if this looks like a buf registry dependency import
      const isBufDependency = this.isBufRegistryImport(importPath);
      const suggestedModule = isBufDependency ? this.suggestBufModule(importPath) : null;

      if (isBufDependency) {
        // Add suggestion to add dependency to buf.yaml
        if (suggestedModule) {
          fixes.push({
            title: `Add '${suggestedModule}' to buf.yaml dependencies`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            diagnostics: [diagnostic],
            command: {
              title: 'Add Buf Dependency',
              command: 'protobuf.addBufDependencyQuick',
              arguments: [suggestedModule, importPath]
            }
          });
        }

        // Add a suggestion to run buf export
        fixes.push({
          title: `Run 'buf export' to download dependencies (${importPath})`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          command: {
            title: 'Export Buf Dependencies',
            command: 'protobuf.exportBufDependencies'
          }
        });
      }

      fixes.push({
        title: 'Remove unresolved import',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
              },
              newText: ''
            }]
          }
        }
      });
    }

    if (message.includes('unused import')) {
      const lines = splitLines(documentText);
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex] || '';

      fixes.push({
        title: 'Remove unused import',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [{
              range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
              },
              newText: ''
            }]
          }
        }
      });
    }

    // Handle unqualified type references
    if (message.includes('must be fully qualified')) {
      // Extract the fully qualified name from the message
      const fqnMatch = diagnostic.message.match(/must be fully qualified as '([^']+)'/);
      const fullyQualifiedName = fqnMatch?.[1];
      
      if (fullyQualifiedName) {
        fixes.push({
          title: `Use fully qualified name: ${fullyQualifiedName}`,
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [{
                range: diagnostic.range,
                newText: fullyQualifiedName
              }]
            }
          }
        });
      }
    }

    // Handle resolved BSR imports that aren't in buf.yaml dependencies
    if (message.includes('is not in buf.yaml dependencies')) {
      // Extract the suggested module from the diagnostic message
      const moduleMatch = diagnostic.message.match(/'([^']+)' is not in buf\.yaml dependencies/);
      const suggestedModule = moduleMatch?.[1] ?? null;

      // Extract import path from message
      const importMatch = diagnostic.message.match(/Import '([^']+)' resolves/);
      const importPath = importMatch?.[1] ?? '';

      if (suggestedModule) {
        fixes.push({
          title: `Add '${suggestedModule}' to buf.yaml dependencies`,
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          diagnostics: [diagnostic],
          command: {
            title: 'Add Buf Dependency',
            command: 'protobuf.addBufDependencyQuick',
            arguments: [suggestedModule, importPath]
          }
        });
      }
    }

    if (/screaming_snake_case/i.test(message)) {
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

    if (/snake_case/i.test(message)) {
      const word = this.getWordAtRange(documentText, diagnostic.range);
      // Avoid offering lowercase snake_case for identifiers that are already screaming snake case (enum values)
      if (word && !/^[A-Z][A-Z0-9_]*$/.test(word)) {
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

    // Fix unknown type - suggest import
    if (message.includes('unknown type')) {
      const typeMatch = message.match(/unknown type '([^']+)'/);
      if (typeMatch?.[1]) {
        const typeName = typeMatch[1];
        const importActions = this.suggestImportsForType(uri, typeName, documentText);
        fixes.push(...importActions);
      }
    }

    // Missing import (detected by diagnostics provider)
    if (message.includes('not imported')) {
      const importMatch = diagnostic.message.match(/import "([^"]+)"/i);
      const importPath = importMatch?.[1];

      if (importPath && !documentText.includes(`"${importPath}"`)) {
        const insertPosition = this.findImportInsertPosition(documentText);
        fixes.push({
          title: `Add import "${importPath}"`,
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [{
                range: { start: insertPosition, end: insertPosition },
                newText: `import "${importPath}";\n`
              }]
            }
          }
        });
      }
    }

    if (message.includes('not strictly increasing') || message.includes('gap in field numbers')) {
      const messageName = this.findEnclosingMessageName(diagnostic.range, documentText);
      if (messageName) {
        const renumber = this.createRenumberMessageAction(uri, documentText, messageName);
        if (renumber) {
          fixes.push(renumber);
        }
      }
    }

    // Incorrect import path for resolved type
    if (message.includes('should be imported via')) {
      const match = diagnostic.message.match(/via "([^"]+)" .*"([^"]+)"/i);
      const expected = match?.[1];
      const found = match?.[2];

      if (expected && found) {
        const insertPosition = this.findImportInsertPosition(documentText);

        // Remove the wrong import line if present; simple replace strategy
        const lines = splitLines(documentText);
        const edits: TextEdit[] = [];
        lines.forEach((line, idx) => {
          if (line.includes(`"${found}"`)) {
            edits.push({
              range: { start: { line: idx, character: 0 }, end: { line: idx, character: line.length } },
              newText: ''
            });
          }
        });

        edits.push({
          range: { start: insertPosition, end: insertPosition },
          newText: `import "${expected}";\n`
        });

        fixes.push({
          title: `Replace import "${found}" with "${expected}"`,
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          diagnostics: [diagnostic],
          edit: { changes: { [uri]: edits } }
        });
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
      const lines = splitLines(documentText);
      const line = lines[diagnostic.range.start.line];
      if (!line) {
        return fixes;
      }
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

    // Fix duplicate field number - only if renumbering is enabled
    if (message.includes('duplicate field number')) {
      logger.info(`Code action: duplicate field number detected, renumberOnFormat=${this.settings.renumberOnFormat}`);

      if (this.settings.renumberOnFormat) {
        logger.info(`Code action: offering quick fix for duplicate field number`);
        const file = this.analyzer.getFile(uri);
        if (file) {
          const nextNumber = this.findNextAvailableFieldNumber(file, documentText, diagnostic.range);

          // Find the field number in the line and suggest changing it
          const lines = splitLines(documentText);
          const line = lines[diagnostic.range.start.line];
          if (line) {
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
      }
    }

    // Fix reserved field number usage
    if (message.includes('field number') && message.includes('is reserved')) {
      const file = this.analyzer.getFile(uri);
      if (file) {
        const nextNumber = this.findNextAvailableFieldNumber(file, documentText, diagnostic.range);

        const lines = splitLines(documentText);
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

    // Fix 'optional' not allowed in editions - convert to field_presence feature
    if (message.includes("'optional' label is not allowed in editions")) {
      const lines = splitLines(documentText);
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex];

      if (line) {
        // Remove 'optional' and add [features.field_presence = EXPLICIT] option
        // Match: optional Type name = N; or optional Type name = N [options];
        const fieldMatch = line.match(/^(\s*)optional\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/);
        if (fieldMatch) {
          const [, indent, type, name, number, existingOptions] = fieldMatch;
          let newLine: string;
          if (existingOptions) {
            // Append to existing options
            const optionsContent = existingOptions.slice(1, -1).trim();
            newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [${optionsContent}, features.field_presence = EXPLICIT];`;
          } else {
            newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [features.field_presence = EXPLICIT];`;
          }

          fixes.push({
            title: "Convert 'optional' to 'features.field_presence = EXPLICIT'",
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [{
                  range: {
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: line.length }
                  },
                  newText: newLine
                }]
              }
            }
          });
        }

        // Also offer option to just remove 'optional' (uses edition default)
        const noOptionalLine = line.replace(/\boptional\s+/, '');
        fixes.push({
          title: "Remove 'optional' modifier (uses edition default)",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [{
                range: {
                  start: { line: lineIndex, character: 0 },
                  end: { line: lineIndex, character: line.length }
                },
                newText: noOptionalLine
              }]
            }
          }
        });
      }
    }

    // Fix 'required' not allowed in editions - convert to field_presence feature
    if (message.includes("'required' label is not allowed in editions")) {
      const lines = splitLines(documentText);
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex];

      if (line) {
        // Remove 'required' and add [features.field_presence = LEGACY_REQUIRED] option
        const fieldMatch = line.match(/^(\s*)required\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/);
        if (fieldMatch) {
          const [, indent, type, name, number, existingOptions] = fieldMatch;
          let newLine: string;
          if (existingOptions) {
            const optionsContent = existingOptions.slice(1, -1).trim();
            newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [${optionsContent}, features.field_presence = LEGACY_REQUIRED];`;
          } else {
            newLine = `${indent ?? ''}${type ?? ''} ${name ?? ''} = ${number ?? ''} [features.field_presence = LEGACY_REQUIRED];`;
          }

          fixes.push({
            title: "Convert 'required' to 'features.field_presence = LEGACY_REQUIRED'",
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [{
                  range: {
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: line.length }
                  },
                  newText: newLine
                }]
              }
            }
          });
        }

        // Also offer option to just remove 'required'
        const noRequiredLine = line.replace(/\brequired\s+/, '');
        fixes.push({
          title: "Remove 'required' modifier",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [{
                range: {
                  start: { line: lineIndex, character: 0 },
                  end: { line: lineIndex, character: line.length }
                },
                newText: noRequiredLine
              }]
            }
          }
        });
      }
    }

    return fixes;
  }

  private getRefactoringActions(uri: string, range: Range, documentText: string): CodeAction[] {
    const actions: CodeAction[] = [];
    const lines = splitLines(documentText);
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

      // Add "Convert to proto3" if proto2
      const file = this.analyzer.getFile(uri);
      if (file && file.syntax?.version === 'proto2' && messageMatch[2]) {
        actions.push({
          title: 'Convert message to proto3 style',
          kind: CodeActionKind.RefactorRewrite,
          edit: this.createProto3ConversionEdit(uri, documentText, messageMatch[2])
        });
      }
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
              newText: ` [json_name = "${this.toCamelCase(fieldMatch[2] ?? '')}"];`
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

      const importPath = this.analyzer.getImportPathForFile(uri, symbolUri);

      actions.push({
        title: `Add import "${importPath}"`,
        kind: CodeActionKind.QuickFix,
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
      'UInt64Value': 'google/protobuf/wrappers.proto',
      // Additional google well-known-ish stubs
      'Status': 'google/rpc/status.proto',
      'Code': 'google/rpc/code.proto',
      'RetryInfo': 'google/rpc/error_details.proto',
      'Date': 'google/type/date.proto',
      'TimeOfDay': 'google/type/timeofday.proto',
      'DateTime': 'google/type/datetime.proto',
      'LatLng': 'google/type/latlng.proto',
      'Money': 'google/type/money.proto',
      'Color': 'google/type/color.proto',
      'PostalAddress': 'google/type/postal_address.proto',
      'PhoneNumber': 'google/type/phone_number.proto',
      'LocalizedText': 'google/type/localized_text.proto',
      'Expr': 'google/type/expr.proto',
      'Operation': 'google/longrunning/operations.proto',
      'HttpRequest': 'google/logging/type/http_request.proto',
      'LogSeverity': 'google/logging/type/log_severity.proto',
      'AuditLog': 'google/cloud/audit/audit_log.proto'
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
    const lines = splitLines(documentText);
    let lastImportLine = -1;
    let syntaxLine = -1;
    let packageLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
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

  private inferPackageFromUri(uri: string): string | null {
    try {
      const fsPath = decodeURI(uri.replace('file://', ''));
      const segments = fsPath.split(/[\\/]+/);
      if (segments.length < 2) {
        return null;
      }
      const dir = segments[segments.length - 2];
      if (!dir) {
        return null;
      }
      return dir.replace(/[^a-zA-Z0-9_]/g, '_');
    } catch {
      return null;
    }
  }

  private replaceOptionValue(uri: string, diagnostic: Diagnostic, documentText: string, valueText: string): CodeAction {
    const lines = splitLines(documentText);
    const lineIndex = diagnostic.range.start.line;
    const line = lines[lineIndex] || '';

    const newLine = line.replace(/=\s*[^;]+/, `= ${valueText}`);

    return {
      title: `Set option value to ${valueText}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [uri]: [{
            range: {
              start: { line: lineIndex, character: 0 },
              end: { line: lineIndex, character: line.length }
            },
            newText: newLine
          }]
        }
      }
    };
  }

  private fillRpcType(uri: string, range: Range, documentText: string, which: 'request' | 'response'): CodeAction | null {
    const lines = splitLines(documentText);
    const lineIndex = range.start.line;
    const line = lines[lineIndex] || '';
    let newLine = line;
    if (which === 'request') {
      newLine = line.replace(/rpc\s+(\w+)\s*\(\s*\)/, 'rpc $1 (google.protobuf.Empty)');
    } else {
      newLine = line.replace(/returns\s*\(\s*\)/, 'returns (google.protobuf.Empty)');
    }

    if (newLine === line) {
      return null;
    }

    return {
      title: which === 'request' ? 'Fill request with google.protobuf.Empty' : 'Fill response with google.protobuf.Empty',
      kind: CodeActionKind.QuickFix,
      diagnostics: [],
      edit: {
        changes: {
          [uri]: [{
            range: {
              start: { line: lineIndex, character: 0 },
              end: { line: lineIndex, character: line.length }
            },
            newText: newLine
          }, {
            range: { start: this.findImportInsertPosition(documentText), end: this.findImportInsertPosition(documentText) },
            newText: documentText.includes('google/protobuf/empty.proto') ? '' : 'import "google/protobuf/empty.proto";\n'
          }]
        }
      }
    };
  }

  private extractMissingImportPaths(diagnostics: Diagnostic[], documentText: string): string[] {
    const imports = new Set<string>();
    for (const diagnostic of diagnostics) {
      if (!diagnostic.message.toLowerCase().includes('not imported')) {
        continue;
      }
      const match = diagnostic.message.match(/import "([^"]+)"/i);
      if (match?.[1]) {
        const path = match[1];
        if (!documentText.includes(`"${path}"`)) {
          imports.add(path);
        }
      }
    }
    return Array.from(imports);
  }

  private createFixImportsAction(uri: string, diagnostics: Diagnostic[], documentText: string): CodeAction | null {
    const lines = splitLines(documentText);

    const missingImports = this.extractMissingImportPaths(diagnostics, documentText);

    const unusedImportLines: TextEdit[] = [];
    for (const diagnostic of diagnostics) {
      const msg = diagnostic.message.toLowerCase();
      if (!msg.includes('unused import')) {
        continue;
      }
      const lineIndex = diagnostic.range.start.line;
      const line = lines[lineIndex] || '';
      unusedImportLines.push({
        range: {
          start: { line: lineIndex, character: 0 },
          end: { line: lineIndex, character: line.length }
        },
        newText: ''
      });
    }

    if (missingImports.length === 0 && unusedImportLines.length === 0) {
      return null;
    }

    const insertPosition = this.findImportInsertPosition(documentText);
    const addEdits: TextEdit[] = missingImports.map(p => ({
      range: { start: insertPosition, end: insertPosition },
      newText: `import "${p}";\n`
    }));

    return {
      title: 'Fix imports (add missing, remove unused)',
      kind: CodeActionKind.SourceFixAll,
      edit: {
        changes: {
          [uri]: [...unusedImportLines, ...addEdits]
        }
      }
    };
  }

  private createAddMissingImportsAction(uri: string, importPaths: string[], documentText: string): CodeAction {
    const insertPosition = this.findImportInsertPosition(documentText);
    const edits: TextEdit[] = importPaths.map(p => ({
      range: { start: insertPosition, end: insertPosition },
      newText: `import "${p}";\n`
    }));

    return {
      title: 'Add missing imports',
      kind: CodeActionKind.SourceOrganizeImports,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  private createNumberFieldsInMessageAction(
    uri: string,
    documentText: string,
    range: Range,
    messageName: string
  ): CodeAction | null {
    const lines = splitLines(documentText);

    // Find message bounds
    let startLine = -1;
    for (let i = range.start.line; i >= 0; i--) {
      if (/^\s*message\s+\w+\s*\{/.test(lines[i]!)) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) {
      return null;
    }

    let braceDepth = 0;
    let endLine = -1;
    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]!) {
        if (ch === '{') {
          braceDepth++;
        }
        if (ch === '}') {
          braceDepth--;
        }
      }
      if (braceDepth === 0 && i > startLine) {
        endLine = i;
        break;
      }
    }
    if (endLine === -1) {
      return null;
    }

    const fieldLike = /^(\s*)(?:optional|required|repeated)?\s*(?:map\s*<[^>]+>\s+|[A-Za-z_][\w.<>,]*\s+)([A-Za-z_][\w]*)(\s*.*)$/;

    const edits: TextEdit[] = [];
    let nextNumber = 1;

    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('}')) {
        continue;
      }

      if (trimmed.includes('=')) {
        // Already numbered; attempt to keep numbering continuity
        const match = trimmed.match(/=\s*(\d+)/);
        if (match?.[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num >= nextNumber) {
            nextNumber = num + 1;
          }
        }
        continue;
      }

      const m = line.match(fieldLike);
      if (!m) {
        continue;
      }

      // Skip internal reserved range
      if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
        nextNumber = 20000;
      }

      const indent = m[1] ?? '';
      const suffix = m[3] ?? '';
      const newLine = `${indent}${m[0].trim()} = ${nextNumber};${suffix.includes(';') ? '' : ''}`;

      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newLine
      });

      nextNumber += 1;
    }

    if (edits.length === 0) {
      return null;
    }

    return {
      title: `Assign field numbers in message ${messageName}`,
      kind: CodeActionKind.SourceFixAll,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
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
    const lines = splitLines(documentText);
    let braceLineIndex = -1;

    for (let i = range.start.line; i >= 0; i--) {
      if (lines[i]?.includes('{')) {
        braceLineIndex = i;
        break;
      }
    }

    if (braceLineIndex < 0) {
      return [];
    }

    const braceLine = lines[braceLineIndex];
    if (!braceLine) {
      return [];
    }

    // Get the enum name for generating the UNKNOWN value name
    const enumMatch = braceLine.match(/enum\s+(\w+)/);
    const enumName = enumMatch?.[1] ?? 'ENUM';
    const unknownName = `${enumName.toUpperCase()}_UNKNOWN`;

    // Insert after the opening brace
    const braceIndex = braceLine.indexOf('{');
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
    const lines = splitLines(documentText);
    const usedNumbers = new Set<number>();

    // Find the containing message
    let braceCount = 0;
    let messageStartLine = -1;

    for (let i = range.start.line; i >= 0; i--) {
      const line = lines[i];
      if (!line) {
        continue;
      }
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
      if (!line) {
        continue;
      }

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
        if (numberMatch?.[1]) {
          usedNumbers.add(parseInt(numberMatch[1], 10));
        }
      }
    }

    // Find next available number
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
      // Skip reserved range
      if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
        nextNumber = 20000;
      }
    }

    return nextNumber;
  }

  private getWordAtRange(documentText: string, range: Range): string | null {
    const lines = splitLines(documentText);
    const line = lines[range.start.line];
    if (!line) {
      return null;
    }

    return line.substring(range.start.character, range.end.character);
  }

  private isInsideMessage(documentText: string, lineNumber: number): boolean {
    const lines = splitLines(documentText);
    let braceCount = 0;

    for (let i = 0; i < lineNumber; i++) {
      const line = lines[i]!;
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

  private createProto3ConversionEdit(uri: string, documentText: string, messageName: string): { changes: { [uri: string]: TextEdit[] } } | undefined {
    const lines = splitLines(documentText);
    const edits: TextEdit[] = [];
    let inMessage = false;
    let braceDepth = 0;
    let messageStartLine = -1;

    // Find the message
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes(`message ${messageName}`)) {
        messageStartLine = i;
        inMessage = true;
        braceDepth = 0;
      }

      if (inMessage) {
        for (const char of line) {
          if (char === '{') {
            braceDepth++;
          }
          if (char === '}') {
            braceDepth--;
          }
        }

        // Remove 'required' modifiers
        if (line.includes('required')) {
          const newLine = line.replace(/\brequired\s+/, '');
          edits.push({
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: line.length }
            },
            newText: newLine
          });
        }

        // Remove default values (proto3 doesn't support them)
        if (line.includes('=') && line.includes('[') === false) {
          const defaultMatch = line.match(/=\s*(\d+)\s*\[default\s*=/);
          if (defaultMatch) {
            const newLine = line.replace(/\s*\[default\s*=[^\]]+\]/, '');
            edits.push({
              range: {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
              },
              newText: newLine
            });
          }
        }

        if (braceDepth === 0 && i > messageStartLine) {
          break;
        }
      }
    }

    if (edits.length === 0) {
      return undefined;
    }

    return {
      changes: {
        [uri]: edits
      }
    };
  }

  /**
   * Organize imports: sort them and remove duplicates
   */
  private createOrganizeImportsAction(uri: string, documentText: string): CodeAction | null {
    const lines = splitLines(documentText);
    const importLines: { line: number; text: string; modifier?: string }[] = [];
    const otherLines: { line: number; text: string }[] = [];
    let inImportsSection = false;
    let lastImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      if (trimmed.startsWith('import')) {
        inImportsSection = true;
        lastImportLine = i;
        const match = trimmed.match(/import\s+(?:weak|public)?\s*"([^"]+)"/);
        if (match) {
          const modifierMatch = trimmed.match(/import\s+(weak|public)/);
          importLines.push({
            line: i,
            text: line,
            modifier: modifierMatch ? modifierMatch[1] : undefined
          });
        }
      } else if (trimmed && (trimmed.startsWith('syntax') || trimmed.startsWith('package') || trimmed.startsWith('option'))) {
        if (inImportsSection && lastImportLine >= 0) {
          // End of imports section
          break;
        }
        otherLines.push({ line: i, text: line });
      } else if (trimmed && (trimmed.startsWith('message') || trimmed.startsWith('enum') || trimmed.startsWith('service'))) {
        if (inImportsSection && lastImportLine >= 0) {
          // End of imports section
          break;
        }
        otherLines.push({ line: i, text: line });
      } else if (inImportsSection && trimmed && !trimmed.startsWith('//')) {
        // End of imports section
        break;
      }
    }

    if (importLines.length === 0) {
      return null;
    }

    // Remove duplicates and sort
    const uniqueImports = new Map<string, { text: string; modifier?: string }>();
    for (const imp of importLines) {
      const match = imp.text.match(/import\s+(?:weak|public)?\s*"([^"]+)"/);
      if (match) {
        const path = match[1];
        const key = `${imp.modifier || ''}:${path}`;
        if (!uniqueImports.has(key)) {
          uniqueImports.set(key, { text: imp.text, modifier: imp.modifier });
        }
      }
    }

    // Sort imports: public first, then weak, then regular, then alphabetically
    const sortedImports = Array.from(uniqueImports.values()).sort((a, b) => {
      if (a.modifier === 'public' && b.modifier !== 'public') {
        return -1;
      }
      if (a.modifier !== 'public' && b.modifier === 'public') {
        return 1;
      }
      if (a.modifier === 'weak' && b.modifier !== 'weak') {
        return -1;
      }
      if (a.modifier !== 'weak' && b.modifier === 'weak') {
        return 1;
      }
      const aPath = a.text.match(/"([^"]+)"/)?.[1] ?? '';
      const bPath = b.text.match(/"([^"]+)"/)?.[1] ?? '';
      return aPath.localeCompare(bPath);
    });

    // Check if anything changed
    const originalImports = importLines.map(i => i.text.trim()).join('\n');
    const newImports = sortedImports.map(i => i.text).join('\n');
    if (originalImports === newImports.trim()) {
      return null;
    }

    // Create edits
    const edits: TextEdit[] = [];
    const firstImportLine = importLines[0]!.line;

    // Remove old imports
    for (const imp of importLines) {
      edits.push({
        range: {
          start: { line: imp.line, character: 0 },
          end: { line: imp.line, character: lines[imp.line]!.length }
        },
        newText: ''
      });
    }

    // Add sorted imports
    const insertPosition = { line: firstImportLine, character: 0 };
    edits.push({
      range: {
        start: insertPosition,
        end: insertPosition
      },
      newText: sortedImports.map(i => i.text).join('\n') + (sortedImports.length > 0 ? '\n' : '')
    });

    return {
      title: 'Organize imports (sort and remove duplicates)',
      kind: CodeActionKind.SourceOrganizeImports,
      edit: {
        changes: {
          [uri]: edits
        }
      }
    };
  }

  /**
   * Check if an import path looks like it comes from the Buf Schema Registry
   * Common patterns:
   * - buf/validate/validate.proto (protovalidate)
   * - buf/... (any buf.build module)
   * - google/api/... (googleapis)
   * - google/type/... (googleapis)
   * - google/rpc/... (googleapis)
   * - grpc/... (grpc modules)
   * - envoy/... (envoy proxy)
   * - validate/validate.proto (protoc-gen-validate)
   */
  private isBufRegistryImport(importPath: string): boolean {
    // Common Buf Schema Registry module patterns
    const bufRegistryPatterns = [
      /^buf\//,                    // buf.build/bufbuild/* modules
      /^google\/api\//,            // googleapis - google/api
      /^google\/type\//,           // googleapis - google/type
      /^google\/rpc\//,            // googleapis - google/rpc
      /^google\/cloud\//,          // googleapis - google/cloud
      /^google\/logging\//,        // googleapis - google/logging
      /^grpc\//,                   // grpc modules
      /^envoy\//,                  // envoy proxy
      /^validate\/validate\.proto$/,  // protoc-gen-validate (PGV)
      /^xds\//,                    // xDS API
      /^opencensus\//,             // OpenCensus
      /^opentelemetry\//,          // OpenTelemetry
      /^cosmos\//,                 // Cosmos SDK
      /^tendermint\//,             // Tendermint
    ];

    return bufRegistryPatterns.some(pattern => pattern.test(importPath));
  }

  /**
   * Suggest a Buf Schema Registry module for an import path
   */
  private suggestBufModule(importPath: string): string | null {
    // Map of import path patterns to BSR modules
    const moduleMap: { pattern: RegExp; module: string }[] = [
      // Google APIs
      { pattern: /^google\/api\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/type\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/rpc\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/cloud\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/logging\//, module: 'buf.build/googleapis/googleapis' },

      // Buf Validate (protovalidate)
      { pattern: /^buf\/validate\//, module: 'buf.build/bufbuild/protovalidate' },

      // Legacy protoc-gen-validate
      { pattern: /^validate\/validate\.proto$/, module: 'buf.build/envoyproxy/protoc-gen-validate' },

      // gRPC
      { pattern: /^grpc\//, module: 'buf.build/grpc/grpc' },

      // Envoy
      { pattern: /^envoy\//, module: 'buf.build/envoyproxy/envoy' },

      // xDS
      { pattern: /^xds\//, module: 'buf.build/cncf/xds' },

      // OpenTelemetry
      { pattern: /^opentelemetry\//, module: 'buf.build/open-telemetry/opentelemetry' },

      // Cosmos SDK
      { pattern: /^cosmos\//, module: 'buf.build/cosmos/cosmos-sdk' },
      { pattern: /^tendermint\//, module: 'buf.build/cosmos/cosmos-sdk' },

      // Connect RPC
      { pattern: /^connectrpc\//, module: 'buf.build/connectrpc/connect' },
    ];

    for (const { pattern, module } of moduleMap) {
      if (pattern.test(importPath)) {
        return module;
      }
    }

    return null;
  }
}
