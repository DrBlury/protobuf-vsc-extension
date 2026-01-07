/**
 * Tests for workspace utilities
 */

import { findProtoFiles, scanWorkspaceForProtoFiles, scanImportPaths } from '../workspace';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    verbose: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Workspace utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findProtoFiles', () => {
    it('should find proto files in directory', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'file1.proto', isDirectory: () => false, isFile: () => true },
        { name: 'file2.proto', isDirectory: () => false, isFile: () => true },
        { name: 'other.txt', isDirectory: () => false, isFile: () => true },
      ] as any);

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(2);
      expect(files[0]).toContain('file1.proto');
      expect(files[1]).toContain('file2.proto');
    });

    it('should recursively search subdirectories', () => {
      let callCount = 0;
      mockFs.readdirSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return [{ name: 'subdir', isDirectory: () => true, isFile: () => false }] as any;
        } else {
          return [{ name: 'file.proto', isDirectory: () => false, isFile: () => true }] as any;
        }
      });

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('file.proto');
    });

    it('should skip node_modules directory', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'file.proto', isDirectory: () => false, isFile: () => true },
      ] as any);

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('file.proto');
    });

    it('should skip hidden directories', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: '.git', isDirectory: () => true, isFile: () => false },
        { name: 'file.proto', isDirectory: () => false, isFile: () => true },
      ] as any);

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(1);
    });

    it('should handle read errors gracefully', () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const files = findProtoFiles('/test');
      expect(files).toEqual([]);
      expect(logger.verbose).toHaveBeenCalled();
    });

    it('should handle empty directories', () => {
      mockFs.readdirSync.mockReturnValue([]);
      const files = findProtoFiles('/test');
      expect(files).toEqual([]);
    });

    it('should collect files in provided array', () => {
      const existingFiles: string[] = ['existing.proto'];
      mockFs.readdirSync.mockReturnValue([{ name: 'new.proto', isDirectory: () => false, isFile: () => true }] as any);

      const files = findProtoFiles('/test', existingFiles);
      expect(files).toHaveLength(2);
      expect(files).toContain('existing.proto');
    });
  });

  describe('scanWorkspaceForProtoFiles', () => {
    let parser: ProtoParser;
    let analyzer: SemanticAnalyzer;

    beforeEach(() => {
      parser = new ProtoParser();
      analyzer = new SemanticAnalyzer();
    });

    it('should scan workspace folders and parse proto files', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      const detectProtoRootsSpy = jest.spyOn(analyzer, 'detectProtoRoots');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(updateFileSpy).toHaveBeenCalled();
      expect(detectProtoRootsSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Scanning'));
    });

    it('should handle multiple workspace folders', () => {
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue('syntax = "proto3";');

      scanWorkspaceForProtoFiles(['/workspace1', '/workspace2'], parser, analyzer);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('2 workspace folder'));
    });

    it('should handle parse errors gracefully', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'invalid.proto', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue('invalid proto content');

      const parseSpy = jest.spyOn(parser, 'parse').mockImplementation(() => {
        throw new Error('Parse error');
      });

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      // Should log verbose message about parse failure (with error message as second arg)
      expect(logger.verbose).toHaveBeenCalled();
      const calls = (logger.verbose as jest.Mock).mock.calls;
      const parseErrorCall = calls.find((call: any[]) => call[0] && call[0].includes('Failed to parse'));
      expect(parseErrorCall).toBeDefined();
      parseSpy.mockRestore();
    });

    it('should handle file read errors gracefully', () => {
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalled();
    });

    it('should log verbose information about found files', () => {
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue('syntax = "proto3";');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('Found'));
    });

    it('should log completion message', () => {
      mockFs.readdirSync.mockReturnValue([]);
      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Workspace scan complete'));
    });

    it('should scan full workspace and register protoSrcsDir as proto root when specified', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);
      mockFs.existsSync.mockReturnValue(true);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      const addProtoRootSpy = jest.spyOn(analyzer, 'addProtoRoot');

      const expectedProtoDir = path.resolve('/workspace', 'protos');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, 'protos');

      // Should scan the full workspace (starting from /workspace, not /workspace/protos)
      expect(updateFileSpy).toHaveBeenCalled();
      // Should register protoSrcsDir as a proto root
      expect(addProtoRootSpy).toHaveBeenCalledWith(expectedProtoDir);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Registered proto root'));
    });

    it('should log when protoSrcsDir does not exist but still scan workspace', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      // First call to existsSync (for protoSrcsDir) returns false
      // But the workspace scan should still proceed
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, 'protos');

      // Should still scan workspace even if protoSrcsDir doesn't exist
      expect(updateFileSpy).toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('should scan workspace root when protoSrcsDir is empty string', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, '');

      // Should still find and parse files in the workspace root
      expect(updateFileSpy).toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('Found'));
    });

    it('should reject protoSrcsDir with path traversal attempts but still scan workspace', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, '../../../etc');

      // Should still scan workspace
      expect(updateFileSpy).toHaveBeenCalled();
      // But should log the path traversal warning
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('outside workspace'));
    });
  });

  describe('scanImportPaths', () => {
    let parser: ProtoParser;
    let analyzer: SemanticAnalyzer;

    beforeEach(() => {
      parser = new ProtoParser();
      analyzer = new SemanticAnalyzer();
    });

    it('should return early for empty import paths', () => {
      scanImportPaths([], parser, analyzer);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Scanning'));
    });

    it('should scan import paths and parse proto files', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      const detectProtoRootsSpy = jest.spyOn(analyzer, 'detectProtoRoots');

      scanImportPaths(['/import-path'], parser, analyzer);

      expect(updateFileSpy).toHaveBeenCalled();
      expect(detectProtoRootsSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Scanning'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Import path scan complete'));
    });

    it('should skip non-existent import paths', () => {
      mockFs.existsSync.mockReturnValue(false);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');

      scanImportPaths(['/non-existent-path'], parser, analyzer);

      expect(updateFileSpy).not.toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('should handle multiple import paths', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([{ name: 'test.proto', isDirectory: () => false, isFile: () => true }] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      scanImportPaths(['/path1', '/path2'], parser, analyzer);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('2 import path'));
    });

    it('should handle parse errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'invalid.proto', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue('invalid proto content');

      const parseSpy = jest.spyOn(parser, 'parse').mockImplementation(() => {
        throw new Error('Parse error');
      });

      scanImportPaths(['/import-path'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalled();
      const calls = (logger.verbose as jest.Mock).mock.calls;
      const parseErrorCall = calls.find((call: any[]) => call[0] && call[0].includes('Failed to parse'));
      expect(parseErrorCall).toBeDefined();
      parseSpy.mockRestore();
    });

    it('should handle scan errors gracefully', () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Scan error');
      });

      scanImportPaths(['/import-path'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalledWith(
        expect.stringContaining('Failed to scan import path'),
        expect.any(String)
      );
    });

    it('should include hidden directories for import paths', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.existsSync.mockReturnValue(true);
      // First call returns hidden directory .buf-deps
      let callCount = 0;
      mockFs.readdirSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return [{ name: '.buf-deps', isDirectory: () => true, isFile: () => false }] as any;
        } else {
          return [{ name: 'dep.proto', isDirectory: () => false, isFile: () => true }] as any;
        }
      });
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');

      scanImportPaths(['/import-path'], parser, analyzer);

      // Should have found and parsed the proto file in .buf-deps
      expect(updateFileSpy).toHaveBeenCalled();
    });

    it('should not refresh proto roots when no files are found', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);

      const detectProtoRootsSpy = jest.spyOn(analyzer, 'detectProtoRoots');

      scanImportPaths(['/import-path'], parser, analyzer);

      // detectProtoRoots should not be called when no files are found
      expect(detectProtoRootsSpy).not.toHaveBeenCalled();
      // Completion message should not be logged when totalFiles is 0
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Import path scan complete'));
    });
  });
});
