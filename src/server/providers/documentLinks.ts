/**
 * Document Links Provider for Protocol Buffers
 * Makes import paths clickable
 */

import type {
  DocumentLink
} from 'vscode-languageserver/node';
import type { ProtoFile } from '../core/ast';
import type { SemanticAnalyzer } from '../core/analyzer';
import * as path from 'path';
import * as fs from 'fs';
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
    const normalizedImport = importPath.replace(/\\/g, '/');

    // Strategy 1: Check configured import paths first
    const importPaths = this.analyzer.getImportPaths();
    for (const importRoot of importPaths) {
      try {
        const candidatePath = path.join(importRoot, normalizedImport);
        if (fs.existsSync(candidatePath)) {
          return URI.file(candidatePath).toString();
        }
      } catch {
        // Continue to next path
      }
    }

    // Strategy 2: Check proto roots (includes protoSrcsDir)
    const protoRoots = this.analyzer.getProtoRoots();
    for (const protoRoot of protoRoots) {
      try {
        const candidatePath = path.join(protoRoot, normalizedImport);
        if (fs.existsSync(candidatePath)) {
          return URI.file(candidatePath).toString();
        }
      } catch {
        // Continue to next path
      }
    }

    // Strategy 3: Check workspace roots
    const workspaceRoots = this.analyzer.getWorkspaceRoots();
    for (const workspaceRoot of workspaceRoots) {
      try {
        const candidatePath = path.join(workspaceRoot, normalizedImport);
        if (fs.existsSync(candidatePath)) {
          return URI.file(candidatePath).toString();
        }
      } catch {
        // Continue to next path
      }
    }

    // Strategy 4: Relative path from current file (original behavior)
    try {
      const currentPath = URI.parse(currentUri).fsPath;
      const currentDir = path.dirname(currentPath);
      const resolvedPath = path.resolve(currentDir, normalizedImport);

      if (resolvedPath && resolvedPath.endsWith('.proto') && fs.existsSync(resolvedPath)) {
        return URI.file(resolvedPath).toString();
      }
    } catch {
      // Ignore errors
    }

    // Strategy 5: Return a guessed path even if file doesn't exist (for user to see where it would be)
    // This helps users understand where the extension is looking
    // Prefer import paths over relative paths for the guess
    if (importPaths.length > 0 && importPaths[0]) {
      try {
        const candidatePath = path.join(importPaths[0], normalizedImport);
        if (candidatePath.endsWith('.proto')) {
          return URI.file(candidatePath).toString();
        }
      } catch {
        // Fall through
      }
    }

    // Fallback to relative path from current file
    try {
      const currentPath = URI.parse(currentUri).fsPath;
      const currentDir = path.dirname(currentPath);
      const resolvedPath = path.resolve(currentDir, normalizedImport);

      if (resolvedPath && resolvedPath.endsWith('.proto')) {
        return URI.file(resolvedPath).toString();
      }
    } catch {
      // Ignore errors
    }

    return undefined;
  }
}
