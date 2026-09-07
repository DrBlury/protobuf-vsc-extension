import type { TextEdit, Position } from 'vscode-languageserver/node';
import type { ProtoFile, MessageDefinition, FieldDefinition } from '../core/ast';
import { sourceTokens, type SourceToken } from './sourceTokens';

export class MigrationProvider {
  public convertToProto3(file: ProtoFile, text: string, _uri: string): TextEdit[] {
    // Editions require a separate migration; adding syntax alongside edition is invalid.
    if (file.edition || file.syntax?.version === 'proto3') {
      return [];
    }
    const edits = this.convertFieldsToProto3(file.messages, text);
    edits.unshift(
      file.syntax
        ? { range: file.syntax.range, newText: 'syntax = "proto3";' }
        : {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            newText: 'syntax = "proto3";\n',
          }
    );
    return edits;
  }

  public convertFieldsToProto3(messages: MessageDefinition[], text: string): TextEdit[] {
    const lineOffsets = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        lineOffsets.push(i + 1);
      }
    }
    const offset = (position: Position) => (lineOffsets[position.line] ?? text.length) + position.character;
    const position = (offset: number): Position => {
      let line = 0;
      while (line + 1 < lineOffsets.length && lineOffsets[line + 1]! <= offset) {
        line++;
      }
      return { line, character: offset - lineOffsets[line]! };
    };
    const tokens = sourceTokens(text).filter(token => token.kind !== 'comment');
    const edits = new Map<number, TextEdit>();
    const replace = (token: SourceToken, newText = '') =>
      edits.set(token.start, {
        range: { start: position(token.start), end: position(token.end) },
        newText,
      });

    const visitField = (field: FieldDefinition) => {
      const typeStart = offset(field.fieldTypeRange.start);
      const typeIndex = tokens.findIndex(token => token.start === typeStart);
      if (field.modifier === 'required' && typeIndex > 0 && tokens[typeIndex - 1]!.text === 'required') {
        // optional retains explicit presence and remains valid while converting a single proto2 message.
        replace(tokens[typeIndex - 1]!, 'optional');
      }
      if (!field.options?.some(option => option.name === 'default')) {
        return;
      }
      let start = tokens.findIndex(token => token.start >= offset(field.nameRange.end));
      while (start >= 0 && start < tokens.length && !['[', ';'].includes(tokens[start]!.text)) {
        start++;
      }
      if (tokens[start]?.text !== '[') {
        return;
      }
      const segments: SourceToken[][] = [[]];
      const commas: SourceToken[] = [];
      let depth = 0;
      let end = start + 1;
      for (; end < tokens.length; end++) {
        const token = tokens[end]!;
        if (token.kind === 'code' && token.text === ']' && depth === 0) {
          break;
        }
        if (token.kind === 'code' && token.text === ',' && depth === 0) {
          commas.push(token);
          segments.push([]);
        } else {
          segments[segments.length - 1]!.push(token);
          if (token.kind === 'code' && ['[', '{', '<', '('].includes(token.text)) {
            depth++;
          }
          if (token.kind === 'code' && [']', '}', '>', ')'].includes(token.text)) {
            depth--;
          }
        }
      }
      if (tokens[end]?.text !== ']') {
        return;
      }
      const removed = segments.map(segment => segment[0]?.text === 'default' && segment[1]?.text === '=');
      for (let i = 0; i < segments.length; i++) {
        if (removed[i]) {
          segments[i]!.forEach(token => replace(token));
        }
      }
      const kept = segments.map((_segment, index) => index).filter(index => !removed[index]);
      if (!kept.length) {
        replace(tokens[start]!);
        replace(tokens[end]!);
      }
      // Keep exactly one delimiter between surviving options; comments are never removed.
      const keptCommas = new Set(kept.slice(0, -1).map(index => commas[index]));
      commas.filter(comma => !keptCommas.has(comma)).forEach(comma => replace(comma));
    };
    const visit = (message: MessageDefinition) => {
      message.fields.forEach(visitField);
      message.oneofs.forEach(oneof => oneof.fields.forEach(visitField));
      message.nestedMessages.forEach(visit);
    };
    messages.forEach(visit);
    return [...edits.values()];
  }
}
