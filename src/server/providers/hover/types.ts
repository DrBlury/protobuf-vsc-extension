/**
 * Types and interfaces for hover provider
 */

import type { MarkupContent } from 'vscode-languageserver/node';
import { MarkupKind } from 'vscode-languageserver/node';

/**
 * Standard hover content factory for markdown
 */
export function createMarkdownHover(lines: string[]): { contents: MarkupContent } {
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join('\n')
    }
  };
}

/**
 * Type for hover handler functions
 */
export type HoverHandler = (word: string, lineText: string) => { contents: MarkupContent } | null;
