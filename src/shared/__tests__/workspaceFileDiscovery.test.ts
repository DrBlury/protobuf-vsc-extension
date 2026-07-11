import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverWorkspaceFiles, discoverWorkspaceFilesSync, WorkspacePathFilter } from '../workspaceFileDiscovery';

describe('workspace file discovery', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-workspace-discovery-'));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = 'syntax = "proto3";'): string {
    const target = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target;
  }

  it('honors root and nested .gitignore rules', () => {
    write('.gitignore', 'DerivedData*/\ngenerated/*.proto\n');
    write('DerivedData-tmp/vendor.proto');
    write('generated/ignored.proto');
    write('src/.gitignore', 'nested-generated/\n');
    write('src/nested-generated/ignored.proto');
    const kept = write('src/kept.proto');

    expect(discoverWorkspaceFilesSync(workspace)).toEqual([kept]);
  });

  it('honors configured patterns and never follows directory symlinks', () => {
    const kept = write('proto/kept.proto');
    write('output/generated.proto');
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-workspace-external-'));
    fs.writeFileSync(path.join(external, 'linked.proto'), 'syntax = "proto3";');
    fs.mkdirSync(path.join(external, 'nested'));
    fs.writeFileSync(path.join(external, 'nested', 'nested.proto'), 'syntax = "proto3";');
    fs.symlinkSync(external, path.join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

    try {
      expect(discoverWorkspaceFilesSync(workspace, { ignorePatterns: ['output'] })).toEqual([kept]);
      expect(discoverWorkspaceFilesSync(path.join(workspace, 'linked'), { rootDir: workspace })).toEqual([]);
      expect(discoverWorkspaceFilesSync(path.join(workspace, 'linked', 'nested'), { rootDir: workspace })).toEqual([]);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it('supports asynchronous scoped discovery', async () => {
    const kept = write('protos/kept.proto');
    write('outside.proto');

    await expect(
      discoverWorkspaceFiles(path.join(workspace, 'protos'), {
        rootDir: workspace,
      })
    ).resolves.toEqual([kept]);
  });

  it('does not follow a symlink used as the asynchronous scan root', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-workspace-external-'));
    fs.writeFileSync(path.join(external, 'outside.proto'), 'syntax = "proto3";');
    const linkedRoot = path.join(workspace, 'protos');
    fs.symlinkSync(external, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    try {
      await expect(discoverWorkspaceFiles(linkedRoot, { rootDir: workspace })).resolves.toEqual([]);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it('updates ignore-file decisions when its cache is cleared', () => {
    const generated = write('generated/example.proto');
    write('.gitignore', 'generated/\n');
    const filter = new WorkspacePathFilter(workspace);

    expect(filter.isIgnored(generated, false)).toBe(true);
    write('.gitignore', 'other/\n');
    expect(filter.isIgnored(generated, false)).toBe(true);

    filter.clearIgnoreFileCache();
    expect(filter.isIgnored(generated, false)).toBe(false);
  });

  it('prunes the directory targeted by descendant glob patterns', () => {
    const buildDirectory = path.join(workspace, 'nested', 'build');
    const filter = new WorkspacePathFilter(workspace, {
      ignorePatterns: ['**/build/**'],
    });

    expect(filter.isIgnored(buildDirectory, true)).toBe(true);
  });
});
