/**
 * Tests for BSR module suggestion functionality
 * Tests the pattern matching logic used by CodeActionsProvider
 */

describe('BSR Module Detection Patterns', () => {
  // These patterns match what's in CodeActionsProvider.isBufRegistryImport
  const bufRegistryPatterns = [
    /^buf\//,
    /^google\/api\//,
    /^google\/type\//,
    /^google\/rpc\//,
    /^google\/cloud\//,
    /^google\/logging\//,
    /^grpc\//,
    /^envoy\//,
    /^validate\/validate\.proto$/,
    /^xds\//,
    /^opencensus\//,
    /^opentelemetry\//,
    /^cosmos\//,
    /^tendermint\//,
  ];

  function isBufRegistryImport(importPath: string): boolean {
    return bufRegistryPatterns.some(pattern => pattern.test(importPath));
  }

  describe('isBufRegistryImport', () => {
    it('should recognize google/api imports as BSR dependencies', () => {
      expect(isBufRegistryImport('google/api/annotations.proto')).toBe(true);
      expect(isBufRegistryImport('google/api/http.proto')).toBe(true);
    });

    it('should recognize google/type imports as BSR dependencies', () => {
      expect(isBufRegistryImport('google/type/date.proto')).toBe(true);
      expect(isBufRegistryImport('google/type/money.proto')).toBe(true);
    });

    it('should recognize google/rpc imports as BSR dependencies', () => {
      expect(isBufRegistryImport('google/rpc/status.proto')).toBe(true);
    });

    it('should recognize buf/validate imports as BSR dependencies', () => {
      expect(isBufRegistryImport('buf/validate/validate.proto')).toBe(true);
    });

    it('should recognize validate/validate.proto as BSR dependency', () => {
      expect(isBufRegistryImport('validate/validate.proto')).toBe(true);
    });

    it('should recognize grpc imports as BSR dependencies', () => {
      expect(isBufRegistryImport('grpc/health/v1/health.proto')).toBe(true);
      expect(isBufRegistryImport('grpc/reflection/v1/reflection.proto')).toBe(true);
    });

    it('should recognize envoy imports as BSR dependencies', () => {
      expect(isBufRegistryImport('envoy/config/core/v3/base.proto')).toBe(true);
    });

    it('should recognize opentelemetry imports as BSR dependencies', () => {
      expect(isBufRegistryImport('opentelemetry/proto/common/v1/common.proto')).toBe(true);
    });

    it('should recognize cosmos imports as BSR dependencies', () => {
      expect(isBufRegistryImport('cosmos/base/v1beta1/coin.proto')).toBe(true);
    });

    it('should recognize tendermint imports as BSR dependencies', () => {
      expect(isBufRegistryImport('tendermint/types/block.proto')).toBe(true);
    });

    it('should recognize xds imports as BSR dependencies', () => {
      expect(isBufRegistryImport('xds/core/v3/resource.proto')).toBe(true);
    });

    it('should NOT recognize google/protobuf as BSR dependency (well-known types)', () => {
      expect(isBufRegistryImport('google/protobuf/timestamp.proto')).toBe(false);
      expect(isBufRegistryImport('google/protobuf/any.proto')).toBe(false);
      expect(isBufRegistryImport('google/protobuf/descriptor.proto')).toBe(false);
    });

    it('should NOT recognize custom/local imports as BSR dependencies', () => {
      expect(isBufRegistryImport('my/company/service.proto')).toBe(false);
      expect(isBufRegistryImport('custom/package/types.proto')).toBe(false);
    });
  });

  describe('BSR module mapping', () => {
    // These patterns match what's in CodeActionsProvider.suggestBufModule
    const moduleMap: { pattern: RegExp; module: string }[] = [
      { pattern: /^google\/api\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/type\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/rpc\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^google\/cloud\//, module: 'buf.build/googleapis/googleapis' },
      { pattern: /^buf\/validate\//, module: 'buf.build/bufbuild/protovalidate' },
      { pattern: /^validate\/validate\.proto$/, module: 'buf.build/envoyproxy/protoc-gen-validate' },
      { pattern: /^grpc\//, module: 'buf.build/grpc/grpc' },
      { pattern: /^envoy\//, module: 'buf.build/envoyproxy/envoy' },
      { pattern: /^xds\//, module: 'buf.build/cncf/xds' },
      { pattern: /^opentelemetry\//, module: 'buf.build/opentelemetry/opentelemetry' },
      { pattern: /^cosmos\//, module: 'buf.build/cosmos/cosmos-sdk' },
      { pattern: /^tendermint\//, module: 'buf.build/cosmos/cosmos-sdk' },
    ];

    function suggestBufModule(importPath: string): string | undefined {
      const match = moduleMap.find(m => m.pattern.test(importPath));
      return match?.module;
    }

    it('should suggest correct module for google/api imports', () => {
      expect(suggestBufModule('google/api/http.proto')).toBe('buf.build/googleapis/googleapis');
      expect(suggestBufModule('google/api/annotations.proto')).toBe('buf.build/googleapis/googleapis');
    });

    it('should suggest correct module for google/type imports', () => {
      expect(suggestBufModule('google/type/date.proto')).toBe('buf.build/googleapis/googleapis');
    });

    it('should suggest correct module for buf/validate imports', () => {
      expect(suggestBufModule('buf/validate/validate.proto')).toBe('buf.build/bufbuild/protovalidate');
    });

    it('should suggest correct module for legacy validate imports', () => {
      expect(suggestBufModule('validate/validate.proto')).toBe('buf.build/envoyproxy/protoc-gen-validate');
    });

    it('should suggest correct module for grpc imports', () => {
      expect(suggestBufModule('grpc/reflection/v1/reflection.proto')).toBe('buf.build/grpc/grpc');
      expect(suggestBufModule('grpc/health/v1/health.proto')).toBe('buf.build/grpc/grpc');
    });

    it('should suggest correct module for envoy imports', () => {
      expect(suggestBufModule('envoy/config/core/v3/base.proto')).toBe('buf.build/envoyproxy/envoy');
    });

    it('should suggest correct module for opentelemetry imports', () => {
      expect(suggestBufModule('opentelemetry/proto/trace/v1/trace.proto')).toBe(
        'buf.build/opentelemetry/opentelemetry'
      );
    });

    it('should suggest correct module for cosmos imports', () => {
      expect(suggestBufModule('cosmos/base/v1beta1/coin.proto')).toBe('buf.build/cosmos/cosmos-sdk');
    });

    it('should suggest correct module for tendermint imports', () => {
      expect(suggestBufModule('tendermint/types/block.proto')).toBe('buf.build/cosmos/cosmos-sdk');
    });

    it('should return undefined for unknown imports', () => {
      expect(suggestBufModule('custom/package/service.proto')).toBeUndefined();
      expect(suggestBufModule('google/protobuf/timestamp.proto')).toBeUndefined();
    });
  });
});
