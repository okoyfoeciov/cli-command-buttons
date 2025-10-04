"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalCommandsProvider = void 0;
const vscode = require("vscode");
class CommandTreeItem extends vscode.TreeItem {
    constructor(commandItem, collapsibleState) {
        super('', collapsibleState);
        this.commandItem = commandItem;
        this.collapsibleState = collapsibleState;
        this.label = commandItem.name;
        this.description = commandItem.command;
        this.tooltip = `Name: ${commandItem.name}\nCommand: ${commandItem.command}\nClick to run, right-click to edit`;
        this.contextValue = 'commandItem';
        this.iconPath = new vscode.ThemeIcon('terminal');
        this.command = {
            command: 'cli-command-buttons.executeCommand',
            title: 'Execute Command',
            arguments: [commandItem.command, commandItem.name]
        };
        this.id = commandItem.id;
    }
}
class GlobalCommandsProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.commands = [];
        this.setupSync();
        this.loadCommands();
    }
    setupSync() {
        this.context.globalState.setKeysForSync([GlobalCommandsProvider.STORAGE_KEY]);
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
                const placeholderItem = new vscode.TreeItem('No global commands', vscode.TreeItemCollapsibleState.None);
                placeholderItem.tooltip = 'Click "+" to add global commands that sync across all devices';
                placeholderItem.iconPath = new vscode.ThemeIcon('info');
                placeholderItem.contextValue = 'placeholder';
                return Promise.resolve([placeholderItem]);
            }
            return Promise.resolve(this.commands.map(cmd => new CommandTreeItem(cmd, vscode.TreeItemCollapsibleState.None)));
        }
        return Promise.resolve([]);
    }
    addCommand(name, command) {
        const newCommand = {
            id: Date.now().toString(),
            name,
            command
        };
        this.commands.push(newCommand);
        this.saveCommands();
        this.refresh();
    }
    editCommand(id, newCommand) {
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
    saveCommands() {
        this.context.globalState.update(GlobalCommandsProvider.STORAGE_KEY, this.commands);
    }
    loadCommands() {
        const saved = this.context.globalState.get(GlobalCommandsProvider.STORAGE_KEY);
        if (saved) {
            this.commands = saved;
        }
        else {
            this.commands = [];
        }
        this.refresh();
    }
}
exports.GlobalCommandsProvider = GlobalCommandsProvider;
GlobalCommandsProvider.STORAGE_KEY = 'globalCliCommands';
//# sourceMappingURL=globalCommandsProvider.js.map