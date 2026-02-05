/**
 * Shared types for live documentation preview
 */

export interface DocumentationRequest {
  uri: string;
}

export type DocumentationElementKind =
  | 'message'
  | 'enum'
  | 'service'
  | 'rpc'
  | 'field'
  | 'enumValue'
  | 'oneof'
  | 'file';

export interface DocumentationField {
  name: string;
  type: string;
  number: number;
  modifier?: 'optional' | 'required' | 'repeated';
  comments?: string;
  deprecated?: boolean;
  options?: string[];
}

export interface DocumentationEnumValue {
  name: string;
  number: number;
  comments?: string;
  deprecated?: boolean;
}

export interface DocumentationRpc {
  name: string;
  requestType: string;
  responseType: string;
  requestStreaming: boolean;
  responseStreaming: boolean;
  comments?: string;
  deprecated?: boolean;
}

export interface DocumentationElement {
  kind: DocumentationElementKind;
  name: string;
  fullName: string;
  comments?: string;
  deprecated?: boolean;
  fields?: DocumentationField[];
  values?: DocumentationEnumValue[];
  rpcs?: DocumentationRpc[];
  nestedMessages?: DocumentationElement[];
  nestedEnums?: DocumentationElement[];
  options?: string[];
}

export interface DocumentationData {
  uri: string;
  fileName: string;
  syntax?: string;
  edition?: string;
  package?: string;
  imports: string[];
  messages: DocumentationElement[];
  enums: DocumentationElement[];
  services: DocumentationElement[];
  fileComments?: string;
  options?: string[];
}
