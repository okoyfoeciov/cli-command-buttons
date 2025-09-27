"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewProvider = void 0;
const vscode = require("vscode");
class WebviewProvider {
    constructor(context, commandProvider) {
        this.context = context;
        this.commandProvider = commandProvider;
    }
    createOrShow() {
        const column = vscode.ViewColumn.One;
        if (this.panel) {
            this.panel.reveal(column);
            this.updateWebview();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('cliCommandButtons', 'CLI Command Buttons', column, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.getWebviewContent();
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'executeCommand':
                    vscode.commands.executeCommand('cli-command-buttons.executeCommand', message.command, message.name);
                    break;
                case 'updateCommandName':
                    this.commandProvider.editCommandName(message.id, message.name);
                    break;
                case 'updateCommandText':
                    this.commandProvider.editCommandText(message.id, message.command);
                    break;
                case 'deleteCommand':
                    this.commandProvider.deleteCommand(message.id);
                    this.updateWebview();
                    break;
                case 'addCommand':
                    this.commandProvider.addCommand(message.name, message.command);
                    this.updateWebview();
                    break;
                case 'ready':
                    this.updateWebview();
                    break;
            }
        }, undefined, this.context.subscriptions);
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);
    }
    updateWebview() {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'updateCommands',
                commands: this.commandProvider.getCommands()
            });
        }
    }
    getWebviewContent() {
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
                    margin: 0;
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
                
                .add-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .add-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .commands-container {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .command-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                }
                
                .command-name-input {
                    min-width: 150px;
                    max-width: 200px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 6px 8px;
                    border-radius: 3px;
                    font-size: 14px;
                }
                
                .command-text-input {
                    flex: 1;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 6px 8px;
                    border-radius: 3px;
                    font-family: monospace;
                    font-size: 13px;
                }
                
                .command-name-input:focus,
                .command-text-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                
                .run-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .run-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .delete-button {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                    border: none;
                    padding: 6px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .delete-button:hover {
                    opacity: 0.8;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 40px;
                    opacity: 0.7;
                    font-style: italic;
                }
                
                .add-command-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px;
                    background-color: var(--vscode-input-background);
                    border: 2px dashed var(--vscode-input-border);
                    border-radius: 4px;
                    margin-top: 10px;
                }
                
                .icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>CLI Command Buttons</h1>
                <button class="add-button" onclick="addNewCommand()">+ Add Command</button>
            </div>
            
            <div id="commands-container" class="commands-container">
                <!-- Commands will be populated by JavaScript -->
            </div>
            
            <div class="empty-state" id="empty-state" style="display: none;">
                No commands configured. Click "Add Command" to get started!
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let commands = [];
                
                function renderCommands() {
                    const container = document.getElementById('commands-container');
                    const emptyState = document.getElementById('empty-state');
                    
                    container.innerHTML = '';
                    
                    if (commands.length === 0) {
                        emptyState.style.display = 'block';
                        return;
                    } else {
                        emptyState.style.display = 'none';
                    }
                    
                    commands.forEach(cmd => {
                        const row = document.createElement('div');
                        row.className = 'command-row';
                        row.innerHTML = \`
                            <input 
                                type="text" 
                                class="command-name-input" 
                                value="\${escapeHtml(cmd.name)}" 
                                placeholder="Command Name"
                                onblur="updateCommandName('\${cmd.id}', this.value)"
                                onkeypress="handleKeyPress(event, () => updateCommandName('\${cmd.id}', this.value))"
                            />
                            <input 
                                type="text" 
                                class="command-text-input" 
                                value="\${escapeHtml(cmd.command)}" 
                                placeholder="CLI Command (e.g., npm run build)"
                                onblur="updateCommandText('\${cmd.id}', this.value)"
                                onkeypress="handleKeyPress(event, () => updateCommandText('\${cmd.id}', this.value))"
                            />
                            <button class="run-button" onclick="executeCommand('\${cmd.id}')">
                                ▶ Run
                            </button>
                            <button class="delete-button" onclick="deleteCommand('\${cmd.id}')" title="Delete command">
                                ×
                            </button>
                        \`;
                        container.appendChild(row);
                    });
                }
                
                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
                
                function handleKeyPress(event, callback) {
                    if (event.key === 'Enter') {
                        event.target.blur();
                        callback();
                    }
                }
                
                function executeCommand(id) {
                    const cmd = commands.find(c => c.id === id);
                    if (cmd) {
                        vscode.postMessage({
                            type: 'executeCommand',
                            command: cmd.command,
                            name: cmd.name
                        });
                    }
                }
                
                function updateCommandName(id, newName) {
                    if (!newName.trim()) return;
                    
                    const cmd = commands.find(c => c.id === id);
                    if (cmd && cmd.name !== newName.trim()) {
                        cmd.name = newName.trim();
                        vscode.postMessage({
                            type: 'updateCommandName',
                            id: id,
                            name: newName.trim()
                        });
                    }
                }
                
                function updateCommandText(id, newCommand) {
                    if (!newCommand.trim()) return;
                    
                    const cmd = commands.find(c => c.id === id);
                    if (cmd && cmd.command !== newCommand.trim()) {
                        cmd.command = newCommand.trim();
                        vscode.postMessage({
                            type: 'updateCommandText',
                            id: id,
                            command: newCommand.trim()
                        });
                    }
                }
                
                function deleteCommand(id) {
                    vscode.postMessage({
                        type: 'deleteCommand',
                        id: id
                    });
                }
                
                function addNewCommand() {
                    const name = prompt('Enter command name:', 'New Command');
                    if (!name || !name.trim()) return;
                    
                    const command = prompt('Enter CLI command:', '');
                    if (!command || !command.trim()) return;
                    
                    vscode.postMessage({
                        type: 'addCommand',
                        name: name.trim(),
                        command: command.trim()
                    });
                }
                
                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateCommands':
                            commands = message.commands;
                            renderCommands();
                            break;
                    }
                });
                
                // Signal that webview is ready
                vscode.postMessage({ type: 'ready' });
            </script>
        </body>
        </html>`;
    }
}
exports.WebviewProvider = WebviewProvider;
//# sourceMappingURL=webviewProvider.js.map