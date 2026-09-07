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
  const chunks: string[] = [];
  let offset = 0;
  for (const token of sourceTokens(text)) {
    if (token.kind === 'code') {
      continue;
    }
    chunks.push(text.slice(offset, token.start), token.text.replace(/[^\r\n]/g, ' '));
    offset = token.end;
  }
  chunks.push(text.slice(offset));
  return chunks.join('');
}
