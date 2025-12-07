import { URI } from 'vscode-uri';
import {
  EnumDefinition,
  MapFieldDefinition,
  MessageDefinition,
  ProtoFile,
  SymbolKind
} from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';
import { SchemaGraph, SchemaGraphEdge, SchemaGraphNode, SchemaGraphRequest, SchemaGraphScope, SchemaGraphField } from '../../shared/schemaGraph';

export class SchemaGraphProvider {
  constructor(private readonly analyzer: SemanticAnalyzer) {}

  buildGraph(params: SchemaGraphRequest): SchemaGraph {
    const scope: SchemaGraphScope = params.scope || 'workspace';
    const targetUris = this.collectTargetUris(params.uri, scope);

    const nodes = new Map<string, SchemaGraphNode>();
    const edges: SchemaGraphEdge[] = [];

    // First pass: collect all nodes with their fields
    for (const uri of targetUris) {
      const file = this.analyzer.getFile(uri);
      if (!file) {
        continue;
      }
      this.collectNodesFromFile(uri, file, nodes);
    }

    // Second pass: collect all edges (may add placeholder nodes for external references)
    for (const uri of targetUris) {
      const file = this.analyzer.getFile(uri);
      if (!file) {
        continue;
      }
      this.collectEdgesFromFile(uri, file, nodes, edges);
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
      scope,
      sourceUri: params.uri
    };
  }

  private collectTargetUris(uri: string | undefined, scope: SchemaGraphScope): Set<string> {
    if (scope === 'workspace' || !uri) {
      return new Set(this.analyzer.getAllFiles().keys());
    }

    const visited = new Set<string>();
    const stack = [uri];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const imports = this.analyzer.getImportedFileUris(current);
      for (const imported of imports) {
        if (!visited.has(imported)) {
          stack.push(imported);
        }
      }
    }

    return visited;
  }

  private collectNodesFromFile(
    uri: string,
    file: ProtoFile,
    nodes: Map<string, SchemaGraphNode>
  ): void {
    const pkg = file.package?.name || '';

    for (const message of file.messages) {
      this.addMessageNode(uri, pkg, message, nodes);
    }

    for (const enumDef of file.enums) {
      this.addEnumNode(uri, pkg, enumDef, nodes);
    }
  }

  private collectEdgesFromFile(
    uri: string,
    file: ProtoFile,
    nodes: Map<string, SchemaGraphNode>,
    edges: SchemaGraphEdge[]
  ): void {
    const pkg = file.package?.name || '';

    for (const message of file.messages) {
      this.collectMessageEdges(uri, pkg, message, nodes, edges);
    }
  }

  private collectFromFile(
    uri: string,
    file: ProtoFile,
    nodes: Map<string, SchemaGraphNode>,
    edges: SchemaGraphEdge[]
  ): void {
    const pkg = file.package?.name || '';

    for (const message of file.messages) {
      this.addMessageNode(uri, pkg, message, nodes);
      this.collectMessageEdges(uri, pkg, message, nodes, edges);
    }

    for (const enumDef of file.enums) {
      this.addEnumNode(uri, pkg, enumDef, nodes);
    }
  }

  private addMessageNode(
    uri: string,
    pkg: string,
    message: MessageDefinition,
    nodes: Map<string, SchemaGraphNode>
  ): void {
    const id = pkg ? `${pkg}.${message.name}` : message.name;
    const filePath = URI.parse(uri).fsPath;

    const fields: SchemaGraphField[] = [];

    for (const field of message.fields) {
      fields.push({
        name: field.name,
        type: field.fieldType,
        kind: 'field',
        repeated: field.modifier === 'repeated',
        optional: field.modifier === 'optional'
      });
    }

    for (const mapField of message.maps) {
      fields.push({
        name: mapField.name,
        type: `map<${mapField.keyType}, ${mapField.valueType}>`,
        kind: 'map'
      });
    }

    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        fields.push({
          name: `${oneof.name}.${field.name}`,
          type: field.fieldType,
          kind: 'oneof',
          repeated: field.modifier === 'repeated',
          optional: field.modifier === 'optional'
        });
      }
    }

    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label: message.name,
        kind: 'message',
        file: filePath,
        package: pkg || undefined,
        fields
      });
    }

    for (const nested of message.nestedMessages) {
      this.addMessageNode(uri, id, nested, nodes);
    }

    for (const nestedEnum of message.nestedEnums) {
      this.addEnumNode(uri, id, nestedEnum, nodes);
    }
  }

  private addEnumNode(
    uri: string,
    pkg: string,
    enumDef: EnumDefinition,
    nodes: Map<string, SchemaGraphNode>
  ): void {
    const id = pkg ? `${pkg}.${enumDef.name}` : enumDef.name;
    const filePath = URI.parse(uri).fsPath;

    const fields: SchemaGraphField[] = enumDef.values.map(v => ({
      name: v.name,
      type: String(v.number),
      kind: 'enumValue'
    }));

    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label: enumDef.name,
        kind: 'enum',
        file: filePath,
        package: pkg || undefined,
        fields
      });
    }
  }

  private collectMessageEdges(
    uri: string,
    pkg: string,
    message: MessageDefinition,
    nodes: Map<string, SchemaGraphNode>,
    edges: SchemaGraphEdge[]
  ): void {
    const id = pkg ? `${pkg}.${message.name}` : message.name;

    const addEdge = (edge: SchemaGraphEdge) => {
      edges.push(edge);
    };

    for (const field of message.fields) {
      const target = this.analyzer.resolveType(field.fieldType, uri, pkg);
      if (target && (target.kind === SymbolKind.Message || target.kind === SymbolKind.Enum)) {
        this.ensureNodeForSymbol(target, nodes);
        addEdge({
          from: id,
          to: target.fullName,
          label: field.name,
          kind: 'field',
          repeated: field.modifier === 'repeated',
          optional: field.modifier === 'optional'
        });
      }
    }

    for (const mapField of message.maps) {
      this.addMapEdge(mapField, id, uri, pkg, nodes, edges);
    }

    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        const target = this.analyzer.resolveType(field.fieldType, uri, pkg);
        if (target && (target.kind === SymbolKind.Message || target.kind === SymbolKind.Enum)) {
          this.ensureNodeForSymbol(target, nodes);
          addEdge({
            from: id,
            to: target.fullName,
            label: `${oneof.name}.${field.name}`,
            kind: 'oneof',
            repeated: field.modifier === 'repeated',
            optional: field.modifier === 'optional'
          });
        }
      }
    }

    for (const nested of message.nestedMessages) {
      const nestedId = pkg ? `${pkg}.${message.name}.${nested.name}` : `${message.name}.${nested.name}`;
      addEdge({ from: id, to: nestedId, label: 'nested', kind: 'nested' });
      this.collectMessageEdges(uri, id, nested, nodes, edges);
    }

    for (const nestedEnum of message.nestedEnums) {
      const nestedId = pkg ? `${pkg}.${message.name}.${nestedEnum.name}` : `${message.name}.${nestedEnum.name}`;
      addEdge({ from: id, to: nestedId, label: 'nested', kind: 'nested' });
    }
  }

  private addMapEdge(
    mapField: MapFieldDefinition,
    ownerId: string,
    uri: string,
    pkg: string,
    nodes: Map<string, SchemaGraphNode>,
    edges: SchemaGraphEdge[]
  ): void {
    const target = this.analyzer.resolveType(mapField.valueType, uri, pkg);
    if (target && (target.kind === SymbolKind.Message || target.kind === SymbolKind.Enum)) {
      this.ensureNodeForSymbol(target, nodes);
      edges.push({
        from: ownerId,
        to: target.fullName,
        label: mapField.name,
        kind: 'map'
      });
    }
  }

  private ensureNodeForSymbol(symbol: { fullName: string; name: string; kind: SymbolKind; location: { uri: string } }, nodes: Map<string, SchemaGraphNode>): void {
    if (nodes.has(symbol.fullName)) {
      return;
    }

    const filePath = URI.parse(symbol.location.uri).fsPath;
    nodes.set(symbol.fullName, {
      id: symbol.fullName,
      label: symbol.name,
      kind: symbol.kind === SymbolKind.Enum ? 'enum' : 'message',
      file: filePath,
        package: this.extractPackageFromFullName(symbol.fullName)
    });
  }

  private extractPackageFromFullName(fullName: string): string | undefined {
    const parts = fullName.split('.');
    if (parts.length <= 1) {
      return undefined;
    }
    parts.pop();
    return parts.join('.');
  }
}
