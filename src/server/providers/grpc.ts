/**
 * gRPC Service Provider
 * Provides gRPC-specific analysis and utilities
 */

import type { SemanticAnalyzer } from '../core/analyzer';
import type { RpcDefinition } from '../core/ast';
import type { Range } from '../core/ast';

export interface GrpcServiceInfo {
  name: string;
  fullName: string;
  package: string;
  rpcs: GrpcRpcInfo[];
  uri: string;
  range: Range;
}

export interface GrpcRpcInfo {
  name: string;
  fullName: string;
  inputType: string;
  outputType: string;
  inputStream: boolean;
  outputStream: boolean;
  streamingType: 'unary' | 'server-streaming' | 'client-streaming' | 'bidirectional-streaming';
  uri: string;
  range: Range;
}

export class GrpcProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Get all gRPC services in the workspace
   */
  getAllServices(): GrpcServiceInfo[] {
    const services: GrpcServiceInfo[] = [];
    const files = this.analyzer.getAllFiles();

    for (const [uri, file] of files.entries()) {
      const packageName = file.package?.name || '';

      for (const service of file.services) {
        const fullName = packageName ? `${packageName}.${service.name}` : service.name;

        const rpcs: GrpcRpcInfo[] = service.rpcs.map(rpc => {
          const rpcFullName = `${fullName}.${rpc.name}`;
          const streamingType = this.getStreamingType(rpc);
          const inputType = rpc.requestType ?? rpc.inputType ?? '';
          const outputType = rpc.responseType ?? rpc.outputType ?? '';
          const inputStream = rpc.requestStreaming ?? rpc.inputStream ?? false;
          const outputStream = rpc.responseStreaming ?? rpc.outputStream ?? false;

          return {
            name: rpc.name,
            fullName: rpcFullName,
            inputType,
            outputType,
            inputStream,
            outputStream,
            streamingType,
            uri,
            range: rpc.range
          };
        });

        services.push({
          name: service.name,
          fullName,
          package: packageName,
          rpcs,
          uri,
          range: service.range
        });
      }
    }

    return services;
  }

  /**
   * Get service by name (fully qualified or simple)
   */
  getService(serviceName: string, uri?: string): GrpcServiceInfo | null {
    const services = this.getAllServices();

    // Try exact match first
    let service = services.find(s => s.fullName === serviceName || s.name === serviceName);

    // If URI provided, prefer service from that file
    if (uri && !service) {
      service = services.find(s => s.uri === uri && s.name === serviceName);
    }

    return service || null;
  }

  /**
   * Get RPC by fully qualified name
   */
  getRpc(rpcFullName: string): GrpcRpcInfo | null {
    const services = this.getAllServices();

    for (const service of services) {
      const rpc = service.rpcs.find(r => r.fullName === rpcFullName || r.name === rpcFullName);
      if (rpc) {
        return rpc;
      }
    }

    return null;
  }

  /**
   * Get all RPCs that use a specific message type
   */
  getRpcsUsingType(typeName: string): GrpcRpcInfo[] {
    const allRpcs: GrpcRpcInfo[] = [];
    const services = this.getAllServices();

    for (const service of services) {
      for (const rpc of service.rpcs) {
        if (rpc.inputType === typeName || rpc.outputType === typeName) {
          allRpcs.push(rpc);
        }
      }
    }

    return allRpcs;
  }

  /**
   * Determine streaming type of an RPC
   */
  private getStreamingType(rpc: RpcDefinition): GrpcRpcInfo['streamingType'] {
    if (rpc.inputStream && rpc.outputStream) {
      return 'bidirectional-streaming';
    } else if (rpc.inputStream) {
      return 'client-streaming';
    } else if (rpc.outputStream) {
      return 'server-streaming';
    } else {
      return 'unary';
    }
  }

  /**
   * Generate client stub code preview (pseudo-code)
   */
  generateClientStubPreview(service: GrpcServiceInfo, language: 'go' | 'java' | 'python' | 'typescript'): string {
    const lines: string[] = [];

    switch (language) {
      case 'go':
        lines.push(`// Go client stub for ${service.fullName}`);
        lines.push(`type ${service.name}Client struct {`);
        lines.push(`  cc grpc.ClientConnInterface`);
        lines.push(`}`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`func (c *${service.name}Client) ${rpc.name}(ctx context.Context, req *${rpc.inputType}) (*${rpc.outputType}, error) {`);
          lines.push(`  // Implementation`);
          lines.push(`}`);
          lines.push('');
        }
        break;

      case 'java':
        lines.push(`// Java client stub for ${service.fullName}`);
        lines.push(`public class ${service.name}Client {`);
        lines.push(`  private final ${service.name}Grpc.${service.name}Stub stub;`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  public ${rpc.outputType} ${rpc.name}(${rpc.inputType} request) {`);
          lines.push(`    // Implementation`);
          lines.push(`  }`);
          lines.push('');
        }
        lines.push(`}`);
        break;

      case 'python':
        lines.push(`# Python client stub for ${service.fullName}`);
        lines.push(`class ${service.name}Client:`);
        lines.push(`  def __init__(self, channel):`);
        lines.push(`    self.stub = ${service.name}_pb2_grpc.${service.name}Stub(channel)`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  def ${this.toSnakeCase(rpc.name)}(self, request):`);
          lines.push(`    # Implementation`);
          lines.push(`    pass`);
          lines.push('');
        }
        break;

      case 'typescript':
        lines.push(`// TypeScript client stub for ${service.fullName}`);
        lines.push(`export class ${service.name}Client {`);
        lines.push(`  constructor(private client: Client) {}`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  ${rpc.name}(request: ${rpc.inputType}): Promise<${rpc.outputType}> {`);
          lines.push(`    // Implementation`);
          lines.push(`  }`);
          lines.push('');
        }
        lines.push(`}`);
        break;
    }

    return lines.join('\n');
  }

  /**
   * Generate server implementation template
   */
  generateServerTemplate(service: GrpcServiceInfo, language: 'go' | 'java' | 'python' | 'typescript'): string {
    const lines: string[] = [];

    switch (language) {
      case 'go':
        lines.push(`// Go server implementation for ${service.fullName}`);
        lines.push(`type ${service.name}Server struct {`);
        lines.push(`  // Add your dependencies here`);
        lines.push(`}`);
        lines.push('');
        lines.push(`func (s *${service.name}Server) mustEmbedUnimplemented${service.name}Server() {}`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`func (s *${service.name}Server) ${rpc.name}(ctx context.Context, req *${rpc.inputType}) (*${rpc.outputType}, error) {`);
          lines.push(`  // TODO: Implement ${rpc.name}`);
          lines.push(`  return nil, status.Errorf(codes.Unimplemented, "method ${rpc.name} not implemented")`);
          lines.push(`}`);
          lines.push('');
        }
        break;

      case 'java':
        lines.push(`// Java server implementation for ${service.fullName}`);
        lines.push(`public class ${service.name}Impl extends ${service.name}Grpc.${service.name}ImplBase {`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  @Override`);
          lines.push(`  public void ${rpc.name}(`);
          lines.push(`      ${rpc.inputType} request,`);
          lines.push(`      StreamObserver<${rpc.outputType}> responseObserver) {`);
          lines.push(`    // TODO: Implement ${rpc.name}`);
          lines.push(`    responseObserver.onError(`);
          lines.push(`      Status.UNIMPLEMENTED.withDescription("method ${rpc.name} not implemented").asException()`);
          lines.push(`    );`);
          lines.push(`  }`);
          lines.push('');
        }
        lines.push(`}`);
        break;

      case 'python':
        lines.push(`# Python server implementation for ${service.fullName}`);
        lines.push(`class ${service.name}Servicer(${service.name}_pb2_grpc.${service.name}Servicer):`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  def ${this.toSnakeCase(rpc.name)}(self, request, context):`);
          lines.push(`    # TODO: Implement ${rpc.name}`);
          lines.push(`    context.set_code(grpc.StatusCode.UNIMPLEMENTED)`);
          lines.push(`    context.set_details('method ${rpc.name} not implemented')`);
          lines.push(`    raise NotImplementedError('method ${rpc.name} not implemented')`);
          lines.push('');
        }
        break;

      case 'typescript':
        lines.push(`// TypeScript server implementation for ${service.fullName}`);
        lines.push(`export class ${service.name}Service implements ${service.name}ServiceDefinition {`);
        lines.push('');
        for (const rpc of service.rpcs) {
          lines.push(`  ${rpc.name}(call: ServerUnaryCall<${rpc.inputType}, ${rpc.outputType}>): Promise<${rpc.outputType}> {`);
          lines.push(`    // TODO: Implement ${rpc.name}`);
          lines.push(`    throw new Error('method ${rpc.name} not implemented');`);
          lines.push(`  }`);
          lines.push('');
        }
        lines.push(`}`);
        break;
    }

    return lines.join('\n');
  }

  /**
   * Convert camelCase to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  /**
   * Get service statistics
   */
  getServiceStats(service: GrpcServiceInfo): {
    totalRpcs: number;
    unaryRpcs: number;
    streamingRpcs: number;
    serverStreamingRpcs: number;
    clientStreamingRpcs: number;
    bidirectionalStreamingRpcs: number;
  } {
    return {
      totalRpcs: service.rpcs.length,
      unaryRpcs: service.rpcs.filter(r => r.streamingType === 'unary').length,
      streamingRpcs: service.rpcs.filter(r => r.streamingType !== 'unary').length,
      serverStreamingRpcs: service.rpcs.filter(r => r.streamingType === 'server-streaming').length,
      clientStreamingRpcs: service.rpcs.filter(r => r.streamingType === 'client-streaming').length,
      bidirectionalStreamingRpcs: service.rpcs.filter(r => r.streamingType === 'bidirectional-streaming').length
    };
  }
}
