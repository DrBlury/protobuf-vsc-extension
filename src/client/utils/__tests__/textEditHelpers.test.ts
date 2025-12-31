const mockRange = jest.fn();
const mockPosition = jest.fn();
const mockWorkspaceEdit = jest.fn(() => ({
  replace: jest.fn(),
}));

const mockVscode = {
  Range: mockRange,
  Position: mockPosition,
  WorkspaceEdit: mockWorkspaceEdit,
  workspace: {
    applyEdit: jest.fn(),
  },
  window: {
    showInformationMessage: jest.fn(),
  },
};

jest.mock('vscode', () => mockVscode, { virtual: true });

import {
  textEditToVSCodeRange,
  createWorkspaceEditFromTextEdits,
  applyWorkspaceEditWithMessage,
} from '../textEditHelpers';
import type { TextEdit } from 'vscode-languageserver/node';

describe('textEditHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRange.mockImplementation((start, end) => ({ start, end }));
    mockPosition.mockImplementation((line, character) => ({ line, character }));
  });

  describe('textEditToVSCodeRange', () => {
    it('should convert LSP TextEdit range to VS Code Range', () => {
      const textEdit: TextEdit = {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        newText: 'replacement',
      };

      const result = textEditToVSCodeRange(textEdit);

      expect(mockPosition).toHaveBeenCalledTimes(2);
      expect(mockPosition).toHaveBeenNthCalledWith(1, 0, 5);
      expect(mockPosition).toHaveBeenNthCalledWith(2, 0, 10);
      expect(mockRange).toHaveBeenCalledWith(
        { line: 0, character: 5 },
        { line: 0, character: 10 }
      );
      expect(result).toEqual({
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      });
    });

    it('should handle multi-line ranges', () => {
      const textEdit: TextEdit = {
        range: {
          start: { line: 5, character: 0 },
          end: { line: 10, character: 15 },
        },
        newText: 'multi-line replacement',
      };

      textEditToVSCodeRange(textEdit);

      expect(mockPosition).toHaveBeenNthCalledWith(1, 5, 0);
      expect(mockPosition).toHaveBeenNthCalledWith(2, 10, 15);
    });

    it('should handle zero-width ranges (insertion points)', () => {
      const textEdit: TextEdit = {
        range: {
          start: { line: 3, character: 7 },
          end: { line: 3, character: 7 },
        },
        newText: 'inserted text',
      };

      textEditToVSCodeRange(textEdit);

      expect(mockPosition).toHaveBeenNthCalledWith(1, 3, 7);
      expect(mockPosition).toHaveBeenNthCalledWith(2, 3, 7);
    });
  });

  describe('createWorkspaceEditFromTextEdits', () => {
    it('should create WorkspaceEdit from single TextEdit', () => {
      const mockReplace = jest.fn();
      mockWorkspaceEdit.mockImplementation(() => ({ replace: mockReplace }));

      const uri = { fsPath: '/test/file.proto', toString: () => 'file:///test/file.proto' };
      const textEdits: TextEdit[] = [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: 'hello',
        },
      ];

      createWorkspaceEditFromTextEdits(uri as any, textEdits);

      expect(mockWorkspaceEdit).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    it('should create WorkspaceEdit from multiple TextEdits', () => {
      const mockReplace = jest.fn();
      mockWorkspaceEdit.mockImplementation(() => ({ replace: mockReplace }));

      const uri = { fsPath: '/test/file.proto', toString: () => 'file:///test/file.proto' };
      const textEdits: TextEdit[] = [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: 'first',
        },
        {
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
          newText: 'second',
        },
        {
          range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
          newText: 'third',
        },
      ];

      createWorkspaceEditFromTextEdits(uri as any, textEdits);

      expect(mockReplace).toHaveBeenCalledTimes(3);
    });

    it('should handle empty TextEdits array', () => {
      const mockReplace = jest.fn();
      mockWorkspaceEdit.mockImplementation(() => ({ replace: mockReplace }));

      const uri = { fsPath: '/test/file.proto', toString: () => 'file:///test/file.proto' };

      createWorkspaceEditFromTextEdits(uri as any, []);

      expect(mockWorkspaceEdit).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should return the WorkspaceEdit object', () => {
      const mockEdit = { replace: jest.fn() };
      mockWorkspaceEdit.mockImplementation(() => mockEdit);

      const uri = { fsPath: '/test/file.proto', toString: () => 'file:///test/file.proto' };

      const result = createWorkspaceEditFromTextEdits(uri as any, []);

      expect(result).toBe(mockEdit);
    });
  });

  describe('applyWorkspaceEditWithMessage', () => {
    it('should apply the workspace edit', async () => {
      const mockEdit = { entries: () => [] };
      mockVscode.workspace.applyEdit.mockResolvedValue(true);

      await applyWorkspaceEditWithMessage(mockEdit as any);

      expect(mockVscode.workspace.applyEdit).toHaveBeenCalledWith(mockEdit);
    });

    it('should show success message when edit is applied and message is provided', async () => {
      const mockEdit = { entries: () => [] };
      mockVscode.workspace.applyEdit.mockResolvedValue(true);

      await applyWorkspaceEditWithMessage(mockEdit as any, 'Edit applied successfully');

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith('Edit applied successfully');
    });

    it('should not show message when no success message is provided', async () => {
      const mockEdit = { entries: () => [] };
      mockVscode.workspace.applyEdit.mockResolvedValue(true);

      await applyWorkspaceEditWithMessage(mockEdit as any);

      expect(mockVscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should not show message when edit fails to apply', async () => {
      const mockEdit = { entries: () => [] };
      mockVscode.workspace.applyEdit.mockResolvedValue(false);

      await applyWorkspaceEditWithMessage(mockEdit as any, 'Edit applied successfully');

      expect(mockVscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should return void', async () => {
      const mockEdit = { entries: () => [] };
      mockVscode.workspace.applyEdit.mockResolvedValue(true);

      const result = await applyWorkspaceEditWithMessage(mockEdit as any);

      expect(result).toBeUndefined();
    });
  });
});
