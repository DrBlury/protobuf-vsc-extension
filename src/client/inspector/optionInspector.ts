import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

export class OptionInspectorProvider implements vscode.TreeDataProvider<OptionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<OptionItem | undefined | null | void> = new vscode.EventEmitter<OptionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<OptionItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private client: LanguageClient;

  constructor(client: LanguageClient) {
    this.client = client;
    vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
    vscode.workspace.onDidSaveTextDocument(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OptionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: OptionItem): Promise<OptionItem[]> {
    if (element) {
      return [];
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      return [];
    }

    try {
        interface OptionInfo {
            name: string;
            value: string | number | boolean;
            parent: string;
            range?: { start: { line: number; character: number }; end: { line: number; character: number } };
        }
        const options = await this.client.sendRequest<OptionInfo[]>('protobuf/getAllOptions', { uri: editor.document.uri.toString() });

        if (!options || options.length === 0) {
            return [new OptionItem('No options found', '', vscode.TreeItemCollapsibleState.None)];
        }

        return options.map(opt => new OptionItem(
            `${opt.name} = ${opt.value}`,
            opt.parent,
            vscode.TreeItemCollapsibleState.None,
            opt.range
        ));
    } catch (e) {
        return [new OptionItem('Error loading options', String(e), vscode.TreeItemCollapsibleState.None)];
    }
  }
}

class OptionItem extends vscode.TreeItem {
  constructor(
    public override readonly label: string,
    public override readonly description: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly range?: { start: { line: number; character: number }; end: { line: number; character: number } }
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} (${this.description})`;
    this.description = description;

    if (range) {
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [
                vscode.window.activeTextEditor?.document.uri,
                {
                    selection: new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
                }
            ]
        };
    }
  }
}
