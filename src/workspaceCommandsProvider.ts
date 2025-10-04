import * as vscode from 'vscode';
import * as path from 'path';

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

export class WorkspaceCommandsProvider implements vscode.TreeDataProvider<CommandTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> = new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private commands: CommandItem[] = [];
    private currentWorkspaceFolder: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.loadCommands();
        
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.loadCommands();
        });
        
        vscode.window.onDidChangeActiveTextEditor(() => {
            const newWorkspaceFolder = this.getCurrentWorkspaceFolder();
            if (newWorkspaceFolder !== this.currentWorkspaceFolder) {
                this.currentWorkspaceFolder = newWorkspaceFolder;
                this.loadCommands();
            }
        });
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
                const workspaceFolder = this.getCurrentWorkspaceFolder();
                const message = workspaceFolder 
                    ? 'No commands for this workspace' 
                    : 'No workspace opened';
                const tooltip = workspaceFolder 
                    ? 'Click "+" to add workspace-specific commands'
                    : 'Open a folder/workspace to add workspace-specific commands';
                
                const placeholderItem = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
                placeholderItem.tooltip = tooltip;
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
        const workspaceFolder = this.getCurrentWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('Please open a workspace folder to add workspace-specific commands.');
            return;
        }

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

    private getCurrentWorkspaceFolder(): string | undefined {
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

    private getStorageKey(): string {
        const workspaceFolder = this.getCurrentWorkspaceFolder();
        if (!workspaceFolder) {
            return 'workspaceCliCommands_global';
        }
        
        const folderName = path.basename(workspaceFolder);
        const folderHash = this.hashString(workspaceFolder);
        return `workspaceCliCommands_${folderName}_${folderHash}`;
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    private saveCommands(): void {
        const storageKey = this.getStorageKey();
        this.context.globalState.update(storageKey, this.commands);
    }

    private loadCommands(): void {
        const storageKey = this.getStorageKey();
        const saved = this.context.globalState.get<CommandItem[]>(storageKey);
        
        if (saved) {
            this.commands = saved;
        } else {
            this.commands = [];
        }
        
        this.currentWorkspaceFolder = this.getCurrentWorkspaceFolder();
        this.refresh();
    }
}