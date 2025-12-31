/**
 * Inlay Hints Provider
 * Shows inline hints for field numbers and type information
 */

import type {
  InlayHint} from 'vscode-languageserver/node';
import {
  InlayHintKind,
  Position
} from 'vscode-languageserver/node';

import type { ProtoFile, FieldDefinition, MapFieldDefinition, EnumValue } from '../core/ast';

/**
 * Inlay hint settings
 */
export interface InlayHintsSettings {
  /** Show field numbers after field names */
  showFieldNumbers: boolean;
  /** Show enum values after enum field names */
  showEnumValues: boolean;
  /** Show default values for fields with defaults */
  showDefaults: boolean;
}

const defaultSettings: InlayHintsSettings = {
  showFieldNumbers: true,
  showEnumValues: true,
  showDefaults: true
};

/**
 * Provides inlay hints for Protocol Buffer files
 */
export class InlayHintsProvider {
  private settings: InlayHintsSettings;

  constructor(settings?: Partial<InlayHintsSettings>) {
    this.settings = { ...defaultSettings, ...settings };
  }

  /**
   * Get inlay hints for a parsed proto file
   */
  getInlayHints(protoFile: ProtoFile, lines: string[]): InlayHint[] {
    const hints: InlayHint[] = [];

    // Process messages
    for (const message of protoFile.messages) {
      this.processMessage(message.fields, message.maps, hints, lines);
      // Process nested messages recursively
      this.processNestedMessages(message, hints, lines);
    }

    // Process enums
    if (this.settings.showEnumValues) {
      for (const enumDef of protoFile.enums) {
        this.processEnum(enumDef.values, hints, lines);
      }
    }

    // Process top-level extensions
    for (const extend of protoFile.extends) {
      if (extend.fields) {
        this.processFields(extend.fields, hints, lines);
      }
    }

    return hints;
  }

  private processNestedMessages(
    message: { messages?: typeof message[]; fields: FieldDefinition[]; maps?: MapFieldDefinition[]; enums?: { values: EnumValue[] }[] },
    hints: InlayHint[],
    lines: string[]
  ): void {
    // Process nested messages
    if (message.messages) {
      for (const nested of message.messages) {
        this.processMessage(nested.fields, nested.maps, hints, lines);
        this.processNestedMessages(nested, hints, lines);
      }
    }

    // Process nested enums
    if (this.settings.showEnumValues && message.enums) {
      for (const enumDef of message.enums) {
        this.processEnum(enumDef.values, hints, lines);
      }
    }
  }

  private processMessage(
    fields: FieldDefinition[],
    maps: MapFieldDefinition[] | undefined,
    hints: InlayHint[],
    lines: string[]
  ): void {
    this.processFields(fields, hints, lines);
    if (maps) {
      this.processMaps(maps, hints, lines);
    }
  }

  private processFields(
    fields: FieldDefinition[],
    hints: InlayHint[],
    lines: string[]
  ): void {
    if (!this.settings.showFieldNumbers && !this.settings.showDefaults) {
      return;
    }

    for (const field of fields) {
      // Skip if no valid range
      if (!field.nameRange) {
        continue;
      }

      const line = field.nameRange.start.line;
      const lineText = lines[line] || '';

      // Find the semicolon position for this field
      const fieldEndMatch = lineText.indexOf(';', field.nameRange.end.character);
      if (fieldEndMatch === -1) {
        continue;
      }

      // Add field number hint (shown after the = N part, before options/semicolon)
      // Only show if showFieldNumbers is enabled
      // Note: Field numbers are already visible in the source, so we show additional info
      if (this.settings.showDefaults && field.options) {
        const defaultOpt = field.options.find(opt => opt.name === 'default');
        if (defaultOpt) {
          hints.push({
            position: Position.create(line, fieldEndMatch),
            label: ` // default: ${formatValue(defaultOpt.value)}`,
            kind: InlayHintKind.Parameter,
            paddingLeft: false
          });
        }
      }
    }
  }

  private processMaps(
    _maps: MapFieldDefinition[],
    _hints: InlayHint[],
    _lines: string[]
  ): void {
    // Map fields don't have field numbers visible in the same way
    // We could show the field number but it's already in the syntax
    // Currently no specific hints for map fields
    // Could add hints for key/value types in the future
  }

  private processEnum(
    values: EnumValue[],
    hints: InlayHint[],
    lines: string[]
  ): void {
    for (const value of values) {
      if (!value.nameRange) {
        continue;
      }

      const line = value.nameRange.start.line;
      const lineText = lines[line] || '';

      // Find the semicolon position
      const endMatch = lineText.indexOf(';', value.nameRange.end.character);
      if (endMatch === -1) {
        continue;
      }

      // For enum values, show the numeric value after the name = N part
      // This is already visible, but we can show hex for large values
      if (value.number !== undefined && (value.number > 1000 || value.number < 0)) {
        const hexValue = value.number >= 0
          ? `0x${value.number.toString(16).toUpperCase()}`
          : `-0x${Math.abs(value.number).toString(16).toUpperCase()}`;
        hints.push({
          position: Position.create(line, endMatch),
          label: ` // ${hexValue}`,
          kind: InlayHintKind.Parameter,
          paddingLeft: false
        });
      }
    }
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'nan';
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? 'inf' : '-inf';
    }
    return String(value);
  }
  return String(value);
}
