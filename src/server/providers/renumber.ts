/**
 * Field Renumbering Provider for Protocol Buffers
 * Provides automatic field number adjustment
 */

import {
  TextEdit,
  Range,
  CodeAction,
  CodeActionKind,
  Position
} from 'vscode-languageserver/node';

import { ProtoFile, MessageDefinition, EnumDefinition, FieldDefinition, MapFieldDefinition, EnumValue, Range as AstRange, MAX_FIELD_NUMBER } from '../core/ast';
import { IProtoParser } from '../core/parserFactory';
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
  increment: 1
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
  renumberMessage(
    text: string,
    uri: string,
    messageName: string
  ): TextEdit[] {
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
  renumberDocument(text: string, uri: string): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const edits: TextEdit[] = [];

    // Renumber all messages
    for (const message of file.messages) {
      edits.push(...this.renumberMessageFieldsRecursive(text, message));
    }

    // Renumber all enums
    for (const enumDef of file.enums) {
      edits.push(...this.renumberEnumValues(text, enumDef));
    }

    return edits;
  }

  /**
   * Renumber fields in a message starting from a specific field
   */
  renumberFromField(
    text: string,
    uri: string,
    position: Position
  ): TextEdit[] {
    const file = this.parser.parse(text, uri);
    const lines = text.split('\n');

    // Find which message contains this position
    const message = this.findMessageAtPosition(file, position);
    if (!message) {
      return [];
    }

    // Find which field is at or after this position
    const allFields = [
      ...message.fields,
      ...message.maps,
      ...message.oneofs.flatMap(o => o.fields)
    ];

    // Sort fields by their position in the document
    allFields.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });

    // Find fields at or after the cursor position
    const fieldsToRenumber = allFields.filter(
      f => f.range.start.line >= position.line
    );

    if (fieldsToRenumber.length === 0) {
      return [];
    }

    // Get the starting number (from the first field to renumber or calculate)
    let nextNumber = this.settings.startNumber;

    // If there are fields before, continue from the last number
    const fieldsBefore = allFields.filter(f => f.range.start.line < position.line);
    if (fieldsBefore.length > 0) {
      const lastField = fieldsBefore[fieldsBefore.length - 1]!;
      nextNumber = lastField.number + this.settings.increment;
    }

    // Get reserved numbers to skip
    const reservedNumbers = this.getReservedNumbers(message);

    const edits: TextEdit[] = [];

    for (const field of fieldsToRenumber) {
      // Skip reserved numbers if setting is enabled
      while (this.settings.skipReservedRange && reservedNumbers.has(nextNumber)) {
        nextNumber += this.settings.increment;
      }

      // Skip the internal reserved range
      if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
        nextNumber = 20000;
      }

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
  renumberEnum(
    text: string,
    uri: string,
    enumName: string
  ): TextEdit[] {
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

    const allFields = [
      ...message.fields,
      ...message.maps,
      ...message.oneofs.flatMap(o => o.fields)
    ];

    if (allFields.length === 0) {
      return this.settings.startNumber;
    }

    const maxNumber = Math.max(...allFields.map(f => f.number));
    let nextNumber = maxNumber + this.settings.increment;

    // Skip reserved numbers
    const reservedNumbers = this.getReservedNumbers(message);
    while (this.settings.skipReservedRange && reservedNumbers.has(nextNumber)) {
      nextNumber += this.settings.increment;
    }

    // Skip the internal reserved range
    if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
      nextNumber = 20000;
    }

    return nextNumber;
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

    const allFields = [
      ...message.fields,
      ...message.maps,
      ...message.oneofs.flatMap(o => o.fields)
    ];

    // Sort fields by their position in the document
    allFields.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });

    const reservedNumbers = this.getReservedNumbers(message);
    let nextNumber = this.settings.startNumber;

    for (const field of allFields) {
      // Skip reserved numbers if setting is enabled
      while (this.settings.skipReservedRange && reservedNumbers.has(nextNumber)) {
        nextNumber += this.settings.increment;
      }

      // Skip the internal reserved range
      if (nextNumber >= FIELD_NUMBER.RESERVED_RANGE_START && nextNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
        nextNumber = 20000;
      }

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

  private renumberMessageFieldsRecursive(text: string, message: MessageDefinition): TextEdit[] {
    const edits: TextEdit[] = [];

    edits.push(...this.renumberMessageFields(text, message));

    // Recurse into nested messages
    for (const nested of message.nestedMessages) {
      edits.push(...this.renumberMessageFieldsRecursive(text, nested));
    }

    // Renumber nested enums
    for (const nested of message.nestedEnums) {
      edits.push(...this.renumberEnumValues(text, nested));
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

    // First value should be 0 in proto3
    let nextNumber = 0;

    for (const value of sortedValues) {
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

  private createFieldNumberEdit(lines: string[], field: FieldDefinition | MapFieldDefinition, newNumber: number): TextEdit | null {
    const line = lines[field.range.start.line];
    if (!line) {
      return null;
    }

    // Find the field number pattern: = <number>
    const match = line.match(/=\s*(\d+)/);
    if (!match) {
      return null;
    }

    const numberStart = line.indexOf(match[1]!, line.indexOf('='));
    const numberEnd = numberStart + match[1]!.length;

    return {
      range: {
        start: { line: field.range.start.line, character: numberStart },
        end: { line: field.range.start.line, character: numberEnd }
      },
      newText: newNumber.toString()
    };
  }

  private createEnumValueEdit(lines: string[], value: EnumValue, newNumber: number): TextEdit | null {
    const line = lines[value.range.start.line];
    if (!line) {
      return null;
    }

    // Find the value number pattern: = <number>
    const match = line.match(/=\s*(-?\d+)/);
    if (!match) {
      return null;
    }

    const numberStart = line.indexOf(match[1]!, line.indexOf('='));
    const numberEnd = numberStart + match[1]!.length;

    return {
      range: {
        start: { line: value.range.start.line, character: numberStart },
        end: { line: value.range.start.line, character: numberEnd }
      },
      newText: newNumber.toString()
    };
  }

  private getReservedNumbers(message: MessageDefinition): Set<number> {
    const reserved = new Set<number>();

    if (!this.settings.preserveReserved) {
      return reserved;
    }

    for (const r of message.reserved) {
      for (const range of r.ranges) {
        const end = range.end === 'max' ? MAX_FIELD_NUMBER : range.end;
        for (let i = range.start; i <= Math.min(end, range.start + 10000); i++) {
          reserved.add(i);
        }
      }
    }

    return reserved;
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
  getCodeActions(
    text: string,
    uri: string,
    range: Range
  ): CodeAction[] {
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
          arguments: [uri, message.name]
        }
      });

      actions.push({
        title: `Renumber fields from cursor in '${message.name}'`,
        kind: CodeActionKind.RefactorRewrite,
        command: {
          title: 'Renumber From Here',
          command: 'protobuf.renumberFromCursor',
          arguments: [uri, range.start]
        }
      });
    }

    // Add document-wide action
    actions.push({
      title: 'Renumber all fields in document',
      kind: CodeActionKind.RefactorRewrite,
      command: {
        title: 'Renumber Document',
        command: 'protobuf.renumberDocument',
        arguments: [uri]
      }
    });

    return actions;
  }
}
