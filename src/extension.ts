import * as vscode from 'vscode';
import { GlobalCommandsProvider } from './globalCommandsProvider';
import { WorkspaceCommandsProvider } from './workspaceCommandsProvider';

type TerminalBehavior = 'reuse' | 'alwaysNew' | 'reuseActive';

export function activate(context: vscode.ExtensionContext) {
    const globalProvider = new GlobalCommandsProvider(context);
    const workspaceProvider = new WorkspaceCommandsProvider(context);
    
    vscode.window.registerTreeDataProvider('globalCommandsView', globalProvider);
    vscode.window.registerTreeDataProvider('workspaceCommandsView', workspaceProvider);
    
    const addGlobalCommandCommand = vscode.commands.registerCommand('cli-command-buttons.addGlobalCommand', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter global command name',
            placeHolder: 'e.g., System Info',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command name cannot be empty';
                }
                return null;
            }
        });
        if (!name) return;
        
        const command = await vscode.window.showInputBox({
            prompt: 'Enter CLI command',
            placeHolder: 'e.g., uname -a',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command cannot be empty';
                }
                return null;
            }
        });
        if (!command) return;
        
        globalProvider.addCommand(name.trim(), command.trim());
    });
    
    const addWorkspaceCommandCommand = vscode.commands.registerCommand('cli-command-buttons.addWorkspaceCommand', async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a workspace folder to add workspace-specific commands.');
            return;
        }
        
        const name = await vscode.window.showInputBox({
            prompt: 'Enter workspace command name',
            placeHolder: 'e.g., Build Project',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Command name cannot be empty';
                }
                return null;
            }
        });
        if (!name) return;
        
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
        if (!command) return;
        
        workspaceProvider.addCommand(name.trim(), command.trim());
    });
    
    const editCommandCommand = vscode.commands.registerCommand('cli-command-buttons.editCommand', async (item: any) => {
        let currentCommand = globalProvider.getCommand(item.id);
        let isGlobal = true;
        
        if (!currentCommand) {
            currentCommand = workspaceProvider.getCommand(item.id);
            isGlobal = false;
        }
        
        if (!currentCommand) return;
        
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
            if (isGlobal) {
                globalProvider.editCommand(item.id, newCommand.trim());
            } else {
                workspaceProvider.editCommand(item.id, newCommand.trim());
            }
        }
    });
    const executeCommand = vscode.commands.registerCommand('cli-command-buttons.executeCommand', async (commandText: string, commandName: string) => {
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
    const deleteCommand = vscode.commands.registerCommand('cli-command-buttons.deleteCommand', (item: any) => {
        let commandFound = false;
        if (globalProvider.getCommand(item.id)) {
            globalProvider.deleteCommand(item.id);
            commandFound = true;
        } else if (workspaceProvider.getCommand(item.id)) {
            workspaceProvider.deleteCommand(item.id);
            commandFound = true;
        }
    });
    
    const refreshCommand = vscode.commands.registerCommand('cli-command-buttons.refresh', () => {
        globalProvider.refresh();
        workspaceProvider.refresh();
    });
    
    context.subscriptions.push(
        addGlobalCommandCommand,
        addWorkspaceCommandCommand,
        editCommandCommand,
        executeCommand,
        deleteCommand,
        refreshCommand
    );
}

function getCurrentWorkspaceFolder(): string | undefined {
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

async function getOrCreateTerminal(commandName: string): Promise<vscode.Terminal> {
    const config = vscode.workspace.getConfiguration('cliCommandButtons');
    const terminalBehavior = config.get<TerminalBehavior>('terminalBehavior') || 'reuse';
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

function isTerminalIdle(terminal: vscode.Terminal): boolean {
    try {
        if (terminal.exitStatus !== undefined) {
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
}

export function deactivate() {}