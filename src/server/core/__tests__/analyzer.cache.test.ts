import { SemanticAnalyzer } from '../analyzer';
import { ProtoParser } from '../parser';

describe('semantic cache invalidation', () => {
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;
  const add = (uri: string, text: string) => analyzer.updateFile(uri, parser.parse(text, uri));

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    parser = new ProtoParser();
  });

  it('does not rescan workspace URIs for every field when an import is missing', () => {
    for (let i = 0; i < 60; i++) {
      add(`file:///workspace/p${i}/types.proto`, `syntax = "proto3"; message Value${i} {}`);
    }
    const uri = 'file:///workspace/main.proto';
    add(uri, 'syntax = "proto3"; import "missing/types.proto"; message Value {}');
    expect(analyzer.resolveType('Value', uri)?.name).toBe('Value');
    const normalize = jest.spyOn(analyzer as unknown as { normalizeUri(uri: string): string }, 'normalizeUri');

    for (let i = 0; i < 100; i++) {
      expect(analyzer.resolveType('Value', uri)?.name).toBe('Value');
      expect(analyzer.resolveImportToUri(uri, 'missing/types.proto')).toBeUndefined();
    }
    // Assert bounded work rather than a machine-dependent time threshold.
    expect(normalize).not.toHaveBeenCalled();
  });

  it('refreshes cached misses and visible closures when files arrive, change, or disappear', () => {
    const main = 'file:///workspace/main.proto';
    const dependency = 'file:///workspace/types.proto';
    add(main, 'syntax = "proto3"; import "types.proto";');
    expect(analyzer.resolveType('Value', main)).toBeUndefined();
    expect(analyzer.getVisibleFileUris(main)).toEqual([main]);

    add(dependency, 'syntax = "proto3"; message Value {}');
    expect(analyzer.resolveType('Value', main)?.location.uri).toBe(dependency);
    expect(analyzer.getVisibleFileUris(main)).toContain(dependency);

    add(dependency, 'syntax = "proto3"; message Changed {}');
    expect(analyzer.resolveType('Value', main)).toBeUndefined();
    expect(analyzer.resolveType('Changed', main)?.location.uri).toBe(dependency);

    analyzer.removeFile(dependency);
    expect(analyzer.resolveType('Changed', main)).toBeUndefined();
    expect(analyzer.getVisibleFileUris(main)).toEqual([main]);
  });

  it('refreshes public import closures after a bridge changes and protects cached arrays from callers', () => {
    const main = 'file:///workspace/main.proto';
    const bridge = 'file:///workspace/bridge.proto';
    const leaf = 'file:///workspace/leaf.proto';
    add(leaf, 'syntax = "proto3"; message Value {}');
    add(bridge, 'syntax = "proto3"; import "leaf.proto";');
    add(main, 'syntax = "proto3"; import "bridge.proto";');
    expect(analyzer.resolveType('Value', main)).toBeUndefined();

    add(bridge, 'syntax = "proto3"; import public "leaf.proto";');
    expect(analyzer.resolveType('Value', main)?.location.uri).toBe(leaf);
    analyzer.getVisibleFileUris(main).splice(0);
    expect(analyzer.getVisibleFileUris(main)).toContain(leaf);

    add(bridge, 'syntax = "proto3";');
    expect(analyzer.resolveType('Value', main)).toBeUndefined();
  });

  it.each(['includes', 'workspace', 'mappings'] as const)('refreshes import precedence when %s change', setting => {
    const first = 'file:///root-a/types.proto';
    const second = 'file:///root-b/types.proto';
    const main = 'file:///consumer/main.proto';
    add(first, 'syntax = "proto3"; message First {}');
    add(second, 'syntax = "proto3"; message Second {}');
    const importPath = setting === 'mappings' ? 'virtual/types.proto' : 'types.proto';
    const configure = (root: string) => {
      if (setting === 'includes') {
        analyzer.setImportPaths([root]);
      }
      if (setting === 'workspace') {
        analyzer.setWorkspaceRoots([root]);
      }
      if (setting === 'mappings') {
        analyzer.setImportPathMappings([{ virtual: 'virtual', actual: root }]);
      }
    };
    configure('/root-a');
    add(main, `syntax = "proto3"; import "${importPath}";`);
    expect(analyzer.getVisibleFileUris(main)).toContain(first);
    configure('/root-b');
    expect(analyzer.getVisibleFileUris(main)).toContain(second);
    expect(analyzer.getVisibleFileUris(main)).not.toContain(first);
  });
});
