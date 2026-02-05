/**
 * Tests for rename handler
 */

import { handlePrepareRename, handleRename } from '../renameHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { RenameProvider } from '../../providers';
import type { PrepareRenameParams, RenameParams } from 'vscode-languageserver/node';

describe('RenameHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let renameProvider: jest.Mocked<RenameProvider>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    renameProvider = {
      prepareRename: jest.fn(),
      rename: jest.fn(),
    } as any;
  });

  describe('handlePrepareRename', () => {
    it('should return null when document not found', () => {
      const params: PrepareRenameParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        position: { line: 0, character: 0 },
      };

      documents.get.mockReturnValue(undefined);

      const result = handlePrepareRename(params, documents, renameProvider);
      expect(result).toBeNull();
      expect(renameProvider.prepareRename).not.toHaveBeenCalled();
    });

    it('should return null when provider returns null', () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: PrepareRenameParams = {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      };

      renameProvider.prepareRename.mockReturnValue(null);

      const result = handlePrepareRename(params, documents, renameProvider);
      expect(result).toBeNull();
    });

    it('should return prepared rename result', () => {
      const content = 'message Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: PrepareRenameParams = {
        textDocument: { uri },
        position: { line: 0, character: 8 },
      };

      renameProvider.prepareRename.mockReturnValue({
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
        placeholder: 'Test',
      });

      const result = handlePrepareRename(params, documents, renameProvider);

      expect(renameProvider.prepareRename).toHaveBeenCalledWith(uri, params.position, 'message Test {}');
      expect(result).toEqual({
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
        placeholder: 'Test',
      });
    });
  });

  describe('handleRename', () => {
    it('should return null when document not found', () => {
      const params: RenameParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        position: { line: 0, character: 0 },
        newName: 'NewTest',
      };

      documents.get.mockReturnValue(undefined);

      const result = handleRename(params, documents, renameProvider);
      expect(result).toBeNull();
      expect(renameProvider.rename).not.toHaveBeenCalled();
    });

    it('should return null when changes are empty', () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: RenameParams = {
        textDocument: { uri },
        position: { line: 0, character: 0 },
        newName: 'NewTest',
      };

      renameProvider.rename.mockReturnValue({ changes: new Map() });

      const result = handleRename(params, documents, renameProvider);
      expect(result).toBeNull();
    });

    it('should return workspace edit with changes', () => {
      const content = 'message Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: RenameParams = {
        textDocument: { uri },
        position: { line: 0, character: 8 },
        newName: 'NewTest',
      };

      const changes = new Map<string, any[]>();
      changes.set(uri, [
        { range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } }, newText: 'NewTest' },
      ]);
      renameProvider.rename.mockReturnValue({ changes });

      const result = handleRename(params, documents, renameProvider);

      expect(renameProvider.rename).toHaveBeenCalledWith(uri, params.position, 'message Test {}', 'NewTest');
      expect(result).toEqual({
        changes: {
          [uri]: [{ range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } }, newText: 'NewTest' }],
        },
      });
    });

    it('should handle multiple files in changes', () => {
      const content = 'message Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: RenameParams = {
        textDocument: { uri },
        position: { line: 0, character: 8 },
        newName: 'NewTest',
      };

      const uri2 = 'file:///test2.proto';
      const changes = new Map<string, any[]>();
      changes.set(uri, [
        { range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } }, newText: 'NewTest' },
      ]);
      changes.set(uri2, [
        { range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } }, newText: 'NewTest' },
      ]);
      renameProvider.rename.mockReturnValue({ changes });

      const result = handleRename(params, documents, renameProvider);

      expect(result).toEqual({
        changes: {
          [uri]: [{ range: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } }, newText: 'NewTest' }],
          [uri2]: [
            { range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } }, newText: 'NewTest' },
          ],
        },
      });
    });
  });
});
