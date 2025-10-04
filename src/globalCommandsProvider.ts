import * as vscode from 'vscode';

export interface CommandItem {
    id: string;
    name: string;
    command: string;
}

class CommandTreeItem extends vscode.TreeItem {
    constructor(
        public readonly commandItem: CommandItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super('', collapsibleState);
        
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

export class GlobalCommandsProvider implements vscode.TreeDataProvider<CommandTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> = new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private commands: CommandItem[] = [];
    private static readonly STORAGE_KEY = 'globalCliCommands';

    constructor(private context: vscode.ExtensionContext) {
        this.setupSync();
        this.loadCommands();
    }

    private setupSync(): void {
        this.context.globalState.setKeysForSync([GlobalCommandsProvider.STORAGE_KEY]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CommandTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommandTreeItem): Thenable<CommandTreeItem[]> {
        if (!element) {
            if (this.commands.length === 0) {
                const placeholderItem = new vscode.TreeItem('No global commands', vscode.TreeItemCollapsibleState.None);
                placeholderItem.tooltip = 'Click "+" to add global commands that sync across all devices';
                placeholderItem.iconPath = new vscode.ThemeIcon('info');
                placeholderItem.contextValue = 'placeholder';
                return Promise.resolve([placeholderItem as CommandTreeItem]);
            }
            
            return Promise.resolve(
                this.commands.map(cmd => new CommandTreeItem(cmd, vscode.TreeItemCollapsibleState.None))
            );
        }
        return Promise.resolve([]);
    }

    addCommand(name: string, command: string): void {
        const newCommand: CommandItem = {
            id: Date.now().toString(),
            name,
            command
        };
        this.commands.push(newCommand);
        this.saveCommands();
        this.refresh();
    }

    editCommand(id: string, newCommand: string): void {
        const commandIndex = this.commands.findIndex(cmd => cmd.id === id);
        if (commandIndex !== -1) {
            this.commands[commandIndex].command = newCommand;
            this.saveCommands();
            this.refresh();
        }
    }

    getCommand(id: string): CommandItem | undefined {
        return this.commands.find(cmd => cmd.id === id);
    }

    deleteCommand(id: string): void {
        this.commands = this.commands.filter(cmd => cmd.id !== id);
        this.saveCommands();
        this.refresh();
    }

    private saveCommands(): void {
        this.context.globalState.update(GlobalCommandsProvider.STORAGE_KEY, this.commands);
    }

    private loadCommands(): void {
        const saved = this.context.globalState.get<CommandItem[]>(GlobalCommandsProvider.STORAGE_KEY);
        
        if (saved) {
            this.commands = saved;
        } else {
            this.commands = [];
        }
        
        this.refresh();
    }
}