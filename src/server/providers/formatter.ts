/**
 * Code Formatter for Protocol Buffers
 */

import type { TextEdit } from 'vscode-languageserver/node';
import { Range } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import type { ClangFormatProvider } from '../services/clangFormat';
import type { BufFormatProvider } from '../services/bufFormat';
import { logger } from '../utils/logger';
import { splitLines } from '../../shared/textUtils';
import type { FormatterSettings, AlignmentData } from './formatter/types';
import { DEFAULT_SETTINGS } from './formatter/types';
import { calculateAlignmentInfo } from './formatter/alignment';
import { getIndent, formatLine, formatLineWithAlignment, formatOptionLine } from './formatter/lineFormatting';
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
        logger.warn(
          'clang-format failed or is not available. Falling back to minimal formatter. Check that clang-format is installed and the path is correct in settings.'
        );
        this.clangFormatWarningShown = true;
      }
    }

    if (this.settings.preset === 'buf' && this.bufFormat) {
      const filePath = this.getFsPathFromUri(uri);
      const formatted = await this.bufFormat.format(text, filePath);
      if (formatted) {
        const lines = splitLines(text);
        return [
          {
            range: Range.create(0, 0, lines.length - 1, lines[lines.length - 1]!.length),
            newText: formatted,
          },
        ];
      }
      // buf format failed - log warning once
      if (!this.bufFormatWarningShown) {
        logger.warn(
          'Formatter preset is "buf" but buf format failed or is not available. Falling back to minimal formatter. Check that buf is installed and the path is correct in settings.'
        );
        this.bufFormatWarningShown = true;
      }
    }

    const formatted = this.format(text);
    const lines = splitLines(text);

    return [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: lines.length - 1, character: lines[lines.length - 1]!.length },
        },
        newText: formatted,
      },
    ];
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

    return [
      {
        range: {
          start: { line: startLine, character: 0 },
          end: { line: endLine, character: lines[endLine]!.length },
        },
        newText: formatted,
      },
    ];
  }

  private format(text: string): string {
    // Preprocess: join multi-line field declarations (unless preserveMultiLineFields is enabled)
    // This handles cases like:
    //   float value =
    //       1;  // comment
    // Which should become:
    //   float value = 1;  // comment
    const preprocessedText = this.settings.preserveMultiLineFields ? text : this.joinMultiLineFieldDeclarations(text);
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
    // Track depth inside multi-line field options [...] without braces
    let inlineOptionBracketDepth = 0;

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

      // Preserve line comments without affecting indentation state
      if (trimmedLine.startsWith('//')) {
        const formattedLine =
          this.settings.alignFields && alignmentInfo
            ? formatLineWithAlignment(trimmedLine, indentLevel, alignmentInfo.get(i), this.settings, line)
            : formatLine(trimmedLine, indentLevel, this.settings, line);
        formattedLines.push(formattedLine);
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

        // Format option block lines with alignment if enabled (now using line-based lookup)
        const formattedLine =
          this.settings.alignFields && alignmentInfo
            ? formatOptionLine(trimmedLine, indentLevel, alignmentInfo.get(i), this.settings)
            : formatLine(trimmedLine, indentLevel, this.settings);
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
        let remainingClose = Math.max(0, closeBraces - openBraces);

        // Adjust indent for closing brace
        if (remainingClose > 0 && trimmedLine.startsWith('}') && indentLevel > 0) {
          const adjust = Math.min(remainingClose, indentLevel);
          indentLevel -= adjust;
          remainingClose -= adjust;
        }

        formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);

        // Adjust indent for opening brace
        if (openBraces > closeBraces) {
          indentLevel += openBraces - closeBraces;
        } else if (remainingClose > 0 && indentLevel > 0) {
          // Closing brace not at line start - reduce indent for subsequent lines
          indentLevel = Math.max(0, indentLevel - remainingClose);
        }

        inlineOptionBraceDepth += openBraces - closeBraces;
        continue;
      }

      // Track multi-line field options with brackets only (no braces)
      if (inlineOptionBracketDepth > 0) {
        const openBrackets = (trimmedLine.match(/\[/g) || []).length;
        const closeBrackets = (trimmedLine.match(/\]/g) || []).length;
        let remainingClose = Math.max(0, closeBrackets - openBrackets);

        // Adjust indent for closing bracket
        if (remainingClose > 0 && trimmedLine.startsWith(']') && indentLevel > 0) {
          const adjust = Math.min(remainingClose, indentLevel);
          indentLevel -= adjust;
          remainingClose -= adjust;
        }

        formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);

        // Adjust indent for opening bracket
        if (openBrackets > closeBrackets) {
          indentLevel += openBrackets - closeBrackets;
        } else if (remainingClose > 0 && indentLevel > 0) {
          // Closing bracket not at line start - reduce indent for subsequent lines
          indentLevel = Math.max(0, indentLevel - remainingClose);
        }

        inlineOptionBracketDepth += openBrackets - closeBrackets;
        continue;
      }

      // Check if this line starts an option with an opening brace
      if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;
        optionBraceDepth = openBraces - closeBraces;

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

      // Check if this line has multi-line field options with brackets only (no braces inside)
      // e.g., "int32 field = 1 [" followed by "(tag1) = true," on the next line
      if (trimmedLine.includes('[') && !trimmedLine.includes('{')) {
        const openBrackets = (trimmedLine.match(/\[/g) || []).length;
        const closeBrackets = (trimmedLine.match(/\]/g) || []).length;

        if (openBrackets > closeBrackets) {
          // Multi-line bracket option - preserve and track
          inlineOptionBracketDepth = openBrackets - closeBrackets;
          formattedLines.push(getIndent(indentLevel, this.settings) + trimmedLine);
          indentLevel++;
          continue;
        }
      }

      // Check for closing brace
      const startsWithClosingBrace = trimmedLine.startsWith('}');
      if (startsWithClosingBrace && indentLevel > 0) {
        indentLevel--;
      }

      // Format the line with alignment if enabled (now using line-based lookup for gofmt-style grouping)
      const formattedLine =
        this.settings.alignFields && alignmentInfo
          ? formatLineWithAlignment(trimmedLine, indentLevel, alignmentInfo.get(i), this.settings, line)
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

    const normalizedLines = this.applyVerticalSpacingRules(formattedLines);
    let result = normalizedLines.join('\n');

    // Apply renumbering if enabled
    logger.verbose(
      `Renumbering setting check: renumberOnFormat=${this.settings.renumberOnFormat} (type: ${typeof this.settings.renumberOnFormat})`
    );
    if (this.settings.renumberOnFormat) {
      logger.verbose('Renumbering enabled, applying field renumbering');
      result = renumberFields(result, this.settings);
    } else {
      logger.verbose('Renumbering disabled, skipping field renumbering');
    }

    // Defensive: ensure no stray \r characters in output
    // This prevents corruption when the output is applied to a CRLF document
    result = result.replace(/\r/g, '');

    return result;
  }

  private formatRangeWithIndent(text: string, startIndentLevel: number): string {
    // Preprocess: join multi-line field declarations (unless preserveMultiLineFields is enabled)
    const preprocessedText = this.settings.preserveMultiLineFields ? text : this.joinMultiLineFieldDeclarations(text);
    const lines = splitLines(preprocessedText);
    const formattedLines: string[] = [];
    let indentLevel = startIndentLevel;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        formattedLines.push('');
        continue;
      }

      if (trimmedLine.startsWith('//')) {
        formattedLines.push(formatLine(trimmedLine, indentLevel, this.settings, line));
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

    // Defensive: ensure no stray \r characters in output
    return formattedLines.join('\n').replace(/\r/g, '');
  }

  private applyVerticalSpacingRules(lines: string[]): string[] {
    let result = [...lines];

    if (this.settings.insertEmptyLineBetweenDefinitions !== false) {
      result = this.ensureBlankLineBetweenTopLevelDefinitions(result);
    }

    const maxEmptyLines = this.settings.maxEmptyLines ?? DEFAULT_SETTINGS.maxEmptyLines ?? 0;
    result = this.collapseEmptyLines(result, maxEmptyLines);

    return result;
  }

  private ensureBlankLineBetweenTopLevelDefinitions(lines: string[]): string[] {
    const ranges = this.findTopLevelDefinitionRanges(lines);
    if (ranges.length < 2) {
      return lines;
    }

    const insertBefore = new Set<number>();

    for (let i = 0; i < ranges.length - 1; i++) {
      const current = ranges[i]!;
      const next = ranges[i + 1]!;
      const between = lines.slice(current.end + 1, next.start);
      const hasEmptyLine = between.some(line => line.trim() === '');

      if (!hasEmptyLine) {
        insertBefore.add(next.start);
      }
    }

    if (insertBefore.size === 0) {
      return lines;
    }

    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (insertBefore.has(i)) {
        result.push('');
      }
      result.push(lines[i]!);
    }

    return result;
  }

  private findTopLevelDefinitionRanges(lines: string[]): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    let depth = 0;
    let current: { start: number; end: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      const isComment = this.isCommentLine(trimmed);

      if (!isComment && depth === 0 && /^(message|enum|service)\s+\w+/.test(trimmed)) {
        const start = this.includeLeadingComments(lines, i);
        current = { start, end: i };
      }

      const openBraces = isComment ? 0 : (trimmed.match(/\{/g) || []).length;
      const closeBraces = isComment ? 0 : (trimmed.match(/\}/g) || []).length;
      depth += openBraces - closeBraces;

      if (current) {
        current.end = i;
        if (depth <= 0) {
          ranges.push(current);
          current = null;
          depth = Math.max(0, depth);
        }
      }
    }

    return ranges;
  }

  private includeLeadingComments(lines: string[], definitionIndex: number): number {
    let start = definitionIndex;

    for (let i = definitionIndex - 1; i >= 0; i--) {
      const trimmed = lines[i]!.trim();

      if (trimmed === '') {
        break;
      }

      if (this.isCommentLine(trimmed)) {
        start = i;
        continue;
      }

      break;
    }

    return start;
  }

  private isCommentLine(trimmedLine: string): boolean {
    return (
      trimmedLine.startsWith('//') ||
      trimmedLine.startsWith('/*') ||
      trimmedLine.startsWith('*') ||
      trimmedLine.startsWith('*/')
    );
  }

  private collapseEmptyLines(lines: string[], maxEmptyLines: number): string[] {
    const limit = Math.max(0, maxEmptyLines);
    const result: string[] = [];
    let emptyCount = 0;

    for (const line of lines) {
      if (line.trim() === '') {
        if (emptyCount < limit) {
          result.push('');
        }
        emptyCount++;
      } else {
        emptyCount = 0;
        result.push(line);
      }
    }

    return result;
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
      const lineWithoutComment = trimmed
        .replace(/\/\/.*$/, '')
        .replace(/\/\*.*?\*\/$/, '')
        .trim();

      // Check for field-like pattern ending with '='
      // e.g., "float value =", "optional string name =", "repeated int32 ids ="
      const isMultiLineFieldStart = /^(?:optional|required|repeated)?\s*[A-Za-z_][\w<>.,\s]*\s+[A-Za-z_]\w*\s*=$/.test(
        lineWithoutComment
      );

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
