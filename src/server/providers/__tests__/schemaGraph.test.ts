import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { SchemaGraphProvider } from '../schemaGraph';

describe('SchemaGraphProvider', () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const provider = new SchemaGraphProvider(analyzer);

  const commonUri = 'file:///common.proto';
  const userUri = 'file:///user.proto';

  beforeAll(() => {
    const common = parser.parse(
      `
      syntax = "proto3";
      package demo;
      message Address {
        string city = 1;
      }
      enum Status {
        UNKNOWN = 0;
        ACTIVE = 1;
      }
    `,
      commonUri
    );

    const user = parser.parse(
      `
      syntax = "proto3";
      package demo;
      import "common.proto";
      message User {
        string id = 1;
        Address address = 2;
        Status status = 3;
        repeated Phone phones = 4;
      }
      message Phone {
        string number = 1;
      }
    `,
      userUri
    );

    analyzer.updateFile(commonUri, common);
    analyzer.updateFile(userUri, user);
  });

  it('builds workspace graph with message and enum nodes', () => {
    const graph = provider.buildGraph({ scope: 'workspace' });

    expect(graph.nodes.find(n => n.id === 'demo.User')).toBeTruthy();
    expect(graph.nodes.find(n => n.id === 'demo.Address')).toBeTruthy();
    expect(graph.nodes.find(n => n.id === 'demo.Status')).toBeTruthy();
  });

  it('creates edges for field type references', () => {
    const graph = provider.buildGraph({ scope: 'workspace' });

    const addressEdge = graph.edges.find(
      e => e.from === 'demo.User' && e.to === 'demo.Address' && e.label === 'address'
    );
    const statusEdge = graph.edges.find(e => e.from === 'demo.User' && e.to === 'demo.Status' && e.label === 'status');
    const phoneEdge = graph.edges.find(e => e.from === 'demo.User' && e.to === 'demo.Phone' && e.label === 'phones');

    expect(addressEdge).toBeDefined();
    expect(statusEdge).toBeDefined();
    expect(phoneEdge?.repeated).toBe(true);
  });

  it('scopes to file + imports when requested', () => {
    const graph = provider.buildGraph({ scope: 'file', uri: userUri });

    expect(graph.nodes.find(n => n.id === 'demo.User')).toBeTruthy();
    expect(graph.nodes.find(n => n.id === 'demo.Status')).toBeTruthy();
    expect(graph.nodes.find(n => n.id === 'demo.Address')).toBeTruthy();

    // Address is included because it is imported; Phone nested is also present
    expect(graph.edges.some(e => e.to === 'demo.Address')).toBe(true);
  });

  describe('additional coverage tests', () => {
    let mapAnalyzer: SemanticAnalyzer;
    let mapProvider: SchemaGraphProvider;

    beforeAll(() => {
      mapAnalyzer = new SemanticAnalyzer();
      mapProvider = new SchemaGraphProvider(mapAnalyzer);
    });

    it('should handle map fields with message value types', () => {
      const content = `
        syntax = "proto3";
        package test;
        message Config {
          string key = 1;
        }
        message Settings {
          map<string, Config> configs = 1;
        }
      `;
      const uri = 'file:///map.proto';
      const file = parser.parse(content, uri);
      mapAnalyzer.updateFile(uri, file);

      const graph = mapProvider.buildGraph({ scope: 'workspace' });

      // Should have nodes for both messages
      expect(graph.nodes.find(n => n.id === 'test.Settings')).toBeTruthy();
      expect(graph.nodes.find(n => n.id === 'test.Config')).toBeTruthy();

      // Should have edge from Settings to Config via map field
      const mapEdge = graph.edges.find(e => e.from === 'test.Settings' && e.to === 'test.Config' && e.kind === 'map');
      expect(mapEdge).toBeDefined();
      expect(mapEdge?.label).toBe('configs');
    });

    it('should handle oneof fields with message types', () => {
      const oneofContent = `
        syntax = "proto3";
        package test;
        message TextContent {
          string text = 1;
        }
        message ImageContent {
          bytes data = 1;
        }
        message Content {
          oneof content_type {
            TextContent text = 1;
            ImageContent image = 2;
          }
        }
      `;
      const uri = 'file:///oneof.proto';
      const oneofAnalyzer = new SemanticAnalyzer();
      const oneofProvider = new SchemaGraphProvider(oneofAnalyzer);
      const file = parser.parse(oneofContent, uri);
      oneofAnalyzer.updateFile(uri, file);

      const graph = oneofProvider.buildGraph({ scope: 'workspace' });

      // Should have nodes for all messages
      expect(graph.nodes.find(n => n.id === 'test.Content')).toBeTruthy();
      expect(graph.nodes.find(n => n.id === 'test.TextContent')).toBeTruthy();
      expect(graph.nodes.find(n => n.id === 'test.ImageContent')).toBeTruthy();

      // Should have oneof edges
      const textEdge = graph.edges.find(
        e => e.from === 'test.Content' && e.to === 'test.TextContent' && e.kind === 'oneof'
      );
      const imageEdge = graph.edges.find(
        e => e.from === 'test.Content' && e.to === 'test.ImageContent' && e.kind === 'oneof'
      );
      expect(textEdge).toBeDefined();
      expect(imageEdge).toBeDefined();
    });

    it('should handle nested messages and enums', () => {
      const nestedContent = `
        syntax = "proto3";
        package test;
        message Outer {
          message Inner {
            string value = 1;
          }
          enum InnerStatus {
            UNKNOWN = 0;
          }
          Inner inner = 1;
          InnerStatus status = 2;
        }
      `;
      const uri = 'file:///nested.proto';
      const nestedAnalyzer = new SemanticAnalyzer();
      const nestedProvider = new SchemaGraphProvider(nestedAnalyzer);
      const file = parser.parse(nestedContent, uri);
      nestedAnalyzer.updateFile(uri, file);

      const graph = nestedProvider.buildGraph({ scope: 'workspace' });

      // Should have nodes for outer and nested types
      expect(graph.nodes.find(n => n.id === 'test.Outer')).toBeTruthy();
      expect(graph.nodes.find(n => n.id === 'test.Outer.Inner')).toBeTruthy();
      expect(graph.nodes.find(n => n.id === 'test.Outer.InnerStatus')).toBeTruthy();

      // Should have nested edges
      const innerEdge = graph.edges.find(
        e => e.from === 'test.Outer' && e.to === 'test.Outer.Inner' && e.kind === 'nested'
      );
      const enumEdge = graph.edges.find(
        e => e.from === 'test.Outer' && e.to === 'test.Outer.InnerStatus' && e.kind === 'nested'
      );
      expect(innerEdge).toBeDefined();
      expect(enumEdge).toBeDefined();
    });

    it('should handle optional fields', () => {
      const optionalContent = `
        syntax = "proto3";
        package test;
        message Address {
          string city = 1;
        }
        message Person {
          optional Address address = 1;
        }
      `;
      const uri = 'file:///optional.proto';
      const optionalAnalyzer = new SemanticAnalyzer();
      const optionalProvider = new SchemaGraphProvider(optionalAnalyzer);
      const file = parser.parse(optionalContent, uri);
      optionalAnalyzer.updateFile(uri, file);

      const graph = optionalProvider.buildGraph({ scope: 'workspace' });

      const edge = graph.edges.find(e => e.from === 'test.Person' && e.to === 'test.Address');
      expect(edge).toBeDefined();
      expect(edge?.optional).toBe(true);
    });

    it('should handle files without package', () => {
      const noPackageContent = `
        syntax = "proto3";
        message SimpleMessage {
          string data = 1;
        }
      `;
      const uri = 'file:///nopackage.proto';
      const noPackageAnalyzer = new SemanticAnalyzer();
      const noPackageProvider = new SchemaGraphProvider(noPackageAnalyzer);
      const file = parser.parse(noPackageContent, uri);
      noPackageAnalyzer.updateFile(uri, file);

      const graph = noPackageProvider.buildGraph({ scope: 'workspace' });

      // Node should use just the message name when no package
      expect(graph.nodes.find(n => n.id === 'SimpleMessage')).toBeTruthy();
    });

    it('should default to workspace scope when scope is undefined', () => {
      const content = `
        syntax = "proto3";
        package test;
        message DefaultScope {
          string value = 1;
        }
      `;
      const uri = 'file:///default.proto';
      const defaultAnalyzer = new SemanticAnalyzer();
      const defaultProvider = new SchemaGraphProvider(defaultAnalyzer);
      const file = parser.parse(content, uri);
      defaultAnalyzer.updateFile(uri, file);

      // Call without scope
      const graph = defaultProvider.buildGraph({});

      expect(graph.scope).toBe('workspace');
      expect(graph.nodes.find(n => n.id === 'test.DefaultScope')).toBeTruthy();
    });

    it('should handle missing file gracefully', () => {
      const emptyAnalyzer = new SemanticAnalyzer();
      const emptyProvider = new SchemaGraphProvider(emptyAnalyzer);

      const graph = emptyProvider.buildGraph({ scope: 'file', uri: 'file:///nonexistent.proto' });

      // Should return empty graph
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });

    it('should include fields in node data', () => {
      const fieldsContent = `
        syntax = "proto3";
        package test;
        message WithFields {
          string name = 1;
          repeated int32 numbers = 2;
          optional bool enabled = 3;
          map<string, string> metadata = 4;
        }
        message Container {
          oneof content {
            string text = 1;
            bytes data = 2;
          }
        }
      `;
      const uri = 'file:///fields.proto';
      const fieldsAnalyzer = new SemanticAnalyzer();
      const fieldsProvider = new SchemaGraphProvider(fieldsAnalyzer);
      const file = parser.parse(fieldsContent, uri);
      fieldsAnalyzer.updateFile(uri, file);

      const graph = fieldsProvider.buildGraph({ scope: 'workspace' });

      const withFieldsNode = graph.nodes.find(n => n.id === 'test.WithFields');
      expect(withFieldsNode).toBeTruthy();
      expect(withFieldsNode?.fields).toBeDefined();
      expect(withFieldsNode?.fields?.length).toBe(4);

      // Check field properties
      const nameField = withFieldsNode?.fields?.find(f => f.name === 'name');
      expect(nameField?.type).toBe('string');
      expect(nameField?.kind).toBe('field');

      const numbersField = withFieldsNode?.fields?.find(f => f.name === 'numbers');
      expect(numbersField?.repeated).toBe(true);

      const enabledField = withFieldsNode?.fields?.find(f => f.name === 'enabled');
      expect(enabledField?.optional).toBe(true);

      const metadataField = withFieldsNode?.fields?.find(f => f.name === 'metadata');
      expect(metadataField?.kind).toBe('map');
    });
  });
});
