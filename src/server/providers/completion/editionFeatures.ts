/**
 * Completion items for Protobuf Edition Features
 */

import type { CompletionItem} from 'vscode-languageserver/node';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';

/**
 * Feature definitions with their possible values
 */
export const EDITION_FEATURES = {
  field_presence: {
    description: 'Controls field presence semantics',
    values: ['EXPLICIT', 'IMPLICIT', 'LEGACY_REQUIRED']
  },
  enum_type: {
    description: 'Controls enum semantics (open/closed)',
    values: ['OPEN', 'CLOSED']
  },
  repeated_field_encoding: {
    description: 'Controls repeated field encoding',
    values: ['PACKED', 'EXPANDED']
  },
  utf8_validation: {
    description: 'Controls UTF-8 validation for strings',
    values: ['VERIFY', 'NONE']
  },
  message_encoding: {
    description: 'Controls message encoding format',
    values: ['LENGTH_PREFIXED', 'DELIMITED']
  },
  json_format: {
    description: 'Controls JSON serialization behavior',
    values: ['ALLOW', 'LEGACY_BEST_EFFORT']
  }
};

/**
 * Available edition versions
 */
export const EDITION_VERSIONS = [
  '2023',
  '2024',
  '1_test_only',
  '2_test_only',
  '99997_test_only',
  '99998_test_only',
  '99999_test_only'
];

/**
 * Get feature name completions for "features." context
 */
export function getEditionFeatureNameCompletions(): CompletionItem[] {
  return Object.entries(EDITION_FEATURES).map(([name, info]) => ({
    label: name,
    kind: CompletionItemKind.Property,
    detail: `features.${name}`,
    documentation: info.description,
    insertText: `${name} = \${1|${info.values.join(',')}|}`,
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: `0${name}`
  }));
}

/**
 * Get feature value completions for a specific feature
 */
export function getEditionFeatureValueCompletions(featureName: string): CompletionItem[] {
  const feature = EDITION_FEATURES[featureName as keyof typeof EDITION_FEATURES];
  if (!feature) {
    return [];
  }

  return feature.values.map((value, index) => ({
    label: value,
    kind: CompletionItemKind.EnumMember,
    detail: `${featureName} value`,
    insertText: value,
    sortText: `0${index}`,
    preselect: index === 0
  }));
}

/**
 * Get edition version completions
 */
export function getEditionVersionCompletions(): CompletionItem[] {
  return EDITION_VERSIONS.map((version, index) => ({
    label: version,
    kind: CompletionItemKind.Value,
    detail: `Edition ${version}`,
    documentation: version === '2023' 
      ? 'First edition release with unified syntax and configurable features' 
      : version === '2024'
      ? 'Updated edition with refined default behaviors'
      : 'Test edition for development',
    insertText: `"${version}"`,
    sortText: `0${index}`,
    preselect: version === '2023'
  }));
}

/**
 * Get field option completions that include features
 */
export function getFieldFeaturesOptionCompletion(): CompletionItem {
  return {
    label: 'features.field_presence',
    kind: CompletionItemKind.Property,
    detail: 'Edition feature: Field presence semantics',
    documentation: 'Controls whether this field has explicit, implicit, or legacy required presence tracking',
    insertText: 'features.field_presence = ${1|EXPLICIT,IMPLICIT,LEGACY_REQUIRED|}',
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: '0features'
  };
}
