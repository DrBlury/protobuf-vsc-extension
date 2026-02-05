/**
 * Tests for formatting handler
 */

import { handleDocumentFormatting, handleRangeFormatting } from '../formattingHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { ProtoFormatter } from '../../providers/formatter';
import { DocumentFormattingParams, DocumentRangeFormattingParams } from 'vscode-languageserver/node';
import { Settings } from '../../utils/types';

describe('FormattingHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let formatterProvider: jest.Mocked<ProtoFormatter>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    formatterProvider = {
      formatDocument: jest.fn(),
      formatRange: jest.fn(),
    } as any;
  });

  describe('handleDocumentFormatting', () => {
    it('should return empty array when formatter is disabled', async () => {
      const params: DocumentFormattingParams = {
        textDocument: { uri: 'file:///test.proto' },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: false },
        },
      } as Settings;

      const result = await handleDocumentFormatting(params, documents, formatterProvider, settings);
      expect(result).toEqual([]);
      expect(formatterProvider.formatDocument).not.toHaveBeenCalled();
    });

    it('should return empty array when document not found', async () => {
      const params: DocumentFormattingParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: true },
        },
      } as Settings;

      documents.get.mockReturnValue(undefined);

      const result = await handleDocumentFormatting(params, documents, formatterProvider, settings);
      expect(result).toEqual([]);
      expect(formatterProvider.formatDocument).not.toHaveBeenCalled();
    });

    it('should return formatted text edits', async () => {
      const content = 'syntax="proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: DocumentFormattingParams = {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: true },
        },
      } as Settings;

      const textEdits = [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } }, newText: 'syntax = "proto3";' },
      ];
      formatterProvider.formatDocument.mockResolvedValue(textEdits);

      const result = await handleDocumentFormatting(params, documents, formatterProvider, settings);

      expect(formatterProvider.formatDocument).toHaveBeenCalledWith(content, uri);
      expect(result).toEqual(textEdits);
    });
  });

  describe('handleRangeFormatting', () => {
    it('should return empty array when formatter is disabled', async () => {
      const params: DocumentRangeFormattingParams = {
        textDocument: { uri: 'file:///test.proto' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: false },
        },
      } as Settings;

      const result = await handleRangeFormatting(params, documents, formatterProvider, settings);
      expect(result).toEqual([]);
      expect(formatterProvider.formatRange).not.toHaveBeenCalled();
    });

    it('should return empty array when document not found', async () => {
      const params: DocumentRangeFormattingParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: true },
        },
      } as Settings;

      documents.get.mockReturnValue(undefined);

      const result = await handleRangeFormatting(params, documents, formatterProvider, settings);
      expect(result).toEqual([]);
      expect(formatterProvider.formatRange).not.toHaveBeenCalled();
    });

    it('should return range formatted text edits', async () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: DocumentRangeFormattingParams = {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
        options: { tabSize: 2, insertSpaces: true },
      };
      const settings: Settings = {
        protobuf: {
          formatter: { enabled: true },
        },
      } as Settings;

      const textEdits = [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } }, newText: 'syntax = "proto3";' },
      ];
      formatterProvider.formatRange.mockResolvedValue(textEdits);

      const result = await handleRangeFormatting(params, documents, formatterProvider, settings);

      expect(formatterProvider.formatRange).toHaveBeenCalledWith(content, params.range, uri);
      expect(result).toEqual(textEdits);
    });
  });
});
