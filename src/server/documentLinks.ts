/**
 * Document Links Provider for Protocol Buffers
 * Makes import paths clickable
 */

import {
  DocumentLink,
  Range
} from 'vscode-languageserver/node';
import { ProtoFile, ImportStatement } from './ast';
import { SemanticAnalyzer } from './analyzer';
import * as path from 'path';
import { URI } from 'vscode-uri';

export class DocumentLinksProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getDocumentLinks(uri: string, file: ProtoFile): DocumentLink[] {
    const links: DocumentLink[] = [];

    for (const imp of file.imports) {
      const resolvedUri = this.analyzer.resolveImportToUri(uri, imp.path);
      if (resolvedUri) {
        links.push({
          range: {
            start: { line: imp.range.start.line, character: imp.range.start.character },
            end: { line: imp.range.end.line, character: imp.range.end.character }
          },
          target: resolvedUri,
          tooltip: `Open ${imp.path}`
        });
      } else {
        // Still create a link even if unresolved, might help with navigation
        const possiblePath = this.guessImportPath(uri, imp.path);
        if (possiblePath) {
          links.push({
            range: {
              start: { line: imp.range.start.line, character: imp.range.start.character },
              end: { line: imp.range.end.line, character: imp.range.end.character }
            },
            target: possiblePath,
            tooltip: `Try to open ${imp.path} (unresolved)`
          });
        }
      }
    }

    return links;
  }

  private guessImportPath(currentUri: string, importPath: string): string | undefined {
    try {
      const currentPath = URI.parse(currentUri).fsPath;
      const currentDir = path.dirname(currentPath);
      const resolvedPath = path.resolve(currentDir, importPath);

      if (resolvedPath && resolvedPath.endsWith('.proto')) {
        return URI.file(resolvedPath).toString();
      }
    } catch (_e) {
      // Ignore errors
    }
    return undefined;
  }
}
