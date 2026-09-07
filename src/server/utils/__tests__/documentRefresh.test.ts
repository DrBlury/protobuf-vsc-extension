/**
 * Tests for document refresh utilities
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { refreshDocumentAndImports } from '../documentRefresh';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ContentHashCache } from '../cache';
import { ProtoFile } from '../../core/ast';
import { logger } from '../logger';

jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
  },
}));

describe('Document Refresh utilities', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let cache: ContentHashCache<ProtoFile>;
  let documents: jest.Mocked<TextDocuments<TextDocument>>;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    cache = new ContentHashCache<ProtoFile>();
    documents = {
      get: jest.fn(),
    } as any;
    jest.clearAllMocks();
  });

  it('should return empty array when document not found', () => {
    const result = refreshDocumentAndImports('file:///nonexistent.proto', documents, parser, analyzer, cache);
    expect(result).toEqual([]);
  });

  it('should refresh document and return URI', () => {
    const content = 'syntax = "proto3"; message Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
    const result = refreshDocumentAndImports(uri, documents, parser, analyzer, cache);

    expect(result).toContain(uri);
    expect(updateFileSpy).toHaveBeenCalled();
  });

  it('should reuse parsed files without rebuilding the unchanged analyzer index', () => {
    const content = 'syntax = "proto3"; message Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const parseSpy = jest.spyOn(parser, 'parse');
    const updateSpy = jest.spyOn(analyzer, 'updateFile');

    // First call should parse
    refreshDocumentAndImports(uri, documents, parser, analyzer, cache);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    parseSpy.mockClear();
    updateSpy.mockClear();
    refreshDocumentAndImports(uri, documents, parser, analyzer, cache);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();

    // A disk rescan may replace the index while the buffer is unchanged.
    analyzer.updateFile(uri, parser.parse('message DiskVersion {}', uri));
    parseSpy.mockClear();
    updateSpy.mockClear();
    refreshDocumentAndImports(uri, documents, parser, analyzer, cache);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(analyzer.getFile(uri)?.messages[0]?.name).toBe('Test');
  });

  it('should invalidate cache when content changes', () => {
    const uri = 'file:///test.proto';
    const doc1 = TextDocument.create(uri, 'proto', 1, 'syntax = "proto3"; message Test1 {}');
    documents.get.mockReturnValue(doc1);

    const parseSpy = jest.spyOn(parser, 'parse');
    refreshDocumentAndImports(uri, documents, parser, analyzer, cache);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Update document content
    const doc2 = TextDocument.create(uri, 'proto', 2, 'syntax = "proto3"; message Test2 {}');
    documents.get.mockReturnValue(doc2);

    parseSpy.mockClear();
    refreshDocumentAndImports(uri, documents, parser, analyzer, cache);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('should refresh imported documents', () => {
    const importContent = 'syntax = "proto3"; message Imported {}';
    const importUri = 'file:///imported.proto';
    const importDoc = TextDocument.create(importUri, 'proto', 1, importContent);

    const mainContent = `syntax = "proto3"; import "imported.proto"; message Main {}`;
    const mainUri = 'file:///main.proto';
    const mainDoc = TextDocument.create(mainUri, 'proto', 1, mainContent);

    documents.get.mockImplementation((uri: string) => {
      if (uri === mainUri) {
        return mainDoc;
      }
      if (uri === importUri) {
        return importDoc;
      }
      return undefined;
    });

    // Set up analyzer to return import
    const parsed = parser.parse(mainContent, mainUri);
    analyzer.updateFile(mainUri, parsed);

    // Mock getImportedFileUris to return the import
    jest.spyOn(analyzer, 'getImportedFileUris').mockReturnValue([importUri]);

    const result = refreshDocumentAndImports(mainUri, documents, parser, analyzer, cache);

    expect(result).toContain(mainUri);
    expect(result).toContain(importUri);

    const updateSpy = jest.spyOn(analyzer, 'updateFile');
    refreshDocumentAndImports(mainUri, documents, parser, analyzer, cache);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('should handle parse errors gracefully', () => {
    const content = 'invalid proto content';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const parseSpy = jest.spyOn(parser, 'parse').mockImplementation(() => {
      throw new Error('Parse error');
    });

    const result = refreshDocumentAndImports(uri, documents, parser, analyzer, cache);

    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('should handle import parse errors gracefully', () => {
    const importContent = 'invalid proto';
    const importUri = 'file:///imported.proto';
    const importDoc = TextDocument.create(importUri, 'proto', 1, importContent);

    const mainContent = 'syntax = "proto3"; message Main {}';
    const mainUri = 'file:///main.proto';
    const mainDoc = TextDocument.create(mainUri, 'proto', 1, mainContent);

    documents.get.mockImplementation((uri: string) => {
      if (uri === mainUri) {
        return mainDoc;
      }
      if (uri === importUri) {
        return importDoc;
      }
      return undefined;
    });

    const parsed = parser.parse(mainContent, mainUri);
    analyzer.updateFile(mainUri, parsed);

    jest.spyOn(analyzer, 'getImportedFileUris').mockReturnValue([importUri]);

    // Mock parse to throw error for import, but succeed for main
    const originalParse = parser.parse.bind(parser);
    const parseSpy = jest.spyOn(parser, 'parse').mockImplementation((content: string, parseUri: string) => {
      if (parseUri === importUri) {
        throw new Error('Import parse error');
      }
      return originalParse(content, parseUri);
    });

    const result = refreshDocumentAndImports(mainUri, documents, parser, analyzer, cache);

    expect(result).toContain(mainUri);
    expect(result).not.toContain(importUri);
    expect(logger.debug).toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('should skip missing imported documents', () => {
    const mainContent = 'syntax = "proto3"; message Main {}';
    const mainUri = 'file:///main.proto';
    const mainDoc = TextDocument.create(mainUri, 'proto', 1, mainContent);
    documents.get.mockImplementation((uri: string) => {
      if (uri === mainUri) {
        return mainDoc;
      }
      return undefined;
    });

    const parsed = parser.parse(mainContent, mainUri);
    analyzer.updateFile(mainUri, parsed);

    const missingImportUri = 'file:///missing.proto';
    jest.spyOn(analyzer, 'getImportedFileUris').mockReturnValue([missingImportUri]);

    const result = refreshDocumentAndImports(mainUri, documents, parser, analyzer, cache);

    expect(result).toContain(mainUri);
    expect(result).not.toContain(missingImportUri);
  });
});
