/**
 * Tests for Buf Configuration Provider
 */

import { BufConfigProvider } from '../bufConfig';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BufConfigProvider', () => {
  let bufConfigProvider: BufConfigProvider;
  let tempDir: string;

  beforeEach(() => {
    bufConfigProvider = new BufConfigProvider();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buf-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    bufConfigProvider.clearCache();
  });

  it('should parse buf.yaml configuration', () => {
    const bufYaml = `version: v1
name: buf.build/acme/proto
build:
  roots:
    - proto
    - third_party
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const config = bufConfigProvider.findBufConfig(bufYamlPath);

    expect(config).toBeDefined();
    expect(config?.version).toBe('v1');
    expect(config?.name).toBe('buf.build/acme/proto');
    expect(config?.build?.roots).toContain('proto');
    expect(config?.build?.roots).toContain('third_party');
  });

  it('should parse buf.work.yaml configuration', () => {
    const bufWorkYaml = `version: v1
directories:
  - proto/acme
  - proto/common
  - third_party
`;

    const bufWorkYamlPath = path.join(tempDir, 'buf.work.yaml');
    fs.writeFileSync(bufWorkYamlPath, bufWorkYaml);

    const config = bufConfigProvider.findBufWorkConfig(bufWorkYamlPath);

    expect(config).toBeDefined();
    expect(config?.version).toBe('v1');
    expect(config?.directories).toContain('proto/acme');
    expect(config?.directories).toContain('proto/common');
    expect(config?.directories).toContain('third_party');
  });

  it('should get proto roots from buf.yaml', () => {
    const bufYaml = `version: v1
build:
  roots:
    - proto
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const protoDir = path.join(tempDir, 'proto');
    fs.mkdirSync(protoDir, { recursive: true });

    const roots = bufConfigProvider.getProtoRoots(bufYamlPath);

    expect(roots.length).toBeGreaterThan(0);
    expect(roots.some(r => r.includes('proto'))).toBe(true);
  });

  it('should get work directories from buf.work.yaml', () => {
    const bufWorkYaml = `version: v1
directories:
  - proto/acme
`;

    const bufWorkYamlPath = path.join(tempDir, 'buf.work.yaml');
    fs.writeFileSync(bufWorkYamlPath, bufWorkYaml);

    const workDir = path.join(tempDir, 'proto', 'acme');
    fs.mkdirSync(workDir, { recursive: true });

    const dirs = bufConfigProvider.getWorkDirectories(bufWorkYamlPath);

    expect(dirs.length).toBeGreaterThan(0);
  });

  it('should find buf.yaml in parent directories', () => {
    const bufYaml = `version: v1
build:
  roots:
    - proto
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const subDir = path.join(tempDir, 'sub', 'dir');
    fs.mkdirSync(subDir, { recursive: true });
    const fileInSubDir = path.join(subDir, 'test.proto');

    const config = bufConfigProvider.findBufConfig(fileInSubDir);

    expect(config).toBeDefined();
    expect(config?.version).toBe('v1');
  });

  it('should return null for missing buf.yaml', () => {
    const filePath = path.join(tempDir, 'test.proto');
    const config = bufConfigProvider.findBufConfig(filePath);

    expect(config).toBeNull();
  });

  it('should cache parsed configurations', () => {
    const bufYaml = `version: v1
build:
  roots:
    - proto
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const config1 = bufConfigProvider.findBufConfig(bufYamlPath);
    const config2 = bufConfigProvider.findBufConfig(bufYamlPath);

    expect(config1).toBe(config2); // Should be same object from cache
  });

  it('should parse buf.yaml v2 format with modules and deps', () => {
    const bufYaml = `version: v2
modules:
  - path: .
    excludes:
      - .buf-deps
deps:
  - buf.build/googleapis/googleapis
  - buf.build/bufbuild/protovalidate
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const config = bufConfigProvider.findBufConfig(bufYamlPath);

    expect(config).toBeDefined();
    expect(config?.version).toBe('v2');
    expect(config?.deps).toBeDefined();
    expect(config?.deps).toContain('buf.build/googleapis/googleapis');
    expect(config?.deps).toContain('buf.build/bufbuild/protovalidate');
    expect(config?.modules?.[0]?.path).toBe('.');
    expect(config?.modules?.[0]?.excludes).toContain('.buf-deps');
    // Should NOT contain items from modules section
    expect(config?.deps).not.toContain('path: .');
    expect(config?.deps?.length).toBe(2);
  });

  it('should ignore nested module metadata lists when parsing buf.yaml v2 modules', () => {
    const bufYaml = `version: v2
modules:
  - path: proto
    lint:
      use:
        - STANDARD
    breaking:
      use:
        - FILE
deps:
  - buf.build/googleapis/googleapis
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const config = bufConfigProvider.findBufConfig(bufYamlPath);

    expect(config?.modules).toEqual([{ path: 'proto' }]);
    expect(config?.deps).toEqual(['buf.build/googleapis/googleapis']);
  });

  it('should get proto roots from buf.yaml v2 modules', () => {
    const bufYaml = `version: v2
modules:
  - path: ./protos
    excludes:
      - protos/grpc
deps:
  - buf.build/googleapis/googleapis
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const protoDir = path.join(tempDir, 'protos');
    fs.mkdirSync(protoDir, { recursive: true });

    const roots = bufConfigProvider.getProtoRoots(bufYamlPath);

    expect(roots).toEqual([path.normalize(protoDir)]);
    expect(roots).not.toContain(path.normalize(tempDir));
  });

  it('should resolve v2 module roots relative to buf.yaml when called with a proto file path', () => {
    const bufYaml = `version: v2
modules:
  - path: protos
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const protoDir = path.join(tempDir, 'protos');
    fs.mkdirSync(path.join(protoDir, 'api', 'v1'), { recursive: true });
    const protoFilePath = path.join(protoDir, 'api', 'v1', 'service.proto');
    fs.writeFileSync(protoFilePath, 'syntax = "proto3";');

    const roots = bufConfigProvider.getProtoRoots(protoFilePath);

    expect(roots).toContain(path.normalize(protoDir));
    expect(roots).not.toContain(path.normalize(path.join(protoDir, 'api', 'v1', 'protos')));
  });

  it('should return all existing v2 module roots', () => {
    const bufYaml = `version: v2
modules:
  - path: proto/public
  - path: proto/internal
  - path: proto/missing
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const publicDir = path.join(tempDir, 'proto', 'public');
    const internalDir = path.join(tempDir, 'proto', 'internal');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.mkdirSync(internalDir, { recursive: true });

    const roots = bufConfigProvider.getProtoRoots(bufYamlPath);

    expect(roots).toEqual([path.normalize(publicDir), path.normalize(internalDir)]);
  });

  it('should resolve v1 build roots relative to buf.yaml when called with a proto file path', () => {
    const bufYaml = `version: v1
build:
  roots:
    - proto
`;

    const bufYamlPath = path.join(tempDir, 'buf.yaml');
    fs.writeFileSync(bufYamlPath, bufYaml);

    const protoDir = path.join(tempDir, 'proto');
    fs.mkdirSync(protoDir, { recursive: true });
    const protoFilePath = path.join(protoDir, 'service.proto');
    fs.writeFileSync(protoFilePath, 'syntax = "proto3";');

    const roots = bufConfigProvider.getProtoRoots(protoFilePath);

    expect(roots).toEqual([path.normalize(protoDir)]);
  });
});
