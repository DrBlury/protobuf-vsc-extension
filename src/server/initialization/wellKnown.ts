/**
 * Server initialization utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { ProtoParser } from '../core/parser';
import { SemanticAnalyzer } from '../core/analyzer';
import { logger } from '../utils/logger';
import { PROTOC_INCLUDE_PATHS, GOOGLE_WELL_KNOWN_TEST_FILE } from '../utils/constants';
import { GOOGLE_WELL_KNOWN_FILES, GOOGLE_WELL_KNOWN_PROTOS } from '../utils/googleWellKnown';

/**
 * Locate a protoc include directory that contains google/protobuf/timestamp.proto.
 * Checks env hint then common install locations.
 */
export function discoverWellKnownIncludePath(): string | undefined {
  const candidates: string[] = [];

  if (process.env.PROTOC_INCLUDE) {
    candidates.push(...process.env.PROTOC_INCLUDE.split(path.delimiter));
  }

  candidates.push(...PROTOC_INCLUDE_PATHS);

  for (const base of candidates) {
    if (!base) {
      continue;
    }
    const testPath = path.join(base, GOOGLE_WELL_KNOWN_TEST_FILE);
    if (fs.existsSync(testPath)) {
      logger.debug(`Discovered protoc include path: ${base}`);
      return base;
    }
  }

  return undefined;
}

/**
 * Add minimal built-in definitions for Google well-known protos.
 * This avoids "Unknown type google.protobuf.*" when users import them
 * without having the source files in their workspace.
 */
export function preloadGoogleWellKnownProtos(
  discoveredIncludePath: string | undefined,
  parser: ProtoParser,
  analyzer: SemanticAnalyzer,
  wellKnownCacheDir?: string
): void {
  const resourcesRoot = path.join(__dirname, '..', '..', '..', '..', 'resources');

  for (const [importPath, fallbackContent] of Object.entries(GOOGLE_WELL_KNOWN_PROTOS)) {
    const relativePath = GOOGLE_WELL_KNOWN_FILES[importPath];

    // Order: discovered include path (user/system protoc), bundled resource, inline fallback
    const fromDiscovered = discoveredIncludePath
      ? path.join(discoveredIncludePath, importPath)
      : undefined;
    const fromResource = relativePath ? path.join(resourcesRoot, relativePath) : undefined;
    const fromCache = wellKnownCacheDir ? path.join(wellKnownCacheDir, importPath) : undefined;

    const firstExisting = [fromDiscovered, fromResource, fromCache].find(
      p => p && fs.existsSync(p)
    );

    let filePath = firstExisting;
    let content = filePath ? fs.readFileSync(filePath, 'utf-8') : fallbackContent;

    // If nothing exists yet but we have a cache dir, materialize the fallback into cache
    if (!filePath && fromCache) {
      try {
        fs.mkdirSync(path.dirname(fromCache), { recursive: true });
        fs.writeFileSync(fromCache, fallbackContent, 'utf-8');
        filePath = fromCache;
        content = fallbackContent;
      } catch (e) {
        logger.errorWithContext('Failed to write well-known cache', {
          uri: fromCache,
          error: e
        });
      }
    }

    const uri = filePath
      ? pathToFileURL(filePath).toString()
      : `builtin:///${importPath}`;

    try {
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);
    } catch (e) {
      logger.errorWithContext('Failed to preload well-known proto', {
        uri: importPath,
        error: e
      });
    }
  }
}
