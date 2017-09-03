'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

// Status items in status bar
let statusFeedback: vscode.StatusBarItem;

// Called when your FastArduino extension is activated (i.e. when current Workspace folder contains Makefile-FastArduino.mk)
export function activate(context: vscode.ExtensionContext) {
    // Finish contruction of boards in ALLBOARDS (add links to programmers)
    initBoardsList(context);
    // Initialize defaults (target, serial, programmer...)
    rebuildBoardsAndProgrammersList();
    // auto-reload if configuration change
    vscode.workspace.onDidChangeConfiguration(rebuildBoardsAndProgrammersList);

    // Register all commands
    context.subscriptions.push(vscode.commands.registerCommand('fastarduino.setTarget', () => {
        setTarget(context);
    }));

    // Add context in the status bar
    statusFeedback = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusFeedback.text = "No Target";
    statusFeedback.tooltip = "Select FastArduino Target";
    statusFeedback.command = "fastarduino.setTarget";
    statusFeedback.show();
    
    // Register a TaskProvider to assign dynamic tasks based on context (board target, serial port, programmer...)
    context.subscriptions.push(vscode.workspace.registerTaskProvider('fastarduino', {
        provideTasks() {
            return createTasks(context);
        },
        resolveTask(task: vscode.Task) {
            return undefined;
        }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
    statusFeedback.hide();
    statusFeedback.dispose();
}

// Internal implementation
//=========================
// Internal structure holding important definitions for one board
interface Board {
    // The first part comes from fastarduino.json
    name: string; 
    config: string;
    frequencies: number[];
    programmer?: string;
    variant: string;
    mcu: string;
    arch: string;
    // The following part is calculated from settings
    programmers?: string[];
    serial?: string;
}

interface Programmer {
    name: string;
    tag: string;
    option: string;
    serials: number;
    onlyFor?: string;
}

// Internal map of all supported targets
let ALLBOARDS: { [key: string]: Board; } = {};
let ALLPROGRAMMERS: { [key: string]: Programmer; } = {};
// Altered targets list according to user settings
let allBoards: { [key: string]: Board; } = {};

// Initialize boards and porgrammers from fastarduino.json
function initBoardsList(context: vscode.ExtensionContext) {
    const configFile: string = context.asAbsolutePath("./fastarduino.json");
    let config: { boards: Board[], programmers: Programmer[] } = JSON.parse(fs.readFileSync(configFile).toString());

    ALLPROGRAMMERS = {};
    let generalProgrammers: string[] = [];
    config.programmers.forEach((programmer: Programmer) => {
        if (programmer.onlyFor === undefined) {
            generalProgrammers.push(programmer.name);
        }
        ALLPROGRAMMERS[programmer.name] = programmer;
    });

    ALLBOARDS = {};
    config.boards.forEach((board: Board) => {
        board.programmers = [];
        board.programmers.push(...generalProgrammers);
        ALLBOARDS[board.name] = board;
    });

    Object.keys(ALLPROGRAMMERS).forEach((key: string) => {
        let target: string = ALLPROGRAMMERS[key].onlyFor;
        if (target) {
            ALLBOARDS[target].programmers.push(key);
        }
    });
}

interface BoardSetting {
    board: string;
    frequencies?: number[];
    programmer?: string;
    serial?: string;
}

function rebuildBoardsAndProgrammersList() {
    let errors: string[] = [];
    const settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("fastarduino");
    const listedBoards: BoardSetting[] = settings.get("listedBoards");
    if (listedBoards.length) {
        // Then find all boards
        let boards = listedBoards   .filter((setting) => ALLBOARDS[setting.board] ? true : false)
                                    .map(formatBoardSetting);
        allBoards = {};
        boards.forEach((board: Board) => {
            if (allBoards[board.name]) {
                // Error in settings!
                errors.push(`Invalid settings! 'fastarduino.listedBoards' contains more than one entry for board '${board.name}'!`);
            } else {
                allBoards[board.name] = board;
            }
        });
    } else {
        allBoards = ALLBOARDS;
    }
    errors.forEach((error) => { vscode.window.showWarningMessage(error); });
    //TODO Handle default target
}

function formatBoardSetting(setting: BoardSetting): Board {
    // Create a new Board based on setting
    if (ALLBOARDS[setting.board]) {
        let reference: Board = ALLBOARDS[setting.board];
        let programmers: string[] = reference.programmers;
        if (setting.programmer && ALLPROGRAMMERS[setting.programmer]) {
            programmers = [setting.programmer];
        }
        return {
            name: reference.name, 
            config: reference.config, 
            frequencies: setting.frequencies !== undefined ? setting.frequencies : reference.frequencies,
            programmer: reference.programmer,
            variant: reference.variant,
            mcu: reference.mcu,
            arch: reference.arch,
            programmers: programmers,
            serial: setting.serial
        };
    }
    return null;
}

interface Target {
    board: string;
    config: string;
    programmer: string;
    serial?: string;
}

function createTasks(context: vscode.ExtensionContext): vscode.Task[] {
    // Check current directory has a Makefile
    let makefileDir: string = "";
    if (vscode.workspace.workspaceFolders && vscode.window.activeTextEditor) {
        const currentFolder: string = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const currentDocument: string = vscode.window.activeTextEditor.document.fileName;
        // Search the last directory (between folder root and current document directory) containing Makefile
        let dirs: string[] = currentDocument.split("/");
        do {
            // Remove last path part
            dirs.pop();
            let path: string = dirs.join("/");
            // Check if current path contains a Makefile
            if (fs.existsSync(path + "/Makefile")) {
                makefileDir = path;
                break;
            }
        } while (dirs.length);
        if (!makefileDir) {
            return [];
        }
    }
    //FIXME what if makefileDir is ""?
    
    // Get current target and programmer
    const target: Target = context.workspaceState.get('fastarduino.target');
    
    // Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    let command: string = `make CONF=${target.config} -C ${makefileDir} `;
    allTasks.push(createTask(command + "build", "Build", vscode.TaskGroup.Build, true));
    allTasks.push(createTask(command + "clean", "Clean", vscode.TaskGroup.Clean, false));
    
    if (target.programmer) {
        command = command + `PROGRAMMER=${target.programmer} `;
        if (target.serial) {
            command = command + `COM=${target.serial} `;
        }
        allTasks.push(createTask(command + "flash", "Upload Flash", null, false));
        allTasks.push(createTask(command + "eeprom", "Program EEPROM", null, false));
        allTasks.push(createTask(command + "fuses", "Program Fuses", null, false));
    }
    
    return allTasks;
}

interface FastArduinoTaskDefinition extends vscode.TaskDefinition {
    kind: string;
}

function createTask(command: string, label: string, group: vscode.TaskGroup | null, matcher: boolean): vscode.Task {
    // Create specific TaskDefinition
    let definition: FastArduinoTaskDefinition = {
        type: "FastArduino",
        kind: label
    };
    // Create task invoking make command in the right directory and using the right problem matcher
    let task = new vscode.Task( definition, 
                                label, 
                                "FastArduino", 
                                new vscode.ShellExecution(command), 
                                matcher ? ["$avrgcc"] : []);
    // Also set group and presentation
    if (group) {
        task.group = group;
    }
    task.presentationOptions = {
        echo: true, 
        reveal: vscode.TaskRevealKind.Always, 
        focus: false, 
        panel: vscode.TaskPanelKind.Shared};
    //TODO check what value we should set here
    // task.isBackground = true;
    return task;
}

//FIXME this function is async hence returns a Prmise (on nothing...) which gonna be rejected... => messages in debug console...
async function setTarget(context: vscode.ExtensionContext) {
    // Ask user to pick one target
    const boardSelection = await pick("Select Target Board or MCU", Object.keys(allBoards));
    const board = allBoards[boardSelection];
    let config = board.config;

    // Ask for frequency if not fixed
    let frequency: string;
    if (board.frequencies) {
        if (board.frequencies.length > 1) {
            let listFrequencies: string[] = board.frequencies.map((f: number) => f.toString() + "MHz");
            frequency = await pick("Select Target MCU Frequency", listFrequencies);
        } else {
            frequency = board.frequencies[0].toString() + "MHz";
        }
        config = config.replace("%{FREQ}", frequency);
    }

    // Ask for programmer if more than one to choose from
    const programmerSelection = await pick("Select Programmer used for Target", board.programmers);
    const programmer = ALLPROGRAMMERS[programmerSelection];

    // Ask user to pick serial port if programmer needs 1 or more
    let serial: string;
    if (programmer.serials > 0) {
        serial = await vscode.window.showInputBox({
            prompt: "Enter Serial Device:",
            value: board.serial ? board.serial : "/dev/ttyACM0",
            valueSelection: board.serial ? undefined : [8,12]
        });
    }

    let boardText = `${boardSelection} (${frequency})`;
    let programmerText = serial ? ` [${programmerSelection} (${serial})]` : ` [${programmerSelection}]`;
    statusFeedback.text = boardText + programmerText;

    // Store somewhere for use by other commands
    context.workspaceState.update('fastarduino.target', {
        board: boardSelection, 
        config: config, 
        programmer: programmer.name, 
        serial: serial
    });
}

async function pick(message: string, labels: string[]) {
    if (labels.length > 1) {
        return await vscode.window.showQuickPick(labels, { placeHolder: message });
    } else {
        return labels[0];
    }
}
