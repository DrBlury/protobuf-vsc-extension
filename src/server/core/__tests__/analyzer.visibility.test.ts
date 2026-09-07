import * as fs from 'fs';
import * as path from 'path';
import { Language } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProtoParser } from '../parser';
import { SemanticAnalyzer } from '../analyzer';
import type { IProtoParser } from '../parserFactory';
import { TreeSitterProtoParser, initTreeSitterParser } from '../treeSitterParser';
import { DefinitionProvider } from '../../providers/definition';
import { RenameProvider } from '../../providers/rename';
import { ReferencesProvider } from '../../providers/references';
import { CompletionProvider } from '../../providers/completion';
import { ProviderRegistry } from '../../utils';

jest.unmock('web-tree-sitter');

const wasmPath = path.resolve(__dirname, '../../../../tree-sitter-proto/tree-sitter-proto.wasm');
const parserModes = fs.existsSync(wasmPath) ? ['legacy', 'tree-sitter'] : ['legacy'];

describe.each(parserModes)('protobuf symbol visibility (%s)', mode => {
  let parser: IProtoParser;
  let analyzer: SemanticAnalyzer;
  const add = (name: string, text: string) => {
    const uri = `file:///workspace/${name}`;
    analyzer.updateFile(uri, parser.parse(text, uri));
    return uri;
  };

  beforeAll(async () => {
    if (mode === 'tree-sitter') {
      const loadLanguage = Language.load.bind(Language);
      const load = jest
        .spyOn(Language, 'load')
        .mockImplementationOnce(input => loadLanguage(typeof input === 'string' ? fs.readFileSync(input) : input));
      try {
        await initTreeSitterParser(wasmPath);
      } finally {
        load.mockRestore();
      }
      parser = new TreeSitterProtoParser();
    } else {
      parser = new ProtoParser();
    }
  });

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    analyzer.setWorkspaceRoots(['/workspace']);
  });

  it('prefers a relative nested type over a root type with the same dotted spelling', () => {
    add('root.proto', 'syntax = "proto3"; message Outer { message Value {} }');
    const uri = add(
      'main.proto',
      `syntax = "proto3";
package p;
import "root.proto";
message Outer { message Value {} }
message Holder { Outer.Value value = 1; }`
    );
    expect(analyzer.resolveType('Outer.Value', uri, 'p.Holder')?.fullName).toBe('p.Outer.Value');
    expect(analyzer.resolveType('.Outer.Value', uri, 'p.Holder')?.fullName).toBe('Outer.Value');
  });

  it('does not escape an inner declaration that shadows a compound type prefix', () => {
    const uri = add(
      'main.proto',
      `syntax = "proto3";
message Outer { message Value {} }
message Holder { message Outer {} Outer.Value value = 1; }`
    );
    expect(analyzer.resolveType('Outer.Value', uri, 'Holder')).toBeUndefined();
    expect(analyzer.resolveType('.Outer.Value', uri, 'Holder')?.fullName).toBe('Outer.Value');
  });

  it('rejects unqualified sibling nested types and unrelated imported package types', () => {
    add('types.proto', 'syntax = "proto3"; package foreign; message Value {}');
    const uri = add(
      'main.proto',
      `syntax = "proto3";
import "types.proto";
message Outer { message Inner {} }
message Holder { Inner nested = 1; Value foreign = 2; }`
    );
    expect(analyzer.resolveType('Inner', uri, 'Holder')).toBeUndefined();
    expect(analyzer.resolveType('Value', uri, 'Holder')).toBeUndefined();
    expect(analyzer.resolveType('.foreign.Value', uri, 'Holder')?.fullName).toBe('foreign.Value');
  });

  it('requires an import even when a fully qualified definition exists in the workspace', () => {
    add('types.proto', 'syntax = "proto3"; package p; message Value {}');
    const text = 'syntax = "proto3"; message Holder { p.Value value = 1; }';
    const uri = add('main.proto', text);
    expect(analyzer.resolveType('p.Value', uri, 'Holder')).toBeUndefined();
    expect(
      new DefinitionProvider(analyzer).getDefinition(uri, { line: 0, character: text.indexOf('p.Value') }, text)
    ).toBeNull();
  });

  it.each(['', 'public '])('exposes only public re-exports through an import bridge (%s)', modifier => {
    const leaf = add('leaf.proto', 'syntax = "proto3"; package p; message Value {}');
    add('bridge.proto', `syntax = "proto3"; import ${modifier}"leaf.proto";`);
    const uri = add('main.proto', 'syntax = "proto3"; import "bridge.proto"; message Holder { p.Value value = 1; }');
    const visible = analyzer.getAccessibleSymbols(uri).some(symbol => symbol.fullName === 'p.Value');
    expect(visible).toBe(modifier === 'public ');
    expect(analyzer.resolveType('p.Value', uri, 'Holder')?.location.uri).toBe(modifier ? leaf : undefined);
  });

  it('handles public import cycles and keeps bridge imports used by their exported types', async () => {
    const leaf = add('leaf.proto', 'syntax = "proto3"; package p; import public "bridge.proto"; message Value {}');
    add('bridge.proto', 'syntax = "proto3"; import public "leaf.proto";');
    const text = 'syntax = "proto3"; import "bridge.proto"; message Holder { p.Value value = 1; }';
    const uri = add('main.proto', text);
    expect(analyzer.getVisibleFileUris(uri)).toContain(leaf);
    expect(new Set(analyzer.getVisibleFileUris(uri)).size).toBe(3);
    const providers = new ProviderRegistry();
    providers.diagnostics.updateSettings({ unusedSymbols: true, circularDependencies: false });
    for (const [fileUri, file] of analyzer.getAllFiles()) {
      providers.analyzer.updateFile(fileUri, file);
    }
    const diagnostics = await providers.diagnostics.validate(uri, analyzer.getFile(uri)!, providers, text);
    expect(diagnostics.filter(d => /not imported|Unknown type|Unused import/.test(d.message))).toEqual([]);
  });

  it('keeps duplicate file symbols visible and restores the remaining copy after removal', () => {
    const first = add('a/types.proto', 'syntax = "proto3"; package p; message Value { string first = 1; }');
    const second = add('b/types.proto', 'syntax = "proto3"; package p; message Value { string second = 1; }');
    expect(analyzer.getSymbolsInFile(first).some(symbol => symbol.fullName === 'p.Value')).toBe(true);
    expect(analyzer.getSymbolsInFile(second).some(symbol => symbol.fullName === 'p.Value')).toBe(true);
    analyzer.removeFile(second);
    expect(analyzer.getSymbol('p.Value')?.location.uri).toBe(first);
    expect(analyzer.getMessageDefinition('p.Value', first)?.fields[0]?.name).toBe('first');
  });

  it('isolates references and rename edits to the imported copy of a duplicate type', () => {
    const declaration = 'syntax = "proto3"; package p; message Value {}';
    const first = add('a/types.proto', declaration);
    const firstUser = add(
      'a/user.proto',
      'syntax = "proto3"; import "types.proto"; message Holder { p.Value value = 1; }'
    );
    const second = add('b/types.proto', declaration);
    add('b/user.proto', 'syntax = "proto3"; import "types.proto"; message Holder { p.Value value = 1; }');
    const position = { line: 0, character: declaration.indexOf('Value') };
    const edits = new RenameProvider(analyzer).rename(first, position, declaration, 'Result');
    expect(Array.from(edits.changes.keys()).sort()).toEqual([first, firstUser].sort());
    expect(edits.changes.has(second)).toBe(false);
    const references = new ReferencesProvider(analyzer).findReferences(first, position, declaration, true);
    expect(references.map(reference => reference.uri).sort()).toEqual([first, firstUser].sort());
  });

  it('resolves identical path imports independently in each workspace root', () => {
    analyzer.setWorkspaceRoots(['/workspace/a', '/workspace/b']);
    const first = add('a/shared/types.proto', 'syntax = "proto3"; package p; message Value {}');
    const second = add('b/shared/types.proto', 'syntax = "proto3"; package p; message Value {}');
    const source = 'syntax = "proto3"; import "shared/types.proto"; message Holder { p.Value value = 1; }';
    const firstUser = add('a/api/main.proto', source);
    const secondUser = add('b/api/main.proto', source);
    expect(analyzer.resolveImportToUri(firstUser, 'shared/types.proto')).toBe(first);
    expect(analyzer.resolveImportToUri(secondUser, 'shared/types.proto')).toBe(second);
  });

  it('resolves encoded file URIs against real configured include paths', () => {
    add('unrelated/types.proto', 'syntax = "proto3"; package p; message Value {}');
    const typeUri = add('team%20one/proto/types.proto', 'syntax = "proto3"; package p; message Value {}');
    analyzer.setImportPaths(['/workspace/team one/proto']);
    const consumer = add('team%20one/api/main.proto', 'syntax = "proto3"; import "types.proto";');
    expect(analyzer.resolveImportToUri(consumer, 'types.proto')).toBe(typeUri);
    expect(analyzer.getImportPathForFile(consumer, typeUri)).toBe('types.proto');
    expect(analyzer.getProtoRoots()).toContain('/workspace/team one/proto');
  });

  it('replaces an early suffix discovery when the exact relative import arrives', () => {
    const first = add('a/types.proto', 'syntax = "proto3"; package p; message Value {}');
    const consumer = add('b/main.proto', 'syntax = "proto3"; import "types.proto";');
    expect(analyzer.resolveImportToUri(consumer, 'types.proto')).toBe(first);
    const exact = add('b/types.proto', 'syntax = "proto3"; package p; message Value {}');
    expect(analyzer.resolveImportToUri(consumer, 'types.proto')).toBe(exact);
  });

  it('drops roots from removed files and replaced include settings', () => {
    analyzer.setImportPaths(['/old-includes']);
    const removed = add('removed/deep/types.proto', 'syntax = "proto3"; message Removed {}');
    add('remaining/main.proto', 'syntax = "proto3"; message Main {}');
    analyzer.addProtoRoot('/old-discovered');
    analyzer.removeFile(removed);
    analyzer.setImportPaths(['/new-includes']);
    analyzer.resetProtoRoots();
    const roots = analyzer.getProtoRoots();
    expect(roots).toContain('/new-includes');
    expect(roots).not.toContain('/old-includes');
    expect(roots).not.toContain('/old-discovered');
    expect(roots).not.toContain('/workspace/removed/deep');
  });

  it('completes nested types in the empty package with a resolvable enclosing name', () => {
    const text = 'syntax = "proto3";\nmessage Outer { message Inner {} }\nmessage Holder {\n  In\n}';
    const uri = add('main.proto', text);
    const completion = new CompletionProvider(analyzer)
      .getCompletions(uri, { line: 3, character: 4 }, '  In', undefined, text)
      .find(item => item.detail === 'Outer.Inner');
    expect(completion?.textEdit?.newText).toBe('Outer.Inner');
  });

  it('completes shadowed types using an absolute name', () => {
    const text =
      'syntax = "proto3";\nmessage Outer { message Inner {} }\nmessage Holder {\n  message Outer {}\n  In\n}';
    const uri = add('main.proto', text);
    const completion = new CompletionProvider(analyzer)
      .getCompletions(uri, { line: 4, character: 4 }, '  In', undefined, text)
      .find(item => item.detail === 'Outer.Inner');
    expect(completion?.textEdit?.newText).toBe('.Outer.Inner');
    const document = TextDocument.create(uri, 'proto', 1, text);
    expect(
      TextDocument.applyEdits(document, [completion!.textEdit! as import('vscode-languageserver/node').TextEdit])
    ).toContain('  .Outer.Inner');
  });
});
