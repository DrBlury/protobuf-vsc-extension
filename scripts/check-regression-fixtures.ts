/**
 * Validates regression proto fixtures against formatter and semicolon-fix regressions.
 *
 * This intentionally includes nested hidden fixture directories such as .buf-deps,
 * because bundled workspace dependencies can expose formatter/code-action edge cases.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { CodeActionKind } from 'vscode-languageserver/node';
import { ProtoFormatter } from '../src/server/providers/formatter';
import { LogLevel, logger, ProviderRegistry } from '../src/server/utils';

const SKIP_FIXTURES = new Map<string, string>([
  [
    'examples/regressions/issue-68-document-symbol-name/invalid-symbols.proto',
    'intentionally malformed regression fixture for missing symbol names',
  ],
]);

function toRepoRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join('/');
}

function shouldSkip(filePath: string): boolean {
  return SKIP_FIXTURES.has(toRepoRelativePath(filePath));
}

function findProtoFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(directory: string): void {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.proto') && !shouldSkip(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files.sort();
}

function applyFormatterResult(original: string, edits: { newText: string }[]): string {
  if (edits.length === 0) {
    return original;
  }
  if (edits.length !== 1) {
    throw new Error(`expected one full-document edit, got ${edits.length}`);
  }
  return edits[0]!.newText;
}

function collectFieldDigest(file: any): string[] {
  const out: string[] = [];

  const visitEnum = (prefix: string, enumDef: any): void => {
    const name = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;
    for (const value of enumDef.values || []) {
      out.push(`enum:${name}.${value.name}=${value.number}`);
    }
  };

  const visitMessage = (prefix: string, message: any): void => {
    const name = prefix ? `${prefix}.${message.name}` : message.name;
    for (const field of message.fields || []) {
      out.push(`field:${name}.${field.name}=${field.number}`);
    }
    for (const map of message.maps || []) {
      out.push(`map:${name}.${map.name}=${map.number}`);
    }
    for (const group of message.groups || []) {
      out.push(`group:${name}.${group.name}=${group.number}`);
      visitMessage(name, group);
    }
    for (const oneof of message.oneofs || []) {
      for (const field of oneof.fields || []) {
        out.push(`oneof:${name}.${oneof.name}.${field.name}=${field.number}`);
      }
    }
    for (const nested of message.nestedMessages || []) {
      visitMessage(name, nested);
    }
    for (const nestedEnum of message.nestedEnums || []) {
      visitEnum(name, nestedEnum);
    }
  };

  for (const message of file.messages || []) {
    visitMessage(file.package?.name || '', message);
  }
  for (const enumDef of file.enums || []) {
    visitEnum(file.package?.name || '', enumDef);
  }
  for (const extend of file.extends || []) {
    const name = `extend:${extend.extendType || extend.messageName}`;
    for (const field of extend.fields || []) {
      out.push(`field:${name}.${field.name}=${field.number}`);
    }
    for (const group of extend.groups || []) {
      out.push(`group:${name}.${group.name}=${group.number}`);
    }
  }

  return out.sort();
}

function collectShapeDigest(file: any): string {
  return JSON.stringify({
    syntax: file.syntax?.version || null,
    edition: file.edition?.edition || null,
    package: file.package?.name || null,
    imports: (file.imports || []).map((imp: any) => imp.path).sort(),
    messages: (file.messages || []).map((message: any) => message.name).sort(),
    enums: (file.enums || []).map((enumDef: any) => enumDef.name).sort(),
    services: (file.services || []).map((service: any) => service.name).sort(),
    extends: (file.extends || []).map((extend: any) => extend.extendType || extend.messageName).sort(),
    fields: collectFieldDigest(file),
  });
}

async function main(): Promise<void> {
  logger.setLevel(LogLevel.ERROR);

  const regressionRoot = path.join(process.cwd(), 'examples/regressions');
  const files = findProtoFiles(regressionRoot);
  const providers = new ProviderRegistry();
  const formatter = new ProtoFormatter();
  const originalText = new Map<string, string>();
  const failures: string[] = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    originalText.set(file, text);
    providers.analyzer.updateFile(pathToFileURL(file).href, providers.parser.parse(text, pathToFileURL(file).href));
  }

  for (const file of files) {
    const rel = toRepoRelativePath(file);
    const uri = pathToFileURL(file).href;
    const text = originalText.get(file)!;
    const parsed = providers.parser.parse(text, uri);
    const syntaxErrors = parsed.syntaxErrors || [];

    if (syntaxErrors.length > 0) {
      failures.push(`${rel}: original parse syntax errors: ${syntaxErrors.map(error => error.message).join('; ')}`);
      continue;
    }

    const diagnostics = await providers.diagnostics.validate(uri, parsed, providers, text);
    const semicolonDiagnostics = diagnostics.filter(diagnostic => diagnostic.message === 'Missing semicolon');
    if (semicolonDiagnostics.length > 0) {
      failures.push(
        `${rel}: default diagnostics unexpectedly report missing semicolon on lines ${semicolonDiagnostics
          .map(diagnostic => diagnostic.range.start.line + 1)
          .join(', ')}`
      );
    }

    const lineCount = text.split('\n').length;
    const actions = providers.codeActions.getCodeActions(
      uri,
      { start: { line: 0, character: 0 }, end: { line: lineCount, character: 0 } },
      { diagnostics: [], only: [CodeActionKind.Source] },
      text
    );
    const semicolonActions = actions.filter(action => action.title?.toLowerCase().includes('semicolon'));
    if (semicolonActions.length > 0) {
      failures.push(
        `${rel}: source code action unexpectedly offers semicolon fix: ${semicolonActions
          .map(action => action.title)
          .join(', ')}`
      );
    }

    const formatted = applyFormatterResult(text, (await formatter.formatDocument(text, uri)) as { newText: string }[]);
    const formattedParsed = providers.parser.parse(formatted, uri);
    const formattedSyntaxErrors = formattedParsed.syntaxErrors || [];

    if (formattedSyntaxErrors.length > 0) {
      failures.push(
        `${rel}: formatted parse syntax errors: ${formattedSyntaxErrors.map(error => error.message).join('; ')}`
      );
    }

    if (/^\s*(message|enum|service|oneof|extend)\b[^\n{;]*;\s*\n\s*\{/m.test(formatted)) {
      failures.push(`${rel}: formatter introduced semicolon before block brace`);
    }

    if (collectShapeDigest(parsed) !== collectShapeDigest(formattedParsed)) {
      failures.push(`${rel}: formatter changed parsed schema shape or field/enum numbers`);
    }
  }

  if (failures.length > 0) {
    console.error(`Regression fixture validation failed (${failures.length}):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Regression fixture validation passed for ${files.length} proto files.`);
  console.log(
    'Checked: original parse, default missing-semicolon diagnostics, semicolon source action, formatted parse, block-header semicolons, schema shape, field/enum numbers.'
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
