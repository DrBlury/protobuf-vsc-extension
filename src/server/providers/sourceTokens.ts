/** Source tokens for edits that must preserve comments, strings, and exact offsets. */
export interface SourceToken {
  text: string;
  start: number;
  end: number;
  kind: 'code' | 'comment' | 'string';
}

export function sourceTokens(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  const pattern =
    /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_]\w*|[^\s]/g;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    tokens.push({
      text: value,
      start: match.index,
      end: match.index + value.length,
      kind: value.startsWith('//') || value.startsWith('/*') ? 'comment' : /^["']/.test(value) ? 'string' : 'code',
    });
  }
  return tokens;
}

export function maskNonCode(text: string): string {
  return maskTokens(text, token => token.kind !== 'code');
}

/** Mask comments while preserving strings, code, line breaks, and source offsets. */
export function maskComments(text: string): string {
  return maskTokens(text, token => token.kind === 'comment');
}

function maskTokens(text: string, shouldMask: (token: SourceToken) => boolean): string {
  const chunks: string[] = [];
  let offset = 0;
  for (const token of sourceTokens(text)) {
    if (!shouldMask(token)) {
      continue;
    }
    chunks.push(text.slice(offset, token.start), token.text.replace(/[^\r\n]/g, ' '));
    offset = token.end;
  }
  chunks.push(text.slice(offset));
  return chunks.join('');
}
