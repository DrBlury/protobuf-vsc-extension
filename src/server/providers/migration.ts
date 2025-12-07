import { TextEdit } from 'vscode-languageserver/node';
import { ProtoFile, FieldDefinition } from '../core/ast';

interface NodeWithFields {
    fields?: FieldDefinition[];
    nestedMessages?: NodeWithFields[];
}

export class MigrationProvider {
  public convertToProto3(file: ProtoFile, text: string, _uri: string): TextEdit[] {
    const edits: TextEdit[] = [];
    const lines = text.split('\n');

    // 1. Update syntax
    if (file.syntax) {
      if (file.syntax.version === 'proto2') {
        edits.push({
          range: file.syntax.range,
          newText: 'syntax = "proto3";'
        });
      }
    } else {
      // Add syntax at top
      edits.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        newText: 'syntax = "proto3";\n'
      });
    }

    // 2. Remove 'required' and 'default' from fields
    function visit(node: NodeWithFields): void {
      if (node.fields) {
        for (const field of node.fields as FieldDefinition[]) {
          const lineIndex = field.range.start.line;
          const line = lines[lineIndex];
          if (!line) {
              continue;
          }

          // Remove 'required'
          if (field.modifier === 'required') {
              // Simple string replacement on the line
              const newLine = line.replace(/\brequired\s+/, '');
              edits.push({
                  range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: line.length } },
                  newText: newLine
              });
          }

          // Remove 'default' option
          // This is tricky with regex if there are multiple options
          if (line.includes('default')) {
             let newLine = line.replace(/\[\s*default\s*=[^\]]+\]/, ''); // Remove standalone default
             newLine = newLine.replace(/,\s*default\s*=[^,\]]+/, ''); // Remove default in list
             newLine = newLine.replace(/default\s*=[^,\]]+\s*,/, ''); // Remove default at start of list

             // Clean up empty options []
             newLine = newLine.replace(/\s*\[\s*\]/, '');
             newLine = newLine.replace(/;\s*;/, ';'); // Double semicolon check

             if (newLine !== line) {
                 edits.push({
                     range: { start: { line: lineIndex, character: 0 }, end: { line: lineIndex, character: line.length } },
                     newText: newLine
                 });
             }
          }
        }
      }

      if (node.nestedMessages) {
        node.nestedMessages.forEach(visit);
      }
    }

    file.messages.forEach(visit);

    return edits;
  }
}
