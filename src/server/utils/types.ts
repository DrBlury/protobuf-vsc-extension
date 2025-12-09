/**
 * Type definitions for Protocol Buffers Language Server
 * Centralized location for shared types and interfaces
 */

import { DEFAULT_CONFIG } from './constants';

/**
 * Configuration settings for the Protobuf extension
 */
export interface Settings {
  protobuf: {
    formatterEnabled: boolean;
    formatOnSave: boolean;
    indentSize: number;
    useTabIndent: boolean;
    maxLineLength: number;
    formatter: {
      preset: string;
      alignFields?: boolean;
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
      namingConventions: boolean;
      referenceChecks: boolean;
      importChecks: boolean;
      fieldTagChecks: boolean;
      duplicateFieldChecks: boolean;
      discouragedConstructs: boolean;
      deprecatedUsage: boolean;
      unusedSymbols: boolean;
      circularDependencies: boolean;
      severity: {
        namingConventions: string;
        referenceErrors: string;
        fieldTagIssues: string;
        discouragedConstructs: string;
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
    protoc: {
      path: string;
      compileOnSave: boolean;
      compileAllPath: string;
      useAbsolutePath: boolean;
      options: string[];
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
      bufConfigPath: string;
      protolintConfigPath: string;
      runOnSave: boolean;
    };
    clangFormat: {
      enabled: boolean;
      path: string;
      style: string;
      fallbackStyle: string;
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
    formatterEnabled: true,
    formatOnSave: false,
    indentSize: DEFAULT_CONFIG.INDENT_SIZE,
    useTabIndent: false,
    maxLineLength: DEFAULT_CONFIG.MAX_LINE_LENGTH,
    formatter: {
      preset: 'minimal',
      alignFields: true
    },
    includes: [],
    protoSrcsDir: '',
    renumber: {
      startNumber: DEFAULT_CONFIG.RENUMBER_START,
      increment: DEFAULT_CONFIG.RENUMBER_INCREMENT,
      preserveReserved: true,
      skipInternalRange: true,
      autoSuggestNext: true,
      onFormat: true
    },
    diagnostics: {
      enabled: true,
      namingConventions: true,
      referenceChecks: true,
      importChecks: true,
      fieldTagChecks: true,
      duplicateFieldChecks: true,
      discouragedConstructs: true,
      deprecatedUsage: true,
      unusedSymbols: false,
      circularDependencies: true,
      severity: {
        namingConventions: 'warning',
        referenceErrors: 'error',
        fieldTagIssues: 'error',
        discouragedConstructs: 'warning'
      }
    },
    completion: {
      autoImport: true,
      includeGoogleTypes: true
    },
    hover: {
      showFieldNumbers: true,
      showDocumentation: true
    },
    protoc: {
      path: DEFAULT_CONFIG.PROTOC_PATH,
      compileOnSave: false,
      compileAllPath: '',
      useAbsolutePath: false,
      options: []
    },
    breaking: {
      enabled: false,
      againstStrategy: 'git',
      againstGitRef: DEFAULT_CONFIG.BREAKING_GIT_REF,
      againstFilePath: ''
    },
    externalLinter: {
      enabled: false,
      linter: 'none',
      bufPath: DEFAULT_CONFIG.BUF_PATH,
      protolintPath: DEFAULT_CONFIG.PROTOLINT_PATH,
      bufConfigPath: '',
      protolintConfigPath: '',
      runOnSave: true
    },
    clangFormat: {
      enabled: false,
      path: DEFAULT_CONFIG.CLANG_FORMAT_PATH,
      style: DEFAULT_CONFIG.CLANG_FORMAT_STYLE,
      fallbackStyle: DEFAULT_CONFIG.CLANG_FORMAT_STYLE
    },
    debug: {
      verboseLogging: false,
      logLevel: 'info'
    }
  }
};
