/**
 * Configuration Manager
 * Handles loading and updating configuration settings
 */

import { LogLevel } from './logger';
import { logger } from './logger';
import { Settings, defaultSettings } from './types';
import { DiagnosticsProvider } from '../providers/diagnostics';
import { ProtoFormatter } from '../providers/formatter';
import { RenumberProvider } from '../providers/renumber';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtocCompiler } from '../services/protoc';
import { BreakingChangeDetector } from '../services/breaking';
import { ExternalLinterProvider } from '../services/externalLinter';
import { ClangFormatProvider } from '../services/clangFormat';

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
 * Updates all providers with new settings
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
  wellKnownCacheDir: string | undefined
): void {
  // Update diagnostics settings
  const diag = settings.protobuf.diagnostics;
  diagnosticsProvider.updateSettings({
    namingConventions: diag.namingConventions,
    referenceChecks: diag.referenceChecks,
    importChecks: diag.importChecks,
    fieldTagChecks: diag.fieldTagChecks,
    duplicateFieldChecks: diag.duplicateFieldChecks,
    discouragedConstructs: diag.discouragedConstructs,
    deprecatedUsage: diag.deprecatedUsage ?? true,
    unusedSymbols: diag.unusedSymbols ?? false,
    circularDependencies: diag.circularDependencies ?? true
  });

  // Update formatter settings
  formatter.updateSettings({
    indentSize: settings.protobuf.indentSize,
    useTabIndent: settings.protobuf.useTabIndent,
    maxLineLength: settings.protobuf.maxLineLength,
    renumberOnFormat: settings.protobuf.renumber.onFormat,
    renumberStartNumber: settings.protobuf.renumber.startNumber,
    renumberIncrement: settings.protobuf.renumber.increment
  });

  // Update renumber settings
  const renumberSettings = settings.protobuf.renumber;
  renumberProvider.updateSettings({
    startNumber: renumberSettings.startNumber,
    increment: renumberSettings.increment,
    preserveReserved: renumberSettings.preserveReserved,
    skipReservedRange: renumberSettings.skipInternalRange
  });

  // Update analyzer with import paths
  const includePaths = [...(settings.protobuf.includes || [])];
  if (wellKnownIncludePath && !includePaths.includes(wellKnownIncludePath)) {
    includePaths.push(wellKnownIncludePath);
  }
  if (wellKnownCacheDir && !includePaths.includes(wellKnownCacheDir)) {
    includePaths.push(wellKnownCacheDir);
  }
  analyzer.setImportPaths(includePaths);

  // Update protoc compiler settings
  const protocSettings = settings.protobuf.protoc;
  protocCompiler.updateSettings({
    path: protocSettings.path,
    compileOnSave: protocSettings.compileOnSave,
    compileAllPath: protocSettings.compileAllPath,
    useAbsolutePath: protocSettings.useAbsolutePath,
    options: protocSettings.options
  });

  // Update breaking change detector settings
  const breakingSettings = settings.protobuf.breaking;
  breakingChangeDetector.updateSettings({
    enabled: breakingSettings.enabled,
    againstStrategy: breakingSettings.againstStrategy as 'git' | 'file' | 'none',
    againstGitRef: breakingSettings.againstGitRef,
    againstFilePath: breakingSettings.againstFilePath
  });

  // Update external linter settings
  const linterSettings = settings.protobuf.externalLinter;
  externalLinter.updateSettings({
    enabled: linterSettings.enabled,
    linter: linterSettings.linter as 'buf' | 'protolint' | 'none',
    bufPath: linterSettings.bufPath,
    protolintPath: linterSettings.protolintPath,
    bufConfigPath: linterSettings.bufConfigPath,
    protolintConfigPath: linterSettings.protolintConfigPath,
    runOnSave: linterSettings.runOnSave
  });

  // Update clang-format settings
  const clangSettings = settings.protobuf.clangFormat;
  clangFormat.updateSettings({
    enabled: clangSettings.enabled,
    path: clangSettings.path,
    style: clangSettings.style,
    fallbackStyle: clangSettings.fallbackStyle
  });

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
}
