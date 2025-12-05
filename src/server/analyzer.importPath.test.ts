import { SemanticAnalyzer } from './analyzer';

describe('SemanticAnalyzer getImportPathForFile', () => {
  const analyzer = new SemanticAnalyzer();

  it('returns canonical path for builtin google stubs', () => {
    const current = 'file:///workspace/example.proto';
    const target = 'builtin:///google/type/date.proto';

    const path = analyzer.getImportPathForFile(current, target);
    expect(path).toBe('google/type/date.proto');
  });

  it('returns canonical google path when resolved from real file location', () => {
    const current = 'file:///workspace/example.proto';
    const target = 'file:///workspace/resources/google-protos/google/protobuf/timestamp.proto';

    const path = analyzer.getImportPathForFile(current, target);
    expect(path).toBe('google/protobuf/timestamp.proto');
  });
});
