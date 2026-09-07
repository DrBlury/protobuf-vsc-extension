import { addBufDependencies, readBufDependencies } from '../bufDependencies';

describe('Buf dependencies', () => {
  it('adds to inline lists without corrupting YAML and preserves comments', () => {
    const updated = addBufDependencies('version: v2\n# dependencies\ndeps: []\n', ['buf.build/acme/api']);
    expect(readBufDependencies(updated)).toEqual(['buf.build/acme/api']);
    expect(updated).toContain('# dependencies');
  });

  it('reads quoted dependencies with comments and compares exact names', () => {
    const content = 'version: v2\ndeps:\n  - "buf.build/acme/api-v2" # Keep this\n';
    const updated = addBufDependencies(content, ['buf.build/acme/api', 'buf.build/acme/api']);
    expect(readBufDependencies(updated)).toEqual(['buf.build/acme/api-v2', 'buf.build/acme/api']);
    expect(updated).toContain('# Keep this');
    expect(addBufDependencies(updated, ['buf.build/acme/api'])).toBe(updated);
  });

  it('ignores comments containing deps and safely quotes module text', () => {
    const module = 'value\nlint:\n  use: []';
    const updated = addBufDependencies('version: v2\n# deps: []\n', [module]);
    expect(readBufDependencies(updated)).toEqual([module]);
  });

  it.each(['deps: invalid', 'deps: [42]', 'deps: [""]', 'deps: ["   "]', 'deps: [unterminated'])(
    'rejects malformed config: %s',
    content => {
      expect(() => addBufDependencies(content, ['buf.build/acme/api'])).toThrow();
    }
  );
});
