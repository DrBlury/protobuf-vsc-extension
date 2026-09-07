import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import { URL } from 'url';
import type { IncomingMessage } from 'http';
import { pipeline } from 'stream/promises';

function requestDownload(url: string, redirects = 0): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'VSCode-Protobuf-Extension' } }, response => {
      response.on('error', reject);
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        response.resume();
        const location = response.headers.location;
        if (!location || redirects >= 5) {
          reject(new Error(`Failed to download ${url}: invalid or excessive redirects`));
          return;
        }
        try {
          resolve(requestDownload(new URL(location, url).href, redirects + 1));
        } catch (error) {
          reject(error);
        }
      } else if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
      } else {
        resolve(response);
      }
    });
    request.setTimeout(60000, () => request.destroy(new Error('Download timed out')));
    request.on('error', reject);
  });
}

/** Write a complete, optionally verified download before replacing any installed file. */
export async function downloadFile(url: string, dest: string, expectedSha256?: string): Promise<void> {
  const temporaryPath = `${dest}.${crypto.randomBytes(12).toString('hex')}.part`;
  try {
    const response = await requestDownload(url);
    const hash = crypto.createHash('sha256');
    response.on('data', (chunk: Buffer) => hash.update(chunk));
    await pipeline(response, fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
    const calculatedHash = hash.digest('hex');
    if (expectedSha256 && calculatedHash !== expectedSha256.toLowerCase()) {
      throw new Error(
        `Integrity verification failed for ${dest}\nExpected: ${expectedSha256}\nCalculated: ${calculatedHash}`
      );
    }
    await fs.promises.rename(temporaryPath, dest);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true });
  }
}
