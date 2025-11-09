import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { GlobalCommandsProvider } from "./globalCommandsProvider";
import { WorkspaceCommandsProvider } from "./workspaceCommandsProvider";

type TerminalBehavior = "reuse" | "alwaysNew" | "reuseActive";

function getProjectFolder(): string {
    const config = vscode.workspace.getConfiguration("cliCommandButtons");
    const customFolder = config.get<string>("defaultProjectFolder");

    if (customFolder && customFolder.trim()) {
        const folder = customFolder.trim();
        if (folder.startsWith("~")) {
            return path.join(os.homedir(), folder.substring(1));
        }
        return path.resolve(folder);
    }

    return path.join(os.homedir(), "Downloads");
}

const COMMAND_LANGUAGE_ID = "shellscript";

function sanitizeForFileName(value: string): string {
    const fallback = "command";
    const sanitized = value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
    return (sanitized || fallback).slice(0, 100);
}

const isFileNotFoundError = (error: unknown): boolean =>
    error instanceof vscode.FileSystemError && error.code === "FileNotFound";

async function promptForCommandName(options: {
    title: string;
    placeHolder: string;
    validate: (value: string) => string | null;
}): Promise<string | undefined> {
    // Use a QuickPick so users can type a fresh name and confirm with Enter.
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = options.title;
    quickPick.placeholder = options.placeHolder;
    quickPick.ignoreFocusOut = true;
    quickPick.items = [];

    return await new Promise((resolve) => {
        const dispose = () => {
            quickPick.dispose();
        };

        quickPick.onDidAccept(() => {
            const candidate = quickPick.value.trim();
            const validationMessage = options.validate(candidate);
            if (validationMessage) {
                void vscode.window.showWarningMessage(validationMessage);
                return;
            }
            resolve(candidate);
            quickPick.hide();
        });

        quickPick.onDidHide(() => {
            resolve(undefined);
            dispose();
        });

        quickPick.show();
    });
}

async function openCommandEditor(
    context: vscode.ExtensionContext,
    options: {
        initialContent: string;
        filePrefix: string;
        onFinalize: (finalCommand: string) => Promise<void> | void;
    },
): Promise<void> {
    // Mirror the edit flow by writing to a temp file and reacting when the tab closes.
    let tempFileUriForCleanup: vscode.Uri | undefined;

    const deleteTempFile = async () => {
        if (!tempFileUriForCleanup) {
            return;
        }

        try {
            await vscode.workspace.fs.delete(tempFileUriForCleanup);
        } catch (error) {
            if (!isFileNotFoundError(error)) {
                vscode.window.showErrorMessage(
                    `Failed to remove temporary file: ${String(error)}`,
                );
            }
        } finally {
            tempFileUriForCleanup = undefined;
        }
    };

    try {
        const storageDir = context.globalStorageUri.fsPath;
        await fs.promises.mkdir(storageDir, { recursive: true });

        const tempFilePath = path.join(
            storageDir,
            `${options.filePrefix}-${Date.now()}.sh`,
        );
        await fs.promises.writeFile(
            tempFilePath,
            options.initialContent,
            "utf8",
        );

        const tempFileUri = vscode.Uri.file(tempFilePath);
        tempFileUriForCleanup = tempFileUri;

        let tempDoc = await vscode.workspace.openTextDocument(tempFileUri);
        await vscode.window.showTextDocument(tempDoc, {
            preview: false,
            viewColumn: vscode.ViewColumn.Active,
        });
        tempDoc = await vscode.languages.setTextDocumentLanguage(
            tempDoc,
            COMMAND_LANGUAGE_ID,
        );

        let latestCommand = tempDoc.getText();
        let hasFinalized = false;

        const isTempDocument = (uri: vscode.Uri) =>
            uri.toString() === tempDoc.uri.toString();

        const matchesTempTab = (tab: vscode.Tab): boolean => {
            const input = tab.input;
            if (!input) {
                return false;
            }

            if (input instanceof vscode.TabInputText) {
                return input.uri.toString() === tempDoc.uri.toString();
            }

            if (input instanceof vscode.TabInputTextDiff) {
                return (
                    input.original.toString() === tempDoc.uri.toString() ||
                    input.modified.toString() === tempDoc.uri.toString()
                );
            }

            return false;
        };

        const updateLatestFromDocument = (document: vscode.TextDocument) => {
            if (document.uri.toString() === tempDoc.uri.toString()) {
                latestCommand = document.getText();
            }
        };

        let changeDisposable: vscode.Disposable | undefined;
        let visibleEditorsDisposable: vscode.Disposable | undefined;
        let closeDisposable: vscode.Disposable | undefined;

        const finalize = async () => {
            if (hasFinalized) {
                return;
            }
            hasFinalized = true;

            try {
                await options.onFinalize(latestCommand.trim());
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to save command: ${String(error)}`,
                );
            } finally {
                changeDisposable?.dispose();
                visibleEditorsDisposable?.dispose();
                closeDisposable?.dispose();
                await deleteTempFile();
            }
        };

        changeDisposable = vscode.workspace.onDidChangeTextDocument(
            (event) => {
                updateLatestFromDocument(event.document);
            },
        );

        visibleEditorsDisposable =
            vscode.window.onDidChangeVisibleTextEditors(() => {
                const tempTabOpen = vscode.window.tabGroups.all.some((group) =>
                    group.tabs.some((tab) => matchesTempTab(tab))
                );

                if (!tempTabOpen) {
                    void finalize();
                }
            });

        closeDisposable = vscode.workspace.onDidCloseTextDocument(
            async (closedDoc) => {
                if (isTempDocument(closedDoc.uri)) {
                    await finalize();
                }
            },
        );

        context.subscriptions.push(
            changeDisposable,
            visibleEditorsDisposable,
            closeDisposable,
        );
    } catch (error) {
        await deleteTempFile();
        vscode.window.showErrorMessage(
            `Failed to open editor: ${String(error)}`,
        );
    }
}

export function activate(context: vscode.ExtensionContext) {
    const globalProvider = new GlobalCommandsProvider(context);
    const workspaceProvider = new WorkspaceCommandsProvider(context);

    vscode.window.registerTreeDataProvider(
        "globalCommandsView",
        globalProvider,
    );
    vscode.window.registerTreeDataProvider(
        "workspaceCommandsView",
        workspaceProvider,
    );

    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        1000,
    );

    function updateStatusBarItem() {
        const projectFolder = getProjectFolder();
        const folderName = path.basename(projectFolder);
        statusBarItem.text = `$(folder-opened) ${folderName}`;
        statusBarItem.tooltip = `Open Projects in ${projectFolder}`;
        statusBarItem.command = "cli-command-buttons.openDownloadsFolder";
    }

    updateStatusBarItem();
    statusBarItem.show();

    const configurationChangeListener = vscode.workspace
        .onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration("cliCommandButtons.defaultProjectFolder")
            ) {
                updateStatusBarItem();
            }
        });

    const openDownloadsFolderCommand = vscode.commands.registerCommand(
        "cli-command-buttons.openDownloadsFolder",
        async () => {
            const projectsPath = getProjectFolder();

            try {
                if (!fs.existsSync(projectsPath)) {
                    const create = await vscode.window.showWarningMessage(
                        `Project folder "${projectsPath}" does not exist. Would you like to create it?`,
                        "Create",
                        "Cancel",
                    );
                    if (create === "Create") {
                        fs.mkdirSync(projectsPath, { recursive: true });
                    } else {
                        return;
                    }
                }

                const items = fs.readdirSync(projectsPath, {
                    withFileTypes: true,
                });
                const subfolders = items
                    .filter((item) => item.isDirectory())
                    .map((item) => ({
                        label: item.name,
                        path: path.join(projectsPath, item.name),
                        description: path.join(projectsPath, item.name),
                    }));

                const quickPickItems = [
                    {
                        label: "$(add) Create a new project",
                        description: "Create a new project folder",
                        path: "CREATE_NEW",
                    },
                    {
                        label: "$(trash) Delete a project",
                        description: "Delete an existing project folder",
                        path: "DELETE_PROJECT",
                    },
                    {
                        label: `$(folder) ${path.basename(projectsPath)}`,
                        description: projectsPath,
                        path: projectsPath,
                    },
                    ...subfolders.map((folder) => ({
                        label: `$(folder) ${folder.label}`,
                        description: folder.path,
                        path: folder.path,
                    })),
                ];

                const selectedFolder = await vscode.window.showQuickPick(
                    quickPickItems,
                    {
                        placeHolder:
                            "Select a folder to open or create a new project",
                        matchOnDescription: true,
                    },
                );

                if (selectedFolder) {
                    if (selectedFolder.path === "CREATE_NEW") {
                        const projectName = await vscode.window.showInputBox({
                            prompt: "Enter project name",
                            placeHolder: "my-new-project",
                            validateInput: (value) => {
                                if (!value.trim()) {
                                    return "Project name cannot be empty";
                                }
                                if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
                                    return "Project name can only contain letters, numbers, hyphens, and underscores";
                                }
                                const projectPath = path.join(
                                    projectsPath,
                                    value.trim(),
                                );
                                if (fs.existsSync(projectPath)) {
                                    return "A folder with this name already exists";
                                }
                                return null;
                            },
                        });

                        if (projectName) {
                            const projectPath = path.join(
                                projectsPath,
                                projectName.trim(),
                            );
                            try {
                                fs.mkdirSync(projectPath, { recursive: true });
                                vscode.window.showInformationMessage(
                                    `Created project: ${projectName}`,
                                );
                                const folderUri = vscode.Uri.file(projectPath);
                                await vscode.commands.executeCommand(
                                    "vscode.openFolder",
                                    folderUri,
                                    false,
                                );
                            } catch (error) {
                                vscode.window.showErrorMessage(
                                    `Failed to create project: ${error}`,
                                );
                            }
                        }
                    } else if (selectedFolder.path === "DELETE_PROJECT") {
                        if (subfolders.length === 0) {
                            vscode.window.showInformationMessage(
                                "No projects found to delete.",
                            );
                            return;
                        }

                        const projectToDelete = await vscode.window.showQuickPick(
                            subfolders.map((folder) => ({
                                label: `$(folder) ${folder.label}`,
                                description: folder.path,
                                path: folder.path,
                            })),
                            {
                                placeHolder: "Select a project to delete",
                                matchOnDescription: true,
                            },
                        );

                        if (projectToDelete) {
                            try {
                                fs.rmSync(projectToDelete.path, {
                                    recursive: true,
                                    force: true,
                                });
                                vscode.window.showInformationMessage(
                                    `Deleted project: ${path.basename(projectToDelete.path)}`,
                                );
                            } catch (error) {
                                vscode.window.showErrorMessage(
                                    `Failed to delete project: ${error}`,
                                );
                            }
                        }
                    } else {
                        const folderUri = vscode.Uri.file(selectedFolder.path);
                        await vscode.commands.executeCommand(
                            "vscode.openFolder",
                            folderUri,
                            false,
                        );
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error reading project directory: ${error}`,
                );
            }
        },
    );

    const addGlobalCommandCommand = vscode.commands.registerCommand(
        "cli-command-buttons.addGlobalCommand",
        async () => {
            const name = await promptForCommandName({
                title: "New Global CLI Command",
                placeHolder: "Type a name and press Enter",
                validate: (value) => {
                    if (!value.trim()) {
                        return "Command name cannot be empty";
                    }
                    return null;
                },
            });

            if (!name) {
                return;
            }

            const trimmedName = name.trim();

            await openCommandEditor(context, {
                initialContent: "",
                filePrefix: `command-create-global-${sanitizeForFileName(trimmedName)}`,
                onFinalize: (finalCommand) => {
                    if (!finalCommand) {
                        vscode.window.showWarningMessage(
                            "Command cannot be empty. The command was not created.",
                        );
                        return;
                    }

                    globalProvider.addCommand(trimmedName, finalCommand);
                },
            });
        },
    );

    const addWorkspaceCommandCommand = vscode.commands.registerCommand(
        "cli-command-buttons.addWorkspaceCommand",
        async () => {
            if (
                !vscode.workspace.workspaceFolders ||
                vscode.workspace.workspaceFolders.length === 0
            ) {
                vscode.window.showWarningMessage(
                    "Please open a workspace folder to add workspace-specific commands.",
                );
                return;
            }

            const name = await promptForCommandName({
                title: "New Workspace CLI Command",
                placeHolder: "Type a name and press Enter",
                validate: (value) => {
                    if (!value.trim()) {
                        return "Command name cannot be empty";
                    }
                    return null;
                },
            });

            if (!name) {
                return;
            }

            const trimmedName = name.trim();

            await openCommandEditor(context, {
                initialContent: "",
                filePrefix: `command-create-workspace-${sanitizeForFileName(trimmedName)}`,
                onFinalize: (finalCommand) => {
                    if (!finalCommand) {
                        vscode.window.showWarningMessage(
                            "Command cannot be empty. The command was not created.",
                        );
                        return;
                    }

                    workspaceProvider.addCommand(trimmedName, finalCommand);
                },
            });
        },
    );

    const editCommandCommand = vscode.commands.registerCommand(
        "cli-command-buttons.editCommand",
        async (item: any) => {
            let currentCommand = globalProvider.getCommand(item.id);
            let isGlobal = true;

            if (!currentCommand) {
                currentCommand = workspaceProvider.getCommand(item.id);
                isGlobal = false;
            }

            if (!currentCommand) {
                return;
            }

            const commandId = item.id;
            const commandName = currentCommand.name;
            const isGlobalCommand = isGlobal;

            await openCommandEditor(context, {
                initialContent: currentCommand.command,
                filePrefix: `command-edit-${sanitizeForFileName(commandName)}-${commandId}`,
                onFinalize: (finalCommand) => {
                    if (!finalCommand) {
                        vscode.window.showWarningMessage(
                            "Command cannot be empty. No changes were made.",
                        );
                        return;
                    }

                    if (isGlobalCommand) {
                        globalProvider.editCommand(commandId, finalCommand);
                    } else {
                        workspaceProvider.editCommand(commandId, finalCommand);
                    }
                },
            });
        },
    );
    const executeCommand = vscode.commands.registerCommand(
        "cli-command-buttons.executeCommand",
        async (commandText: string, commandName: string) => {
            const terminal = await getOrCreateTerminal(commandName);
            const workspaceFolder = getCurrentWorkspaceFolder();
            if (workspaceFolder) {
                terminal.sendText(`cd "${workspaceFolder}"`);
            }
            terminal.show();
            setTimeout(() => {
                terminal.sendText(commandText);
            }, 200);
        },
    );
    const deleteCommand = vscode.commands.registerCommand(
        "cli-command-buttons.deleteCommand",
        (item: any) => {
            let commandFound = false;
            if (globalProvider.getCommand(item.id)) {
                globalProvider.deleteCommand(item.id);
                commandFound = true;
            } else if (workspaceProvider.getCommand(item.id)) {
                workspaceProvider.deleteCommand(item.id);
                commandFound = true;
            }
        },
    );

    const refreshCommand = vscode.commands.registerCommand(
        "cli-command-buttons.refresh",
        () => {
            globalProvider.refresh();
            workspaceProvider.refresh();
        },
    );

    const createNewProjectCommand = vscode.commands.registerCommand(
        "cli-command-buttons.createNewProject",
        async () => {
            const projectsPath = getProjectFolder();

            if (!fs.existsSync(projectsPath)) {
                const create = await vscode.window.showWarningMessage(
                    `Project folder "${projectsPath}" does not exist. Would you like to create it?`,
                    "Create",
                    "Cancel",
                );
                if (create === "Create") {
                    fs.mkdirSync(projectsPath, { recursive: true });
                } else {
                    return;
                }
            }

            const projectName = await vscode.window.showInputBox({
                prompt: "Enter project name",
                placeHolder: "my-new-project",
                validateInput: (value) => {
                    if (!value.trim()) {
                        return "Project name cannot be empty";
                    }
                    if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
                        return "Project name can only contain letters, numbers, hyphens, and underscores";
                    }
                    const projectPath = path.join(projectsPath, value.trim());
                    if (fs.existsSync(projectPath)) {
                        return "A folder with this name already exists";
                    }
                    return null;
                },
            });

            if (projectName) {
                const projectPath = path.join(projectsPath, projectName.trim());
                try {
                    fs.mkdirSync(projectPath, { recursive: true });
                    vscode.window.showInformationMessage(
                        `Created project: ${projectName}`,
                    );
                    const folderUri = vscode.Uri.file(projectPath);
                    await vscode.commands.executeCommand(
                        "vscode.openFolder",
                        folderUri,
                        false,
                    );
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to create project: ${error}`,
                    );
                }
            }
        },
    );

    context.subscriptions.push(
        statusBarItem,
        configurationChangeListener,
        openDownloadsFolderCommand,
        addGlobalCommandCommand,
        addWorkspaceCommandCommand,
        editCommandCommand,
        executeCommand,
        deleteCommand,
        refreshCommand,
        createNewProjectCommand,
    );
}

function getCurrentWorkspaceFolder(): string | undefined {
    if (vscode.window.activeTextEditor) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
            vscode.window.activeTextEditor.document.uri,
        );
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }
    }
    if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
    ) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return undefined;
}

async function getOrCreateTerminal(
    commandName: string,
): Promise<vscode.Terminal> {
    const config = vscode.workspace.getConfiguration("cliCommandButtons");
    const terminalBehavior = config.get<TerminalBehavior>("terminalBehavior") ||
        "reuse";
    const terminals = vscode.window.terminals;
    switch (terminalBehavior) {
        case "alwaysNew":
            return vscode.window.createTerminal(`CLI: ${commandName}`);
        case "reuseActive":
            const activeTerminal = vscode.window.activeTerminal;
            if (activeTerminal && isTerminalIdle(activeTerminal)) {
                return activeTerminal;
            }
            return vscode.window.createTerminal(`CLI: ${commandName}`);
        case "reuse":
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
