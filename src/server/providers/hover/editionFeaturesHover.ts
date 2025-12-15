/**
 * Hover information for Protobuf Edition Features
 */

import { Hover, MarkupKind } from 'vscode-languageserver/node';

/**
 * Feature documentation from the Protocol Buffers Editions specification
 */
const EDITION_FEATURES_DOCS: Record<string, { description: string; values?: Record<string, string> }> = {
  field_presence: {
    description: 'Controls the field presence semantics for scalar fields',
    values: {
      EXPLICIT: 'Fields have explicit presence tracking (proto2 style). The field can distinguish between unset and default values.',
      IMPLICIT: 'Fields have implicit presence (proto3 style). Default values are not serialized and cannot distinguish between unset and default.',
      LEGACY_REQUIRED: 'Field must be set (proto2 required). Validation fails if the field is not present.'
    }
  },
  enum_type: {
    description: 'Controls whether enums are open or closed',
    values: {
      OPEN: 'Enum can accept any int32 value, even if not explicitly defined (proto3 style).',
      CLOSED: 'Enum can only accept explicitly defined values (proto2 style). Unknown values cause parsing to fail.'
    }
  },
  repeated_field_encoding: {
    description: 'Controls how repeated fields are encoded on the wire',
    values: {
      PACKED: 'Repeated fields are packed (proto3 style for primitives). More efficient encoding for numeric types.',
      EXPANDED: 'Repeated fields are expanded (proto2 style). Each element is encoded separately with its tag.'
    }
  },
  utf8_validation: {
    description: 'Controls UTF-8 validation for string fields',
    values: {
      VERIFY: 'String fields are validated to be valid UTF-8. Parsing fails for invalid UTF-8.',
      NONE: 'String fields are not validated for UTF-8 encoding.'
    }
  },
  message_encoding: {
    description: 'Controls the encoding format for nested messages',
    values: {
      LENGTH_PREFIXED: 'Messages are length-prefixed (standard protobuf encoding).',
      DELIMITED: 'Messages are delimited (group-style encoding, rarely used).'
    }
  },
  json_format: {
    description: 'Controls JSON serialization behavior',
    values: {
      ALLOW: 'Standard JSON serialization is allowed.',
      LEGACY_BEST_EFFORT: 'Use legacy best-effort JSON parsing behavior.'
    }
  }
};

/**
 * Edition versions and their descriptions
 */
const EDITION_VERSIONS: Record<string, string> = {
  '2023': 'Protobuf Edition 2023 - The first edition release, providing a unified syntax with configurable features',
  '2024': 'Protobuf Edition 2024 - Updated edition with refined default behaviors',
  '1_test_only': 'Test edition for development and validation purposes',
  '2_test_only': 'Test edition for development and validation purposes',
  '99997_test_only': 'Test edition for development and validation purposes',
  '99998_test_only': 'Test edition for development and validation purposes',
  '99999_test_only': 'Test edition for development and validation purposes'
};

/**
 * Get hover information for edition features
 */
export function getEditionFeaturesHover(word: string, lineText: string): Hover | null {
  // Check if we're in a features context
  if (!lineText.includes('features.')) {
    return null;
  }

  // Check for feature names
  if (word in EDITION_FEATURES_DOCS) {
    const feature = EDITION_FEATURES_DOCS[word]!;
    let content = `**features.${word}**\n\n${feature.description}`;

    if (feature.values) {
      content += '\n\n**Values:**\n';
      for (const [value, desc] of Object.entries(feature.values)) {
        content += `\n- \`${value}\`: ${desc}`;
      }
    }

    content += '\n\n[Protocol Buffers Editions Documentation](https://protobuf.dev/editions/features/)';

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }

  // Check for feature values
  for (const [featureName, feature] of Object.entries(EDITION_FEATURES_DOCS)) {
    if (feature.values && word in feature.values) {
      const valueDesc = feature.values[word]!;
      const content = `**${word}** (features.${featureName})\n\n${valueDesc}\n\n[Protocol Buffers Editions Documentation](https://protobuf.dev/editions/features/)`;

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: content
        }
      };
    }
  }

  return null;
}

/**
 * Get hover information for edition declaration
 */
export function getEditionHover(word: string, lineText: string): Hover | null {
  // Check if this is an edition keyword
  if (word === 'edition' && lineText.trim().startsWith('edition')) {
    const editions = Object.entries(EDITION_VERSIONS)
      .map(([ver, desc]) => `- \`${ver}\`: ${desc}`)
      .join('\n');
    
    const content = `**edition**

Declares the Protobuf edition for this file. Editions provide a unified syntax with configurable features that replace the proto2/proto3 distinction.

**Usage:** \`edition = "2023";\`

**Available Editions:**
${editions}

[Protocol Buffers Editions Documentation](https://protobuf.dev/editions/overview/)`;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }

  // Check if this is an edition version
  if (word in EDITION_VERSIONS) {
    const content = `**Edition ${word}**\n\n${EDITION_VERSIONS[word]}\n\n[Protocol Buffers Editions Documentation](https://protobuf.dev/editions/overview/)`;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }

  return null;
}
