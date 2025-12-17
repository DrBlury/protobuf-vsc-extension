/**
 * Workspace management utilities
 * Handles workspace scanning and file discovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { IProtoParser } from '../core/parserFactory';
import { SemanticAnalyzer } from '../core/analyzer';
import { logger } from './logger';
import { getErrorMessage } from './utils';

function toWorkspaceRelative(filePath: string, workspaceFolder: string): string {
  const relative = path.relative(workspaceFolder, filePath);
  if (!relative || relative.startsWith('..')) {
    return filePath;
  }
  return relative.split(path.sep).join('/');
}

/**
 * Recursively find all .proto files in a directory
 * @param dir - The directory to search
 * @param files - Array to collect file paths (for recursion)
 * @param includeHidden - Whether to include hidden directories (e.g., .buf-deps)
 * @returns Array of proto file paths
 */
export function findProtoFiles(dir: string, files: string[] = [], includeHidden: boolean = false): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, and optionally skip hidden directories
        const skipHidden = !includeHidden && entry.name.startsWith('.');
        if (!skipHidden && entry.name !== 'node_modules') {
          findProtoFiles(fullPath, files, includeHidden);
        }
      } else if (entry.isFile() && entry.name.endsWith('.proto')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore permission errors, but log in verbose mode
    logger.verbose(`Failed to read directory during workspace scan: ${dir}`, getErrorMessage(error));
  }
  return files;
}

/**
 * Scan workspace folders for proto files and parse them
 * @param workspaceFolders - Array of workspace folder paths
 * @param parser - Proto parser instance
 * @param analyzer - Semantic analyzer instance
 * @param protoSrcsDir - Optional subdirectory to prioritize for proto file search (e.g., 'protos')
 *                       Note: The full workspace is always scanned to discover all proto files,
 *                       but protoSrcsDir is registered as a proto root for import path resolution.
 */
export function scanWorkspaceForProtoFiles(
  workspaceFolders: string[],
  parser: IProtoParser,
  analyzer: SemanticAnalyzer,
  protoSrcsDir?: string
): void {
  logger.info(`Scanning ${workspaceFolders.length} workspace folder(s) for proto files`);

  let totalFiles = 0;
  let parsedFiles = 0;

  for (const folder of workspaceFolders) {
    // Always scan the full workspace to discover all proto files
    // This ensures types in any directory can be found and suggested for import
    const protoFiles = findProtoFiles(folder);
    totalFiles += protoFiles.length;

    logger.verbose(`Found ${protoFiles.length} proto file(s) in workspace folder: ${folder}`);
    const relativePaths = protoFiles
      .map(filePath => toWorkspaceRelative(filePath, folder))
      .sort((a, b) => a.localeCompare(b));

    if (relativePaths.length === 0) {
      logger.info(`No proto files found in workspace folder "${folder}".`);
    } else {
      logger.info(`Proto files found in workspace folder "${folder}":`);
      for (const relPath of relativePaths) {
        const display = relPath.startsWith('.') ? relPath : `./${relPath}`;
        logger.info(`  - ${display}`);
      }
    }

    for (const filePath of protoFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const uri = URI.file(filePath).toString();
        const file = parser.parse(content, uri);
        analyzer.updateFile(uri, file);
        parsedFiles++;
      } catch (error) {
        // Ignore parse errors during initial scan, but log in verbose mode
        logger.verbose(`Failed to parse file during initial scan: ${filePath}`, getErrorMessage(error));
      }
    }

    // If protoSrcsDir is specified, register it as a proto root for import path resolution
    if (protoSrcsDir) {
      const candidatePath = path.join(folder, protoSrcsDir);
      const resolvedCandidatePath = path.resolve(candidatePath);
      const resolvedFolder = path.resolve(folder);

      // Use path.relative to detect path traversal attempts
      const relativePath = path.relative(resolvedFolder, resolvedCandidatePath);
      const normalizedRelative = relativePath.split(path.sep).join('/').split('\\').join('/');

      // Only register if path is valid (not outside workspace) and exists
      if (!(normalizedRelative === '..' || normalizedRelative.startsWith('../'))) {
        if (fs.existsSync(resolvedCandidatePath)) {
          analyzer.addProtoRoot(resolvedCandidatePath);
          logger.info(`Registered proto root from protoSrcsDir: ${resolvedCandidatePath}`);
        } else {
          logger.verbose(`Proto sources directory does not exist: ${candidatePath}`);
        }
      } else {
        logger.verbose(`Proto sources directory is outside workspace: ${candidatePath}`);
      }
    }
  }

  logger.info(`Workspace scan complete: ${parsedFiles}/${totalFiles} proto file(s) parsed successfully`);

  // Refresh proto root hints after full scan
  analyzer.detectProtoRoots();
}

/**
 * Scan additional import paths for proto files (e.g., .buf-deps directories)
 * @param importPaths - Array of import paths to scan
 * @param parser - Proto parser instance
 * @param analyzer - Semantic analyzer instance
 */
export function scanImportPaths(
  importPaths: string[],
  parser: IProtoParser,
  analyzer: SemanticAnalyzer
): void {
  if (importPaths.length === 0) {
    return;
  }

  logger.info(`Scanning ${importPaths.length} import path(s) for proto files`);

  let totalFiles = 0;
  let parsedFiles = 0;

  for (const importPath of importPaths) {
    try {
      if (!fs.existsSync(importPath)) {
        logger.verbose(`Import path does not exist: ${importPath}`);
        continue;
      }

      // Include hidden directories for import paths (e.g., .buf-deps)
      const protoFiles = findProtoFiles(importPath, [], true);
      totalFiles += protoFiles.length;

      logger.verbose(`Found ${protoFiles.length} proto file(s) in import path: ${importPath}`);

      for (const filePath of protoFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const uri = URI.file(filePath).toString();
          const file = parser.parse(content, uri);
          analyzer.updateFile(uri, file);
          parsedFiles++;
        } catch (error) {
          // Ignore parse errors during scan, but log in verbose mode
          logger.verbose(`Failed to parse file during import path scan: ${filePath}`, getErrorMessage(error));
        }
      }
    } catch (error) {
      logger.verbose(`Failed to scan import path: ${importPath}`, getErrorMessage(error));
    }
  }

  if (totalFiles > 0) {
    logger.info(`Import path scan complete: ${parsedFiles}/${totalFiles} proto file(s) parsed successfully`);
    // Refresh proto root hints after scan
    analyzer.detectProtoRoots();
  }
}
