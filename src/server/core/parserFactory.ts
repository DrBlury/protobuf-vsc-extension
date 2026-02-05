/**
 * Parser Factory
 * Provides a unified interface to switch between Tree-sitter and custom parsers
 */

import { ProtoParser } from './parser';
import {
  TreeSitterProtoParser,
  isTreeSitterInitialized,
  getTreeSitterInitError,
  TreeSitterInitError,
} from './treeSitterParser';
import type { ProtoFile } from './ast';
import { logger } from '../utils/logger';

/**
 * Interface that both parsers must implement
 */
export interface IProtoParser {
  parse(text: string, uri: string): ProtoFile;
}

/**
 * Statistics about parser fallbacks
 */
interface ParserStats {
  treeSitterAttempts: number;
  treeSitterSuccesses: number;
  treeSitterFailures: number;
  fallbackUses: number;
  lastError: Error | null;
  lastErrorTime: Date | null;
}

/**
 * Parser factory that can switch between parsers based on configuration
 */
export class ParserFactory {
  private customParser: ProtoParser;
  private treeSitterParser: TreeSitterProtoParser | null = null;
  private useTreeSitter: boolean = false;
  private stats: ParserStats = {
    treeSitterAttempts: 0,
    treeSitterSuccesses: 0,
    treeSitterFailures: 0,
    fallbackUses: 0,
    lastError: null,
    lastErrorTime: null,
  };

  constructor() {
    this.customParser = new ProtoParser();
    if (isTreeSitterInitialized()) {
      this.treeSitterParser = new TreeSitterProtoParser();
    }
  }

  /**
   * Set whether to use Tree-sitter parser
   */
  setUseTreeSitter(use: boolean): void {
    this.useTreeSitter = use && isTreeSitterInitialized();
    if (use && !isTreeSitterInitialized()) {
      const initError = getTreeSitterInitError();
      if (initError) {
        if (initError instanceof TreeSitterInitError) {
          logger.warn(
            `Tree-sitter parser requested but initialization failed (${initError.errorType}): ${initError.message}. ` +
              'Falling back to custom parser.'
          );
        } else {
          logger.warn(
            `Tree-sitter parser requested but initialization failed: ${initError.message}. ` +
              'Falling back to custom parser.'
          );
        }
      } else {
        logger.warn('Tree-sitter parser requested but not initialized. Falling back to custom parser.');
      }
    }
  }

  /**
   * Get current parser preference
   */
  isUsingTreeSitter(): boolean {
    return this.useTreeSitter && this.treeSitterParser !== null;
  }

  /**
   * Initialize Tree-sitter parser (if not already initialized)
   */
  initializeTreeSitter(): void {
    if (isTreeSitterInitialized() && !this.treeSitterParser) {
      this.treeSitterParser = new TreeSitterProtoParser();
      logger.info('Tree-sitter parser initialized in parser factory');
    }
  }

  /**
   * Get parser statistics
   */
  getStats(): Readonly<ParserStats> {
    return { ...this.stats };
  }

  /**
   * Reset parser statistics
   */
  resetStats(): void {
    this.stats = {
      treeSitterAttempts: 0,
      treeSitterSuccesses: 0,
      treeSitterFailures: 0,
      fallbackUses: 0,
      lastError: null,
      lastErrorTime: null,
    };
  }

  /**
   * Parse a proto file using the configured parser
   * Automatically falls back to custom parser if tree-sitter fails
   */
  parse(text: string, uri: string): ProtoFile {
    // Try tree-sitter if enabled and available
    if (this.useTreeSitter && this.treeSitterParser) {
      this.stats.treeSitterAttempts++;
      try {
        const result = this.treeSitterParser.parse(text, uri);
        this.stats.treeSitterSuccesses++;
        return result;
      } catch (error) {
        this.stats.treeSitterFailures++;
        this.stats.lastError = error instanceof Error ? error : new Error(String(error));
        this.stats.lastErrorTime = new Date();

        // Log detailed error information
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : 'Unknown';
        const errorStack =
          error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 3).join(' -> ') : 'No stack trace';

        logger.error(
          `Tree-sitter parser failed for ${uri}, falling back to custom parser. ` +
            `Error: [${errorName}] ${errorMessage}. Stack: ${errorStack}`
        );

        // Log stats periodically if there are many failures
        if (this.stats.treeSitterFailures % 10 === 0) {
          logger.warn(
            `Tree-sitter parser failure rate: ${this.stats.treeSitterFailures}/${this.stats.treeSitterAttempts} ` +
              `(${((this.stats.treeSitterFailures / this.stats.treeSitterAttempts) * 100).toFixed(1)}%)`
          );
        }
      }
    }

    // Fall back to custom parser
    this.stats.fallbackUses++;
    try {
      return this.customParser.parse(text, uri);
    } catch (fallbackError) {
      // If even the fallback parser fails, log and re-throw
      logger.error(`Both tree-sitter and custom parser failed for ${uri}:`, fallbackError);
      throw fallbackError;
    }
  }

  /**
   * Get the underlying parser instance
   */
  getParser(): IProtoParser {
    if (this.useTreeSitter && this.treeSitterParser) {
      return this.treeSitterParser;
    }
    return this.customParser;
  }

  /**
   * Get a diagnostic report about parser health
   */
  getDiagnosticReport(): string {
    const lines: string[] = [
      '=== Parser Factory Diagnostic Report ===',
      `Tree-sitter enabled: ${this.useTreeSitter}`,
      `Tree-sitter initialized: ${isTreeSitterInitialized()}`,
      `Tree-sitter parser available: ${this.treeSitterParser !== null}`,
      '',
      '--- Statistics ---',
      `Tree-sitter attempts: ${this.stats.treeSitterAttempts}`,
      `Tree-sitter successes: ${this.stats.treeSitterSuccesses}`,
      `Tree-sitter failures: ${this.stats.treeSitterFailures}`,
      `Fallback parser uses: ${this.stats.fallbackUses}`,
    ];

    if (this.stats.treeSitterAttempts > 0) {
      const successRate = (this.stats.treeSitterSuccesses / this.stats.treeSitterAttempts) * 100;
      lines.push(`Success rate: ${successRate.toFixed(1)}%`);
    }

    if (this.stats.lastError) {
      lines.push('');
      lines.push('--- Last Error ---');
      lines.push(`Time: ${this.stats.lastErrorTime?.toISOString() ?? 'unknown'}`);
      lines.push(`Message: ${this.stats.lastError.message}`);
    }

    const initError = getTreeSitterInitError();
    if (initError) {
      lines.push('');
      lines.push('--- Initialization Error ---');
      if (initError instanceof TreeSitterInitError) {
        lines.push(`Type: ${initError.errorType}`);
      }
      lines.push(`Message: ${initError.message}`);
    }

    return lines.join('\n');
  }
}

/**
 * Singleton parser factory instance
 */
export const parserFactory = new ParserFactory();
