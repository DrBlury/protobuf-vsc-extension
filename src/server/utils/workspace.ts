/**
 * Workspace management utilities
 * Handles workspace scanning and file discovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { ProtoParser } from '../core/parser';
import { SemanticAnalyzer } from '../core/analyzer';
import { logger } from './logger';
import { getErrorMessage } from './utils';

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
 * @param protoSrcsDir - Optional subdirectory to limit proto file search (e.g., 'protos')
 */
export function scanWorkspaceForProtoFiles(
  workspaceFolders: string[],
  parser: ProtoParser,
  analyzer: SemanticAnalyzer,
  protoSrcsDir?: string
): void {
  logger.info(`Scanning ${workspaceFolders.length} workspace folder(s) for proto files`);

  let totalFiles = 0;
  let parsedFiles = 0;

  for (const folder of workspaceFolders) {
    // If protoSrcsDir is specified, limit search to that subdirectory
    const searchPath = protoSrcsDir ? path.join(folder, protoSrcsDir) : folder;
    
    // Check if the search path exists when protoSrcsDir is specified
    if (protoSrcsDir && !fs.existsSync(searchPath)) {
      logger.verbose(`Proto sources directory does not exist: ${searchPath}`);
      continue;
    }
    
    const protoFiles = findProtoFiles(searchPath);
    totalFiles += protoFiles.length;

    const displayPath = protoSrcsDir ? `${folder}/${protoSrcsDir}` : folder;
    logger.verbose(`Found ${protoFiles.length} proto file(s) in workspace folder: ${displayPath}`);

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
  parser: ProtoParser,
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
