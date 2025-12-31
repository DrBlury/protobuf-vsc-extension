/**
 * Document Refresh Utilities
 * Provides functions to refresh document and import state in the analyzer
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { TextDocuments } from 'vscode-languageserver/node';
import type { ProtoFile } from '../core/ast';
import type { IProtoParser } from '../core/parserFactory';
import type { SemanticAnalyzer } from '../core/analyzer';
import type { ContentHashCache} from './cache';
import { simpleHash } from './cache';
import { logger } from './logger';
import { getErrorMessage } from './utils';

/**
 * Refresh a document and its imported documents in the analyzer
 * This ensures the analyzer has up-to-date symbol information
 *
 * @param uri - The URI of the document to refresh
 * @param documents - The document manager
 * @param parser - The proto parser
 * @param analyzer - The semantic analyzer
 * @param cache - The parsed file cache
 * @returns Array of URIs that were refreshed
 */
export function refreshDocumentAndImports(
  uri: string,
  documents: TextDocuments<TextDocument>,
  parser: IProtoParser,
  analyzer: SemanticAnalyzer,
  cache: ContentHashCache<ProtoFile>
): string[] {
  const touchedUris: string[] = [];
  const document = documents.get(uri);

  if (!document) {
    return touchedUris;
  }

  try {
    const documentText = document.getText();
    const contentHash = simpleHash(documentText);

    const cachedParsed = cache.get(uri, contentHash);
    let parsed: ProtoFile;
    if (!cachedParsed) {
      parsed = parser.parse(documentText, uri);
      cache.set(uri, parsed, contentHash);
    } else {
      parsed = cachedParsed;
    }

    analyzer.updateFile(uri, parsed);
    touchedUris.push(uri);

    // Refresh imported documents
    const imports = analyzer.getImportedFileUris(uri);
    for (const importUri of imports) {
      const importedDoc = documents.get(importUri);
      if (!importedDoc) {
        continue;
      }

      try {
        const importedText = importedDoc.getText();
        const importedHash = simpleHash(importedText);

        const cachedImported = cache.get(importUri, importedHash);
        let importedParsed: ProtoFile;
        if (!cachedImported) {
          importedParsed = parser.parse(importedText, importUri);
          cache.set(importUri, importedParsed, importedHash);
        } else {
          importedParsed = cachedImported;
        }

        analyzer.updateFile(importUri, importedParsed);
        touchedUris.push(importUri);
      } catch (importParseErr) {
        logger.debug(`Import parse failed: ${importUri}`, getErrorMessage(importParseErr));
      }
    }
  } catch (parseErr) {
    logger.debug(`Document parse failed: ${uri}`, getErrorMessage(parseErr));
  }

  return touchedUris;
}
