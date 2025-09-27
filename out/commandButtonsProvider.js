"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandButtonsProvider = void 0;
const vscode = require("vscode");
const path = require("path");
class CommandTreeItem extends vscode.TreeItem {
    constructor(commandItem, collapsibleState) {
        super('', collapsibleState); // Empty label, we'll use description
        this.commandItem = commandItem;
        this.collapsibleState = collapsibleState;
        // Display the command name as the main label
        this.label = commandItem.name;
        // Display the CLI command as description (smaller text)
        this.description = commandItem.command;
        this.tooltip = `Name: ${commandItem.name}\nCommand: ${commandItem.command}\nClick to run, right-click to edit`;
        this.contextValue = 'commandItem';
        // Remove the play icon - use terminal icon instead
        this.iconPath = new vscode.ThemeIcon('terminal');
        // Set the command to execute when clicked
        this.command = {
            command: 'cli-command-buttons.executeCommand',
            title: 'Execute Command',
            arguments: [commandItem.command, commandItem.name]
        };
        // Store reference to the command item
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
                const workspaceFolder = this.getCurrentWorkspaceFolder();
                const message = workspaceFolder
                    ? 'No commands for this project'
                    : 'No workspace opened';
                const tooltip = workspaceFolder
                    ? 'Click "+" to add project-specific commands'
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
    editCommandName(id, newName) {
        const commandIndex = this.commands.findIndex(cmd => cmd.id === id);
        if (commandIndex !== -1) {
            this.commands[commandIndex].name = newName;
            this.saveCommands();
            this.refresh();
        }
    }
    editCommandText(id, newCommand) {
        const commandIndex = this.commands.findIndex(cmd => cmd.id === id);
        if (commandIndex !== -1) {
            this.commands[commandIndex].command = newCommand;
            this.saveCommands();
            this.refresh();
        }
    }
    getCommand(id) {
        return this.commands.find(cmd => cmd.id === id);
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
    getStorageKey() {
        const workspaceFolder = this.getCurrentWorkspaceFolder();
        if (!workspaceFolder) {
            return 'cliCommands_global';
        }
        const folderName = path.basename(workspaceFolder);
        const folderHash = this.hashString(workspaceFolder);
        return `cliCommands_${folderName}_${folderHash}`;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
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
            this.commands = [];
        }
        this.currentWorkspaceFolder = this.getCurrentWorkspaceFolder();
        this.refresh();
    }
}
exports.CommandButtonsProvider = CommandButtonsProvider;
//# sourceMappingURL=commandButtonsProvider.js.map