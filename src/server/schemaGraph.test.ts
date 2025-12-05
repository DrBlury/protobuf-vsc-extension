import { ProtoParser } from './parser';
import { SemanticAnalyzer } from './analyzer';
import { SchemaGraphProvider } from './schemaGraph';

describe('SchemaGraphProvider', () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const provider = new SchemaGraphProvider(analyzer);

  const commonUri = 'file:///common.proto';
  const userUri = 'file:///user.proto';

  beforeAll(() => {
    const common = parser.parse(`
      syntax = "proto3";
      package demo;
      message Address {
        string city = 1;
      }
      enum Status {
        UNKNOWN = 0;
        ACTIVE = 1;
      }
    `, commonUri);

    const user = parser.parse(`
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
    `, userUri);

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

    const addressEdge = graph.edges.find(e => e.from === 'demo.User' && e.to === 'demo.Address' && e.label === 'address');
    const statusEdge = graph.edges.find(e => e.from === 'demo.User' && e.to === 'demo.Status' && e.label === 'status');
    const phoneEdge = graph.edges.find(e => e.from === 'demo.User' && e.to === 'demo.User.Phone' && e.label === 'phones');

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
});
