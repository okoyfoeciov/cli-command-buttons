"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const commandButtonsProvider_1 = require("./commandButtonsProvider");
function activate(context) {
    const provider = new commandButtonsProvider_1.CommandButtonsProvider(context);
    // Register the tree data provider for the custom view container
    vscode.window.registerTreeDataProvider('cliCommandButtonsView', provider);
    // Add command
    const addCommandCommand = vscode.commands.registerCommand('cli-command-buttons.addCommand', async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a workspace folder to add project-specific commands.');
            return;
        }
        const name = await vscode.window.showInputBox({
            prompt: 'Enter command name',
            placeHolder: 'e.g., Build Project',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command name cannot be empty';
                }
                return null;
            }
        });
        if (!name)
            return;
        const command = await vscode.window.showInputBox({
            prompt: 'Enter CLI command',
            placeHolder: 'e.g., npm run build',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command cannot be empty';
                }
                return null;
            }
        });
        if (!command)
            return;
        provider.addCommand(name.trim(), command.trim());
    });
    // Edit command name
    const editCommandNameCommand = vscode.commands.registerCommand('cli-command-buttons.editCommandName', async (item) => {
        const currentCommand = provider.getCommand(item.id);
        if (!currentCommand)
            return;
        const newName = await vscode.window.showInputBox({
            prompt: 'Edit command name',
            value: currentCommand.name,
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command name cannot be empty';
                }
                return null;
            }
        });
        if (newName !== undefined && newName.trim() !== currentCommand.name) {
            provider.editCommandName(item.id, newName.trim());
        }
    });
    // Edit command text
    const editCommandTextCommand = vscode.commands.registerCommand('cli-command-buttons.editCommandText', async (item) => {
        const currentCommand = provider.getCommand(item.id);
        if (!currentCommand)
            return;
        const newCommand = await vscode.window.showInputBox({
            prompt: 'Edit CLI command',
            value: currentCommand.command,
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command cannot be empty';
                }
                return null;
            }
        });
        if (newCommand !== undefined && newCommand.trim() !== currentCommand.command) {
            provider.editCommandText(item.id, newCommand.trim());
        }
    });
    // Execute command
    const executeCommand = vscode.commands.registerCommand('cli-command-buttons.executeCommand', async (commandText, commandName) => {
        const terminal = await getOrCreateTerminal(commandName);
        const workspaceFolder = getCurrentWorkspaceFolder();
        if (workspaceFolder) {
            terminal.sendText(`cd "${workspaceFolder}"`);
        }
        terminal.show();
        setTimeout(() => {
            terminal.sendText(commandText);
        }, 200);
    });
    // Delete command
    const deleteCommand = vscode.commands.registerCommand('cli-command-buttons.deleteCommand', (item) => {
        provider.deleteCommand(item.id);
    });
    // Refresh
    const refreshCommand = vscode.commands.registerCommand('cli-command-buttons.refresh', () => {
        provider.refresh();
    });
    context.subscriptions.push(addCommandCommand, editCommandNameCommand, editCommandTextCommand, executeCommand, deleteCommand, refreshCommand);
}
exports.activate = activate;
function getCurrentWorkspaceFolder() {
    if (vscode.window.activeTextEditor) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return undefined;
}
async function getOrCreateTerminal(commandName) {
    const config = vscode.workspace.getConfiguration('cliCommandButtons');
    const terminalBehavior = config.get('terminalBehavior') || 'reuse';
    const terminals = vscode.window.terminals;
    switch (terminalBehavior) {
        case 'alwaysNew':
            return vscode.window.createTerminal(`CLI: ${commandName}`);
        case 'reuseActive':
            const activeTerminal = vscode.window.activeTerminal;
            if (activeTerminal && isTerminalIdle(activeTerminal)) {
                return activeTerminal;
            }
            return vscode.window.createTerminal(`CLI: ${commandName}`);
        case 'reuse':
        default:
            const currentActive = vscode.window.activeTerminal;
            if (currentActive && isTerminalIdle(currentActive)) {
                return currentActive;
            }
            for (const terminal of terminals) {
                if (isTerminalIdle(terminal)) {
                    return terminal;
                }
            }
            return vscode.window.createTerminal(`CLI: ${commandName}`);
    }
}
function isTerminalIdle(terminal) {
    try {
        if (terminal.exitStatus !== undefined) {
            return false;
        }
        return true;
    }
    catch (error) {
        return false;
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map