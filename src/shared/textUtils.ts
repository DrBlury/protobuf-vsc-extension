/**
 * Shared text utilities used across client and server
 */

/**
 * Split text into lines, handling both CRLF (\r\n) and LF (\n) line endings.
 * This normalizes line endings for consistent text processing.
 */
export function splitLines(text: string): string[] {
  return text.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * Join lines back into text with LF line endings
 */
export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Get the line at a specific line number (0-indexed)
 */
export function getLineAt(text: string, lineNumber: number): string | undefined {
  const lines = splitLines(text);
  return lines[lineNumber];
}

/**
 * Count the number of lines in text
 */
export function lineCount(text: string): number {
  return splitLines(text).length;
}

/**
 * Get the indentation (leading whitespace) of a line
 */
export function getIndentation(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1]! : '';
}

/**
 * Remove trailing whitespace from each line
 */
export function trimTrailingWhitespace(text: string): string {
  return splitLines(text)
    .map(line => line.trimEnd())
    .join('\n');
}
