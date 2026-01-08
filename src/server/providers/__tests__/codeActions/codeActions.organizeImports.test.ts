/**
 * Tests for Organize Imports feature with grouping
 */

import { CodeActionsProvider } from '../../codeActions';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { RenumberProvider } from '../../renumber';
import { Range, CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider Organize Imports', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let renumberProvider: RenumberProvider;
  let codeActionsProvider: CodeActionsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    renumberProvider = new RenumberProvider(parser);
    codeActionsProvider = new CodeActionsProvider(analyzer, renumberProvider);
  });

  describe('Import Grouping', () => {
    it('should group imports by category (google, third-party, local)', () => {
      const content = `syntax = "proto3";

import "google/protobuf/timestamp.proto";
import "myproject/v1/user.proto";
import "google/protobuf/any.proto";
import "validate/validate.proto";
import "myproject/v1/auth.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      // Enable grouping (default)
      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // Should have blank lines between groups
        expect(newText).toContain('\n\n');

        // Google protos should come first
        const googleIndex = newText.indexOf('google/protobuf/any.proto');
        const validateIndex = newText.indexOf('validate/validate.proto');
        const localIndex = newText.indexOf('myproject/v1/auth.proto');

        expect(googleIndex).toBeLessThan(validateIndex);
        expect(validateIndex).toBeLessThan(localIndex);
      }
    });

    it('should sort alphabetically within groups', () => {
      const content = `syntax = "proto3";

import "google/protobuf/timestamp.proto";
import "google/protobuf/any.proto";
import "google/protobuf/empty.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // Should be sorted: any, empty, timestamp
        const anyIndex = newText.indexOf('any.proto');
        const emptyIndex = newText.indexOf('empty.proto');
        const timestampIndex = newText.indexOf('timestamp.proto');

        expect(anyIndex).toBeLessThan(emptyIndex);
        expect(emptyIndex).toBeLessThan(timestampIndex);
      }
    });

    it('should not add blank lines when grouping is disabled', () => {
      // Use unsorted imports so the action is triggered
      const content = `syntax = "proto3";

import "myproject/v1/user.proto";
import "google/protobuf/timestamp.proto";
import "validate/validate.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      // Disable grouping
      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: false },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // Should not have double newlines (no group separation)
        expect(newText).not.toContain('\n\n');
      }
    });

    it('should categorize third-party imports correctly', () => {
      const content = `syntax = "proto3";

import "buf/validate/validate.proto";
import "google/api/annotations.proto";
import "grpc/health/v1/health.proto";
import "envoy/config/core/v3/base.proto";
import "local/service.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // All third-party imports should be grouped together
        const bufIndex = newText.indexOf('buf/validate');
        const googleApiIndex = newText.indexOf('google/api');
        const grpcIndex = newText.indexOf('grpc/health');
        const envoyIndex = newText.indexOf('envoy/config');
        const localIndex = newText.indexOf('local/service');

        // All third-party should come before local
        expect(bufIndex).toBeLessThan(localIndex);
        expect(googleApiIndex).toBeLessThan(localIndex);
        expect(grpcIndex).toBeLessThan(localIndex);
        expect(envoyIndex).toBeLessThan(localIndex);
      }
    });

    it('should handle public and weak modifiers', () => {
      const content = `syntax = "proto3";

import "zebra.proto";
import public "alpha.proto";
import weak "beta.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // Public should come first, then weak, then regular
        const publicIndex = newText.indexOf('import public');
        const weakIndex = newText.indexOf('import weak');
        const regularIndex = newText.indexOf('import "zebra');

        expect(publicIndex).toBeLessThan(weakIndex);
        expect(weakIndex).toBeLessThan(regularIndex);
      }
    });

    it('should return null when imports are already organized', () => {
      // Already organized content - imports sorted within groups with blank lines between
      const content = `syntax = "proto3";

import "google/protobuf/any.proto";
import "google/protobuf/timestamp.proto";

import "validate/validate.proto";

import "myproject/v1/auth.proto";
import "myproject/v1/user.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } };

      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      // When imports are already organized, createOrganizeImportsAction returns null
      // so there should be no organize action (or it should be empty)
      const organizeAction = actions.find(
        a => a.kind === CodeActionKind.SourceOrganizeImports && a.title?.includes('Organize imports')
      );

      // The action may exist but with the "Add missing imports" title if no changes needed
      // If it's specifically the organize action, it should not be present
      expect(organizeAction).toBeUndefined();
    });

    it('should remove duplicate imports', () => {
      const content = `syntax = "proto3";

import "google/protobuf/timestamp.proto";
import "google/protobuf/timestamp.proto";
import "myproject/v1/user.proto";
import "myproject/v1/user.proto";

message Test {}`;
      const uri = 'file:///test.proto';
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };

      codeActionsProvider.updateSettings({
        organizeImports: { groupByCategory: true },
      });

      const actions = codeActionsProvider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        content
      );

      const organizeAction = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
      expect(organizeAction).toBeDefined();

      if (organizeAction?.edit?.changes?.[uri]) {
        const edits = organizeAction.edit.changes[uri];
        const newText = edits.map(e => e.newText).join('');

        // Count occurrences of each import
        const timestampCount = (newText.match(/google\/protobuf\/timestamp\.proto/g) || []).length;
        const userCount = (newText.match(/myproject\/v1\/user\.proto/g) || []).length;

        expect(timestampCount).toBe(1);
        expect(userCount).toBe(1);
      }
    });
  });
});
