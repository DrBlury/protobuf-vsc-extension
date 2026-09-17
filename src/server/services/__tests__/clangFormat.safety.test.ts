import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { ClangFormatProvider } from '../clangFormat';

jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function processMock(failInput = false) {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(() => {
        if (failInput) {
          proc.stdin.emit('error', new Error('EPIPE'));
        } else {
          proc.emit('close', 0);
        }
      }),
    }),
  });
  return proc as unknown as ReturnType<typeof spawn>;
}

it('uses real byte offsets for mixed line endings and decodes file URIs', async () => {
  mockSpawn.mockReturnValue(processMock());
  const provider = new ClangFormatProvider();
  provider.updateSettings({ enabled: true });
  const text = '// €\nmessage A {\r\n string a = 1;\n}';
  await provider.formatRange(
    text,
    { start: { line: 2, character: 1 }, end: { line: 2, character: 14 } },
    'file:///project%20space/a.proto'
  );
  const args = mockSpawn.mock.calls[0]![1]!;
  const decodedPath = URI.parse('file:///project%20space/a.proto').fsPath;
  expect(args).toContain(`--offset=${Buffer.byteLength('// €\nmessage A {\r\n ')}`);
  expect(args).toContain(`--assume-filename=${decodedPath}`);
  expect(mockSpawn.mock.calls[0]![2]).toEqual({ cwd: path.dirname(decodedPath) });
});

it('handles a formatter closing stdin without an unhandled EPIPE', async () => {
  mockSpawn.mockReturnValue(processMock(true));
  const provider = new ClangFormatProvider();
  provider.updateSettings({ enabled: true });
  expect(await provider.formatDocument('message A {}')).toEqual([]);
});
