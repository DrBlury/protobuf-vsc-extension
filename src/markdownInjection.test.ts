import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

describe('Markdown protobuf fence injection', () => {
  it('embeds source.proto for proto, protobuf, and proto3 fences', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      contributes: {
        grammars: Array<{ scopeName: string; path: string; injectTo?: string[] }>;
      };
    };
    const contribution = manifest.contributes.grammars.find(
      grammar => grammar.scopeName === 'markdown.codeblock.proto'
    );
    expect(contribution).toEqual(
      expect.objectContaining({
        path: './syntaxes/proto.markdown-injection.json',
        injectTo: ['text.html.markdown'],
      })
    );

    const grammar = JSON.parse(
      fs.readFileSync(path.join(root, 'syntaxes', 'proto.markdown-injection.json'), 'utf8')
    ) as {
      injectionSelector: string;
      repository: {
        fenced_code_block_proto: {
          begin: string;
          patterns: Array<{ patterns: Array<{ include: string }> }>;
        };
      };
    };
    const rule = grammar.repository.fenced_code_block_proto;

    expect(grammar.injectionSelector).toBe('L:text.html.markdown');
    expect(rule.begin).toContain('(protobuf|proto|proto3)');
    expect(rule.patterns[0]?.patterns).toContainEqual({ include: 'source.proto' });
  });
});
