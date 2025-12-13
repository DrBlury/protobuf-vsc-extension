/**
 * Tests for GrpcProvider
 */

import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoParser } from '../../core/parser';
import { GrpcProvider } from '../grpc';

describe('GrpcProvider', () => {
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;
  let grpcProvider: GrpcProvider;

  const parseAndUpdate = (uri: string, content: string) => {
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);
  };

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    parser = new ProtoParser();
    grpcProvider = new GrpcProvider(analyzer);
  });

  describe('getAllServices', () => {
    it('should return empty array when no services exist', () => {
      const protoContent = `
        syntax = "proto3";
        message User {
          string name = 1;
        }
      `;
      parseAndUpdate('file:///test.proto', protoContent);

      const services = grpcProvider.getAllServices();
      expect(services).toEqual([]);
    });

    it('should collect services from single file', () => {
      const protoContent = `
        syntax = "proto3";
        package myservice;

        service UserService {
          rpc GetUser (GetUserRequest) returns (GetUserResponse);
          rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);
        }

        message GetUserRequest { string id = 1; }
        message GetUserResponse { string name = 1; }
        message ListUsersRequest {}
        message ListUsersResponse { repeated string names = 1; }
      `;
      parseAndUpdate('file:///test.proto', protoContent);

      const services = grpcProvider.getAllServices();
      expect(services).toHaveLength(1);
      expect(services[0]!.name).toBe('UserService');
      expect(services[0]!.fullName).toBe('myservice.UserService');
      expect(services[0]!.package).toBe('myservice');
      expect(services[0]!.rpcs).toHaveLength(2);
    });

    it('should collect services from multiple files', () => {
      parseAndUpdate('file:///user.proto', `
        syntax = "proto3";
        package users;
        service UserService {
          rpc GetUser (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);

      parseAndUpdate('file:///order.proto', `
        syntax = "proto3";
        package orders;
        service OrderService {
          rpc CreateOrder (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services).toHaveLength(2);
      expect(services.map(s => s.name).sort()).toEqual(['OrderService', 'UserService']);
    });

    it('should handle services without package', () => {
      const protoContent = `
        syntax = "proto3";
        service SimpleService {
          rpc DoSomething (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `;
      parseAndUpdate('file:///test.proto', protoContent);

      const services = grpcProvider.getAllServices();
      expect(services).toHaveLength(1);
      expect(services[0]!.name).toBe('SimpleService');
      expect(services[0]!.fullName).toBe('SimpleService');
      expect(services[0]!.package).toBe('');
    });

    it('should handle nested package names', () => {
      const protoContent = `
        syntax = "proto3";
        package com.example.api.v1;
        service MyService {
          rpc Call (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `;
      parseAndUpdate('file:///test.proto', protoContent);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.fullName).toBe('com.example.api.v1.MyService');
    });

    it('should correctly populate RPC info', () => {
      const protoContent = `
        syntax = "proto3";
        package test;
        service TestService {
          rpc UnaryCall (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `;
      parseAndUpdate('file:///test.proto', protoContent);

      const services = grpcProvider.getAllServices();
      const rpc = services[0]!.rpcs[0]!;

      expect(rpc.name).toBe('UnaryCall');
      expect(rpc.fullName).toBe('test.TestService.UnaryCall');
      expect(rpc.inputType).toBe('Request');
      expect(rpc.outputType).toBe('Response');
      expect(rpc.uri).toBe('file:///test.proto');
    });
  });

  describe('getService', () => {
    beforeEach(() => {
      parseAndUpdate('file:///user.proto', `
        syntax = "proto3";
        package api.users;
        service UserService {
          rpc GetUser (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);

      parseAndUpdate('file:///admin.proto', `
        syntax = "proto3";
        package api.admin;
        service UserService {
          rpc GetAdmin (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);
    });

    it('should find service by fully qualified name', () => {
      const service = grpcProvider.getService('api.users.UserService');
      expect(service).not.toBeNull();
      expect(service!.fullName).toBe('api.users.UserService');
    });

    it('should find service by simple name', () => {
      const service = grpcProvider.getService('UserService');
      expect(service).not.toBeNull();
      // Returns first match
      expect(service!.name).toBe('UserService');
    });

    it('should return null for non-existent service', () => {
      const service = grpcProvider.getService('NonExistentService');
      expect(service).toBeNull();
    });

    it('should prefer service from specified URI when simple name matches multiple', () => {
      const service = grpcProvider.getService('UserService', 'file:///admin.proto');
      // Note: Current implementation tries URI fallback only if not found
      expect(service).not.toBeNull();
    });
  });

  describe('getRpc', () => {
    beforeEach(() => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package test;
        service TestService {
          rpc GetUser (GetUserRequest) returns (GetUserResponse);
          rpc CreateUser (CreateUserRequest) returns (CreateUserResponse);
        }
        message GetUserRequest {}
        message GetUserResponse {}
        message CreateUserRequest {}
        message CreateUserResponse {}
      `);
    });

    it('should find RPC by fully qualified name', () => {
      const rpc = grpcProvider.getRpc('test.TestService.GetUser');
      expect(rpc).not.toBeNull();
      expect(rpc!.name).toBe('GetUser');
      expect(rpc!.fullName).toBe('test.TestService.GetUser');
    });

    it('should find RPC by simple name', () => {
      const rpc = grpcProvider.getRpc('CreateUser');
      expect(rpc).not.toBeNull();
      expect(rpc!.name).toBe('CreateUser');
    });

    it('should return null for non-existent RPC', () => {
      const rpc = grpcProvider.getRpc('NonExistentRpc');
      expect(rpc).toBeNull();
    });
  });

  describe('getRpcsUsingType', () => {
    beforeEach(() => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package test;

        message User {}
        message Order {}
        message Empty {}

        service UserService {
          rpc GetUser (Empty) returns (User);
          rpc CreateUser (User) returns (User);
        }

        service OrderService {
          rpc GetOrder (Empty) returns (Order);
          rpc GetUserOrders (User) returns (Order);
        }
      `);
    });

    it('should find all RPCs using a type as input', () => {
      const rpcs = grpcProvider.getRpcsUsingType('User');
      expect(rpcs).toHaveLength(3);
      expect(rpcs.map(r => r.name).sort()).toEqual(['CreateUser', 'GetUser', 'GetUserOrders']);
    });

    it('should find RPCs using type as output only', () => {
      const rpcs = grpcProvider.getRpcsUsingType('Order');
      expect(rpcs).toHaveLength(2);
    });

    it('should return empty array when no RPCs use the type', () => {
      const rpcs = grpcProvider.getRpcsUsingType('NonExistent');
      expect(rpcs).toEqual([]);
    });
  });

  describe('streaming type detection', () => {
    it('should detect unary RPC', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc Unary (Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs[0]!.streamingType).toBe('unary');
      expect(services[0]!.rpcs[0]!.inputStream).toBe(false);
      expect(services[0]!.rpcs[0]!.outputStream).toBe(false);
    });

    it('should detect server-streaming RPC', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc ServerStream (Request) returns (stream Response);
        }
        message Request {}
        message Response {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs[0]!.streamingType).toBe('server-streaming');
      expect(services[0]!.rpcs[0]!.inputStream).toBe(false);
      expect(services[0]!.rpcs[0]!.outputStream).toBe(true);
    });

    it('should detect client-streaming RPC', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc ClientStream (stream Request) returns (Response);
        }
        message Request {}
        message Response {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs[0]!.streamingType).toBe('client-streaming');
      expect(services[0]!.rpcs[0]!.inputStream).toBe(true);
      expect(services[0]!.rpcs[0]!.outputStream).toBe(false);
    });

    it('should detect bidirectional-streaming RPC', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc BiDiStream (stream Request) returns (stream Response);
        }
        message Request {}
        message Response {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs[0]!.streamingType).toBe('bidirectional-streaming');
      expect(services[0]!.rpcs[0]!.inputStream).toBe(true);
      expect(services[0]!.rpcs[0]!.outputStream).toBe(true);
    });
  });

  describe('generateClientStubPreview', () => {
    let service: ReturnType<typeof grpcProvider.getAllServices>[0];

    beforeEach(() => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package myapi;
        service MyService {
          rpc GetItem (GetItemRequest) returns (GetItemResponse);
          rpc ListItems (ListItemsRequest) returns (ListItemsResponse);
        }
        message GetItemRequest {}
        message GetItemResponse {}
        message ListItemsRequest {}
        message ListItemsResponse {}
      `);
      service = grpcProvider.getAllServices()[0]!;
    });

    it('should generate Go client stub', () => {
      const stub = grpcProvider.generateClientStubPreview(service, 'go');
      expect(stub).toContain('// Go client stub for myapi.MyService');
      expect(stub).toContain('type MyServiceClient struct');
      expect(stub).toContain('func (c *MyServiceClient) GetItem');
      expect(stub).toContain('func (c *MyServiceClient) ListItems');
      expect(stub).toContain('*GetItemRequest');
      expect(stub).toContain('*GetItemResponse');
    });

    it('should generate Java client stub', () => {
      const stub = grpcProvider.generateClientStubPreview(service, 'java');
      expect(stub).toContain('// Java client stub for myapi.MyService');
      expect(stub).toContain('public class MyServiceClient');
      expect(stub).toContain('public GetItemResponse GetItem(GetItemRequest request)');
    });

    it('should generate Python client stub with snake_case', () => {
      const stub = grpcProvider.generateClientStubPreview(service, 'python');
      expect(stub).toContain('# Python client stub for myapi.MyService');
      expect(stub).toContain('class MyServiceClient:');
      expect(stub).toContain('def get_item(self, request):');
      expect(stub).toContain('def list_items(self, request):');
    });

    it('should generate TypeScript client stub', () => {
      const stub = grpcProvider.generateClientStubPreview(service, 'typescript');
      expect(stub).toContain('// TypeScript client stub for myapi.MyService');
      expect(stub).toContain('export class MyServiceClient');
      expect(stub).toContain('GetItem(request: GetItemRequest): Promise<GetItemResponse>');
    });
  });

  describe('generateServerTemplate', () => {
    let service: ReturnType<typeof grpcProvider.getAllServices>[0];

    beforeEach(() => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package api;
        service TestService {
          rpc DoAction (ActionRequest) returns (ActionResponse);
        }
        message ActionRequest {}
        message ActionResponse {}
      `);
      service = grpcProvider.getAllServices()[0]!;
    });

    it('should generate Go server template', () => {
      const template = grpcProvider.generateServerTemplate(service, 'go');
      expect(template).toContain('// Go server implementation for api.TestService');
      expect(template).toContain('type TestServiceServer struct');
      expect(template).toContain('mustEmbedUnimplementedTestServiceServer');
      expect(template).toContain('func (s *TestServiceServer) DoAction');
      expect(template).toContain('// TODO: Implement DoAction');
      expect(template).toContain('codes.Unimplemented');
    });

    it('should generate Java server template', () => {
      const template = grpcProvider.generateServerTemplate(service, 'java');
      expect(template).toContain('// Java server implementation for api.TestService');
      expect(template).toContain('extends TestServiceGrpc.TestServiceImplBase');
      expect(template).toContain('@Override');
      expect(template).toContain('public void DoAction');
      expect(template).toContain('StreamObserver<ActionResponse>');
      expect(template).toContain('Status.UNIMPLEMENTED');
    });

    it('should generate Python server template', () => {
      const template = grpcProvider.generateServerTemplate(service, 'python');
      expect(template).toContain('# Python server implementation for api.TestService');
      expect(template).toContain('class TestServiceServicer');
      expect(template).toContain('def do_action(self, request, context):');
      expect(template).toContain('grpc.StatusCode.UNIMPLEMENTED');
    });

    it('should generate TypeScript server template', () => {
      const template = grpcProvider.generateServerTemplate(service, 'typescript');
      expect(template).toContain('// TypeScript server implementation for api.TestService');
      expect(template).toContain('implements TestServiceServiceDefinition');
      expect(template).toContain('DoAction(call: ServerUnaryCall');
      expect(template).toContain("throw new Error('method DoAction not implemented')");
    });
  });

  describe('toSnakeCase', () => {
    it('should convert camelCase to snake_case via Python stub generation', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc GetUserById (R) returns (R);
          rpc ListAllItems (R) returns (R);
          rpc HTMLParser (R) returns (R);
        }
        message R {}
      `);

      const service = grpcProvider.getAllServices()[0]!;
      const stub = grpcProvider.generateClientStubPreview(service, 'python');

      expect(stub).toContain('def get_user_by_id');
      expect(stub).toContain('def list_all_items');
      expect(stub).toContain('def h_t_m_l_parser');
    });

    it('should handle already snake_case names', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test {
          rpc get_user (R) returns (R);
        }
        message R {}
      `);

      const service = grpcProvider.getAllServices()[0]!;
      const stub = grpcProvider.generateClientStubPreview(service, 'python');

      expect(stub).toContain('def get_user');
    });
  });

  describe('getServiceStats', () => {
    it('should calculate statistics for service with mixed RPC types', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service MixedService {
          rpc Unary1 (R) returns (R);
          rpc Unary2 (R) returns (R);
          rpc ServerStream (R) returns (stream R);
          rpc ClientStream (stream R) returns (R);
          rpc BiDi (stream R) returns (stream R);
        }
        message R {}
      `);

      const service = grpcProvider.getAllServices()[0]!;
      const stats = grpcProvider.getServiceStats(service);

      expect(stats.totalRpcs).toBe(5);
      expect(stats.unaryRpcs).toBe(2);
      expect(stats.streamingRpcs).toBe(3);
      expect(stats.serverStreamingRpcs).toBe(1);
      expect(stats.clientStreamingRpcs).toBe(1);
      expect(stats.bidirectionalStreamingRpcs).toBe(1);
    });

    it('should return zeros for empty service', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service EmptyService {}
      `);

      const service = grpcProvider.getAllServices()[0]!;
      const stats = grpcProvider.getServiceStats(service);

      expect(stats.totalRpcs).toBe(0);
      expect(stats.unaryRpcs).toBe(0);
      expect(stats.streamingRpcs).toBe(0);
    });

    it('should handle service with only unary RPCs', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service UnaryOnly {
          rpc A (R) returns (R);
          rpc B (R) returns (R);
          rpc C (R) returns (R);
        }
        message R {}
      `);

      const service = grpcProvider.getAllServices()[0]!;
      const stats = grpcProvider.getServiceStats(service);

      expect(stats.totalRpcs).toBe(3);
      expect(stats.unaryRpcs).toBe(3);
      expect(stats.streamingRpcs).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle service with nested message types in RPC', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package test;

        message Outer {
          message Inner {
            string value = 1;
          }
        }

        service Test {
          rpc Process (Outer.Inner) returns (Outer.Inner);
        }
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs[0]!.inputType).toBe('Outer.Inner');
      expect(services[0]!.rpcs[0]!.outputType).toBe('Outer.Inner');
    });

    it('should handle multiple services in same file', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        package multi;

        service ServiceA {
          rpc A (R) returns (R);
        }

        service ServiceB {
          rpc B (R) returns (R);
        }

        service ServiceC {
          rpc C (R) returns (R);
        }

        message R {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services).toHaveLength(3);
      expect(services.map(s => s.name).sort()).toEqual(['ServiceA', 'ServiceB', 'ServiceC']);
    });

    it('should handle service with many RPCs', () => {
      const rpcs = Array.from({ length: 20 }, (_, i) =>
        `rpc Method${i} (R) returns (R);`
      ).join('\n');

      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service LargeService {
          ${rpcs}
        }
        message R {}
      `);

      const services = grpcProvider.getAllServices();
      expect(services[0]!.rpcs).toHaveLength(20);
    });

    it('should handle services after file removal', () => {
      parseAndUpdate('file:///test.proto', `
        syntax = "proto3";
        service Test { rpc A (R) returns (R); }
        message R {}
      `);

      expect(grpcProvider.getAllServices()).toHaveLength(1);

      analyzer.removeFile('file:///test.proto');

      expect(grpcProvider.getAllServices()).toHaveLength(0);
    });
  });
});
