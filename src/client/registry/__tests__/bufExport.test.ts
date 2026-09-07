import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { exportBufDependencies } from '../bufExport';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

describe('Buf dependency export', () => {
  let directory: string;
  const mockExec = execFile as unknown as jest.Mock;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buf-export-test-'));
    await fs.mkdir(path.join(directory, '.buf-deps'));
    await fs.writeFile(path.join(directory, '.buf-deps', 'previous.proto'), 'previous export');
    mockExec.mockReset();
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('passes dependency names literally and replaces previous files only after every export succeeds', async () => {
    const dependencies = ['buf.build/acme/one', 'buf.build/acme/$(touch injected)'];
    mockExec.mockImplementation((_executable, args, _options, callback) => {
      const filename = args[4] === dependencies[0] ? 'first.proto' : 'second.proto';
      fs.writeFile(path.join(args[2], filename), 'exported').then(
        () => callback(null, '', ''),
        error => callback(error, '', '')
      );
    });

    const result = await exportBufDependencies('/tools with spaces/buf', directory, dependencies);

    expect(await fs.readdir(result)).toEqual(['first.proto', 'second.proto']);
    expect(await fs.readdir(directory)).toEqual(['.buf-deps']);
    expect(mockExec).toHaveBeenNthCalledWith(
      2,
      '/tools with spaces/buf',
      ['export', '--output', expect.any(String), '--', dependencies[1]],
      expect.objectContaining({ cwd: directory }),
      expect.any(Function)
    );
    expect(mockExec.mock.calls[1][2].shell).toBeUndefined();
  });

  it('preserves the previous export and cleans temporary files if a later dependency fails', async () => {
    mockExec
      .mockImplementationOnce((_executable, _args, _options, callback) => callback(null, '', ''))
      .mockImplementationOnce((_executable, _args, _options, callback) =>
        callback(new Error('exit 1'), '', 'module not found')
      );

    await expect(exportBufDependencies('buf', directory, ['first', 'missing'])).rejects.toThrow('module not found');
    expect(await fs.readFile(path.join(directory, '.buf-deps', 'previous.proto'), 'utf8')).toBe('previous export');
    expect(await fs.readdir(directory)).toEqual(['.buf-deps']);
  });

  it('reports a missing executable without removing the previous export', async () => {
    mockExec.mockImplementation((_executable, _args, _options, callback) =>
      callback(new Error('spawn buf ENOENT'), '', '')
    );
    await expect(exportBufDependencies('buf', directory, ['first'])).rejects.toThrow('spawn buf ENOENT');
    expect(await fs.readdir(path.join(directory, '.buf-deps'))).toEqual(['previous.proto']);
    expect(await fs.readdir(directory)).toEqual(['.buf-deps']);
  });
});
