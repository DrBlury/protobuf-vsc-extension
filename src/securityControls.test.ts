import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

describe('packaged security controls', () => {
  it('requires VS Code Workspace Trust before activation', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      capabilities?: { untrustedWorkspaces?: { supported?: boolean } };
    };

    expect(manifest.capabilities?.untrustedWorkspaces?.supported).toBe(false);
  });

  it('pins every GitHub Action reference to a full commit SHA', () => {
    const workflowDir = path.join(root, '.github', 'workflows');
    const workflows = fs.readdirSync(workflowDir).filter(file => file.endsWith('.yml'));
    const actionReferences = workflows.flatMap(file => {
      const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
      return [...source.matchAll(/uses:\s+([^\s#]+)/g)].map(match => `${file}: ${match[1]}`);
    });

    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences).toEqual(
      expect.arrayContaining(actionReferences.filter(reference => /@[0-9a-f]{40}$/.test(reference)))
    );
    expect(actionReferences.every(reference => /@[0-9a-f]{40}$/.test(reference))).toBe(true);
  });

  it('uses locked local CLI packages for SBOM generation and publication', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>;
    };
    const workflows = ['ci.yml', 'release.yml']
      .map(file => fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8'))
      .join('\n');

    expect(packageJson.devDependencies?.['@cyclonedx/cyclonedx-npm']).toMatch(/^\d/);
    expect(packageJson.devDependencies?.ovsx).toMatch(/^\d/);
    expect(workflows).not.toContain('npm install -g');
    expect(workflows).not.toContain('npx --yes');
    expect(workflows).toContain('npx --no-install cyclonedx-npm');
    expect(workflows).toContain('npx --no-install ovsx');
  });
});
