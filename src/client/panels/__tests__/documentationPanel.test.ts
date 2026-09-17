import { createMockVscode, createMockLanguageClient } from '../../__tests__/testUtils';
import type { DocumentationData } from '../../../shared/documentation';
const mockVscode = createMockVscode();
jest.mock('vscode', () => mockVscode, { virtual: true });
import { DocumentationPanel } from '../documentationPanel';

describe('DocumentationPanel asynchronous loads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (DocumentationPanel as unknown as { currentPanel: undefined }).currentPanel = undefined;
  });

  const data = (fileName: string): DocumentationData => ({
    uri: `file:///test/${fileName}`,
    fileName,
    imports: [],
    messages: [],
    enums: [],
    services: [],
  });

  it('keeps the newest document when an older request finishes last', async () => {
    const client = createMockLanguageClient();
    const panel = mockVscode.window.createWebviewPanel();
    let first!: (value: DocumentationData) => void;
    client.sendRequest
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            first = resolve;
          })
      )
      .mockResolvedValueOnce(data('second.proto'));
    DocumentationPanel.createOrShow({} as never, client, 'file:///test/first.proto');
    DocumentationPanel.createOrShow({} as never, client, 'file:///test/second.proto');
    await Promise.resolve();
    first(data('first.proto'));
    await Promise.resolve();

    expect(panel.title).toBe('Docs: second.proto');
    expect(panel.webview.html).toContain('second.proto');
    expect(panel.webview.html).not.toContain('first.proto');
  });

  it('ignores an obsolete failure after a later request succeeds', async () => {
    const client = createMockLanguageClient();
    let fail!: (reason: Error) => void;
    client.sendRequest
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          })
      )
      .mockResolvedValueOnce(data('second.proto'));
    DocumentationPanel.createOrShow({} as never, client, 'file:///test/first.proto');
    DocumentationPanel.createOrShow({} as never, client, 'file:///test/second.proto');
    await Promise.resolve();
    fail(new Error('old request failed'));
    await Promise.resolve();

    expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('escapes file names and field options in generated HTML', async () => {
    const client = createMockLanguageClient();
    const panel = mockVscode.window.createWebviewPanel();
    client.sendRequest.mockResolvedValue({
      ...data('</title><script>alert(1)</script>.proto'),
      messages: [
        {
          kind: 'message',
          name: 'Request',
          fullName: 'Request',
          fields: [
            {
              name: 'value',
              type: 'string',
              number: 1,
              options: ['deprecated = true', '</span><img src=x onerror=alert(1)>'],
            },
          ],
          nestedMessages: [],
          nestedEnums: [],
        },
      ],
    } as DocumentationData);

    DocumentationPanel.createOrShow({} as never, client, 'file:///test/unsafe.proto');
    await Promise.resolve();

    expect(panel.webview.html).not.toContain('</title><script>');
    expect(panel.webview.html).not.toContain('</span><img');
    expect(panel.webview.html).toContain('&lt;/title&gt;&lt;script&gt;');
    expect(panel.webview.html).toContain('&lt;/span&gt;&lt;img');
  });
});
