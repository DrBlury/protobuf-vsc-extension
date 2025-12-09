/**
 * Dependency Suggestion Provider
 * Suggests adding external packages to buf.yaml when imports cannot be resolved
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Map of common import patterns to their Buf Schema Registry modules
export const KNOWN_BSR_MODULES: { [pattern: string]: { module: string; description: string } } = {
  // Google APIs
  'google/api/': { module: 'buf.build/googleapis/googleapis', description: 'Google API definitions' },
  'google/type/': { module: 'buf.build/googleapis/googleapis', description: 'Google common types' },
  'google/rpc/': { module: 'buf.build/googleapis/googleapis', description: 'Google RPC definitions' },
  'google/cloud/': { module: 'buf.build/googleapis/googleapis', description: 'Google Cloud APIs' },
  'google/logging/': { module: 'buf.build/googleapis/googleapis', description: 'Google Logging' },

  // Buf Validate (formerly protoc-gen-validate)
  'buf/validate/': { module: 'buf.build/bufbuild/protovalidate', description: 'Buf validation rules' },
  'validate/validate.proto': { module: 'buf.build/envoyproxy/protoc-gen-validate', description: 'Protoc-gen-validate (legacy)' },

  // gRPC
  'grpc/': { module: 'buf.build/grpc/grpc', description: 'gRPC definitions' },
  'grpc/health/': { module: 'buf.build/grpc/grpc', description: 'gRPC health checking' },
  'grpc/reflection/': { module: 'buf.build/grpc/grpc', description: 'gRPC reflection' },

  // Envoy
  'envoy/': { module: 'buf.build/envoyproxy/envoy', description: 'Envoy Proxy APIs' },

  // xDS
  'xds/': { module: 'buf.build/cncf/xds', description: 'xDS APIs' },

  // OpenTelemetry
  'opentelemetry/': { module: 'buf.build/open-telemetry/opentelemetry', description: 'OpenTelemetry protocol' },

  // Cosmos SDK
  'cosmos/': { module: 'buf.build/cosmos/cosmos-sdk', description: 'Cosmos SDK' },
  'tendermint/': { module: 'buf.build/cosmos/cosmos-sdk', description: 'Tendermint' },

  // Connect
  'connectrpc/': { module: 'buf.build/connectrpc/connect', description: 'Connect RPC' },
};

export interface DependencySuggestion {
  importPath: string;
  module: string;
  description: string;
}

export class DependencySuggestionProvider {
  private outputChannel: vscode.OutputChannel;
  private pendingSuggestions: Map<string, DependencySuggestion[]> = new Map();

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Get suggestions for an unresolved import
   */
  public getSuggestion(importPath: string): DependencySuggestion | undefined {
    for (const [pattern, info] of Object.entries(KNOWN_BSR_MODULES)) {
      if (importPath.startsWith(pattern) || importPath === pattern.replace(/\/$/, '')) {
        return {
          importPath,
          module: info.module,
          description: info.description,
        };
      }
    }
    return undefined;
  }

  /**
   * Handle multiple unresolved imports and suggest adding dependencies
   */
  public async suggestDependencies(unresolvedImports: string[], documentUri: vscode.Uri): Promise<void> {
    const suggestions: DependencySuggestion[] = [];
    const seenModules = new Set<string>();

    for (const importPath of unresolvedImports) {
      const suggestion = this.getSuggestion(importPath);
      if (suggestion && !seenModules.has(suggestion.module)) {
        suggestions.push(suggestion);
        seenModules.add(suggestion.module);
      }
    }

    if (suggestions.length === 0) {
      return;
    }

    // Find buf.yaml
    const bufYamlPath = await this.findBufYaml(documentUri);

    if (!bufYamlPath) {
      // No buf.yaml, suggest creating one
      const create = await vscode.window.showInformationMessage(
        `Found ${suggestions.length} unresolved BSR import(s). Create buf.yaml to add dependencies?`,
        'Create buf.yaml',
        'Ignore'
      );

      if (create === 'Create buf.yaml') {
        await this.createBufYaml(documentUri, suggestions);
      }
      return;
    }

    // Check which dependencies are already present
    const existingDeps = await this.getExistingDeps(bufYamlPath);
    const newSuggestions = suggestions.filter(s => !existingDeps.includes(s.module));

    if (newSuggestions.length === 0) {
      return;
    }

    // Store pending suggestions for this document
    this.pendingSuggestions.set(documentUri.toString(), newSuggestions);

    // Show suggestion
    const moduleNames = newSuggestions.map(s => s.module.split('/').pop()).join(', ');
    const message = newSuggestions.length === 1
      ? `Import requires "${newSuggestions[0].module}". Add to buf.yaml?`
      : `Imports require ${newSuggestions.length} dependencies (${moduleNames}). Add to buf.yaml?`;

    const action = await vscode.window.showInformationMessage(
      message,
      'Add Dependencies',
      'Show Details',
      'Ignore'
    );

    if (action === 'Add Dependencies') {
      await this.addDependencies(bufYamlPath, newSuggestions);
    } else if (action === 'Show Details') {
      await this.showDependencyDetails(newSuggestions, bufYamlPath);
    }
  }

  /**
   * Show details about suggested dependencies
   */
  private async showDependencyDetails(suggestions: DependencySuggestion[], bufYamlPath: string): Promise<void> {
    const items = suggestions.map(s => ({
      label: s.module,
      description: s.description,
      detail: `Required for: ${s.importPath}`,
      module: s.module,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select dependencies to add',
      canPickMany: true,
    });

    if (selected && selected.length > 0) {
      const selectedSuggestions = suggestions.filter(s =>
        selected.some(sel => sel.module === s.module)
      );
      await this.addDependencies(bufYamlPath, selectedSuggestions);
    }
  }

  /**
   * Find buf.yaml in the document's directory hierarchy
   */
  private async findBufYaml(documentUri: vscode.Uri): Promise<string | null> {
    let currentDir = path.dirname(documentUri.fsPath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const bufYamlPath = path.join(currentDir, 'buf.yaml');
      const bufYmlPath = path.join(currentDir, 'buf.yml');

      if (fs.existsSync(bufYamlPath)) {
        return bufYamlPath;
      }
      if (fs.existsSync(bufYmlPath)) {
        return bufYmlPath;
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {break;}
      currentDir = parent;
    }

    return null;
  }

  /**
   * Get existing dependencies from buf.yaml
   */
  private async getExistingDeps(bufYamlPath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(bufYamlPath, 'utf-8');
      const deps: string[] = [];

      // Simple regex-based parsing for deps array
      const depsMatch = content.match(/^deps:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (depsMatch) {
        const depsLines = depsMatch[1].split('\n');
        for (const line of depsLines) {
          const depMatch = line.match(/^\s+-\s+["']?([^"'\s]+)["']?/);
          if (depMatch) {
            deps.push(depMatch[1].trim());
          }
        }
      }

      return deps;
    } catch {
      return [];
    }
  }

  /**
   * Add dependencies to buf.yaml
   */
  private async addDependencies(bufYamlPath: string, suggestions: DependencySuggestion[]): Promise<void> {
    try {
      let content = fs.readFileSync(bufYamlPath, 'utf-8');
      const modulesToAdd = suggestions.map(s => s.module);

      // Check if deps section exists
      if (content.includes('deps:')) {
        // Add to existing deps section
        for (const module of modulesToAdd) {
          if (!content.includes(module)) {
            content = content.replace(/deps:\s*\n/, `deps:\n  - ${module}\n`);
          }
        }
      } else {
        // Add new deps section
        const depsSection = `\ndeps:\n${modulesToAdd.map(m => `  - ${m}`).join('\n')}\n`;
        content += depsSection;
      }

      fs.writeFileSync(bufYamlPath, content);
      this.outputChannel.appendLine(`Added ${modulesToAdd.length} dependencies to ${bufYamlPath}`);

      // Run buf mod update
      await this.runBufModUpdate(path.dirname(bufYamlPath));

      vscode.window.showInformationMessage(
        `Added ${modulesToAdd.length} dependency(ies) to buf.yaml and ran buf mod update`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to add dependencies: ${message}`);
    }
  }

  /**
   * Create a new buf.yaml with dependencies
   */
  private async createBufYaml(documentUri: vscode.Uri, suggestions: DependencySuggestion[]): Promise<void> {
    // Find workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Cannot create buf.yaml: no workspace folder found');
      return;
    }

    // Ask where to create buf.yaml
    const locations = [
      { label: 'Workspace Root', path: workspaceFolder.uri.fsPath },
      { label: 'Document Directory', path: path.dirname(documentUri.fsPath) },
    ];

    const location = await vscode.window.showQuickPick(locations, {
      placeHolder: 'Where should buf.yaml be created?',
    });

    if (!location) {
      return;
    }

    const bufYamlPath = path.join(location.path, 'buf.yaml');

    // Create buf.yaml content
    const modulesToAdd = suggestions.map(s => s.module);
    const content = `version: v2
deps:
${modulesToAdd.map(m => `  - ${m}`).join('\n')}
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
`;

    try {
      fs.writeFileSync(bufYamlPath, content);
      this.outputChannel.appendLine(`Created ${bufYamlPath}`);

      // Run buf mod update
      await this.runBufModUpdate(location.path);

      // Open the file
      const doc = await vscode.workspace.openTextDocument(bufYamlPath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage('Created buf.yaml and ran buf mod update');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to create buf.yaml: ${message}`);
    }
  }

  /**
   * Run buf mod update
   */
  private async runBufModUpdate(cwd: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('protobuf');
    const bufPath = config.get<string>('buf.path') || config.get<string>('externalLinter.bufPath') || 'buf';

    return new Promise((resolve, reject) => {
      this.outputChannel.appendLine(`Running: ${bufPath} mod update`);
      const proc = spawn(bufPath, ['mod', 'update'], { cwd, shell: true });

      proc.stdout?.on('data', d => this.outputChannel.append(d.toString()));
      proc.stderr?.on('data', d => this.outputChannel.append(d.toString()));

      proc.on('close', code => {
        if (code === 0) {
          this.outputChannel.appendLine('buf mod update completed');
          resolve();
        } else {
          reject(new Error(`buf mod update failed with code ${code}`));
        }
      });

      proc.on('error', err => {
        this.outputChannel.appendLine(`buf mod update error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Get pending suggestions for a document
   */
  public getPendingSuggestions(documentUri: string): DependencySuggestion[] {
    return this.pendingSuggestions.get(documentUri) || [];
  }

  /**
   * Clear pending suggestions for a document
   */
  public clearPendingSuggestions(documentUri: string): void {
    this.pendingSuggestions.delete(documentUri);
  }
}
