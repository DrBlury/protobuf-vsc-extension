/**
 * Definition Handler
 * Handles go-to-definition requests
 */

import type {
  DefinitionParams,
  Location,
  LocationLink
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { DefinitionProvider } from '../providers/definition';
import type { IProtoParser } from '../core/parserFactory';
import type { SemanticAnalyzer } from '../core/analyzer';
import type { ProtoFile } from '../core/ast';
import type { ContentHashCache } from '../utils/cache';
import { refreshDocumentAndImports } from '../utils/documentRefresh';
import { logger } from '../utils/logger';

/**
 * Extracts an identifier (word) at the given character position in a line.
 * Handles protobuf identifiers which may contain letters, numbers, underscores, and dots.
 *
 * @param line - The line of text to search in
 * @param character - The character position to extract the identifier from
 * @returns The extracted identifier, or null if no identifier is found at the position
 */
export function extractIdentifierAtPosition(line: string, character: number): string | null {
  const isIdentifierChar = (ch: string): boolean => /[a-zA-Z0-9_.]/.test(ch) || ch === '_';

  let startIndex = character;
  let endIndex = character;

  // If cursor is at a non-identifier character but immediately after one, move back
  if (startIndex > 0 && !isIdentifierChar(line[startIndex]!) && isIdentifierChar(line[startIndex - 1]!)) {
    startIndex -= 1;
    endIndex = startIndex;
  }

  // Expand backwards to find the start of the identifier
  while (startIndex > 0 && isIdentifierChar(line[startIndex - 1]!)) {
    startIndex--;
  }

  // Expand forwards to find the end of the identifier
  while (endIndex < line.length && isIdentifierChar(line[endIndex]!)) {
    endIndex++;
  }

  if (startIndex === endIndex) {
    return null;
  }

  // Remove trailing dots (handles cases like "package.Type.")
  return line.substring(startIndex, endIndex).replace(/\.+$/g, '');
}

/**
 * Handle definition request
 */
export function handleDefinition(
  params: DefinitionParams,
  documents: TextDocuments<TextDocument>,
  definitionProvider: DefinitionProvider,
  parser: IProtoParser,
  analyzer: SemanticAnalyzer,
  parsedFileCache: ContentHashCache<ProtoFile>
): Location | Location[] | LocationLink[] | null {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const lines = document.getText().split('\n');
    const lineText = lines[params.position.line] || '';

    const identifier = extractIdentifierAtPosition(lineText, params.position.character);

    // Refresh analyzer state for this document and its open imports to avoid stale symbols
    const touchedUris = refreshDocumentAndImports(
      params.textDocument.uri,
      documents,
      parser,
      analyzer,
      parsedFileCache
    );

    // Log incoming definition request for diagnostics
    logger.debug(
      `Definition request: uri=${params.textDocument.uri} line=${params.position.line} char=${params.position.character} identifier=${identifier || '<none>'}`
    );

    const result = definitionProvider.getDefinition(
      params.textDocument.uri,
      params.position,
      lineText
    );

    if (result) {
      const locations = Array.isArray(result) ? result : [result];
      for (const loc of locations) {
        logger.debug(`Definition resolved: ${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`);
      }
    } else {
      logger.debug(`Definition resolved: null (symbols=${analyzer.getAllSymbols().length}, touched=${touchedUris.length})`);
    }
    return result;
  } catch (error) {
    logger.errorWithContext('Definition handler failed', {
      uri: params.textDocument.uri,
      position: params.position,
      error
    });
    return null;
  }
}
