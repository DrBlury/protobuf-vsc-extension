import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionKind, type TextEdit } from 'vscode-languageserver/node';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoFormatter } from '../formatter';
import { MigrationProvider } from '../migration';
import { CodeActionsProvider } from '../codeActions';
import { RenumberProvider } from '../renumber';
import { sourceTokens } from '../sourceTokens';

const uri = 'file:///preservation.proto';
const apply = (text: string, edits: TextEdit[]) =>
  TextDocument.applyEdits(TextDocument.create(uri, 'proto', 1, text), edits);
const code = (text: string) =>
  sourceTokens(text)
    .filter(token => token.kind !== 'comment')
    .map(token => token.text);

async function format(text: string, settings = {}) {
  const formatter = new ProtoFormatter();
  formatter.updateSettings(settings);
  return apply(text, await formatter.formatDocument(text, uri));
}

function organize(text: string): { text: string; edits: TextEdit[] } {
  const provider = new CodeActionsProvider(new SemanticAnalyzer(), new RenumberProvider(new ProtoParser()));
  provider.updateSettings({ organizeImports: { groupByCategory: false } });
  const action = provider.getCodeActions(
    uri,
    { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
    text
  )[0];
  const edits = action?.edit?.changes?.[uri] || [];
  return { text: apply(text, edits), edits };
}

describe('formatter preserves source meaning', () => {
  it.each([false, true])('preserves enum options and comments with alignment=%s', async alignFields => {
    const text = 'syntax = "proto3";\nenum E {\n  ZERO = 0 [(my.option) = 123]; // = 999\n}';
    const result = await format(text, { alignFields });
    expect(code(result)).toEqual(code(text));
    expect(result).toContain('// = 999');
    expect(await format(result, { alignFields })).toBe(result);
  });

  it('does not join a multiline tag behind a line comment', async () => {
    const text = 'syntax = "proto2";\nmessage T {\n optional string a = // tag below\n 1;\n}';
    const result = await format(text);
    expect(code(result)).toEqual(code(text));
    expect(result).toContain('// tag below\n');
    expect(await format(result)).toBe(result);
  });

  it('ignores comment and string braces when indenting', async () => {
    const text =
      'syntax = "proto2";\nmessage T { // }\noptional string value = 1 [default = "{"];\noptional int32 next = 2;\n}';
    const result = await format(text, { alignFields: false });
    expect(result).toContain('\n  optional int32 next = 2;');
    expect(code(result)).toEqual(code(text));
  });

  it('renumbers tags and inline declarations while preserving numeric options and comments', async () => {
    const text =
      'syntax = "proto2";\nmessage T {\n optional int32 a = 7 [default = 123]; // = 456\n optional int32 b = 9; optional int32 c = 10;\n}';
    const result = await format(text, { renumberOnFormat: true });
    const file = new ProtoParser().parse(result, uri);
    expect(file.messages[0]!.fields.map(field => field.number)).toEqual([1, 2, 3]);
    expect(result).toContain('default = 123');
    expect(result).toContain('// = 456');
    expect(await format(result, { renumberOnFormat: true })).toBe(result);
  });

  it('preserves enum reserved ranges during explicit renumbering', async () => {
    const text = 'syntax = "proto3";\nenum E { reserved 1 to 100000; ZERO = 0; NEXT = 100005; }';
    const result = apply(text, new RenumberProvider(new ProtoParser()).renumberDocument(text, uri));
    expect(new ProtoParser().parse(result, uri).enums[0]!.values.map(value => value.number)).toEqual([0, 100001]);
  });

  it('leaves the exclusive last line of a range untouched and ignores braces in earlier strings', async () => {
    const text =
      'syntax = "proto2";\noption java_package = "}";\nmessage T {\noptional string a = 1;\n optional int32 untouched=2;\n}';
    const formatter = new ProtoFormatter();
    const result = apply(
      text,
      await formatter.formatRange(text, { start: { line: 3, character: 0 }, end: { line: 4, character: 0 } }, uri)
    );
    expect(result).toContain('\n  optional string a = 1;\n optional int32 untouched=2;');
    expect(code(result)).toEqual(code(text));
  });
});

describe('migration applies non-overlapping source edits', () => {
  it('preserves comments, unrelated options and neighboring inline fields', () => {
    const text =
      'syntax = "proto2"; message T { required string a = 1 [default = "x,]", /* keep */ deprecated = true]; required int32 b = 2 [deprecated=true, default = 7]; }';
    const parser = new ProtoParser();
    const edits = new MigrationProvider().convertToProto3(parser.parse(text, uri), text, uri);
    const result = apply(text, edits);
    const file = parser.parse(result, uri);
    expect(file.syntaxErrors).toEqual([]);
    expect(file.syntax?.version).toBe('proto3');
    expect(file.messages[0]!.fields.map(field => field.modifier)).toEqual(['optional', 'optional']);
    expect(file.messages[0]!.fields.map(field => field.options?.map(option => option.name))).toEqual([
      ['deprecated'],
      ['deprecated'],
    ]);
    expect(result).toContain('/* keep */');
    expect(new MigrationProvider().convertToProto3(file, result, uri)).toEqual([]);
  });

  it('removes multiline standalone defaults and leaves default text in comments untouched', () => {
    const text =
      'syntax = "proto2";\nmessage T {\n // required default = 7\n required string a = 1 [\n default = "a\\"b,]"\n ];\n}';
    const parser = new ProtoParser();
    const result = apply(text, new MigrationProvider().convertToProto3(parser.parse(text, uri), text, uri));
    expect(parser.parse(result, uri).syntaxErrors).toEqual([]);
    expect(result).toContain('// required default = 7');
    expect(result).not.toContain('[');
  });

  it('does not add a syntax declaration to an edition file', () => {
    const text = 'edition = "2023"; message T { string a = 1; }';
    expect(new MigrationProvider().convertToProto3(new ProtoParser().parse(text, uri), text, uri)).toEqual([]);
  });
});

describe('organize imports preserves source context', () => {
  it('preserves comments, single quotes, duplicate comments, and EOF boundaries', () => {
    const text =
      'syntax = "proto3";\n/* import "fake.proto"; */\nimport "z.proto"; // z comment\n// a documentation\nimport \'a.proto\';\nimport "z.proto"; // duplicate note';
    const result = organize(text);
    expect(result.edits).toHaveLength(1);
    expect(result.text).toContain('/* import "fake.proto"; */');
    expect(result.text).toContain('// a documentation');
    expect(result.text).toContain('// z comment');
    expect(result.text).toContain('// duplicate note');
    expect(new ProtoParser().parse(result.text, uri).imports.map(item => item.path)).toEqual(['a.proto', 'z.proto']);
    expect(organize(result.text).edits).toEqual([]);
  });

  it('preserves declarations adjacent to inline imports', () => {
    const text = 'syntax = "proto3"; import "z.proto"; import "a.proto"; message T {}';
    const result = organize(text).text;
    const file = new ProtoParser().parse(result, uri);
    expect(file.syntax?.version).toBe('proto3');
    expect(file.imports.map(item => item.path)).toEqual(['a.proto', 'z.proto']);
    expect(file.messages[0]?.name).toBe('T');
    expect(file.syntaxErrors).toEqual([]);
  });
});
