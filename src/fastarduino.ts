'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

// Internal structure holding important definitions for one board
//TODO for new Makefile, we'll need more stuff here (variant, mcu, arch, freq, default programmer...)
//TODO for frequency we need to allow a range e.g. 1-20MHz
class Board {
    constructor(public readonly label: string, 
                public readonly config: string,
                public frequency: number[],
                public programmers?: string[],
                public serial?: string) {}
}

class Programmer {
    constructor(public readonly label: string,
                public readonly tag: string,
                public serialsNeeded: number,
                public onlyFor?: string) {}
}

// Internal map of all supported targets (TODO get it from dedicated json file)
const ALLBOARDS: { [key: string]: Board; } = {
    "Arduino UNO": new Board("Arduino UNO", "UNO-Release", [16]),
    "Arduino NANO": new Board("Arduino NANO", "NANO-Release", [16]),
    "Arduino LEONARDO": new Board("Arduino LEONARDO", "LEONARDO-Release", [16]),
    "Arduino MEGA": new Board("Arduino MEGA", "MEGA-Release", [16]),
    "ATmega328": new Board("ATmega328", "ATmega328-%{FREQ}-Release", [8,16]),
    "ATtinyX4": new Board("ATtinyX4", "ATtinyX4-Release", [8])
};

const ALLPROGRAMMERS: { [key: string]: Programmer; } = {
    "UNO USB": new Programmer("UNO USB", "UNO", 1, "Arduino UNO"),
    "NANO USB": new Programmer("NANO USB", "NANO", 1, "Arduino NANO"),
    "LEONARDO USB": new Programmer("LEONARDO USB", "LEONARDO", 2, "Arduino LEONARDO"),
    "MEGA USB": new Programmer("MEGA USB", "MEGA", 1, "Arduino MEGA"),
    "ArduinoISP.cc": new Programmer("ArduinoISP.cc", "ISP", 0),
    // "ArduinoISP.org": new Programmer("ArduinoISP.org", "ISPorg", 0),
    "ISP Shield": new Programmer("ISP Shield", "SHIELD", 1)
};

let allBoards: { [key: string]: Board; } = {};
    
// TODO later add more specific stuff here?
class Target {
    constructor(public board: string,
                public config: string,
                public programmer?: string,
                public serial?: string) {}
}

// Status items in status bar
let statusFeedback: vscode.StatusBarItem;

// Called when your FastArduino extension is activated (i.e. when current Workspace folder contains Makefile-FastArduino.mk)
export function activate(context: vscode.ExtensionContext) {
    // Finish contruction of boards in ALLBOARDS (add links to programmers)
    initBoardsList();
    // Initialize defaults (target, serial, programmer...)
    rebuildBoardsAndProgrammersList();
    // auto-reload if configuration change
    vscode.workspace.onDidChangeConfiguration(rebuildBoardsAndProgrammersList);

    // Register all commands
    context.subscriptions.push(vscode.commands.registerCommand('fastarduino.setTarget', () => {
        setTarget(context);
    }));

    // Add context in the status bar
    statusFeedback = createStatus("No Target", "Select FastArduino Target", "fastarduino.setTarget", 1);
    // programmerStatus = createStatus("No Programmer", "Select FastArduino Programmer", "fastarduino.setProgrammer", 0);
    
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
    disposeStatus(statusFeedback);
    // disposeStatus(programmerStatus);
}

// Internal implementation
//=========================
// Add all possible programmers to each board in ALLBOARDS
function initBoardsList() {
    // First list general programmers
    let generalProgrammers: string[] = [];
    for (let key in ALLPROGRAMMERS) {
        if (ALLPROGRAMMERS[key].onlyFor === undefined) {
            generalProgrammers.push(key);
        }
    }
    for (let key in ALLBOARDS) {
        ALLBOARDS[key].programmers = [];
        ALLBOARDS[key].programmers.push(...generalProgrammers);
    }
    for (let key in ALLPROGRAMMERS) {
        let target: string = ALLPROGRAMMERS[key].onlyFor;
        if (target) {
            ALLBOARDS[target].programmers.push(key);
        }
    }
}

interface BoardSetting {
    board: string;
    frequency?: number[];
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
            if (allBoards[board.label]) {
                // Error in settings!
                errors.push(`Invalid settings! 'fastarduino.listedBoards' contains more than one entry for board '${board.label}'!`);
            } else {
                allBoards[board.label] = board;
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
        return new Board(   reference.label, 
                            reference.config, 
                            setting.frequency !== undefined ? setting.frequency : reference.frequency,
                            programmers,
                            setting.serial);
    }
    return null;
}

function createStatus(text: string, tooltip: string, command: string, priority: number): vscode.StatusBarItem {
    let status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    status.text = text;
    status.tooltip = tooltip;
    status.command = command;
    status.show();
    return status;
}

function disposeStatus(status: vscode.StatusBarItem) {
    status.hide();
    status.dispose();
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
    
    // Get current target and programmer
    const target: Target = context.workspaceState.get('fastarduino.target');
    // const programmer: TargetProgrammer = context.workspaceState.get('fastarduino.programmer');
    
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
    task.presentationOptions = {echo: true, reveal: vscode.TaskRevealKind.Always, focus: false, panel: vscode.TaskPanelKind.Shared};
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
    if (board.frequency) {
        if (board.frequency.length > 1) {
            let listFrequencies: string[] = board.frequency.map((f: number) => f.toString() + "MHz");
            frequency = await pick("Select Target MCU Frequency", listFrequencies);
        } else {
            frequency = board.frequency[0].toString() + "MHz";
        }
        //TODO improve setup of config to ensure frequency is added at the right place i.e. inside config string...
        config = config.replace("%{FREQ}", frequency);
    }

    // Ask for programmer if more than one to choose from
    const programmerSelection = await pick("Select Programmer used for Target", board.programmers);
    const programmer = ALLPROGRAMMERS[programmerSelection];

    // Ask user to pick serial port if programmer needs 1 or more
    let serial: string;
    if (programmer.serialsNeeded > 0) {
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
    context.workspaceState.update('fastarduino.target', new Target(boardSelection, config, programmer.label, serial));
}

async function pick(message: string, labels: string[]) {
    if (labels.length > 1) {
        return await vscode.window.showQuickPick(labels, { placeHolder: message });
    } else {
        return labels[0];
    }
}
