/**
 * Dependency Suggestion Provider
 * Suggests adding external packages to buf.yaml when imports cannot be resolved
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileExists, readFile, writeFile } from '../utils/fsUtils';

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
  'opentelemetry/': { module: 'buf.build/opentelemetry/opentelemetry', description: 'OpenTelemetry protocol' },

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
      ? `Import requires "${newSuggestions[0]!.module}". Add to buf.yaml?`
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

      if (await fileExists(bufYamlPath)) {
        return bufYamlPath;
      }
      if (await fileExists(bufYmlPath)) {
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
      const content = await readFile(bufYamlPath);
      const deps: string[] = [];

      // Simple regex-based parsing for deps array
      const depsMatch = content.match(/^deps:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (depsMatch) {
        const depsLines = depsMatch[1]!.split('\n');
        for (const line of depsLines) {
          const depMatch = line.match(/^\s+-\s+["']?([^"'\s]+)["']?/);
          if (depMatch) {
            deps.push(depMatch[1]!.trim());
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
      let content = await readFile(bufYamlPath);
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

      await writeFile(bufYamlPath, content);
      this.outputChannel.appendLine(`Added ${modulesToAdd.length} dependencies to ${bufYamlPath}`);

      // Run buf dep update
      await this.runBufDepUpdate(path.dirname(bufYamlPath));

      vscode.window.showInformationMessage(
        `Added ${modulesToAdd.length} dependency(ies) to buf.yaml and ran buf dep update`
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
      await writeFile(bufYamlPath, content);
      this.outputChannel.appendLine(`Created ${bufYamlPath}`);

      // Run buf dep update
      await this.runBufDepUpdate(location.path);

      // Open the file
      const doc = await vscode.workspace.openTextDocument(bufYamlPath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage('Created buf.yaml and ran buf dep update');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to create buf.yaml: ${message}`);
    }
  }

  /**
   * Run buf dep update
   * If it fails due to editions issues (optional/required labels), auto-fix and retry
   */
  private async runBufDepUpdate(cwd: string, retryCount: number = 0): Promise<void> {
    const config = vscode.workspace.getConfiguration('protobuf');
    const bufPath = config.get<string>('buf.path') || config.get<string>('externalLinter.bufPath') || 'buf';
    const maxRetries = 3;

    return new Promise((resolve, reject) => {
      this.outputChannel.appendLine(`Running: ${bufPath} dep update`);
      // Don't use shell: true as it breaks paths with spaces
      const proc = spawn(bufPath, ['dep', 'update'], { cwd });

      let stderrOutput = '';

      proc.stdout?.on('data', d => this.outputChannel.append(d.toString()));
      proc.stderr?.on('data', d => {
        const str = d.toString();
        stderrOutput += str;
        this.outputChannel.append(str);
      });

      proc.on('close', async code => {
        if (code === 0) {
          this.outputChannel.appendLine('buf dep update completed');
          resolve();
        } else {
          // Check if the error is about 'optional' or 'required' labels in editions
          const editionsErrors = this.parseEditionsErrors(stderrOutput, cwd);

          if (editionsErrors.length > 0 && retryCount < maxRetries) {
            this.outputChannel.appendLine(`\nDetected ${editionsErrors.length} editions compatibility issue(s). Auto-fixing...`);

            try {
              await this.fixEditionsErrors(editionsErrors);
              this.outputChannel.appendLine('Auto-fix applied. Retrying buf dep update...\n');

              // Retry after fixing
              const result = await this.runBufDepUpdate(cwd, retryCount + 1);
              resolve(result);
            } catch (fixErr) {
              const msg = fixErr instanceof Error ? fixErr.message : String(fixErr);
              this.outputChannel.appendLine(`Auto-fix failed: ${msg}`);
              reject(new Error(`buf dep update failed with code ${code}`));
            }
          } else {
            reject(new Error(`buf dep update failed with code ${code}`));
          }
        }
      });

      proc.on('error', err => {
        this.outputChannel.appendLine(`buf dep update error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Parse buf output for editions-related errors (optional/required labels)
   */
  private parseEditionsErrors(stderr: string, cwd: string): Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}> {
    const errors: Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}> = [];

    // Pattern: file.proto:43:9:field package.Message.field_name: label 'optional' is not allowed in editions
    const regex = /^([^:]+):(\d+):\d+:field\s+[\w.]+\.(\w+):\s+label\s+'(optional|required)'\s+is\s+not\s+allowed\s+in\s+editions/gm;

    let match;
    while ((match = regex.exec(stderr)) !== null) {
      const [, filePath, lineStr, fieldName, label] = match;
      const fullPath = path.isAbsolute(filePath!) ? filePath! : path.join(cwd, filePath!);
      errors.push({
        filePath: fullPath,
        line: parseInt(lineStr!, 10),
        fieldName: fieldName!,
        label: label as 'optional' | 'required',
      });
    }

    return errors;
  }

  /**
   * Fix editions errors by converting optional/required to features.field_presence
   */
  private async fixEditionsErrors(errors: Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}>): Promise<void> {
    // Group errors by file
    const errorsByFile = new Map<string, Array<{line: number; fieldName: string; label: 'optional' | 'required'}>>();

    for (const error of errors) {
      const existing = errorsByFile.get(error.filePath) || [];
      existing.push({ line: error.line, fieldName: error.fieldName, label: error.label });
      errorsByFile.set(error.filePath, existing);
    }

    for (const [filePath, fileErrors] of errorsByFile) {
      try {
        // Check if file exists
        if (!(await fileExists(filePath))) {
          this.outputChannel.appendLine(`  ERROR: File not found: ${filePath}`);
          throw new Error(`File not found: ${filePath}`);
        }

        let content = await readFile(filePath);
        const originalContent = content;
        const lines = content.split('\n');
        this.outputChannel.appendLine(`  Reading ${filePath} (${lines.length} lines)`);

        // Sort errors by line number in descending order to avoid index shifts
        fileErrors.sort((a, b) => b.line - a.line);

        let fixCount = 0;
        for (const error of fileErrors) {
          const lineIndex = error.line - 1;
          if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex]!;
            this.outputChannel.appendLine(`  Line ${error.line}: "${line.substring(0, 60)}..."`);

            // Match: optional/required Type name = N; or optional/required Type name = N [options];
            const fieldMatch = line.match(/^(\s*)(optional|required)\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/);
            if (fieldMatch) {
              const [, indent, , type, name, number, existingOptions] = fieldMatch;
              const presenceValue = error.label === 'optional' ? 'EXPLICIT' : 'LEGACY_REQUIRED';

              let newLine: string;
              if (existingOptions) {
                // Append to existing options
                const optionsContent = existingOptions.slice(1, -1).trim();
                newLine = `${indent!}${type!} ${name!} = ${number!} [${optionsContent}, features.field_presence = ${presenceValue}];`;
              } else {
                newLine = `${indent!}${type!} ${name!} = ${number!} [features.field_presence = ${presenceValue}];`;
              }

              lines[lineIndex] = newLine;
              fixCount++;
              this.outputChannel.appendLine(`  Fixed: ${filePath}:${error.line} - converted '${error.label}' to features.field_presence = ${presenceValue}`);
            } else {
              this.outputChannel.appendLine(`  WARNING: Line ${error.line} did not match expected pattern: "${line.substring(0, 80)}"`);
            }
          }
        }

        if (fixCount > 0) {
          content = lines.join('\n');
          if (content !== originalContent) {
            await writeFile(filePath, content);
            this.outputChannel.appendLine(`  Saved: ${filePath} (${fixCount} fixes applied)`);
          } else {
            this.outputChannel.appendLine(`  WARNING: No changes detected in ${filePath}`);
          }
        } else {
          this.outputChannel.appendLine(`  WARNING: No fixes applied to ${filePath}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to fix ${filePath}: ${msg}`);
      }
    }
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
