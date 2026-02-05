/**
 * Type definitions for Protocol Buffers Language Server
 * Centralized location for shared types and interfaces
 */

import { DEFAULT_CONFIG } from './constants';

/**
 * Setting value for a severity
 */
export type SeveritySetting = 'error' | 'warning' | 'information' | 'hint';

/**
 * Configuration settings for the Protobuf extension
 */
export interface Settings {
  protobuf: {
    formatOnSave: boolean;
    enableBetaFeatures: boolean;
    indentSize: number;
    useTabIndent: boolean;
    maxLineLength: number;
    formatter: {
      enabled: boolean;
      preset: string;
      alignFields?: boolean;
      preserveMultiLineFields?: boolean;
      insertEmptyLineBetweenDefinitions?: boolean;
      maxEmptyLines?: number;
    };
    semanticHighlighting: {
      enabled: 'hybrid' | 'semantic' | 'textmate';
    };
    includes: string[];
    protoSrcsDir: string;
    renumber: {
      startNumber: number;
      increment: number;
      preserveReserved: boolean;
      skipInternalRange: boolean;
      autoSuggestNext: boolean;
      onFormat: boolean;
    };
    diagnostics: {
      enabled: boolean;
      useBuiltIn: boolean;
      namingConventions: boolean;
      referenceChecks: boolean;
      importChecks: boolean;
      fieldTagChecks: boolean;
      duplicateFieldChecks: boolean;
      discouragedConstructs: boolean;
      deprecatedUsage: boolean;
      unusedSymbols: boolean;
      circularDependencies: boolean;
      documentationComments: boolean;
      editionFeatures: boolean;
      breakingChanges: boolean;
      severity: {
        namingConventions: SeveritySetting;
        referenceErrors: SeveritySetting;
        fieldTagIssues: SeveritySetting;
        discouragedConstructs: SeveritySetting;
        nonCanonicalImportPath: SeveritySetting;
        breakingChanges: SeveritySetting;
      };
    };
    completion: {
      autoImport: boolean;
      includeGoogleTypes: boolean;
    };
    hover: {
      showFieldNumbers: boolean;
      showDocumentation: boolean;
    };
    organizeImports: {
      enabled: boolean;
      groupByCategory: boolean;
    };
    parser?: 'tree-sitter' | 'legacy';
    buf?: {
      path?: string;
    };
    protoc: {
      path: string;
      compileOnSave: boolean;
      compileAllPath: string;
      useAbsolutePath: boolean;
      options: string[];
      excludePatterns: string[];
    };
    breaking: {
      enabled: boolean;
      againstStrategy: string;
      againstGitRef: string;
      againstFilePath: string;
    };
    externalLinter: {
      enabled: boolean;
      linter: string;
      bufPath: string;
      protolintPath: string;
      apiLinterPath: string;
      bufConfigPath: string;
      protolintConfigPath: string;
      apiLinterConfigPath: string;
      runOnSave: boolean;
    };
    clangFormat: {
      enabled: boolean;
      path: string;
      style: string;
      fallbackStyle: string;
      configPath: string;
    };
    debug: {
      verboseLogging: boolean;
      logLevel: string;
    };
  };
}

/**
 * Default settings values
 */
export const defaultSettings: Settings = {
  protobuf: {
    formatOnSave: false,
    enableBetaFeatures: false,
    indentSize: DEFAULT_CONFIG.INDENT_SIZE,
    useTabIndent: false,
    maxLineLength: DEFAULT_CONFIG.MAX_LINE_LENGTH,
    formatter: {
      enabled: true,
      preset: 'minimal',
      alignFields: true,
      preserveMultiLineFields: false,
      insertEmptyLineBetweenDefinitions: true,
      maxEmptyLines: 1,
    },
    semanticHighlighting: {
      enabled: 'textmate',
    },
    includes: [],
    protoSrcsDir: '',
    renumber: {
      startNumber: DEFAULT_CONFIG.RENUMBER_START,
      increment: DEFAULT_CONFIG.RENUMBER_INCREMENT,
      preserveReserved: true,
      skipInternalRange: true,
      autoSuggestNext: true,
      onFormat: false,
    },
    diagnostics: {
      enabled: true,
      useBuiltIn: true,
      namingConventions: true,
      referenceChecks: true,
      importChecks: true,
      fieldTagChecks: true,
      duplicateFieldChecks: true,
      discouragedConstructs: true,
      deprecatedUsage: true,
      unusedSymbols: false,
      circularDependencies: true,
      documentationComments: true,
      editionFeatures: true,
      breakingChanges: false,
      severity: {
        namingConventions: 'warning',
        referenceErrors: 'error',
        fieldTagIssues: 'error',
        discouragedConstructs: 'warning',
        nonCanonicalImportPath: 'error',
        breakingChanges: 'error',
      },
    },
    completion: {
      autoImport: true,
      includeGoogleTypes: true,
    },
    hover: {
      showFieldNumbers: true,
      showDocumentation: true,
    },
    organizeImports: {
      enabled: true,
      groupByCategory: true,
    },
    parser: 'tree-sitter',
    buf: {
      path: DEFAULT_CONFIG.BUF_PATH,
    },
    protoc: {
      path: DEFAULT_CONFIG.PROTOC_PATH,
      compileOnSave: false,
      compileAllPath: '',
      useAbsolutePath: false,
      options: [],
      excludePatterns: [],
    },
    breaking: {
      enabled: false,
      againstStrategy: 'git',
      againstGitRef: DEFAULT_CONFIG.BREAKING_GIT_REF,
      againstFilePath: '',
    },
    externalLinter: {
      enabled: false,
      linter: 'none',
      bufPath: DEFAULT_CONFIG.BUF_PATH,
      protolintPath: DEFAULT_CONFIG.PROTOLINT_PATH,
      apiLinterPath: DEFAULT_CONFIG.API_LINTER_PATH,
      bufConfigPath: '',
      protolintConfigPath: '',
      apiLinterConfigPath: '',
      runOnSave: true,
    },
    clangFormat: {
      enabled: false,
      path: DEFAULT_CONFIG.CLANG_FORMAT_PATH,
      style: DEFAULT_CONFIG.CLANG_FORMAT_STYLE,
      fallbackStyle: DEFAULT_CONFIG.CLANG_FORMAT_FALLBACK_STYLE,
      configPath: '',
    },
    debug: {
      verboseLogging: false,
      logLevel: 'info',
    },
  },
};
