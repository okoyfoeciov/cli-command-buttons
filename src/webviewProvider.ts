import * as vscode from 'vscode';
import { CommandButtonsProvider, CommandItem } from './commandButtonsProvider';

export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private commandProvider: CommandButtonsProvider
    ) {}

    public createOrShow(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cliCommandButtons',
            'CLI Command Buttons',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'executeCommand':
                        const terminal = vscode.window.createTerminal('CLI Command');
                        terminal.show();
                        terminal.sendText(message.command);
                        break;
                    case 'addCommand':
                        const name = await vscode.window.showInputBox({
                            prompt: 'Enter command name',
                            placeHolder: 'e.g., Build Project'
                        });

                        if (!name) return;

                        const command = await vscode.window.showInputBox({
                            prompt: 'Enter CLI command',
                            placeHolder: 'e.g., npm run build'
                        });

                        if (!command) return;

                        this.commandProvider.addCommand(name, command);
                        this.updateWebview();
                        break;
                    case 'deleteCommand':
                        this.commandProvider.deleteCommand(message.id);
                        this.updateWebview();
                        break;
                    case 'refreshCommands':
                        this.updateWebview();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    private updateWebview(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'updateCommands',
                commands: this.commandProvider.getCommands()
            });
        }
    }

    private getWebviewContent(): string {
        const commands = this.commandProvider.getCommands();
        const commandsJson = JSON.stringify(commands);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CLI Command Buttons</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 15px;
                }
                
                h1 {
                    margin: 0;
                    font-size: 1.5em;
                }
                
                .buttons-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                
                .command-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    position: relative;
                    transition: background-color 0.2s;
                }
                
                .command-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .command-name {
                    font-size: 16px;
                    margin-bottom: 8px;
                }
                
                .command-text {
                    font-size: 12px;
                    opacity: 0.8;
                    font-family: monospace;
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 4px 6px;
                    border-radius: 3px;
                    word-break: break-all;
                }
                
                .delete-button {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    background: var(--vscode-errorForeground);
                    color: white;
                    border: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 12px;
                    display: none;
                }
                
                .command-button:hover .delete-button {
                    display: block;
                }
                
                .add-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 2px dashed var(--vscode-button-border);
                    padding: 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 60px;
                    transition: all 0.2s;
                }
                
                .add-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                    border-color: var(--vscode-button-foreground);
                }
                
                .empty-state {
                    text-align: center;
                    padding: 40px;
                    opacity: 0.7;
                }
                
                .refresh-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 1px solid var(--vscode-button-border);
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .refresh-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>CLI Command Buttons</h1>
                <button class="refresh-button" onclick="refreshCommands()">Refresh</button>
            </div>
            
            <div id="buttons-container" class="buttons-container">
                <!-- Buttons will be populated by JavaScript -->
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let commands = ${commandsJson};
                
                function renderButtons() {
                    const container = document.getElementById('buttons-container');
                    container.innerHTML = '';
                    
                    if (commands.length === 0) {
                        container.innerHTML = '<div class="empty-state">No commands configured. Click "Add Command" to get started!</div>';
                    }
                    
                    commands.forEach(cmd => {
                        const button = document.createElement('div');
                        button.className = 'command-button';
                        button.innerHTML = \`
                            <div class="command-name">\${cmd.name}</div>
                            <div class="command-text">\${cmd.command}</div>
                            <button class="delete-button" onclick="deleteCommand('\${cmd.id}')" title="Delete command">×</button>
                        \`;
                        button.onclick = (e) => {
                            if (e.target.className !== 'delete-button') {
                                executeCommand(cmd.command);
                            }
                        };
                        container.appendChild(button);
                    });
                    
                    // Add "Add Command" button
                    const addButton = document.createElement('div');
                    addButton.className = 'add-button';
                    addButton.innerHTML = '+ Add Command';
                    addButton.onclick = addCommand;
                    container.appendChild(addButton);
                }
                
                function executeCommand(command) {
                    vscode.postMessage({
                        type: 'executeCommand',
                        command: command
                    });
                }
                
                function addCommand() {
                    vscode.postMessage({
                        type: 'addCommand'
                    });
                }
                
                function deleteCommand(id) {
                    vscode.postMessage({
                        type: 'deleteCommand',
                        id: id
                    });
                }
                
                function refreshCommands() {
                    vscode.postMessage({
                        type: 'refreshCommands'
                    });
                }
                
                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateCommands':
                            commands = message.commands;
                            renderButtons();
                            break;
                    }
                });
                
                // Initial render
                renderButtons();
            </script>
        </body>
        </html>`;
    }
}