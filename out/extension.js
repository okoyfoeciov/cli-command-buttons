"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
const globalCommandsProvider_1 = require("./globalCommandsProvider");
const workspaceCommandsProvider_1 = require("./workspaceCommandsProvider");
function getProjectFolder() {
    const config = vscode.workspace.getConfiguration('cliCommandButtons');
    const customFolder = config.get('defaultProjectFolder');
    if (customFolder && customFolder.trim()) {
        const folder = customFolder.trim();
        if (folder.startsWith('~')) {
            return path.join(os.homedir(), folder.substring(1));
        }
        return path.resolve(folder);
    }
    return path.join(os.homedir(), 'Downloads');
}
function activate(context) {
    const globalProvider = new globalCommandsProvider_1.GlobalCommandsProvider(context);
    const workspaceProvider = new workspaceCommandsProvider_1.WorkspaceCommandsProvider(context);
    vscode.window.registerTreeDataProvider('globalCommandsView', globalProvider);
    vscode.window.registerTreeDataProvider('workspaceCommandsView', workspaceProvider);
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    function updateStatusBarItem() {
        const projectFolder = getProjectFolder();
        const folderName = path.basename(projectFolder);
        statusBarItem.text = `$(folder-opened) ${folderName}`;
        statusBarItem.tooltip = `Open Projects in ${projectFolder}`;
        statusBarItem.command = 'cli-command-buttons.openDownloadsFolder';
    }
    updateStatusBarItem();
    statusBarItem.show();
    const configurationChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('cliCommandButtons.defaultProjectFolder')) {
            updateStatusBarItem();
        }
    });
    const openDownloadsFolderCommand = vscode.commands.registerCommand('cli-command-buttons.openDownloadsFolder', async () => {
        const projectsPath = getProjectFolder();
        try {
            if (!fs.existsSync(projectsPath)) {
                const create = await vscode.window.showWarningMessage(`Project folder "${projectsPath}" does not exist. Would you like to create it?`, 'Create', 'Cancel');
                if (create === 'Create') {
                    fs.mkdirSync(projectsPath, { recursive: true });
                }
                else {
                    return;
                }
            }
            const items = fs.readdirSync(projectsPath, { withFileTypes: true });
            const subfolders = items
                .filter(item => item.isDirectory())
                .map(item => ({
                label: item.name,
                path: path.join(projectsPath, item.name),
                description: path.join(projectsPath, item.name)
            }));
            const quickPickItems = [
                {
                    label: path.basename(projectsPath),
                    description: projectsPath,
                    path: projectsPath
                },
                {
                    label: '$(add) Create New Project',
                    description: 'Create a new project folder',
                    path: 'CREATE_NEW'
                },
                ...subfolders.map(folder => ({
                    label: `$(folder) ${folder.label}`,
                    description: folder.path,
                    path: folder.path
                }))
            ];
            const selectedFolder = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a folder to open or create a new project',
                matchOnDescription: true
            });
            if (selectedFolder) {
                if (selectedFolder.path === 'CREATE_NEW') {
                    const projectName = await vscode.window.showInputBox({
                        prompt: 'Enter project name',
                        placeHolder: 'my-new-project',
                        validateInput: (value) => {
                            if (!value.trim()) {
                                return 'Project name cannot be empty';
                            }
                            if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
                                return 'Project name can only contain letters, numbers, hyphens, and underscores';
                            }
                            const projectPath = path.join(projectsPath, value.trim());
                            if (fs.existsSync(projectPath)) {
                                return 'A folder with this name already exists';
                            }
                            return null;
                        }
                    });
                    if (projectName) {
                        const projectPath = path.join(projectsPath, projectName.trim());
                        try {
                            fs.mkdirSync(projectPath, { recursive: true });
                            vscode.window.showInformationMessage(`Created project: ${projectName}`);
                            const folderUri = vscode.Uri.file(projectPath);
                            await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
                        }
                        catch (error) {
                            vscode.window.showErrorMessage(`Failed to create project: ${error}`);
                        }
                    }
                }
                else {
                    const folderUri = vscode.Uri.file(selectedFolder.path);
                    await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
                }
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error reading project directory: ${error}`);
        }
    });
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
        if (!name)
            return;
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
        if (!command)
            return;
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
        workspaceProvider.addCommand(name.trim(), command.trim());
    });
    const editCommandCommand = vscode.commands.registerCommand('cli-command-buttons.editCommand', async (item) => {
        let currentCommand = globalProvider.getCommand(item.id);
        let isGlobal = true;
        if (!currentCommand) {
            currentCommand = workspaceProvider.getCommand(item.id);
            isGlobal = false;
        }
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
            if (isGlobal) {
                globalProvider.editCommand(item.id, newCommand.trim());
            }
            else {
                workspaceProvider.editCommand(item.id, newCommand.trim());
            }
        }
    });
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
    const deleteCommand = vscode.commands.registerCommand('cli-command-buttons.deleteCommand', (item) => {
        let commandFound = false;
        if (globalProvider.getCommand(item.id)) {
            globalProvider.deleteCommand(item.id);
            commandFound = true;
        }
        else if (workspaceProvider.getCommand(item.id)) {
            workspaceProvider.deleteCommand(item.id);
            commandFound = true;
        }
    });
    const refreshCommand = vscode.commands.registerCommand('cli-command-buttons.refresh', () => {
        globalProvider.refresh();
        workspaceProvider.refresh();
    });
    const createNewProjectCommand = vscode.commands.registerCommand('cli-command-buttons.createNewProject', async () => {
        const projectsPath = getProjectFolder();
        if (!fs.existsSync(projectsPath)) {
            const create = await vscode.window.showWarningMessage(`Project folder "${projectsPath}" does not exist. Would you like to create it?`, 'Create', 'Cancel');
            if (create === 'Create') {
                fs.mkdirSync(projectsPath, { recursive: true });
            }
            else {
                return;
            }
        }
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter project name',
            placeHolder: 'my-new-project',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Project name cannot be empty';
                }
                if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
                    return 'Project name can only contain letters, numbers, hyphens, and underscores';
                }
                const projectPath = path.join(projectsPath, value.trim());
                if (fs.existsSync(projectPath)) {
                    return 'A folder with this name already exists';
                }
                return null;
            }
        });
        if (projectName) {
            const projectPath = path.join(projectsPath, projectName.trim());
            try {
                fs.mkdirSync(projectPath, { recursive: true });
                vscode.window.showInformationMessage(`Created project: ${projectName}`);
                const folderUri = vscode.Uri.file(projectPath);
                await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to create project: ${error}`);
            }
        }
    });
    context.subscriptions.push(statusBarItem, configurationChangeListener, openDownloadsFolderCommand, addGlobalCommandCommand, addWorkspaceCommandCommand, editCommandCommand, executeCommand, deleteCommand, refreshCommand, createNewProjectCommand);
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