/**
 * Server initialization utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import type { IProtoParser } from '../core/parserFactory';
import type { SemanticAnalyzer } from '../core/analyzer';
import { logger } from '../utils/logger';
import { PROTOC_INCLUDE_PATHS, GOOGLE_WELL_KNOWN_TEST_FILE } from '../utils/constants';
import { GOOGLE_WELL_KNOWN_FILES, GOOGLE_WELL_KNOWN_PROTOS } from '../utils/googleWellKnown';

function sanitizePathEntry(rawPath: string | undefined): string | undefined {
  if (!rawPath) {
    return undefined;
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^"(.*)"$/, '$1');
}

function discoverProtocBinaryOnPath(): string | undefined {
  const pathEnv = process.env.PATH;
  if (!pathEnv) {
    return undefined;
  }

  const executableNames =
    process.platform === 'win32' ? ['protoc.exe', 'protoc.cmd', 'protoc.bat', 'protoc'] : ['protoc'];

  for (const pathEntry of pathEnv.split(path.delimiter)) {
    const directory = sanitizePathEntry(pathEntry);
    if (!directory) {
      continue;
    }

    for (const executableName of executableNames) {
      const candidate = path.join(directory, executableName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function deriveIncludeCandidatesFromProtocBinary(protocBinaryPath: string): string[] {
  const binDir = path.dirname(protocBinaryPath);
  const candidates = [path.join(path.dirname(binDir), 'include'), path.join(binDir, 'include')];
  const uniqueCandidates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

/**
 * Locate a protoc include directory that contains google/protobuf/timestamp.proto.
 * Checks env hint, then protoc location on PATH, then common install locations.
 */
export function discoverWellKnownIncludePath(): string | undefined {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: string | undefined): void => {
    const sanitized = sanitizePathEntry(candidate);
    if (!sanitized) {
      return;
    }
    const normalized = path.normalize(sanitized);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(sanitized);
    }
  };

  if (process.env.PROTOC_INCLUDE) {
    for (const envPath of process.env.PROTOC_INCLUDE.split(path.delimiter)) {
      addCandidate(envPath);
    }
  }

  const protocBinaryPath = discoverProtocBinaryOnPath();
  if (protocBinaryPath) {
    for (const includePath of deriveIncludeCandidatesFromProtocBinary(protocBinaryPath)) {
      addCandidate(includePath);
    }
  }

  for (const includePath of PROTOC_INCLUDE_PATHS) {
    addCandidate(includePath);
  }

  for (const base of candidates) {
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
  parser: IProtoParser,
  analyzer: SemanticAnalyzer,
  wellKnownCacheDir?: string
): void {
  const resourcesRoot = path.resolve(process.cwd(), 'resources');

  for (const [importPath, fallbackContent] of Object.entries(GOOGLE_WELL_KNOWN_PROTOS)) {
    const relativePath = GOOGLE_WELL_KNOWN_FILES[importPath];

    // Order: discovered include path (user/system protoc), bundled resource, inline fallback
    const fromDiscovered = discoveredIncludePath ? path.join(discoveredIncludePath, importPath) : undefined;
    const fromResource = relativePath ? path.join(resourcesRoot, relativePath) : undefined;
    const fromCache = wellKnownCacheDir ? path.join(wellKnownCacheDir, importPath) : undefined;

    const firstExisting = [fromDiscovered, fromResource, fromCache].find(p => p && fs.existsSync(p));

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
          error: e,
        });
      }
    }

    const uri = filePath ? pathToFileURL(filePath).toString() : `builtin:///${importPath}`;

    try {
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);
    } catch (e) {
      logger.errorWithContext('Failed to preload well-known proto', {
        uri: importPath,
        error: e,
      });
    }
  }
}
