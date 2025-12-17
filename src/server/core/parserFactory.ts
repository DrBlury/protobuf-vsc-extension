/**
 * Parser Factory
 * Provides a unified interface to switch between Tree-sitter and custom parsers
 */

import { ProtoParser } from './parser';
import { TreeSitterProtoParser, isTreeSitterInitialized } from './treeSitterParser';
import { ProtoFile } from './ast';

/**
 * Interface that both parsers must implement
 */
export interface IProtoParser {
  parse(text: string, uri: string): ProtoFile;
}

/**
 * Parser factory that can switch between parsers based on configuration
 */
export class ParserFactory {
  private customParser: ProtoParser;
  private treeSitterParser: TreeSitterProtoParser | null = null;
  private useTreeSitter: boolean = false;

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
      console.warn('Tree-sitter parser requested but not initialized. Falling back to custom parser.');
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
    }
  }

  /**
   * Parse a proto file using the configured parser
   */
  parse(text: string, uri: string): ProtoFile {
    try {
      if (this.useTreeSitter && this.treeSitterParser) {
        return this.treeSitterParser.parse(text, uri);
      }
    } catch (error) {
      console.error('Tree-sitter parser failed, falling back to custom parser:', error);
    }
    
    // Fall back to custom parser
    return this.customParser.parse(text, uri);
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
}

/**
 * Singleton parser factory instance
 */
export const parserFactory = new ParserFactory();
