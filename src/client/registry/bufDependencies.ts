import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

function parseBufConfig(content: string) {
  const document = parseDocument(content);
  if (document.errors.length > 0) {
    throw new Error(`Invalid buf configuration: ${document.errors[0]!.message}`);
  }
  if (!isMap(document.contents)) {
    throw new Error('Buf configuration must contain a YAML mapping');
  }
  const deps = document.get('deps', true);
  if (deps !== undefined && deps !== null && !(isScalar(deps) && deps.value === null) && !isSeq(deps)) {
    throw new Error('Buf dependencies must be a YAML list');
  }
  return document;
}

export function readBufDependencies(content: string): string[] {
  const document = parseBufConfig(content);
  const deps = document.get('deps', true);
  if (!isSeq(deps)) {
    return [];
  }
  return deps.items.map(item => {
    if (!isScalar(item) || typeof item.value !== 'string' || item.value.trim().length === 0) {
      throw new Error('Each Buf dependency must be a non-empty string');
    }
    return item.value;
  });
}

export function addBufDependencies(content: string, modules: readonly string[]): string {
  if (modules.some(module => typeof module !== 'string' || module.trim().length === 0)) {
    throw new Error('Each Buf dependency must be a non-empty string');
  }
  const existing = readBufDependencies(content);
  const additions = [...new Set(modules)].filter(module => !existing.includes(module));
  if (additions.length === 0) {
    return content;
  }
  const document = parseBufConfig(content);
  const deps = document.get('deps', true);
  if (isSeq(deps)) {
    for (const module of additions) {
      deps.add(module);
    }
  } else {
    document.set('deps', additions);
  }
  return document.toString({ lineWidth: 0 });
}
