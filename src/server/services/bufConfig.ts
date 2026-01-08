/**
 * Buf Configuration Parser
 * Parses buf.yaml and buf.work.yaml files to improve import resolution
 */

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';

export interface BufConfig {
  version: string;
  name?: string;
  deps?: string[];
  build?: {
    roots?: string[];
  };
  lint?: {
    use?: string[];
    except?: string[];
    ignore?: string[];
    ignore_only?: { [key: string]: string[] };
  };
  breaking?: {
    use?: string[];
    except?: string[];
    ignore?: string[];
    ignore_only?: { [key: string]: string[] };
  };
}

export interface BufWorkConfig {
  version: string;
  directories?: string[];
}

export class BufConfigProvider {
  private configCache = new Map<string, BufConfig | null>();
  private workConfigCache = new Map<string, BufWorkConfig | null>();

  /**
   * Convert a URI or file path to a normalized file path
   */
  private toFilePath(uriOrPath: string): string {
    if (uriOrPath.startsWith('file://')) {
      return URI.parse(uriOrPath).fsPath;
    }
    return uriOrPath;
  }

  /**
   * Find and parse buf.yaml in the directory hierarchy
   */
  findBufConfig(filePath: string): BufConfig | null {
    const normalizedPath = this.toFilePath(filePath);
    const dir = path.dirname(normalizedPath);
    return this.findBufConfigInDirectory(dir);
  }

  /**
   * Find and parse buf.work.yaml in the directory hierarchy
   */
  findBufWorkConfig(filePath: string): BufWorkConfig | null {
    const normalizedPath = this.toFilePath(filePath);
    const dir = path.dirname(normalizedPath);
    return this.findBufWorkConfigInDirectory(dir);
  }

  /**
   * Get proto roots from buf.yaml configuration
   */
  getProtoRoots(filePath: string): string[] {
    const config = this.findBufConfig(filePath);
    const roots: string[] = [];

    if (config?.build?.roots) {
      const dir = path.dirname(filePath);
      for (const root of config.build.roots) {
        const rootPath = path.resolve(dir, root);
        if (fs.existsSync(rootPath)) {
          roots.push(rootPath);
        }
      }
    }

    // If no roots specified, use the directory containing buf.yaml
    if (roots.length === 0) {
      const configPath = this.findBufConfigPath(filePath);
      if (configPath) {
        roots.push(path.dirname(configPath));
      }
    }

    return roots;
  }

  /**
   * Get workspace directories from buf.work.yaml
   */
  getWorkDirectories(filePath: string): string[] {
    const workConfig = this.findBufWorkConfig(filePath);
    const dirs: string[] = [];

    if (workConfig?.directories) {
      const workConfigPath = this.findBufWorkConfigPath(filePath);
      if (workConfigPath) {
        const workDir = path.dirname(workConfigPath);
        for (const dir of workConfig.directories) {
          const dirPath = path.resolve(workDir, dir);
          if (fs.existsSync(dirPath)) {
            dirs.push(dirPath);
          }
        }
      }
    }

    return dirs;
  }

  getBufConfigDir(filePath: string): string | null {
    const configPath = this.findBufConfigPath(filePath);
    return configPath ? path.dirname(configPath) : null;
  }

  private findBufConfigInDirectory(dir: string): BufConfig | null {
    const normalizedDir = path.normalize(dir);

    if (this.configCache.has(normalizedDir)) {
      return this.configCache.get(normalizedDir) || null;
    }

    let currentDir = normalizedDir;
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const configPath = path.join(currentDir, 'buf.yaml');
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = this.parseBufYaml(content);
          this.configCache.set(normalizedDir, config);
          return config;
        } catch {
          // Parse error, cache null
          this.configCache.set(normalizedDir, null);
          return null;
        }
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    this.configCache.set(normalizedDir, null);
    return null;
  }

  private findBufWorkConfigInDirectory(dir: string): BufWorkConfig | null {
    const normalizedDir = path.normalize(dir);

    if (this.workConfigCache.has(normalizedDir)) {
      return this.workConfigCache.get(normalizedDir) || null;
    }

    let currentDir = normalizedDir;
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const configPath = path.join(currentDir, 'buf.work.yaml');
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = this.parseBufWorkYaml(content);
          this.workConfigCache.set(normalizedDir, config);
          return config;
        } catch {
          this.workConfigCache.set(normalizedDir, null);
          return null;
        }
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    this.workConfigCache.set(normalizedDir, null);
    return null;
  }

  /**
   * Find the path to buf.yaml in the directory hierarchy
   * @param filePath Path to a file to start searching from
   * @returns Path to buf.yaml or null if not found
   */
  findBufConfigPath(filePath: string): string | null {
    const dir = path.dirname(filePath);
    let currentDir = path.normalize(dir);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      for (const configName of ['buf.yaml', 'buf.yml']) {
        const configPath = path.join(currentDir, configName);
        if (fs.existsSync(configPath)) {
          return configPath;
        }
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    return null;
  }

  private findBufWorkConfigPath(filePath: string): string | null {
    const dir = path.dirname(filePath);
    let currentDir = path.normalize(dir);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const configPath = path.join(currentDir, 'buf.work.yaml');
      if (fs.existsSync(configPath)) {
        return configPath;
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    return null;
  }

  private parseBufYaml(content: string): BufConfig {
    // Simple YAML parser for buf.yaml
    // This is a basic implementation - for production, consider using a proper YAML parser
    const config: BufConfig = {
      version: 'v1',
    };

    const lines = content.split('\n');
    let currentSection: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Check for top-level section headers (not indented)
      const isTopLevel = !line.startsWith(' ') && !line.startsWith('\t');
      const match = trimmed.match(/^(\w+):\s*(.*)$/);

      if (match && isTopLevel) {
        const key = match[1]!;
        const value = match[2]!;

        if (key === 'version') {
          config.version = value;
          currentSection = null;
        } else if (key === 'name') {
          config.name = value.replace(/^["']|["']$/g, '');
          currentSection = null;
        } else if (key === 'deps') {
          // Handle array format
          config.deps = [];
          currentSection = 'deps';
        } else if (key === 'modules') {
          // v2 format: modules section - skip items under it
          currentSection = 'modules';
        } else if (key === 'build') {
          config.build = { roots: [] };
          currentSection = 'build';
        } else if (key === 'lint') {
          config.lint = {};
          currentSection = 'lint';
        } else if (key === 'breaking') {
          config.breaking = {};
          currentSection = 'breaking';
        }
      } else if (match && currentSection === 'build') {
        const key = match[1];
        const value = match[2];
        if (key === 'roots') {
          if (!config.build) {
            config.build = { roots: [] };
          }
          if (value) {
            const roots = value.split(',').map(r => r.trim().replace(/^["']|["']$/g, ''));
            config.build.roots = roots;
          }
        }
      } else if (trimmed.startsWith('-')) {
        // Array item - only process for relevant sections
        const item = trimmed
          .substring(1)
          .trim()
          .replace(/^["']|["']$/g, '');

        if (currentSection === 'deps') {
          if (!config.deps) {
            config.deps = [];
          }
          config.deps.push(item);
        } else if (currentSection === 'build' && config.build) {
          if (!config.build.roots) {
            config.build.roots = [];
          }
          config.build.roots.push(item);
        }
        // Ignore array items in 'modules', 'lint', 'breaking' sections for deps
      }
    }

    return config;
  }

  private parseBufWorkYaml(content: string): BufWorkConfig {
    const config: BufWorkConfig = {
      version: 'v1',
    };

    const lines = content.split('\n');
    let inDirectories = false;
    config.directories = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (trimmed === 'directories:') {
        inDirectories = true;
        continue;
      }

      if (inDirectories && trimmed.startsWith('-')) {
        const dir = trimmed
          .substring(1)
          .trim()
          .replace(/^["']|["']$/g, '');
        if (!config.directories) {
          config.directories = [];
        }
        config.directories.push(dir);
      } else if (trimmed.match(/^\w+:/)) {
        inDirectories = false;
        const match = trimmed.match(/^version:\s*(.+)$/);
        if (match) {
          config.version = match[1]!.trim();
        }
      }
    }

    return config;
  }

  /**
   * Clear cache (useful for testing or when files change)
   */
  clearCache(): void {
    this.configCache.clear();
    this.workConfigCache.clear();
  }
}

export const bufConfigProvider = new BufConfigProvider();
