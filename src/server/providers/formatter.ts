/**
 * Code Formatter for Protocol Buffers
 */

import { TextEdit, Range } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { ClangFormatProvider } from '../services/clangFormat';
import { BufFormatProvider } from '../services/bufFormat';
import { logger } from '../utils/logger';
import { splitLines } from '../../shared/textUtils';
import {
  FormatterSettings,
  AlignmentData,
  DEFAULT_SETTINGS
} from './formatter/types';
import { calculateAlignmentInfo } from './formatter/alignment';
import {
  getIndent,
  formatLine,
  formatLineWithAlignment,
  formatOptionLine
} from './formatter/lineFormatting';
import { renumberFields } from './formatter/renumber';

// Re-export types for backwards compatibility
export type { FormatterSettings } from './formatter/types';

export class ProtoFormatter {
  private settings: FormatterSettings = DEFAULT_SETTINGS;
  private clangFormatEnabled: boolean = false;

  constructor(
    private clangFormat?: ClangFormatProvider,
    private bufFormat?: BufFormatProvider
  ) {}

  updateSettings(settings: Partial<FormatterSettings>): void {
    this.settings = { ...this.settings, ...settings };
    // Reset warning flags when settings change so users can see warnings again
    this.clangFormatWarningShown = false;
    this.bufFormatWarningShown = false;
  }

  /**
   * Set whether clang-format is enabled (from protobuf.clangFormat.enabled setting)
   * This allows using clang-format even without preset='google'
   */
  setClangFormatEnabled(enabled: boolean): void {
    this.clangFormatEnabled = enabled;
    // Reset warning flag when clang-format enabled state changes
    this.clangFormatWarningShown = false;
  }

  setBufPath(path: string): void {
    this.bufFormat?.setBufPath(path);
  }

  private clangFormatWarningShown = false;
  private bufFormatWarningShown = false;

  async formatDocument(text: string, uri?: string): Promise<TextEdit[]> {
    // Use clang-format if preset is 'google' OR if clangFormat is explicitly enabled
    const useClangFormat = (this.settings.preset === 'google' || this.clangFormatEnabled) && this.clangFormat;
    if (useClangFormat) {
      const lines = splitLines(text);
      const range = Range.create(0, 0, lines.length - 1, lines[lines.length - 1]!.length);
      const filePath = this.getFsPathFromUri(uri);
      const edits = await this.clangFormat!.formatRange(text, range, filePath);

      // null means clang-format is disabled or failed - fall back to minimal
      // empty array means no changes needed - return as-is (don't fall back!)
      // non-empty array means changes - return them
      if (edits !== null) {
        return edits; // Success - either changes or no changes needed
      }

      // clang-format failed - log warning once and fall back
      if (!this.clangFormatWarningShown) {
        logger.warn('clang-format failed or is not available. Falling back to minimal formatter. Check that clang-format is installed and the path is correct in settings.');
        this.clangFormatWarningShown = true;
      }
    }

    if (this.settings.preset === 'buf' && this.bufFormat) {
      const filePath = this.getFsPathFromUri(uri);
      const formatted = await this.bufFormat.format(text, filePath);
      if (formatted) {
        const lines = splitLines(text);
        return [{
          range: Range.create(0, 0, lines.length - 1, lines[lines.length - 1]!.length),
          newText: formatted
        }];
      }
      // buf format failed - log warning once
      if (!this.bufFormatWarningShown) {
        logger.warn('Formatter preset is "buf" but buf format failed or is not available. Falling back to minimal formatter. Check that buf is installed and the path is correct in settings.');
        this.bufFormatWarningShown = true;
      }
    }

    const formatted = this.format(text);
    const lines = splitLines(text);

    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1]!.length }
      },
      newText: formatted
    }];
  }

  async formatRange(text: string, range: Range, uri?: string): Promise<TextEdit[]> {
    // Use clang-format if preset is 'google' OR if clangFormat is explicitly enabled
    const useClangFormat = (this.settings.preset === 'google' || this.clangFormatEnabled) && this.clangFormat;
    if (useClangFormat) {
      const filePath = this.getFsPathFromUri(uri);
      const edits = await this.clangFormat!.formatRange(text, range, filePath);

      // null means clang-format is disabled or failed - fall back to minimal
      // empty array or non-empty array means success
      if (edits !== null) {
        return edits;
      }

      // clang-format failed for range formatting - log warning once
      if (!this.clangFormatWarningShown) {
        logger.warn('clang-format failed or is not available. Falling back to minimal formatter.');
        this.clangFormatWarningShown = true;
      }
    }

    // Buf doesn't support range formatting easily, fall back to minimal

    const lines = splitLines(text);
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Extract the range to format
    const rangeLines = lines.slice(startLine, endLine + 1);
    const rangeText = rangeLines.join('\n');

    // Determine indent level at start of range
    let indentLevel = 0;
    for (let i = 0; i < startLine; i++) {
      const line = lines[i]!.trim();
      if (line.includes('{') && !line.includes('}')) {
        indentLevel++;
      }
      if (line.startsWith('}')) {
        indentLevel--;
      }
    }

    // Format the range
    const formatted = this.formatRangeWithIndent(rangeText, indentLevel);

    return [{
      range: {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: lines[endLine]!.length }
      },
      newText: formatted
    }];
  }

  private format(text: string): string {
    // Preprocess: join multi-line field declarations (unless preserveMultiLineFields is enabled)
    // This handles cases like:
    //   float value =
    //       1;  // comment
    // Which should become:
    //   float value = 1;  // comment
    const preprocessedText = this.settings.preserveMultiLineFields
      ? text
      : this.joinMultiLineFieldDeclarations(text);
    const lines = splitLines(preprocessedText);

    // If alignment is enabled, first pass to collect alignment info
    let alignmentInfo: Map<number, AlignmentData> | undefined;
    if (this.settings.alignFields) {
      alignmentInfo = calculateAlignmentInfo(lines);
    }

    const formattedLines: string[] = [];
    let indentLevel = 0;
    let inBlockComment = false;
    // Track depth inside option blocks (aggregate options like CEL)
    let optionBraceDepth = 0;
    // Track depth inside inline field options [...] containing braces
    let inlineOptionBraceDepth = 0;
    let currentBlockStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmedLine = line.trim();

      // Handle block comments
      if (inBlockComment) {
        formattedLines.push(`${getIndent(indentLevel, this.settings)} ${trimmedLine}`);
        if (trimmedLine.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmedLine.startsWith('/*') && !trimmedLine.includes('*/')) {
        inBlockComment = true;
        formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);
        continue;
      }

      // Skip empty lines but preserve them
      if (trimmedLine === '') {
        formattedLines.push('');
        continue;
      }

      // Track multi-line option blocks
      if (optionBraceDepth > 0) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;

        // Adjust indent for closing brace
        if (trimmedLine.startsWith('}') && indentLevel > 0) {
          indentLevel--;
        }

        // Format option block lines with alignment if enabled
        const formattedLine = this.settings.alignFields && alignmentInfo
          ? formatOptionLine(trimmedLine, indentLevel, alignmentInfo.get(currentBlockStartLine), this.settings)
          : getIndent(indentLevel, this.settings) + trimmedLine;
        formattedLines.push(formattedLine);

        // Adjust indent for opening brace
        if (openBraces > closeBraces) {
          indentLevel++;
        }

        optionBraceDepth += openBraces - closeBraces;
        continue;
      }

      // Track inline field options with braces
      if (inlineOptionBraceDepth > 0) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;

        // Adjust indent for closing brace
        if (trimmedLine.startsWith('}') && indentLevel > 0) {
          indentLevel--;
        }

        formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);

        // Adjust indent for opening brace
        if (openBraces > closeBraces) {
          indentLevel++;
        }

        inlineOptionBraceDepth += openBraces - closeBraces;
        continue;
      }

      // Check if this line starts an option with an opening brace
      if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;
        optionBraceDepth = openBraces - closeBraces;
        currentBlockStartLine = i;

        formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);

        if (optionBraceDepth > 0) {
          indentLevel++;
        }
        continue;
      }

      // Check if this line has inline field options with braces
      if (trimmedLine.includes('[') && trimmedLine.includes('{')) {
        const bracketStart = trimmedLine.indexOf('[');
        const afterBracket = trimmedLine.slice(bracketStart);
        const openBraces = (afterBracket.match(/\{/g) || []).length;
        const closeBraces = (afterBracket.match(/\}/g) || []).length;

        if (openBraces > closeBraces) {
          // Multi-line inline option - preserve and track
          inlineOptionBraceDepth = openBraces - closeBraces;
          formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);
          indentLevel++;
          continue;
        }
      }

      // Track message/enum block starts for alignment
      if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
        currentBlockStartLine = i;
      }

      // Check for closing brace
      const startsWithClosingBrace = trimmedLine.startsWith('}');
      if (startsWithClosingBrace && indentLevel > 0) {
        indentLevel--;
      }

      // Format the line with alignment if enabled
      const formattedLine = this.settings.alignFields && alignmentInfo
        ? formatLineWithAlignment(trimmedLine, indentLevel, alignmentInfo.get(currentBlockStartLine), this.settings, line)
        : formatLine(trimmedLine, indentLevel, this.settings, line);
      formattedLines.push(formattedLine);

      // Check for opening brace
      const hasOpeningBrace = trimmedLine.includes('{') && !trimmedLine.includes('}');
      const endsWithOpeningBrace = trimmedLine.endsWith('{');
      if (hasOpeningBrace || endsWithOpeningBrace) {
        indentLevel++;
      }

      // Handle single line with both braces
      if (trimmedLine.includes('{') && trimmedLine.includes('}')) {
        // No change to indent level
      }
    }

    let result = formattedLines.join('\n');

    // Apply renumbering if enabled
    logger.verbose(`Renumbering setting check: renumberOnFormat=${this.settings.renumberOnFormat} (type: ${typeof this.settings.renumberOnFormat})`);
    if (this.settings.renumberOnFormat) {
      logger.verbose('Renumbering enabled, applying field renumbering');
      result = renumberFields(result, this.settings);
    } else {
      logger.verbose('Renumbering disabled, skipping field renumbering');
    }

    return result;
  }

  private formatRangeWithIndent(text: string, startIndentLevel: number): string {
    // Preprocess: join multi-line field declarations (unless preserveMultiLineFields is enabled)
    const preprocessedText = this.settings.preserveMultiLineFields
      ? text
      : this.joinMultiLineFieldDeclarations(text);
    const lines = splitLines(preprocessedText);
    const formattedLines: string[] = [];
    let indentLevel = startIndentLevel;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        formattedLines.push('');
        continue;
      }

      if (trimmedLine.startsWith('}') && indentLevel > 0) {
        indentLevel--;
      }

      formattedLines.push(formatLine(trimmedLine, indentLevel, this.settings, line));

      if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
        indentLevel++;
      }
    }

    return formattedLines.join('\n');
  }

  private getFsPathFromUri(uri?: string): string | undefined {
    if (!uri) {
      return undefined;
    }

    try {
      return URI.parse(uri).fsPath;
    } catch {
      return undefined;
    }
  }

  /**
   * Join multi-line field declarations into single lines.
   * This handles cases where a field declaration is split across multiple lines:
   *   float value =
   *       1;  // comment
   * becomes:
   *   float value = 1;  // comment
   */
  private joinMultiLineFieldDeclarations(text: string): string {
    const lines = splitLines(text);
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Check if this line looks like the start of a multi-line field declaration
      // Pattern: ends with '=' (possibly followed by comment), no semicolon
      const lineWithoutComment = trimmed.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\/$/, '').trim();

      // Check for field-like pattern ending with '='
      // e.g., "float value =", "optional string name =", "repeated int32 ids ="
      const isMultiLineFieldStart = /^(?:optional|required|repeated)?\s*[A-Za-z_][\w<>.,\s]*\s+[A-Za-z_]\w*\s*=$/.test(lineWithoutComment);

      if (isMultiLineFieldStart) {
        // Collect continuation lines until we find the semicolon
        let joinedLine = line;
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j]!;
          const nextTrimmed = nextLine.trim();

          // Skip empty lines
          if (nextTrimmed === '') {
            j++;
            continue;
          }

          // Check if this continuation line has the field number and possibly semicolon
          // Pattern: starts with a number, may have options [...], ends with semicolon
          const continuationMatch = nextTrimmed.match(/^(\d+)\s*(.*?)(;.*)$/);
          if (continuationMatch) {
            // Join the lines: take the first line's content and append the number + rest
            const firstLineTrimmed = line.trimEnd();
            const [, number, options, semicolonAndAfter] = continuationMatch;
            // Preserve any comment from the continuation line
            joinedLine = `${firstLineTrimmed} ${number}${options ? ' ' + options.trim() : ''}${semicolonAndAfter}`;
            i = j; // Skip to after the continuation line
            break;
          }

          // If it's not a valid continuation, stop trying to join
          break;
        }

        result.push(joinedLine);
      } else {
        result.push(line);
      }

      i++;
    }

    return result.join('\n');
  }
}
