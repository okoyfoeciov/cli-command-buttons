"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandButtonsProvider = void 0;
const vscode = require("vscode");
const path = require("path");
class CommandTreeItem extends vscode.TreeItem {
    constructor(commandItem, collapsibleState) {
        super(commandItem.name, collapsibleState);
        this.commandItem = commandItem;
        this.collapsibleState = collapsibleState;
        this.tooltip = `${commandItem.name}\n${commandItem.command}`;
        this.description = commandItem.command;
        this.contextValue = 'commandItem';
        // Set icon for the command
        this.iconPath = new vscode.ThemeIcon('terminal');
        // Set the command to execute when clicked
        this.command = {
            command: 'cli-command-buttons.executeCommand',
            title: 'Execute Command',
            arguments: [commandItem.command, commandItem.name]
        };
        // Store reference to the command item for deletion
        this.id = commandItem.id;
    }
}
class CommandButtonsProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.commands = [];
        this.loadCommands();
        // Listen for workspace folder changes
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.loadCommands();
        });
        // Listen for active editor changes to detect workspace switches
        vscode.window.onDidChangeActiveTextEditor(() => {
            const newWorkspaceFolder = this.getCurrentWorkspaceFolder();
            if (newWorkspaceFolder !== this.currentWorkspaceFolder) {
                this.currentWorkspaceFolder = newWorkspaceFolder;
                this.loadCommands();
            }
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            if (this.commands.length === 0) {
                // Show different message based on whether we have a workspace
                const workspaceFolder = this.getCurrentWorkspaceFolder();
                const message = workspaceFolder
                    ? 'No commands for this project'
                    : 'No workspace opened';
                const tooltip = workspaceFolder
                    ? 'Click "Add New Command" to add project-specific commands'
                    : 'Open a folder/workspace to add project-specific commands';
                const placeholderItem = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
                placeholderItem.tooltip = tooltip;
                placeholderItem.iconPath = new vscode.ThemeIcon('info');
                placeholderItem.contextValue = 'placeholder';
                return Promise.resolve([placeholderItem]);
            }
            return Promise.resolve(this.commands.map(cmd => new CommandTreeItem(cmd, vscode.TreeItemCollapsibleState.None)));
        }
        return Promise.resolve([]);
    }
    addCommand(name, command) {
        const workspaceFolder = this.getCurrentWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('Please open a workspace folder to add project-specific commands.');
            return;
        }
        const newCommand = {
            id: Date.now().toString(),
            name,
            command
        };
        this.commands.push(newCommand);
        this.saveCommands();
        this.refresh();
    }
    deleteCommand(id) {
        this.commands = this.commands.filter(cmd => cmd.id !== id);
        this.saveCommands();
        this.refresh();
    }
    getCommands() {
        return this.commands;
    }
    getCurrentWorkspaceFolder() {
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
    getStorageKey() {
        const workspaceFolder = this.getCurrentWorkspaceFolder();
        if (!workspaceFolder) {
            return 'cliCommands_global'; // Fallback for when no workspace is open
        }
        // Create a unique key based on workspace folder path
        // Use path.basename to get just the folder name for cleaner keys
        const folderName = path.basename(workspaceFolder);
        const folderHash = this.hashString(workspaceFolder);
        return `cliCommands_${folderName}_${folderHash}`;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
    saveCommands() {
        const storageKey = this.getStorageKey();
        this.context.globalState.update(storageKey, this.commands);
    }
    loadCommands() {
        const storageKey = this.getStorageKey();
        const saved = this.context.globalState.get(storageKey);
        if (saved) {
            this.commands = saved;
        }
        else {
            // Start with empty commands array - no default commands
            this.commands = [];
        }
        // Update current workspace folder reference
        this.currentWorkspaceFolder = this.getCurrentWorkspaceFolder();
        this.refresh();
    }
}
exports.CommandButtonsProvider = CommandButtonsProvider;
//# sourceMappingURL=commandButtonsProvider.js.map