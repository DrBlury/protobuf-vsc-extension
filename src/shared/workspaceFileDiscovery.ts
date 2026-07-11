import * as fs from 'fs';
import * as path from 'path';
import ignore, { type Ignore } from 'ignore';

export const DEFAULT_WORKSPACE_IGNORE_PATTERNS = ['.build/', 'DerivedData*/', '*.noindex/', 'index-build/'];

const ALWAYS_IGNORED_DIRECTORIES = new Set(['.git', '.hg', '.svn', 'node_modules']);

export interface WorkspaceFileDiscoveryOptions {
  rootDir?: string;
  ignorePatterns?: readonly string[];
  includeHidden?: boolean;
  useIgnoreFiles?: boolean;
  fileExtensions?: readonly string[];
  fileNames?: readonly string[];
  maxResults?: number;
  onError?: (directory: string, error: unknown) => void;
}

interface IgnoreContext {
  baseDir: string;
  matcher: Ignore;
}

function createIgnoreMatcher(): Ignore {
  // Match Git's usual filesystem defaults: case-sensitive on Linux and
  // case-insensitive on Windows/macOS.
  return ignore({ ignorecase: process.platform !== 'linux' });
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}

function isInsideRoot(rootDir: string, candidate: string): boolean {
  const relative = path.relative(rootDir, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export function hasSymlinkedPathComponentSync(rootDir: string, candidatePath: string): boolean {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (!isInsideRoot(root, candidate)) {
    return true;
  }

  let current = root;
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        return true;
      }
    } catch (error) {
      // Missing source roots are allowed so a watcher can observe their creation.
      return !isMissingPathError(error);
    }
  }

  return false;
}

async function hasSymlinkedPathComponent(rootDir: string, candidatePath: string): Promise<boolean> {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (!isInsideRoot(root, candidate)) {
    return true;
  }

  let current = root;
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await fs.promises.lstat(current)).isSymbolicLink()) {
        return true;
      }
    } catch (error) {
      return !isMissingPathError(error);
    }
  }

  return false;
}

function normalizeConfiguredPattern(pattern: string, rootDir: string): string | undefined {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return undefined;
  }

  const negated = trimmed.startsWith('!');
  const rawPattern = negated ? trimmed.slice(1) : trimmed;
  let normalized = rawPattern.replace(/\\/g, '/');

  if (path.isAbsolute(rawPattern)) {
    const relative = path.relative(rootDir, path.resolve(rawPattern));
    if (!relative || relative === '..' || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`)) {
      return undefined;
    }
    normalized = toPosixPath(relative);
  }

  return `${negated ? '!' : ''}${normalized}`;
}

function createMatcher(patterns: readonly string[], rootDir: string): Ignore | undefined {
  const normalized = patterns
    .map(pattern => normalizeConfiguredPattern(pattern, rootDir))
    .filter((pattern): pattern is string => Boolean(pattern))
    .flatMap(pattern => {
      const negated = pattern.startsWith('!');
      const body = negated ? pattern.slice(1) : pattern;
      if (!body.endsWith('/**')) {
        return [pattern];
      }

      // A pattern such as **/build/** ignores descendants but does not match
      // the build directory itself. Add the directory form so traversal can
      // prune the subtree before reading it.
      return [pattern, `${negated ? '!' : ''}${body.slice(0, -3)}/`];
    });

  if (normalized.length === 0) {
    return undefined;
  }

  return createIgnoreMatcher().add(normalized);
}

/**
 * Applies configured exclusions and Git ignore files without following links.
 * Ignore-file contents are cached for the lifetime of this instance; construct a
 * new filter (or clear the cache) when an ignore file changes.
 */
export class WorkspacePathFilter {
  private readonly rootDir: string;
  private readonly includeHidden: boolean;
  private readonly useIgnoreFiles: boolean;
  private readonly configuredMatcher: Ignore | undefined;
  private readonly ignoreFileCache = new Map<string, IgnoreContext | undefined>();

  constructor(
    rootDir: string,
    options: Pick<WorkspaceFileDiscoveryOptions, 'ignorePatterns' | 'includeHidden' | 'useIgnoreFiles'> = {}
  ) {
    this.rootDir = path.resolve(rootDir);
    this.includeHidden = options.includeHidden ?? false;
    this.useIgnoreFiles = options.useIgnoreFiles ?? true;
    this.configuredMatcher = createMatcher(
      [...DEFAULT_WORKSPACE_IGNORE_PATTERNS, ...(options.ignorePatterns ?? [])],
      this.rootDir
    );
  }

  clearIgnoreFileCache(): void {
    this.ignoreFileCache.clear();
  }

  isIgnored(candidatePath: string, isDirectory: boolean): boolean {
    const candidate = path.resolve(candidatePath);
    if (!isInsideRoot(this.rootDir, candidate)) {
      return true;
    }

    const relative = path.relative(this.rootDir, candidate);
    if (!relative) {
      return false;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    const directorySegments = isDirectory ? segments : segments.slice(0, -1);
    if (
      directorySegments.some(
        segment => ALWAYS_IGNORED_DIRECTORIES.has(segment) || (!this.includeHidden && segment.startsWith('.'))
      )
    ) {
      return true;
    }

    const candidateForMatching = `${toPosixPath(relative)}${isDirectory ? '/' : ''}`;
    if (this.configuredMatcher?.ignores(candidateForMatching)) {
      return true;
    }

    if (!this.useIgnoreFiles) {
      return false;
    }

    const contexts: IgnoreContext[] = [];
    const rootContext = this.getIgnoreContext(this.rootDir);
    if (rootContext) {
      contexts.push(rootContext);
    }

    let ancestor = this.rootDir;
    for (const segment of segments.slice(0, -1)) {
      ancestor = path.join(ancestor, segment);
      if (this.matchesIgnoreContexts(ancestor, true, contexts)) {
        // Git cannot re-include a file when one of its parent directories is excluded.
        return true;
      }

      const context = this.getIgnoreContext(ancestor);
      if (context) {
        contexts.push(context);
      }
    }

    return this.matchesIgnoreContexts(candidate, isDirectory, contexts);
  }

  private getIgnoreContext(directory: string): IgnoreContext | undefined {
    if (this.ignoreFileCache.has(directory)) {
      return this.ignoreFileCache.get(directory);
    }

    let context: IgnoreContext | undefined;
    try {
      const contents = fs.readFileSync(path.join(directory, '.gitignore'), 'utf8');
      if (contents.trim()) {
        context = { baseDir: directory, matcher: createIgnoreMatcher().add(contents) };
      }
    } catch {
      // Most directories do not contain an ignore file.
    }

    this.ignoreFileCache.set(directory, context);
    return context;
  }

  private matchesIgnoreContexts(candidate: string, isDirectory: boolean, contexts: readonly IgnoreContext[]): boolean {
    let ignored = false;

    for (const context of contexts) {
      const relative = path.relative(context.baseDir, candidate);
      if (!relative || !isInsideRoot(context.baseDir, candidate)) {
        continue;
      }

      const result = context.matcher.test(`${toPosixPath(relative)}${isDirectory ? '/' : ''}`);
      if (result.ignored) {
        ignored = true;
      } else if (result.unignored) {
        ignored = false;
      }
    }

    return ignored;
  }
}

function matchesRequestedFile(name: string, options: WorkspaceFileDiscoveryOptions): boolean {
  const extensions = options.fileExtensions ?? ['.proto'];
  const fileNames = options.fileNames ?? [];
  return fileNames.includes(name) || extensions.some(extension => name.endsWith(extension));
}

export function discoverWorkspaceFilesSync(startDir: string, options: WorkspaceFileDiscoveryOptions = {}): string[] {
  const rootDir = path.resolve(options.rootDir ?? startDir);
  const resolvedStartDir = path.resolve(startDir);
  const filter = new WorkspacePathFilter(rootDir, options);
  const files: string[] = [];

  if (resolvedStartDir !== rootDir && hasSymlinkedPathComponentSync(rootDir, resolvedStartDir)) {
    return files;
  }

  const visit = (directory: string): void => {
    if (options.maxResults !== undefined && files.length >= options.maxResults) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      options.onError?.(directory, error);
      return;
    }

    for (const entry of entries) {
      if (options.maxResults !== undefined && files.length >= options.maxResults) {
        return;
      }

      const fullPath = path.join(directory, entry.name);
      const isSymbolicLink = typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink();
      if (isSymbolicLink) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!filter.isIgnored(fullPath, true)) {
          visit(fullPath);
        }
      } else if (entry.isFile() && matchesRequestedFile(entry.name, options) && !filter.isIgnored(fullPath, false)) {
        files.push(fullPath);
      }
    }
  };

  if (isInsideRoot(rootDir, resolvedStartDir) && !filter.isIgnored(resolvedStartDir, true)) {
    visit(resolvedStartDir);
  }

  return files;
}

export async function discoverWorkspaceFiles(
  startDir: string,
  options: WorkspaceFileDiscoveryOptions = {}
): Promise<string[]> {
  const rootDir = path.resolve(options.rootDir ?? startDir);
  const resolvedStartDir = path.resolve(startDir);
  const filter = new WorkspacePathFilter(rootDir, options);
  const files: string[] = [];

  if (resolvedStartDir !== rootDir && (await hasSymlinkedPathComponent(rootDir, resolvedStartDir))) {
    return files;
  }

  const visit = async (directory: string): Promise<void> => {
    if (options.maxResults !== undefined && files.length >= options.maxResults) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      options.onError?.(directory, error);
      return;
    }

    for (const entry of entries) {
      if (options.maxResults !== undefined && files.length >= options.maxResults) {
        return;
      }

      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!filter.isIgnored(fullPath, true)) {
          await visit(fullPath);
        }
      } else if (entry.isFile() && matchesRequestedFile(entry.name, options) && !filter.isIgnored(fullPath, false)) {
        files.push(fullPath);
      }
    }
  };

  if (isInsideRoot(rootDir, resolvedStartDir) && !filter.isIgnored(resolvedStartDir, true)) {
    await visit(resolvedStartDir);
  }

  return files;
}
