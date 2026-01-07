/**
 * Protovalidate Playground Manager
 * Interactive webview for testing protovalidate/buf.validate rules with sample data
 */

import * as vscode from 'vscode';

export interface ProtovalidateRule {
  fieldName: string;
  messageName: string;
  ruleType: string;
  ruleText: string;
  lineNumber: number;
  filePath: string;
}

export class ProtovalidatePlaygroundManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'protovalidatePlayground';

  constructor(_context: vscode.ExtensionContext, _outputChannel: vscode.OutputChannel) {
    // Context and output channel reserved for future use
  }

  public openPlayground(rule?: ProtovalidateRule) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      if (rule) {
        this.panel.webview.postMessage({ command: 'setRule', rule });
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      this.viewType,
      'Protovalidate Playground',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'validateData':
          await this.validateData(message.data);
          break;
        case 'openDocs':
          vscode.env.openExternal(vscode.Uri.parse('https://buf.build/docs/protovalidate/overview/'));
          break;
        case 'openCelPlayground':
          vscode.env.openExternal(vscode.Uri.parse('https://playcel.undistro.io/'));
          break;
        case 'copyExpression':
          await vscode.env.clipboard.writeText(message.expression);
          vscode.window.showInformationMessage('CEL expression copied to clipboard');
          break;
      }
    });

    // Send initial rule if provided
    if (rule) {
      // Small delay to ensure webview is ready
      setTimeout(() => {
        this.panel?.webview.postMessage({ command: 'setRule', rule });
      }, 100);
    }
  }

  private async validateData(data: { rule: ProtovalidateRule; jsonValue: string }) {
    // Client-side validation simulation
    // In a real implementation, this would use protovalidate library
    // For now, we provide helpful feedback based on the rule type
    const { rule, jsonValue } = data;

    try {
      const parsedValue = JSON.parse(jsonValue);
      const result = this.simulateValidation(rule, parsedValue);
      this.panel?.webview.postMessage({ command: 'validationResult', result });
    } catch (e) {
      this.panel?.webview.postMessage({
        command: 'validationResult',
        result: {
          valid: false,
          error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
        }
      });
    }
  }

  private simulateValidation(rule: ProtovalidateRule, value: unknown): { valid: boolean; error?: string; info?: string } {
    const ruleText = rule.ruleText.toLowerCase();

    // String validations
    if (typeof value === 'string') {
      if (ruleText.includes('min_len')) {
        const match = ruleText.match(/min_len\s*=\s*(\d+)/);
        if (match) {
          const minLen = parseInt(match[1]!, 10);
          if (value.length < minLen) {
            return { valid: false, error: `String length ${value.length} is less than minimum ${minLen}` };
          }
        }
      }
      if (ruleText.includes('max_len')) {
        const match = ruleText.match(/max_len\s*=\s*(\d+)/);
        if (match) {
          const maxLen = parseInt(match[1]!, 10);
          if (value.length > maxLen) {
            return { valid: false, error: `String length ${value.length} exceeds maximum ${maxLen}` };
          }
        }
      }
      if (ruleText.includes('pattern')) {
        const match = ruleText.match(/pattern\s*=\s*["']([^"']+)["']/);
        if (match) {
          try {
            const regex = new RegExp(match[1]!);
            if (!regex.test(value)) {
              return { valid: false, error: `String does not match pattern: ${match[1]}` };
            }
          } catch {
            return { valid: false, error: `Invalid regex pattern: ${match[1]}` };
          }
        }
      }
      if (ruleText.includes('email') && ruleText.includes('true')) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return { valid: false, error: 'String is not a valid email address' };
        }
      }
      if (ruleText.includes('uuid') && ruleText.includes('true')) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          return { valid: false, error: 'String is not a valid UUID' };
        }
      }
    }

    // Numeric validations
    if (typeof value === 'number') {
      if (ruleText.includes('gt')) {
        const match = ruleText.match(/\bgt\s*=\s*(\d+)/);
        if (match) {
          const gtVal = parseInt(match[1]!, 10);
          if (value <= gtVal) {
            return { valid: false, error: `Value ${value} must be greater than ${gtVal}` };
          }
        }
      }
      if (ruleText.includes('gte')) {
        const match = ruleText.match(/gte\s*=\s*(\d+)/);
        if (match) {
          const gteVal = parseInt(match[1]!, 10);
          if (value < gteVal) {
            return { valid: false, error: `Value ${value} must be greater than or equal to ${gteVal}` };
          }
        }
      }
      if (ruleText.includes('lt')) {
        const match = ruleText.match(/\blt\s*=\s*(\d+)/);
        if (match) {
          const ltVal = parseInt(match[1]!, 10);
          if (value >= ltVal) {
            return { valid: false, error: `Value ${value} must be less than ${ltVal}` };
          }
        }
      }
      if (ruleText.includes('lte')) {
        const match = ruleText.match(/lte\s*=\s*(\d+)/);
        if (match) {
          const lteVal = parseInt(match[1]!, 10);
          if (value > lteVal) {
            return { valid: false, error: `Value ${value} must be less than or equal to ${lteVal}` };
          }
        }
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (ruleText.includes('min_items')) {
        const match = ruleText.match(/min_items\s*=\s*(\d+)/);
        if (match) {
          const minItems = parseInt(match[1]!, 10);
          if (value.length < minItems) {
            return { valid: false, error: `Array has ${value.length} items, minimum is ${minItems}` };
          }
        }
      }
      if (ruleText.includes('max_items')) {
        const match = ruleText.match(/max_items\s*=\s*(\d+)/);
        if (match) {
          const maxItems = parseInt(match[1]!, 10);
          if (value.length > maxItems) {
            return { valid: false, error: `Array has ${value.length} items, maximum is ${maxItems}` };
          }
        }
      }
      if (ruleText.includes('unique') && ruleText.includes('true')) {
        const uniqueSet = new Set(value.map(v => JSON.stringify(v)));
        if (uniqueSet.size !== value.length) {
          return { valid: false, error: 'Array contains duplicate items' };
        }
      }
    }

    // CEL expression - can't validate client-side, provide helpful info
    if (ruleText.includes('cel') || ruleText.includes('expression')) {
      return {
        valid: true,
        info: 'CEL expressions require server-side validation. Use the CEL Playground link to test your expression.'
      };
    }

    return { valid: true };
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Protovalidate Playground</title>
        <style>
            * { box-sizing: border-box; }
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                line-height: 1.6;
            }
            h2 {
                margin-top: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .header-links {
                margin-left: auto;
                display: flex;
                gap: 10px;
            }
            .header-links a {
                font-size: 12px;
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                padding: 4px 8px;
                border-radius: 4px;
                background: var(--vscode-button-secondaryBackground);
            }
            .header-links a:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .section {
                margin-bottom: 20px;
                padding: 15px;
                background: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 6px;
            }
            .section h3 {
                margin-top: 0;
                margin-bottom: 10px;
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
            }
            input, select, textarea {
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 8px 10px;
                margin-bottom: 10px;
                width: 100%;
                border-radius: 4px;
                font-family: var(--vscode-editor-font-family);
            }
            textarea {
                min-height: 100px;
                resize: vertical;
            }
            button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 13px;
            }
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            button.secondary {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            button.secondary:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .rule-display {
                font-family: var(--vscode-editor-font-family);
                font-size: 13px;
                padding: 10px;
                background: var(--vscode-textCodeBlock-background);
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .rule-meta {
                display: flex;
                gap: 20px;
                margin-bottom: 10px;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            .result-box {
                padding: 15px;
                border-radius: 6px;
                margin-top: 10px;
            }
            .result-valid {
                background: var(--vscode-testing-iconPassed);
                background: rgba(35, 134, 54, 0.2);
                border: 1px solid var(--vscode-testing-iconPassed, #23863a);
            }
            .result-invalid {
                background: rgba(248, 81, 73, 0.2);
                border: 1px solid var(--vscode-testing-iconFailed, #f85149);
            }
            .result-info {
                background: rgba(56, 139, 253, 0.2);
                border: 1px solid var(--vscode-textLink-foreground, #388bfd);
            }
            .placeholder {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                padding: 20px;
                text-align: center;
            }
            .button-row {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }
            .examples {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid var(--vscode-panel-border);
            }
            .examples h4 {
                margin: 0 0 10px 0;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            .example-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .example-chip {
                padding: 4px 10px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 12px;
                font-size: 12px;
                cursor: pointer;
            }
            .example-chip:hover {
                opacity: 0.8;
            }
            .hidden {
                display: none;
            }
        </style>
    </head>
    <body>
        <h2>
            Protovalidate Playground
            <div class="header-links">
                <a href="#" id="docsLink">Documentation</a>
                <a href="#" id="celLink">CEL Playground</a>
            </div>
        </h2>

        <div class="section" id="ruleSection">
            <h3>Validation Rule</h3>
            <div id="ruleContent">
                <div class="placeholder">
                    Click "Test in Protovalidate Playground" on a validation rule to load it here,
                    or enter a rule manually below.
                </div>
            </div>
            <div class="rule-meta" id="ruleMeta" style="display: none;">
                <span id="ruleField"></span>
                <span id="ruleMessage"></span>
                <span id="ruleType"></span>
            </div>
        </div>

        <div class="section">
            <h3>Test Value</h3>
            <label for="jsonInput">Enter a JSON value to validate:</label>
            <textarea id="jsonInput" placeholder='Examples:\n"hello@example.com"\n42\n["item1", "item2"]\n{"key": "value"}'></textarea>

            <div class="button-row">
                <button id="validateBtn">Validate</button>
                <button id="clearBtn" class="secondary">Clear</button>
            </div>

            <div class="examples">
                <h4>Quick examples:</h4>
                <div class="example-chips">
                    <span class="example-chip" data-value='"test@example.com"'>Email</span>
                    <span class="example-chip" data-value='"550e8400-e29b-41d4-a716-446655440000"'>UUID</span>
                    <span class="example-chip" data-value='"hello world"'>String</span>
                    <span class="example-chip" data-value='42'>Number</span>
                    <span class="example-chip" data-value='["a", "b", "c"]'>Array</span>
                    <span class="example-chip" data-value='""'>Empty string</span>
                    <span class="example-chip" data-value='-1'>Negative</span>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>Result</h3>
            <div id="resultOutput">
                <div class="placeholder">Enter a value and click Validate to see the result</div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const jsonInput = document.getElementById('jsonInput');
            const validateBtn = document.getElementById('validateBtn');
            const clearBtn = document.getElementById('clearBtn');
            const resultOutput = document.getElementById('resultOutput');
            const ruleContent = document.getElementById('ruleContent');
            const ruleMeta = document.getElementById('ruleMeta');
            const ruleField = document.getElementById('ruleField');
            const ruleMessage = document.getElementById('ruleMessage');
            const ruleType = document.getElementById('ruleType');
            const docsLink = document.getElementById('docsLink');
            const celLink = document.getElementById('celLink');

            let currentRule = null;

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setRule':
                        currentRule = message.rule;
                        displayRule(currentRule);
                        break;
                    case 'validationResult':
                        displayResult(message.result);
                        break;
                }
            });

            function displayRule(rule) {
                if (!rule) {
                    ruleContent.innerHTML = '<div class="placeholder">No rule loaded</div>';
                    ruleMeta.style.display = 'none';
                    return;
                }

                ruleContent.innerHTML = '<div class="rule-display">' + escapeHtml(rule.ruleText) + '</div>';
                ruleMeta.style.display = 'flex';
                ruleField.textContent = 'Field: ' + rule.fieldName;
                ruleMessage.textContent = 'Message: ' + rule.messageName;
                ruleType.textContent = 'Type: ' + rule.ruleType;
            }

            function displayResult(result) {
                if (result.valid) {
                    if (result.info) {
                        resultOutput.innerHTML = '<div class="result-box result-info">ℹ️ ' + escapeHtml(result.info) + '</div>';
                    } else {
                        resultOutput.innerHTML = '<div class="result-box result-valid">✓ Validation passed</div>';
                    }
                } else {
                    resultOutput.innerHTML = '<div class="result-box result-invalid">✗ ' + escapeHtml(result.error || 'Validation failed') + '</div>';
                }
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            validateBtn.addEventListener('click', () => {
                if (!currentRule) {
                    resultOutput.innerHTML = '<div class="result-box result-info">ℹ️ Load a rule first by clicking "Test in Protovalidate Playground" on a validation constraint</div>';
                    return;
                }

                const value = jsonInput.value.trim();
                if (!value) {
                    resultOutput.innerHTML = '<div class="result-box result-invalid">Please enter a value to validate</div>';
                    return;
                }

                vscode.postMessage({
                    command: 'validateData',
                    data: {
                        rule: currentRule,
                        jsonValue: value
                    }
                });
            });

            clearBtn.addEventListener('click', () => {
                jsonInput.value = '';
                resultOutput.innerHTML = '<div class="placeholder">Enter a value and click Validate to see the result</div>';
            });

            docsLink.addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openDocs' });
            });

            celLink.addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openCelPlayground' });
            });

            // Example chips
            document.querySelectorAll('.example-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    jsonInput.value = chip.dataset.value;
                });
            });
        </script>
    </body>
    </html>`;
  }
}
