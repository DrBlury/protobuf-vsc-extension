import * as vscode from 'vscode';

/**
 * Section IDs for the sidebar
 */
type SectionId = 'workspace' | 'playgrounds' | 'tools' | 'analysis' | 'registry' | 'help';

/**
 * Represents a section header (collapsible)
 */
class SectionItem extends vscode.TreeItem {
  constructor(
    public readonly sectionId: SectionId,
    label: string,
    icon: string,
    public readonly badge?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'section';

    // Add badge for counts
    if (badge) {
      this.description = badge;
    }
  }
}

/**
 * Represents an action button
 */
class ActionItem extends vscode.TreeItem {
  constructor(label: string, description: string, icon: string, command: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip || `${label} - ${description}`;
    this.contextValue = 'action';
    this.command = {
      command,
      title: label,
    };
  }
}

/**
 * Represents an info/status item (non-clickable)
 */
class InfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon: string,
    tooltip?: string,
    status?: 'success' | 'warning' | 'error' | 'info'
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip || label;
    this.contextValue = 'info';

    // Use status-specific icons
    const iconMap: Record<string, string> = {
      success: 'pass-filled',
      warning: 'warning',
      error: 'error',
      info: 'info',
    };
    this.iconPath = new vscode.ThemeIcon(status ? iconMap[status] || icon : icon);
  }
}

type TreeItemType = SectionItem | ActionItem | InfoItem;

export class ProtobufSidebarProvider implements vscode.TreeDataProvider<TreeItemType> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItemType | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private protoFileCount = 0;
  private serviceCount = 0;
  private hasBufConfig = false;
  private readonly betaFeaturesEnabled: boolean;

  constructor(extensionContext: vscode.ExtensionContext, betaFeaturesEnabled: boolean) {
    this.betaFeaturesEnabled = betaFeaturesEnabled;
    this.scanWorkspace();

    // Watch for file changes
    const protoWatcher = vscode.workspace.createFileSystemWatcher('**/*.proto');
    protoWatcher.onDidCreate(() => this.scanWorkspace());
    protoWatcher.onDidDelete(() => this.scanWorkspace());
    protoWatcher.onDidChange(() => this.scanWorkspace());
    extensionContext.subscriptions.push(protoWatcher);

    // Watch for buf.yaml changes
    const bufWatcher = vscode.workspace.createFileSystemWatcher('**/buf.yaml');
    bufWatcher.onDidCreate(() => this.scanWorkspace());
    bufWatcher.onDidDelete(() => this.scanWorkspace());
    extensionContext.subscriptions.push(bufWatcher);
  }

  refresh(): void {
    this.scanWorkspace();
  }

  private async scanWorkspace(): Promise<void> {
    const protoFiles = await vscode.workspace.findFiles('**/*.proto', '**/node_modules/**');
    this.protoFileCount = protoFiles.length;

    // Count services
    let services = 0;
    for (const file of protoFiles.slice(0, 50)) {
      // Limit for performance
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();
        const matches = text.match(/\bservice\s+\w+/g);
        if (matches) {
          services += matches.length;
        }
      } catch {
        // Skip files that can't be read
      }
    }
    this.serviceCount = services;

    // Check for buf.yaml
    const bufConfigs = await vscode.workspace.findFiles('**/buf.yaml', '**/node_modules/**', 1);
    this.hasBufConfig = bufConfigs.length > 0;

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItemType): TreeItemType[] {
    if (!element) {
      return this.getSections();
    }

    if (element instanceof SectionItem) {
      return this.getSectionChildren(element.sectionId);
    }

    return [];
  }

  private getSections(): SectionItem[] {
    const sections: SectionItem[] = [
      new SectionItem('workspace', 'WORKSPACE', 'folder-opened', `${this.protoFileCount} files`),
    ];

    if (this.betaFeaturesEnabled) {
      sections.push(new SectionItem('playgrounds', 'PLAYGROUNDS', 'beaker'));
    }

    sections.push(
      new SectionItem('tools', 'BUILD & GENERATE', 'tools'),
      new SectionItem('analysis', 'ANALYSIS', 'graph'),
      new SectionItem('registry', 'BUF REGISTRY', 'cloud'),
      new SectionItem('help', 'HELP', 'question')
    );

    return sections;
  }

  private getSectionChildren(sectionId: SectionId): TreeItemType[] {
    switch (sectionId) {
      case 'workspace':
        return this.getWorkspaceItems();
      case 'playgrounds':
        if (!this.betaFeaturesEnabled) {
          return [];
        }
        return this.getPlaygroundItems();
      case 'tools':
        return this.getToolItems();
      case 'analysis':
        return this.getAnalysisItems();
      case 'registry':
        return this.getRegistryItems();
      case 'help':
        return this.getHelpItems();
      default:
        return [];
    }
  }

  private getWorkspaceItems(): TreeItemType[] {
    const items: TreeItemType[] = [];

    items.push(
      new InfoItem(
        `${this.protoFileCount} Proto Files`,
        this.protoFileCount > 0 ? 'in workspace' : 'none found',
        'file-code',
        `Found ${this.protoFileCount} .proto files in workspace`,
        this.protoFileCount > 0 ? 'success' : 'warning'
      )
    );

    if (this.serviceCount > 0) {
      items.push(
        new InfoItem(
          `${this.serviceCount} gRPC Services`,
          'detected',
          'server',
          `Found ${this.serviceCount} gRPC service definitions`,
          'info'
        )
      );
    }

    if (this.hasBufConfig) {
      items.push(
        new InfoItem(
          'Buf Project',
          'buf.yaml found',
          'verified-filled',
          'This workspace has a buf.yaml configuration',
          'success'
        )
      );
    }

    return items;
  }

  private getPlaygroundItems(): TreeItemType[] {
    return [
      new ActionItem(
        'gRPC Playground',
        'Test gRPC calls',
        'play-circle',
        'protobuf.openPlayground',
        'Open the gRPC request playground to test services interactively'
      ),
      new ActionItem(
        'Protovalidate',
        'Test validation',
        'shield',
        'protobuf.openProtovalidatePlayground',
        'Test protovalidate validation rules'
      ),
    ];
  }

  private getToolItems(): TreeItemType[] {
    return [
      new ActionItem(
        'Manage Toolchain',
        'protoc, buf, grpcurl',
        'settings-gear',
        'protobuf.toolchain.manage',
        'Install and configure protoc, buf, and grpcurl'
      ),
      new ActionItem(
        'Generate Code',
        'Run codegen',
        'zap',
        'protobuf.generateCode',
        'Generate code from proto files using buf or protoc'
      ),
      new ActionItem(
        'Compile All',
        'Check for errors',
        'check-all',
        'protobuf.compileAll',
        'Compile all proto files to check for errors'
      ),
      new ActionItem(
        'Run Linter',
        'Check style',
        'checklist',
        'protobuf.runExternalLinter',
        'Run external linter (buf lint, protolint, or api-linter)'
      ),
    ];
  }

  private getAnalysisItems(): TreeItemType[] {
    return [
      new ActionItem(
        'Schema Graph',
        'Visualize deps',
        'type-hierarchy-sub',
        'protobuf.showSchemaGraph',
        'Show a visual graph of proto file dependencies'
      ),
      new ActionItem(
        'Breaking Changes',
        'Compare with git',
        'git-compare',
        'protobuf.checkBreakingChanges',
        'Check for breaking changes against a git reference'
      ),
      new ActionItem(
        'Diff Schema',
        'Compare versions',
        'diff',
        'protobuf.diffSchema',
        'Diff schema with a git reference'
      ),
      new ActionItem(
        'List Services',
        'All gRPC services',
        'server-process',
        'protobuf.listGrpcServices',
        'List all gRPC services in the workspace'
      ),
    ];
  }

  private getRegistryItems(): TreeItemType[] {
    return [
      new ActionItem(
        'Add Dependency',
        'From BSR',
        'package',
        'protobuf.addBufDependency',
        'Add a dependency from the Buf Schema Registry'
      ),
      new ActionItem(
        'Export Dependencies',
        'For imports',
        'cloud-download',
        'protobuf.exportBufDependencies',
        'Export buf dependencies for import resolution'
      ),
    ];
  }

  private getHelpItems(): TreeItemType[] {
    return [
      new ActionItem(
        'Show Lint Rules',
        'Available rules',
        'list-unordered',
        'protobuf.showAvailableLintRules',
        'Show available linting rules'
      ),
      new ActionItem(
        'Detect Tools',
        'Auto-configure',
        'search',
        'protobuf.detectTools',
        'Automatically detect and configure protobuf tools'
      ),
      new ActionItem(
        'Documentation',
        'Show docs',
        'book',
        'protobuf.showDocumentation',
        'Show documentation preview for current proto file'
      ),
    ];
  }
}

/**
 * Register the Protobuf sidebar view
 */
export function registerProtobufSidebar(
  context: vscode.ExtensionContext,
  betaFeaturesEnabled = false
): ProtobufSidebarProvider {
  const sidebarProvider = new ProtobufSidebarProvider(context, betaFeaturesEnabled);

  const treeView = vscode.window.createTreeView('protobufExplorer', {
    treeDataProvider: sidebarProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.sidebar.refresh', () => {
      sidebarProvider.refresh();
    })
  );

  context.subscriptions.push(treeView);

  return sidebarProvider;
}
