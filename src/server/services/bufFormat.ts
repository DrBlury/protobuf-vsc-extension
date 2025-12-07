import { spawn } from 'child_process';

export class BufFormatProvider {
  private bufPath: string = 'buf';

  public setBufPath(path: string) {
    this.bufPath = path;
  }

  public async format(text: string, filePath?: string): Promise<string | null> {
    return new Promise((resolve) => {
      // buf format reads from stdin if no file is specified, or we can use --path to simulate file context
      const args = ['format'];
      if (filePath) {
          args.push('--path');
          args.push(filePath);
      }

      const proc = spawn(this.bufPath, args, { shell: true });
      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (_data) => {
        // stderr is captured but not used
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          // Log error if needed
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });

      proc.stdin.write(text);
      proc.stdin.end();
    });
  }
}
