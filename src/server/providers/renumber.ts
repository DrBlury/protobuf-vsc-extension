/**
 * Field Renumbering Provider for Protocol Buffers
 * Provides automatic field number adjustment
 */

import type { TextEdit, Range, CodeAction, Position } from 'vscode-languageserver/node';
import { CodeActionKind } from 'vscode-languageserver/node';

import type {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  FieldDefinition,
  MapFieldDefinition,
  EnumValue,
  Range as AstRange,
} from '../core/ast';
import { MAX_FIELD_NUMBER } from '../core/ast';
import type { IProtoParser } from '../core/parserFactory';
import { FIELD_NUMBER } from '../utils/constants';

export interface RenumberSettings {
  startNumber: number;
  preserveReserved: boolean;
  skipReservedRange: boolean;
  increment: number;
}

const DEFAULT_SETTINGS: RenumberSettings = {
  startNumber: 1,
  preserveReserved: true,
  skipReservedRange: true,
  increment: 1,
};

export class RenumberProvider {
  private settings: RenumberSettings = DEFAULT_SETTINGS;
  private parser: IProtoParser;

  constructor(parser: IProtoParser) {
    this.parser = parser;
  }

  updateSettings(settings: Partial<RenumberSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Renumber all fields in a message
   */
  renumberMessage(text: string, uri: string, messageName: string): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const message = this.findMessage(file, messageName);

    if (!message) {
      return [];
    }

    return this.renumberMessageFields(text, message);
  }

  /**
   * Renumber all fields in the entire document
   */
  renumberDocument(text: string, uri: string, includeEnums = true): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const edits: TextEdit[] = [];

    // Renumber all messages
    for (const message of file.messages) {
      edits.push(...this.renumberMessageFieldsRecursive(text, message, includeEnums));
    }

    // Renumber all enums
    if (includeEnums) {
      for (const enumDef of file.enums) {
        edits.push(...this.renumberEnumValues(text, enumDef));
      }
    }

    return edits;
  }

  /**
   * Renumber fields in a message starting from a specific field
   */
  renumberFromField(text: string, uri: string, position: Position): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const lines = text.split('\n');

    // Find which message contains this position
    const message = this.findMessageAtPosition(file, position);
    if (!message) {
      return [];
    }

    // Find which field is at or after this position
    const allFields = [...message.fields, ...message.maps, ...message.oneofs.flatMap(o => o.fields)];

    // Sort fields by their position in the document
    allFields.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });

    // Include the field containing the cursor and subsequent fields, even when
    // multiple declarations share a line or a declaration spans several lines.
    const firstField = allFields.findIndex(
      field =>
        field.range.end.line > position.line ||
        (field.range.end.line === position.line && field.range.end.character >= position.character)
    );
    const fieldsToRenumber = firstField < 0 ? [] : allFields.slice(firstField);

    if (fieldsToRenumber.length === 0) {
      return [];
    }

    // Get the starting number (from the first field to renumber or calculate)
    let nextNumber = this.settings.startNumber;

    // If there are fields before, continue from the last number
    const fieldsBefore = allFields.slice(0, firstField);
    if (fieldsBefore.length > 0) {
      const lastField = fieldsBefore[fieldsBefore.length - 1]!;
      nextNumber = lastField.number + this.settings.increment;
    }

    // Get reserved numbers to skip
    const reservedRanges = this.getReservedRanges(message);

    const edits: TextEdit[] = [];

    for (const field of fieldsToRenumber) {
      nextNumber = this.skipReservedNumbers(nextNumber, reservedRanges);

      if (field.number !== nextNumber) {
        const edit = this.createFieldNumberEdit(lines, field, nextNumber);
        if (edit) {
          edits.push(edit);
        }
      }

      nextNumber += this.settings.increment;
    }

    return edits;
  }

  /**
   * Renumber enum values
   */
  renumberEnum(text: string, uri: string, enumName: string): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const enumDef = this.findEnum(file, enumName);

    if (!enumDef) {
      return [];
    }

    return this.renumberEnumValues(text, enumDef);
  }

  /**
   * Get the next available field number for a message
   */
  getNextFieldNumber(text: string, uri: string, messageName: string): number {
    const file = this.parser.parse(text, uri);
    const message = this.findMessage(file, messageName);

    if (!message) {
      return this.settings.startNumber;
    }

    const allFields = [...message.fields, ...message.maps, ...message.oneofs.flatMap(o => o.fields)];
    const nextNumber = allFields.length
      ? Math.max(...allFields.map(field => field.number)) + this.settings.increment
      : this.settings.startNumber;
    return this.skipReservedNumbers(nextNumber, this.getReservedRanges(message));
  }

  /**
   * Get the next available enum value number
   */
  getNextEnumNumber(text: string, uri: string, enumName: string): number {
    const file = this.parser.parse(text, uri);
    const enumDef = this.findEnum(file, enumName);

    if (!enumDef || enumDef.values.length === 0) {
      return 0;
    }

    const maxNumber = Math.max(...enumDef.values.map(v => v.number));
    return maxNumber + this.settings.increment;
  }

  private renumberMessageFields(text: string, message: MessageDefinition): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];

    const allFields = [...message.fields, ...message.maps, ...message.oneofs.flatMap(o => o.fields)];

    // Sort fields by their position in the document
    allFields.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });

    const reservedRanges = this.getReservedRanges(message);
    let nextNumber = this.settings.startNumber;

    for (const field of allFields) {
      nextNumber = this.skipReservedNumbers(nextNumber, reservedRanges);

      if (field.number !== nextNumber) {
        const edit = this.createFieldNumberEdit(lines, field, nextNumber);
        if (edit) {
          edits.push(edit);
        }
      }

      nextNumber += this.settings.increment;
    }

    return edits;
  }

  private renumberMessageFieldsRecursive(text: string, message: MessageDefinition, includeEnums = true): TextEdit[] {
    const edits: TextEdit[] = [];

    edits.push(...this.renumberMessageFields(text, message));

    // Recurse into nested messages
    for (const nested of message.nestedMessages) {
      edits.push(...this.renumberMessageFieldsRecursive(text, nested, includeEnums));
    }

    // Renumber nested enums
    if (includeEnums) {
      for (const nested of message.nestedEnums) {
        edits.push(...this.renumberEnumValues(text, nested));
      }
    }

    return edits;
  }

  private renumberEnumValues(text: string, enumDef: EnumDefinition): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];

    // Sort values by their position in the document
    const sortedValues = [...enumDef.values].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });

    // First value should be 0 in proto3. Enum reservations apply independently
    // of the field-only 19000-19999 reserved range.
    let nextNumber = 0;
    const reserved = this.settings.preserveReserved
      ? enumDef.reserved
          .flatMap(statement =>
            statement.ranges.map(range => ({
              start: range.start,
              end: range.end === 'max' ? 2147483647 : range.end,
            }))
          )
          .sort((left, right) => left.start - right.start)
      : [];

    for (const value of sortedValues) {
      for (const range of reserved) {
        if (nextNumber >= range.start && nextNumber <= range.end) {
          nextNumber += Math.ceil((range.end + 1 - nextNumber) / this.settings.increment) * this.settings.increment;
        }
      }
      if (!Number.isSafeInteger(nextNumber) || nextNumber < 0 || nextNumber > 2147483647) {
        throw new Error('No available enum number remains within the valid protobuf range.');
      }
      if (value.number !== nextNumber) {
        const edit = this.createEnumValueEdit(lines, value, nextNumber);
        if (edit) {
          edits.push(edit);
        }
      }
      nextNumber += this.settings.increment;
    }

    return edits;
  }

  private createFieldNumberEdit(
    lines: string[],
    field: FieldDefinition | MapFieldDefinition,
    newNumber: number
  ): TextEdit | null {
    return this.createNumberEdit(lines, field, newNumber);
  }

  private createEnumValueEdit(lines: string[], value: EnumValue, newNumber: number): TextEdit | null {
    return this.createNumberEdit(lines, value, newNumber);
  }

  private createNumberEdit(
    lines: string[],
    node: { nameRange: Range; range: Range },
    newNumber: number
  ): TextEdit | null {
    const start = node.nameRange.end;
    const end = node.range.end;
    const declarationLines = lines.slice(start.line, end.line + 1);
    if (!declarationLines.length) {
      return null;
    }
    declarationLines[declarationLines.length - 1] = declarationLines[declarationLines.length - 1]!.slice(
      0,
      end.character
    );
    declarationLines[0] = declarationLines[0]!.slice(start.character);
    // Mask comments to preserve source offsets while ignoring any '=' or
    // digits in them. Only search the portion after this declaration's name.
    const source = declarationLines
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, comment => comment.replace(/[^\n]/g, ' '));
    const match = /^\s*=\s*([+-]?(?:0[xX][0-9a-fA-F]+|\d+))\b/.exec(source);
    if (!match) {
      return null;
    }
    const numberOffset = match[0].lastIndexOf(match[1]!);
    const prefixLines = source.slice(0, numberOffset).split('\n');
    const line = start.line + prefixLines.length - 1;
    const character = prefixLines[prefixLines.length - 1]!.length + (prefixLines.length === 1 ? start.character : 0);
    return {
      range: {
        start: { line, character },
        end: { line, character: character + match[1]!.length },
      },
      newText: newNumber.toString(),
    };
  }

  private getReservedRanges(message: MessageDefinition): Array<{ start: number; end: number }> {
    const ranges = this.settings.preserveReserved
      ? message.reserved.flatMap(reserved =>
          reserved.ranges.map(range => ({
            start: range.start,
            end: range.end === 'max' ? MAX_FIELD_NUMBER : range.end,
          }))
        )
      : [];
    if (this.settings.skipReservedRange) {
      ranges.push({ start: FIELD_NUMBER.RESERVED_RANGE_START, end: FIELD_NUMBER.RESERVED_RANGE_END });
    }
    return ranges.sort((left, right) => left.start - right.start);
  }

  private skipReservedNumbers(nextNumber: number, ranges: Array<{ start: number; end: number }>): number {
    for (const range of ranges) {
      if (nextNumber >= range.start && nextNumber <= range.end) {
        // Jump over intervals without expanding potentially hundreds of
        // millions of reserved tags or truncating them to an arbitrary limit.
        nextNumber += Math.ceil((range.end + 1 - nextNumber) / this.settings.increment) * this.settings.increment;
      }
    }
    if (!Number.isSafeInteger(nextNumber) || nextNumber < 1 || nextNumber > MAX_FIELD_NUMBER) {
      throw new Error('No available field number remains within the valid protobuf range.');
    }
    return nextNumber;
  }

  private findMessage(file: ProtoFile, name: string): MessageDefinition | null {
    // Search top-level messages
    for (const message of file.messages) {
      if (message.name === name) {
        return message;
      }
      // Search nested messages
      const nested = this.findNestedMessage(message, name);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  private findNestedMessage(message: MessageDefinition, name: string): MessageDefinition | null {
    for (const nested of message.nestedMessages) {
      if (nested.name === name) {
        return nested;
      }
      const found = this.findNestedMessage(nested, name);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private findEnum(file: ProtoFile, name: string): EnumDefinition | null {
    // Search top-level enums
    for (const enumDef of file.enums) {
      if (enumDef.name === name) {
        return enumDef;
      }
    }

    // Search enums inside messages
    for (const message of file.messages) {
      const found = this.findEnumInMessage(message, name);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private findEnumInMessage(message: MessageDefinition, name: string): EnumDefinition | null {
    for (const enumDef of message.nestedEnums) {
      if (enumDef.name === name) {
        return enumDef;
      }
    }

    for (const nested of message.nestedMessages) {
      const found = this.findEnumInMessage(nested, name);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private findMessageAtPosition(file: ProtoFile, position: Position): MessageDefinition | null {
    for (const message of file.messages) {
      if (this.isPositionInRange(position, message.range)) {
        // Check nested messages first (more specific)
        const nested = this.findMessageAtPositionRecursive(message, position);
        return nested || message;
      }
    }
    return null;
  }

  private findMessageAtPositionRecursive(message: MessageDefinition, position: Position): MessageDefinition | null {
    for (const nested of message.nestedMessages) {
      if (this.isPositionInRange(position, nested.range)) {
        const deeper = this.findMessageAtPositionRecursive(nested, position);
        return deeper || nested;
      }
    }
    return null;
  }

  private isPositionInRange(position: Position, range: AstRange): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    return true;
  }

  /**
   * Create code actions for renumbering
   */
  getCodeActions(text: string, uri: string, range: Range): CodeAction[] {
    const file = this.parser.parse(text, uri);
    const actions: CodeAction[] = [];

    // Find message at cursor
    const message = this.findMessageAtPosition(file, range.start);
    if (message) {
      actions.push({
        title: `Renumber fields in '${message.name}'`,
        kind: CodeActionKind.RefactorRewrite,
        command: {
          title: 'Renumber Fields',
          command: 'protobuf.renumberMessage',
          arguments: [uri, message.name],
        },
      });

      actions.push({
        title: `Renumber fields from cursor in '${message.name}'`,
        kind: CodeActionKind.RefactorRewrite,
        command: {
          title: 'Renumber From Here',
          command: 'protobuf.renumberFromCursor',
          arguments: [uri, range.start],
        },
      });
    }

    // Add document-wide action
    actions.push({
      title: 'Renumber all fields in document',
      kind: CodeActionKind.RefactorRewrite,
      command: {
        title: 'Renumber Document',
        command: 'protobuf.renumberDocument',
        arguments: [uri],
      },
    });

    return actions;
  }
}
