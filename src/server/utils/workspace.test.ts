/**
 * Tests for workspace utilities
 */

import { findProtoFiles, scanWorkspaceForProtoFiles } from './workspace';
import { ProtoParser } from '../core/parser';
import { SemanticAnalyzer } from '../core/analyzer';
import { logger } from './logger';
import * as fs from 'fs';

jest.mock('fs');
jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    verbose: jest.fn()
  }
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
        { name: 'other.txt', isDirectory: () => false, isFile: () => true }
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
          return [
            { name: 'subdir', isDirectory: () => true, isFile: () => false }
          ] as any;
        } else {
          return [
            { name: 'file.proto', isDirectory: () => false, isFile: () => true }
          ] as any;
        }
      });

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('file.proto');
    });

    it('should skip node_modules directory', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'file.proto', isDirectory: () => false, isFile: () => true }
      ] as any);

      const files = findProtoFiles('/test');
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('file.proto');
    });

    it('should skip hidden directories', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: '.git', isDirectory: () => true, isFile: () => false },
        { name: 'file.proto', isDirectory: () => false, isFile: () => true }
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
      mockFs.readdirSync.mockReturnValue([
        { name: 'new.proto', isDirectory: () => false, isFile: () => true }
      ] as any);

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
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      const detectProtoRootsSpy = jest.spyOn(analyzer, 'detectProtoRoots');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(updateFileSpy).toHaveBeenCalled();
      expect(detectProtoRootsSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Scanning'));
    });

    it('should handle multiple workspace folders', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue('syntax = "proto3";');

      scanWorkspaceForProtoFiles(['/workspace1', '/workspace2'], parser, analyzer);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('2 workspace folder'));
    });

    it('should handle parse errors gracefully', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'invalid.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue('invalid proto content');

      const parseSpy = jest.spyOn(parser, 'parse').mockImplementation(() => {
        throw new Error('Parse error');
      });

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      // Should log verbose message about parse failure (with error message as second arg)
      expect(logger.verbose).toHaveBeenCalled();
      const calls = (logger.verbose as jest.Mock).mock.calls;
      const parseErrorCall = calls.find((call: any[]) =>
        call[0] && call[0].includes('Failed to parse')
      );
      expect(parseErrorCall).toBeDefined();
      parseSpy.mockRestore();
    });

    it('should handle file read errors gracefully', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalled();
    });

    it('should log verbose information about found files', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue('syntax = "proto3";');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('Found'));
    });

    it('should log completion message', () => {
      mockFs.readdirSync.mockReturnValue([]);
      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Workspace scan complete'));
    });

    it('should scan protoSrcsDir when specified', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);
      mockFs.existsSync.mockReturnValue(true);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, 'protos');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/workspace/protos');
      expect(updateFileSpy).toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('/workspace/protos'));
    });

    it('should skip workspace if protoSrcsDir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, 'protos');

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });

    it('should scan workspace root when protoSrcsDir is empty string', () => {
      const protoContent = 'syntax = "proto3"; message Test {}';
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.proto', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.readFileSync.mockReturnValue(protoContent);

      const updateFileSpy = jest.spyOn(analyzer, 'updateFile');
      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, '');

      // Should still find and parse files in the workspace root
      expect(updateFileSpy).toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('Found'));
    });

    it('should reject protoSrcsDir with path traversal attempts', () => {
      mockFs.existsSync.mockReturnValue(true);

      scanWorkspaceForProtoFiles(['/workspace'], parser, analyzer, '../../../etc');

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('outside workspace'));
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });
  });
});
