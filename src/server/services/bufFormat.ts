import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as path from 'path';
import { bufConfigProvider } from './bufConfig';

export class BufFormatProvider {
  private bufPath: string = 'buf';

  public setBufPath(path: string) {
    this.bufPath = path;
  }

  public async format(text: string, filePath?: string): Promise<string | null> {
    return new Promise((resolve) => {
      // buf format reads from stdin if no file is specified, or we can use --path to simulate file context
      const args = ['format'];
      const spawnOptions: { shell?: boolean; cwd?: string } = {};

      if (filePath) {
        const normalizedFile = path.normalize(filePath);
        const configDir = bufConfigProvider.getBufConfigDir(normalizedFile);
        let cwd = configDir || path.dirname(normalizedFile);
        let relativePath = configDir
          ? path.relative(configDir, normalizedFile)
          : path.basename(normalizedFile);

        if (!relativePath) {
          relativePath = path.basename(normalizedFile);
        }

        spawnOptions.cwd = cwd;

        if (relativePath) {
          const posixRelative = relativePath.split(path.sep).join('/');
          args.push('--path');
          args.push(posixRelative);
        }
      }

      // Try without shell first to avoid command line length limits
      const runFormat = (useShell: boolean): void => {
        const opts = useShell ? { ...spawnOptions, shell: true } : spawnOptions;
        const proc = spawn(this.bufPath, args, opts) as ChildProcess;
        let stdout = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (_data) => {
          // stderr is captured but not used
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            resolve(null);
          }
        });

        proc.on('error', () => {
          if (!useShell) {
            // Fallback with shell for PATH resolution
            runFormat(true);
          } else {
            resolve(null);
          }
        });

        proc.stdin?.write(text);
        proc.stdin?.end();
      };

      runFormat(false);
    });
  }
}
