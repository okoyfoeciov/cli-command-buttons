"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const commandButtonsProvider_1 = require("./commandButtonsProvider");
function activate(context) {
    const provider = new commandButtonsProvider_1.CommandButtonsProvider(context);
    // Register the tree data provider for the custom view container
    vscode.window.registerTreeDataProvider('cliCommandButtonsView', provider);
    // Register commands
    const addCommandCommand = vscode.commands.registerCommand('cli-command-buttons.addCommand', async () => {
        // Check if workspace is open
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
    const executeCommand = vscode.commands.registerCommand('cli-command-buttons.executeCommand', async (commandText, commandName) => {
        const terminal = await getOrCreateTerminal(commandName);
        // Set working directory to current workspace folder
        const workspaceFolder = getCurrentWorkspaceFolder();
        if (workspaceFolder) {
            // Change to workspace directory first
            terminal.sendText(`cd "${workspaceFolder}"`);
        }
        terminal.show();
        // Small delay to ensure terminal is ready and cd command is executed
        setTimeout(() => {
            terminal.sendText(commandText);
        }, 200);
    });
    const deleteCommand = vscode.commands.registerCommand('cli-command-buttons.deleteCommand', (item) => {
        provider.deleteCommand(item.id);
    });
    const refreshCommand = vscode.commands.registerCommand('cli-command-buttons.refresh', () => {
        provider.refresh();
        vscode.window.showInformationMessage('Command buttons refreshed!');
    });
    context.subscriptions.push(addCommandCommand, executeCommand, deleteCommand, refreshCommand);
}
exports.activate = activate;
function getCurrentWorkspaceFolder() {
    // Try to get workspace folder from active editor first
    if (vscode.window.activeTextEditor) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }
    }
    // Fall back to first workspace folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return undefined;
}
/**
 * Get existing terminal or create a new one based on user settings
 */
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
            // Check if there's an active terminal first
            const currentActive = vscode.window.activeTerminal;
            if (currentActive && isTerminalIdle(currentActive)) {
                return currentActive;
            }
            // Look for any idle terminal
            for (const terminal of terminals) {
                if (isTerminalIdle(terminal)) {
                    return terminal;
                }
            }
            // If no idle terminals found, create a new one
            return vscode.window.createTerminal(`CLI: ${commandName}`);
    }
}
/**
 * Check if terminal is likely idle (not running a command)
 * This is a best-effort check since VSCode doesn't provide direct access to terminal state
 */
function isTerminalIdle(terminal) {
    try {
        // Check if terminal is disposed or has exited
        if (terminal.exitStatus !== undefined) {
            return false; // Terminal has exited
        }
        // Terminal exists and hasn't exited, assume it's idle
        // Note: This is a limitation of VSCode API - we can't detect if a command is currently running
        return true;
    }
    catch (error) {
        // If we can't check the terminal status, assume it's not idle
        return false;
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map