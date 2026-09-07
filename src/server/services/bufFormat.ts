import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { bufConfigProvider } from './bufConfig';

export class BufFormatProvider {
  private bufPath: string = 'buf';

  public setBufPath(path: string) {
    this.bufPath = path;
  }

  public async format(text: string, filePath?: string): Promise<string | null> {
    let tempDir: string | undefined;
    try {
      // buf format defaults to files on disk and does not read the editor buffer from stdin.
      // Give it exactly one temporary source file so unsaved edits and new files are preserved.
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protobuf-format-'));
      const inputPath = path.join(tempDir, 'input.proto');
      await fs.writeFile(inputPath, text, { encoding: 'utf8', mode: 0o600 });
      const cwd = filePath ? bufConfigProvider.getBufConfigDir(filePath) || path.dirname(filePath) : undefined;

      return await new Promise(resolve => {
        const proc = spawn(this.bufPath, ['format', inputPath], { cwd, timeout: 30000 });
        const chunks: Buffer[] = [];
        proc.stdout?.on('data', (data: Buffer) => chunks.push(Buffer.from(data)));
        proc.stderr?.on('data', () => {});
        proc.on('close', code => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8') : null));
        proc.on('error', () => resolve(null));
      });
    } catch {
      return null;
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
