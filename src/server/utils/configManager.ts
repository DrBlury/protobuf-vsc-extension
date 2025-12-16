/**
 * Configuration Manager
 * Handles loading and updating configuration settings
 */

import * as fs from 'fs';
import * as path from 'path';
import { LogLevel } from './logger';
import { logger } from './logger';
import { Settings } from './types';
import { DiagnosticsProvider } from '../providers/diagnostics';
import { ProtoFormatter } from '../providers/formatter';
import { RenumberProvider } from '../providers/renumber';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtocCompiler } from '../services/protoc';
import { BreakingChangeDetector } from '../services/breaking';
import { ExternalLinterProvider } from '../services/externalLinter';
import { ClangFormatProvider } from '../services/clangFormat';
import { bufConfigProvider } from '../services/bufConfig';
import { GOOGLE_WELL_KNOWN_TEST_FILE } from './constants';

/**
 * Map string log level to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
  verbose: LogLevel.VERBOSE
};

/**
 * Check if a directory contains google well-known protos.
 * This is used to detect when user provides their own google/protobuf protos
 * (e.g., from nanopb) so we can skip adding system/bundled protos.
 */
function containsGoogleProtos(includePath: string): boolean {
  try {
    const testFile = path.join(includePath, GOOGLE_WELL_KNOWN_TEST_FILE);
    return fs.existsSync(testFile);
  } catch {
    return false;
  }
}

/**
 * Expands VS Code variables like ${workspaceFolder} in a path
 */
function expandVariables(value: string, workspaceFolders: string[]): string {
  // Use the first workspace folder for ${workspaceFolder}
  const workspaceFolder = workspaceFolders[0] || '';
  const workspaceFolderBasename = workspaceFolder ? path.basename(workspaceFolder) : '';
  return value
    .replace(/\$\{workspaceRoot\}/g, workspaceFolder)
    .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
    .replace(/\$\{workspaceFolderBasename\}/g, workspaceFolderBasename)
    .replace(/\$\{env(?::|\.)([^}]+)\}/g, (_: string, name: string) => process.env[name] || '');
}

function expandPathSetting(value: string | undefined, workspaceFolders: string[]): string | undefined {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return expandVariables(trimmed, workspaceFolders);
}

function findExistingConfig(base: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const resolved = path.join(base, candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return undefined;
}

function collectWorkspaceBufIncludes(workspaceFolders: string[]): string[] {
  const includeSet = new Set<string>();

  for (const folder of workspaceFolders) {
    if (!folder) {
      continue;
    }

    const bufConfigPath = findExistingConfig(folder, ['buf.yaml', 'buf.yml']);
    if (bufConfigPath) {
      try {
        const roots = bufConfigProvider.getProtoRoots(bufConfigPath);
        for (const root of roots) {
          includeSet.add(path.normalize(root));
        }
      } catch {
        // ignore parse errors and continue collecting
      }
    }

    const bufWorkPath = findExistingConfig(folder, ['buf.work.yaml', 'buf.work.yml']);
    if (bufWorkPath) {
      try {
        const directories = bufConfigProvider.getWorkDirectories(bufWorkPath);
        for (const dir of directories) {
          includeSet.add(path.normalize(dir));
        }
      } catch {
        // ignore parse errors and continue collecting
      }
    }
  }

  return Array.from(includeSet);
}

function extractProtoPathOptions(options: string[] | undefined): string[] {
  if (!options || options.length === 0) {
    return [];
  }

  const protoPaths: string[] = [];

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (!option) {
      continue;
    }

    if (option.startsWith('--proto_path=')) {
      protoPaths.push(option.substring('--proto_path='.length));
      continue;
    }

    if (option === '--proto_path' || option === '-I') {
      const next = options[i + 1];
      if (next) {
        protoPaths.push(next);
        i++;
      }
      continue;
    }

    if (option.startsWith('-I') && option.length > 2) {
      protoPaths.push(option.substring(2));
    }
  }

  return protoPaths;
}

/**
 * Updates all providers with new settings
 * @returns An object containing the expanded include paths and protoSrcsDir
 */
export function updateProvidersWithSettings(
  settings: Settings,
  diagnosticsProvider: DiagnosticsProvider,
  formatter: ProtoFormatter,
  renumberProvider: RenumberProvider,
  analyzer: SemanticAnalyzer,
  protocCompiler: ProtocCompiler,
  breakingChangeDetector: BreakingChangeDetector,
  externalLinter: ExternalLinterProvider,
  clangFormat: ClangFormatProvider,
  wellKnownIncludePath: string | undefined,
  wellKnownCacheDir: string | undefined,
  workspaceFolders: string[] = [],
  codeActionsProvider?: import('../providers/codeActions').CodeActionsProvider
): { includePaths: string[]; protoSrcsDir: string } {
  // Update diagnostics settings
  const diag = settings.protobuf.diagnostics;
  const diagSettings = {
    namingConventions: diag.namingConventions,
    referenceChecks: diag.referenceChecks,
    importChecks: diag.importChecks,
    fieldTagChecks: diag.fieldTagChecks,
    duplicateFieldChecks: diag.duplicateFieldChecks,
    discouragedConstructs: diag.discouragedConstructs,
    deprecatedUsage: diag.deprecatedUsage ?? true,
    unusedSymbols: diag.unusedSymbols ?? false,
    circularDependencies: diag.circularDependencies ?? true,
    documentationComments: diag.documentationComments ?? true
  };
  diagnosticsProvider.updateSettings(diagSettings);
  logger.info(`Diagnostics settings: enabled=${diag.enabled}, fieldTagChecks=${diagSettings.fieldTagChecks}, duplicateFieldChecks=${diagSettings.duplicateFieldChecks}`);

  // Update formatter settings
  const formatterSettings = {
    indentSize: settings.protobuf.indentSize,
    useTabIndent: settings.protobuf.useTabIndent,
    maxLineLength: settings.protobuf.maxLineLength,
    renumberOnFormat: settings.protobuf.renumber.onFormat,
    renumberStartNumber: settings.protobuf.renumber.startNumber,
    renumberIncrement: settings.protobuf.renumber.increment,
    preset: settings.protobuf.formatter?.preset as 'minimal' | 'google' | 'buf' | 'custom',
    alignFields: settings.protobuf.formatter?.alignFields,
    preserveMultiLineFields: settings.protobuf.formatter?.preserveMultiLineFields
  };
  formatter.updateSettings(formatterSettings);
  // Pass clangFormat.enabled to formatter so it can use clang-format even without preset='google'
  formatter.setClangFormatEnabled(settings.protobuf.clangFormat.enabled);
  logger.info(`Formatter settings updated: renumberOnFormat=${formatterSettings.renumberOnFormat}, preset=${formatterSettings.preset}, alignFields=${formatterSettings.alignFields}, preserveMultiLineFields=${formatterSettings.preserveMultiLineFields}, clangFormatEnabled=${settings.protobuf.clangFormat.enabled}`);

  // Update code actions settings
  if (codeActionsProvider) {
    const codeActionsSettings = {
      renumberOnFormat: settings.protobuf.renumber.onFormat,
      formatterEnabled: settings.protobuf.formatter?.enabled ?? true
    };
    codeActionsProvider.updateSettings(codeActionsSettings);
    logger.info(`Code actions settings updated: renumberOnFormat=${codeActionsSettings.renumberOnFormat}, formatterEnabled=${codeActionsSettings.formatterEnabled}`);
  }

  // Update renumber settings
  const renumberSettings = settings.protobuf.renumber;
  renumberProvider.updateSettings({
    startNumber: renumberSettings.startNumber,
    increment: renumberSettings.increment,
    preserveReserved: renumberSettings.preserveReserved,
    skipReservedRange: renumberSettings.skipInternalRange
  });

  // Update analyzer with import paths (expand variables like ${workspaceFolder})
  const workspaceBufIncludes = collectWorkspaceBufIncludes(workspaceFolders);
  const protoPathIncludes = extractProtoPathOptions(settings.protobuf.protoc?.options).map(p => p.trim()).filter(Boolean);
  const rawIncludePaths = [
    ...workspaceBufIncludes,
    ...protoPathIncludes,
    ...(settings.protobuf.includes || [])
  ];

  const includePaths: string[] = [];
  const seenPaths = new Set<string>();
  let userHasGoogleProtos = false;

  for (const rawPath of rawIncludePaths) {
    if (!rawPath) {
      continue;
    }
    const expanded = expandVariables(rawPath, workspaceFolders);
    if (!expanded) {
      continue;
    }
    const normalized = path.normalize(expanded);
    if (!seenPaths.has(normalized)) {
      seenPaths.add(normalized);
      includePaths.push(expanded);

      // Check if user provides their own google protos (e.g., from nanopb)
      if (containsGoogleProtos(expanded)) {
        userHasGoogleProtos = true;
        logger.info(`User-supplied google protos detected in: ${expanded}`);
      }
    }
  }

  // Only add well-known paths if user hasn't provided their own google protos
  // This prevents duplicate google/protobuf imports when user has e.g. nanopb's protos
  if (userHasGoogleProtos) {
    logger.info('Skipping system/bundled well-known protos since user provides their own google/protobuf files');
  } else {
    if (wellKnownIncludePath) {
      const normalized = path.normalize(wellKnownIncludePath);
      if (!seenPaths.has(normalized)) {
        includePaths.push(wellKnownIncludePath);
        seenPaths.add(normalized);
      }
    }

    if (wellKnownCacheDir) {
      const normalized = path.normalize(wellKnownCacheDir);
      if (!seenPaths.has(normalized)) {
        includePaths.push(wellKnownCacheDir);
        seenPaths.add(normalized);
      }
    }
  }

  analyzer.setImportPaths(includePaths);

  // Update protoc compiler settings
  const protocSettings = settings.protobuf.protoc;
  const expandedProtocPath = expandPathSetting(protocSettings.path, workspaceFolders);
  const expandedCompileAllPath = expandPathSetting(protocSettings.compileAllPath, workspaceFolders);
  protocCompiler.updateSettings({
    path: expandedProtocPath || protocSettings.path,
    compileOnSave: protocSettings.compileOnSave,
    compileAllPath: expandedCompileAllPath || protocSettings.compileAllPath,
    useAbsolutePath: protocSettings.useAbsolutePath,
    options: protocSettings.options,
    excludePatterns: protocSettings.excludePatterns || []
  });

  // Update breaking change detector settings
  const breakingSettings = settings.protobuf.breaking;
  const expandedBreakingFilePath = expandPathSetting(breakingSettings.againstFilePath, workspaceFolders);
  breakingChangeDetector.updateSettings({
    enabled: breakingSettings.enabled,
    againstStrategy: breakingSettings.againstStrategy as 'git' | 'file' | 'none',
    againstGitRef: breakingSettings.againstGitRef,
    againstFilePath: expandedBreakingFilePath || breakingSettings.againstFilePath
  });

  // Update external linter settings
  const linterSettings = settings.protobuf.externalLinter;
  const expandedLinterBufPath = expandPathSetting(linterSettings.bufPath, workspaceFolders);
  const expandedProtolintPath = expandPathSetting(linterSettings.protolintPath, workspaceFolders);
  const expandedBufConfigPath = expandPathSetting(linterSettings.bufConfigPath, workspaceFolders);
  const expandedProtolintConfigPath = expandPathSetting(linterSettings.protolintConfigPath, workspaceFolders);
  externalLinter.updateSettings({
    enabled: linterSettings.enabled,
    linter: linterSettings.linter as 'buf' | 'protolint' | 'none',
    bufPath: expandedLinterBufPath || linterSettings.bufPath,
    protolintPath: expandedProtolintPath || linterSettings.protolintPath,
    bufConfigPath: expandedBufConfigPath || linterSettings.bufConfigPath,
    protolintConfigPath: expandedProtolintConfigPath || linterSettings.protolintConfigPath,
    runOnSave: linterSettings.runOnSave
  });

  const configuredBufPath = expandPathSetting(settings.protobuf.buf?.path?.trim(), workspaceFolders);
  const resolvedBufPath = configuredBufPath || expandedLinterBufPath;
  if (resolvedBufPath) {
    formatter.setBufPath(resolvedBufPath);
  }

  // Update clang-format settings
  const clangSettings = settings.protobuf.clangFormat;
  const expandedClangPath = expandPathSetting(clangSettings.path, workspaceFolders);
  const expandedClangConfigPath = expandPathSetting(clangSettings.configPath, workspaceFolders);
  const resolvedClangPath = expandedClangPath || clangSettings.path || 'clang-format';
  clangFormat.updateSettings({
    enabled: clangSettings.enabled,
    path: resolvedClangPath,
    style: clangSettings.style,
    fallbackStyle: clangSettings.fallbackStyle,
    configPath: expandedClangConfigPath || clangSettings.configPath
  });

  if (clangSettings.enabled) {
    const configuredPath = clangSettings.path?.trim() || 'clang-format';
    const usedPath = resolvedClangPath;
    let pathDetails = 'resolved via PATH';
    if (path.isAbsolute(usedPath)) {
      pathDetails = fs.existsSync(usedPath) ? 'exists' : 'missing on disk';
    } else if (usedPath !== 'clang-format') {
      pathDetails = 'relative path';
    }

    const expansionInfo = expandedClangPath && clangSettings.path
      ? ` (expanded from "${clangSettings.path}")`
      : '';

    const configPathInfo = expandedClangConfigPath
      ? `, configPath="${expandedClangConfigPath}"`
      : '';

    logger.info(
      `clang-format enabled. configured="${configuredPath}" resolved="${usedPath}"${expansionInfo} (${pathDetails}). style=${clangSettings.style || 'file'}, fallback=${clangSettings.fallbackStyle || 'Google'}${configPathInfo}`
    );

    logger.verboseWithContext('clang-format configuration expanded', {
      operation: 'config',
      configuredPath,
      expandedPath: expandedClangPath,
      resolvedPath: resolvedClangPath,
      configPath: expandedClangConfigPath || clangSettings.configPath || '(auto-detect)',
      workspaceFolders: workspaceFolders.join(', ') || '(none)',
      style: clangSettings.style,
      fallbackStyle: clangSettings.fallbackStyle
    });
  } else {
    logger.info('clang-format disabled. Built-in formatter will handle proto files unless buf preset is selected.');
    logger.verboseWithContext('clang-format disabled configuration snapshot', {
      operation: 'config',
      configuredPath: clangSettings.path,
      style: clangSettings.style,
      fallbackStyle: clangSettings.fallbackStyle,
      configPath: clangSettings.configPath
    });
  }

  // Update logger with debug settings
  const debugSettings = settings.protobuf.debug;
  if (debugSettings) {
    logger.setVerboseLogging(debugSettings.verboseLogging || false);

    const level = LOG_LEVEL_MAP[debugSettings.logLevel?.toLowerCase() || 'info'] || LogLevel.INFO;
    logger.setLevel(level);

    if (debugSettings.verboseLogging) {
      logger.info('Verbose logging enabled - all operations will be logged in detail');
    }
  }

  // Expand protoSrcsDir with variable substitution
  const protoSrcsDir = expandVariables(settings.protobuf.protoSrcsDir || '', workspaceFolders);

  logger.info('Tool configuration summary:');
  logger.info(`  protoc.path: ${expandedProtocPath || protocSettings.path || 'protoc'}`);
  logger.info(`  protoc.compileOnSave: ${protocSettings.compileOnSave}`);
  logger.info(`  buf.path: ${resolvedBufPath ?? 'not configured'}`);
  logger.info(`  externalLinter.enabled: ${linterSettings.enabled} (linter=${linterSettings.linter})`);
  logger.info(`  externalLinter.bufConfigPath: ${expandedBufConfigPath || linterSettings.bufConfigPath || 'not configured'}`);
  logger.info(`  externalLinter.protolintPath: ${expandedProtolintPath || linterSettings.protolintPath || 'not configured'}`);
  logger.info(`  externalLinter.protolintConfigPath: ${expandedProtolintConfigPath || linterSettings.protolintConfigPath || 'not configured'}`);
  logger.info(`  clangFormat.path: ${resolvedClangPath} (enabled=${clangSettings.enabled})`);
  logger.info(`  includePaths: ${includePaths.join(', ') || '(none)'}`);
  logger.info(`  protoSrcsDir: ${protoSrcsDir || '(workspace root)'}`);

  // Return the user-configured include paths (expanded) and protoSrcsDir for scanning
  // Note: includePaths already computed above with variable expansion
  return {
    includePaths: includePaths.filter(p => p !== wellKnownIncludePath && p !== wellKnownCacheDir),
    protoSrcsDir
  };
}
