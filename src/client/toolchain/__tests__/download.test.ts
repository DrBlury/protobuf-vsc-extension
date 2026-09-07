import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import * as https from 'https';
import { downloadFile } from '../download';

jest.mock('https', () => ({ get: jest.fn() }));

function response(statusCode: number, content = '', location?: string) {
  return Object.assign(new PassThrough(), { statusCode, headers: { location }, content });
}

describe('tool downloads', () => {
  let directory: string;
  let destination: string;
  beforeEach(async () => {
    jest.clearAllMocks();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protobuf-download-test-'));
    destination = path.join(directory, 'tool');
    await fs.writeFile(destination, 'installed');
  });
  afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

  function serve(responses: ReturnType<typeof response>[]) {
    (https.get as jest.Mock).mockImplementation((_url, _options, callback) => {
      const incoming = responses.shift()!;
      const request = Object.assign(new EventEmitter(), { setTimeout: jest.fn(), destroy: jest.fn() });
      setImmediate(() => {
        callback(incoming);
        incoming.end(incoming.content);
      });
      return request;
    });
  }

  it('follows relative redirects and only replaces the installed tool after verification', async () => {
    serve([response(302, '', '/asset'), response(200, 'downloaded')]);
    await downloadFile(
      'https://example.test/release',
      destination,
      crypto.createHash('sha256').update('downloaded').digest('hex')
    );
    expect(await fs.readFile(destination, 'utf8')).toBe('downloaded');
    expect((https.get as jest.Mock).mock.calls[1][0]).toBe('https://example.test/asset');
    expect(await fs.readdir(directory)).toEqual(['tool']);
  });

  it('preserves the installed tool and removes partial files after a checksum failure', async () => {
    serve([response(200, 'corrupted')]);
    await expect(downloadFile('https://example.test/tool', destination, 'wrong')).rejects.toThrow(
      'Integrity verification failed'
    );
    expect(await fs.readFile(destination, 'utf8')).toBe('installed');
    expect(await fs.readdir(directory)).toEqual(['tool']);
  });

  it('rejects redirect loops without opening a destination stream', async () => {
    serve(Array.from({ length: 6 }, () => response(302, '', '/again')));
    await expect(downloadFile('https://example.test/tool', destination)).rejects.toThrow('redirects');
    expect(await fs.readFile(destination, 'utf8')).toBe('installed');
    expect(await fs.readdir(directory)).toEqual(['tool']);
  });

  it('rejects destination stream errors instead of leaving an unresolved download', async () => {
    serve([response(200, 'downloaded')]);
    await expect(downloadFile('https://example.test/tool', path.join(directory, 'missing', 'tool'))).rejects.toThrow();
    expect(await fs.readFile(destination, 'utf8')).toBe('installed');
  });
});
