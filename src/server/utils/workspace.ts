/**
 * Workspace management utilities
 * Handles workspace scanning and file discovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import type { IProtoParser } from '../core/parserFactory';
import type { SemanticAnalyzer } from '../core/analyzer';
import { discoverWorkspaceFilesSync, type WorkspaceFileDiscoveryOptions } from '../../shared/workspaceFileDiscovery';
import { logger } from './logger';
import { getErrorMessage } from './utils';

function toWorkspaceRelative(filePath: string, workspaceFolder: string): string {
  const relative = path.relative(workspaceFolder, filePath);
  if (!relative || relative.startsWith('..')) {
    return filePath;
  }
  return relative.split(path.sep).join('/');
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function reconcileWorkspaceFiles(
  workspaceFolders: string[],
  discoveredUris: ReadonlySet<string>,
  analyzer: SemanticAnalyzer,
  preservedRoots: string[] = []
): string[] {
  const removedUris: string[] = [];

  for (const [uri] of analyzer.getAllFiles()) {
    let filePath: string;
    try {
      const parsedUri = URI.parse(uri);
      if (parsedUri.scheme !== 'file') {
        continue;
      }
      filePath = parsedUri.fsPath;
    } catch {
      continue;
    }

    const belongsToWorkspace = workspaceFolders.some(folder => isPathWithin(folder, filePath));
    const belongsToPreservedRoot = preservedRoots.some(root => isPathWithin(root, filePath));
    if (belongsToWorkspace && !belongsToPreservedRoot && !discoveredUris.has(uri)) {
      analyzer.removeFile(uri);
      removedUris.push(uri);
    }
  }

  analyzer.clearImportResolutionCache();
  return removedUris;
}

/**
 * Recursively find all .proto files in a directory
 * @param dir - The directory to search
 * @param files - Array to collect file paths (for recursion)
 * @param includeHidden - Whether to include hidden directories (e.g., .buf-deps)
 * @returns Array of proto file paths
 */
export function findProtoFiles(
  dir: string,
  files: string[] = [],
  includeHidden: boolean = false,
  options: Pick<WorkspaceFileDiscoveryOptions, 'rootDir' | 'ignorePatterns' | 'useIgnoreFiles'> = {
    rootDir: dir,
    ignorePatterns: [],
    useIgnoreFiles: true,
  }
): string[] {
  const discovered = discoverWorkspaceFilesSync(dir, {
    rootDir: options.rootDir ?? dir,
    ignorePatterns: options.ignorePatterns ?? [],
    includeHidden,
    useIgnoreFiles: options.useIgnoreFiles ?? true,
    fileExtensions: ['.proto'],
    onError: (directory, error) => {
      logger.verbose(`Failed to read directory during workspace scan: ${directory}`, getErrorMessage(error));
    },
  });
  files.push(...discovered);
  return files;
}

/**
 * Scan workspace folders for proto files and parse them
 * @param workspaceFolders - Array of workspace folder paths
 * @param parser - Proto parser instance
 * @param analyzer - Semantic analyzer instance
 * @param protoSrcsDir - Optional subdirectory that scopes proto discovery (e.g., 'protos')
 * @param ignorePatterns - Optional glob/path patterns to exclude from workspace discovery
 */
export function scanWorkspaceForProtoFiles(
  workspaceFolders: string[],
  parser: IProtoParser,
  analyzer: SemanticAnalyzer,
  protoSrcsDir?: string,
  ignorePatterns: string[] = []
): Set<string> {
  logger.info(`Scanning ${workspaceFolders.length} workspace folder(s) for proto files`);
  if (ignorePatterns.length > 0) {
    logger.info(`Workspace discovery ignore patterns: ${ignorePatterns.join(', ')}`);
  }

  let totalFiles = 0;
  let parsedFiles = 0;
  const discoveredUris = new Set<string>();

  for (const folder of workspaceFolders) {
    let scanRoot = folder;
    let scanRootExists = true;

    if (protoSrcsDir) {
      const candidatePath = path.isAbsolute(protoSrcsDir) ? protoSrcsDir : path.join(folder, protoSrcsDir);
      const resolvedCandidatePath = path.resolve(candidatePath);
      const resolvedFolder = path.resolve(folder);
      const relativePath = path.relative(resolvedFolder, resolvedCandidatePath);
      const isInsideWorkspace =
        relativePath === '' ||
        (!path.isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`));

      if (isInsideWorkspace) {
        scanRoot = resolvedCandidatePath;
        analyzer.addProtoRoot(resolvedCandidatePath);
        scanRootExists = fs.existsSync(resolvedCandidatePath);
        if (scanRootExists) {
          logger.info(`Scoped workspace discovery to protoSrcsDir: ${resolvedCandidatePath}`);
        } else {
          logger.verbose(`Proto sources directory does not exist: ${candidatePath}`);
        }
      } else {
        logger.verbose(`Proto sources directory is outside workspace: ${candidatePath}`);
      }
    }

    const protoFiles = scanRootExists
      ? findProtoFiles(scanRoot, [], false, {
          rootDir: folder,
          ignorePatterns,
          useIgnoreFiles: true,
        })
      : [];
    totalFiles += protoFiles.length;

    logger.verbose(`Found ${protoFiles.length} proto file(s) in workspace scan root: ${scanRoot}`);
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
      const uri = URI.file(filePath).toString();
      discoveredUris.add(uri);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
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
  return discoveredUris;
}

/**
 * Scan additional import paths for proto files (e.g., .buf-deps directories)
 * @param importPaths - Array of import paths to scan
 * @param parser - Proto parser instance
 * @param analyzer - Semantic analyzer instance
 */
export function scanImportPaths(importPaths: string[], parser: IProtoParser, analyzer: SemanticAnalyzer): void {
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
      const protoFiles = findProtoFiles(importPath, [], true, { useIgnoreFiles: false });
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
