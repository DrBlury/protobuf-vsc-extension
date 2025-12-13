/**
 * Tests for configuration manager
 */

import { updateProvidersWithSettings } from './configManager';
import { Settings } from './types';
import { DiagnosticsProvider } from '../providers/diagnostics';
import { ProtoFormatter } from '../providers/formatter';
import { RenumberProvider } from '../providers/renumber';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtocCompiler } from '../services/protoc';
import { BreakingChangeDetector } from '../services/breaking';
import { ExternalLinterProvider } from '../services/externalLinter';
import { ClangFormatProvider } from '../services/clangFormat';
import { logger } from './logger';
import { defaultSettings } from './types';

jest.mock('./logger', () => {
  const actualLogger = jest.requireActual('./logger');
  return {
    ...actualLogger,
    logger: {
      setVerboseLogging: jest.fn(),
      setLevel: jest.fn(),
      info: jest.fn(),
      verbose: jest.fn(),
      verboseWithContext: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  };
});

describe('ConfigManager', () => {
  let diagnosticsProvider: jest.Mocked<DiagnosticsProvider>;
  let formatter: jest.Mocked<ProtoFormatter>;
  let renumberProvider: jest.Mocked<RenumberProvider>;
  let analyzer: jest.Mocked<SemanticAnalyzer>;
  let protocCompiler: jest.Mocked<ProtocCompiler>;
  let breakingChangeDetector: jest.Mocked<BreakingChangeDetector>;
  let externalLinter: jest.Mocked<ExternalLinterProvider>;
  let clangFormat: jest.Mocked<ClangFormatProvider>;

  beforeEach(() => {
    diagnosticsProvider = {
      updateSettings: jest.fn()
    } as any;

    formatter = {
      updateSettings: jest.fn(),
      setBufPath: jest.fn(),
      setClangFormatEnabled: jest.fn()
    } as any;

    renumberProvider = {
      updateSettings: jest.fn()
    } as any;

    analyzer = {
      setImportPaths: jest.fn()
    } as any;

    protocCompiler = {
      updateSettings: jest.fn()
    } as any;

    breakingChangeDetector = {
      updateSettings: jest.fn()
    } as any;

    externalLinter = {
      updateSettings: jest.fn()
    } as any;

    clangFormat = {
      updateSettings: jest.fn()
    } as any;

    jest.clearAllMocks();
  });

  it('should update diagnostics provider settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(diagnosticsProvider.updateSettings).toHaveBeenCalledWith({
      namingConventions: settings.protobuf.diagnostics.namingConventions,
      referenceChecks: settings.protobuf.diagnostics.referenceChecks,
      importChecks: settings.protobuf.diagnostics.importChecks,
      fieldTagChecks: settings.protobuf.diagnostics.fieldTagChecks,
      duplicateFieldChecks: settings.protobuf.diagnostics.duplicateFieldChecks,
      discouragedConstructs: settings.protobuf.diagnostics.discouragedConstructs,
      deprecatedUsage: true,
      unusedSymbols: false,
      circularDependencies: true,
      documentationComments: true
    });
  });

  it('should update formatter settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(formatter.updateSettings).toHaveBeenCalledWith({
      indentSize: settings.protobuf.indentSize,
      useTabIndent: settings.protobuf.useTabIndent,
      maxLineLength: settings.protobuf.maxLineLength,
      renumberOnFormat: settings.protobuf.renumber.onFormat,
      renumberStartNumber: settings.protobuf.renumber.startNumber,
      renumberIncrement: settings.protobuf.renumber.increment,
      preset: settings.protobuf.formatter.preset,
      alignFields: settings.protobuf.formatter.alignFields
    });
  });

  it('should update renumber provider settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(renumberProvider.updateSettings).toHaveBeenCalledWith({
      startNumber: settings.protobuf.renumber.startNumber,
      increment: settings.protobuf.renumber.increment,
      preserveReserved: settings.protobuf.renumber.preserveReserved,
      skipReservedRange: settings.protobuf.renumber.skipInternalRange
    });
  });

  it('should update analyzer with import paths', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        includes: ['/path1', '/path2']
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(analyzer.setImportPaths).toHaveBeenCalledWith(['/path1', '/path2']);
  });

  it('should add well-known include path to analyzer', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      '/well-known',
      undefined
    );

    expect(analyzer.setImportPaths).toHaveBeenCalledWith(['/well-known']);
  });

  it('should add well-known cache dir to analyzer', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      '/cache-dir'
    );

    expect(analyzer.setImportPaths).toHaveBeenCalledWith(['/cache-dir']);
  });

  it('should combine includes with well-known paths', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        includes: ['/path1']
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      '/well-known',
      '/cache-dir'
    );

    expect(analyzer.setImportPaths).toHaveBeenCalledWith(['/path1', '/well-known', '/cache-dir']);
  });

  it('should not duplicate well-known paths', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        includes: ['/well-known']
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      '/well-known',
      undefined
    );

    expect(analyzer.setImportPaths).toHaveBeenCalledWith(['/well-known']);
  });

  it('should update protoc compiler settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(protocCompiler.updateSettings).toHaveBeenCalledWith({
      path: settings.protobuf.protoc.path,
      compileOnSave: settings.protobuf.protoc.compileOnSave,
      compileAllPath: settings.protobuf.protoc.compileAllPath,
      useAbsolutePath: settings.protobuf.protoc.useAbsolutePath,
      options: settings.protobuf.protoc.options
    });
  });

  it('should update breaking change detector settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(breakingChangeDetector.updateSettings).toHaveBeenCalledWith({
      enabled: settings.protobuf.breaking.enabled,
      againstStrategy: settings.protobuf.breaking.againstStrategy,
      againstGitRef: settings.protobuf.breaking.againstGitRef,
      againstFilePath: settings.protobuf.breaking.againstFilePath
    });
  });

  it('should update external linter settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(externalLinter.updateSettings).toHaveBeenCalledWith({
      enabled: settings.protobuf.externalLinter.enabled,
      linter: settings.protobuf.externalLinter.linter,
      bufPath: settings.protobuf.externalLinter.bufPath,
      protolintPath: settings.protobuf.externalLinter.protolintPath,
      bufConfigPath: settings.protobuf.externalLinter.bufConfigPath,
      protolintConfigPath: settings.protobuf.externalLinter.protolintConfigPath,
      runOnSave: settings.protobuf.externalLinter.runOnSave
    });
  });

  it('should update clang-format settings', () => {
    const settings: Settings = defaultSettings;
    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(clangFormat.updateSettings).toHaveBeenCalledWith({
      enabled: settings.protobuf.clangFormat.enabled,
      path: settings.protobuf.clangFormat.path,
      style: settings.protobuf.clangFormat.style,
      fallbackStyle: settings.protobuf.clangFormat.fallbackStyle,
      configPath: settings.protobuf.clangFormat.configPath
    });
  });

  it('expands workspace variables in executable paths', () => {
    const workspaceFolders = ['/workspaces/project'];
    const settings = JSON.parse(JSON.stringify(defaultSettings)) as Settings;

    settings.protobuf.protoc.path = '${workspaceFolder}/bin/protoc';
    settings.protobuf.protoc.compileAllPath = '${workspaceFolder}/all-protos';
    settings.protobuf.breaking = {
      ...settings.protobuf.breaking,
      enabled: true,
      againstStrategy: 'file',
      againstGitRef: 'HEAD',
      againstFilePath: '${workspaceFolder}/baselines/current.proto'
    };
    settings.protobuf.externalLinter = {
      ...settings.protobuf.externalLinter,
      enabled: true,
      linter: 'buf',
      bufPath: '${workspaceFolder}/tools/buf',
      protolintPath: '${workspaceFolder}/tools/protolint',
      bufConfigPath: '${workspaceFolder}/configs/buf.yaml',
      protolintConfigPath: '${workspaceFolder}/configs/protolint.yaml',
      runOnSave: true
    };
    settings.protobuf.buf = {
      path: '${workspaceFolder}/custom/buf'
    };
    settings.protobuf.clangFormat = {
      ...settings.protobuf.clangFormat,
      enabled: true,
      path: '${workspaceFolder}/bin/clang-format',
      style: 'file',
      fallbackStyle: 'Google',
      configPath: '${workspaceFolder}/configs/.clang-format'
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined,
      workspaceFolders
    );

    expect(protocCompiler.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      path: '/workspaces/project/bin/protoc',
      compileAllPath: '/workspaces/project/all-protos'
    }));

    expect(breakingChangeDetector.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      againstFilePath: '/workspaces/project/baselines/current.proto'
    }));

    expect(externalLinter.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      bufPath: '/workspaces/project/tools/buf',
      protolintPath: '/workspaces/project/tools/protolint',
      bufConfigPath: '/workspaces/project/configs/buf.yaml',
      protolintConfigPath: '/workspaces/project/configs/protolint.yaml'
    }));

    expect(formatter.setBufPath).toHaveBeenCalledWith('/workspaces/project/custom/buf');

    expect(clangFormat.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      path: '/workspaces/project/bin/clang-format',
      configPath: '/workspaces/project/configs/.clang-format'
    }));
  });

  it('should update logger settings when debug settings present', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        debug: {
          verboseLogging: true,
          logLevel: 'debug'
        }
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(logger.setVerboseLogging).toHaveBeenCalledWith(true);
    expect(logger.setLevel).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Verbose logging enabled'));
  });

  it('should handle missing debug settings', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        debug: undefined as any
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(logger.setVerboseLogging).not.toHaveBeenCalled();
  });

  it('should handle null/undefined diagnostic settings', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        diagnostics: {
          ...defaultSettings.protobuf.diagnostics,
          deprecatedUsage: undefined as any,
          unusedSymbols: undefined as any,
          circularDependencies: undefined as any,
          documentationComments: undefined as any
        }
      }
    };

    updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(diagnosticsProvider.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        deprecatedUsage: true,
        unusedSymbols: false,
        circularDependencies: true,
        documentationComments: true
      })
    );
  });

  it('should return empty protoSrcsDir when not set', () => {
    const settings: Settings = defaultSettings;
    const result = updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(result.protoSrcsDir).toBe('');
  });

  it('should return protoSrcsDir when set', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        protoSrcsDir: 'protos'
      }
    };

    const result = updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined
    );

    expect(result.protoSrcsDir).toBe('protos');
  });

  it('should expand variables in protoSrcsDir', () => {
    const settings: Settings = {
      ...defaultSettings,
      protobuf: {
        ...defaultSettings.protobuf,
        protoSrcsDir: '${workspaceFolder}/src/protos'
      }
    };

    const result = updateProvidersWithSettings(
      settings,
      diagnosticsProvider,
      formatter,
      renumberProvider,
      analyzer,
      protocCompiler,
      breakingChangeDetector,
      externalLinter,
      clangFormat,
      undefined,
      undefined,
      ['/workspace']
    );

    expect(result.protoSrcsDir).toBe('/workspace/src/protos');
  });
});
