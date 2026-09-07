import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Export into a fresh directory so a failed dependency cannot erase the last good export. */
export async function exportBufDependencies(
  executable: string,
  directory: string,
  dependencies: readonly string[]
): Promise<string> {
  const staging = await fs.mkdtemp(path.join(directory, '.buf-deps-export-'));
  const output = path.join(staging, 'output');
  const destination = path.join(directory, '.buf-deps');
  const backup = path.join(staging, 'previous');
  let keepBackup = false;
  try {
    await fs.mkdir(output);
    for (const dependency of dependencies) {
      await new Promise<void>((resolve, reject) => {
        execFile(
          executable,
          ['export', '--output', output, '--', dependency],
          { cwd: directory, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
          (error, _stdout, stderr) => {
            if (error) {
              reject(new Error(`Failed to export ${dependency}: ${stderr || error.message}`));
            } else {
              resolve();
            }
          }
        );
      });
    }

    let hadPrevious = false;
    try {
      await fs.rename(destination, backup);
      hadPrevious = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    try {
      await fs.rename(output, destination);
    } catch (error) {
      if (hadPrevious) {
        try {
          await fs.rename(backup, destination);
        } catch {
          keepBackup = true;
          throw new Error(`Could not install exported dependencies. Previous files are preserved at ${backup}.`);
        }
      }
      throw error;
    }
    return destination;
  } finally {
    if (!keepBackup) {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}
