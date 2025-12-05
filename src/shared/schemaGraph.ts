export type SchemaGraphScope = 'workspace' | 'file';

export interface SchemaGraphRequest {
  uri?: string;
  scope?: SchemaGraphScope;
}

export type SchemaGraphNodeKind = 'message' | 'enum';

export type SchemaGraphFieldKind = 'field' | 'map' | 'oneof' | 'enumValue';

export interface SchemaGraphField {
  name: string;
  type: string;
  kind: SchemaGraphFieldKind;
  repeated?: boolean;
  optional?: boolean;
}

export interface SchemaGraphNode {
  id: string;
  label: string;
  kind: SchemaGraphNodeKind;
  file: string;
  package?: string;
  fields?: SchemaGraphField[];
}

export type SchemaGraphEdgeKind = 'field' | 'map' | 'oneof' | 'nested' | 'extend';

export interface SchemaGraphEdge {
  from: string;
  to: string;
  label: string;
  kind: SchemaGraphEdgeKind;
  repeated?: boolean;
  optional?: boolean;
}

export interface SchemaGraph {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
  scope: SchemaGraphScope;
  sourceUri?: string;
}
