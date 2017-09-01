'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

// Internal structure holding important definitions for one board
//TODO for new Makefile, we'll need more stuff here (variant, mcu, arch, freq, default programmer...)
//TODO for frequency we need to allow a range e.g. 1-20MHz
class Board {
    constructor(public readonly label: string, public readonly config: string, public readonly frequency: number[]) {}
}

class Programmer {
    constructor(public readonly label: string, public readonly tag: string, public readonly serials: number, public readonly onlyFor?: string) {}
}

// Internal map of all supported targets
const allBoards: { [key: string]: Board; } = {
    "Arduino UNO": new Board("Arduino UNO", "UNO-Release", [16]),
    "Arduino NANO": new Board("Arduino NANO", "NANO-Release", [16]),
    "Arduino LEONARDO": new Board("Arduino LEONARDO", "LEONARDO-Release", [16]),
    "Arduino MEGA": new Board("Arduino MEGA", "MEGA-Release", [16]),
    "ATmega328": new Board("ATmega328", "ATmega328-%{FREQ}-Release", [8,16]),
    "ATtinyX4": new Board("ATtinyX4", "ATtinyX4-Release", [8])
};

const allProgrammers: { [key: string]: Programmer; } = {
    "UNO USB": new Programmer("UNO USB", "UNO", 1, "Arduino UNO"),
    "NANO USB": new Programmer("NANO USB", "NANO", 1, "Arduino NANO"),
    "LEONARDO USB": new Programmer("LEONARDO USB", "LEONARDO", 2, "Arduino LEONARDO"),
    "MEGA USB": new Programmer("MEGA USB", "MEGA", 1, "Arduino MEGA"),
    "ArduinoISP.cc": new Programmer("ArduinoISP.cc", "ISP", 0),
    // "ArduinoISP.org": new Programmer("ArduinoISP.org", "ISPorg", 0),
    "ISP Shield": new Programmer("ISP Shield", "SHIELD", 1)
};

// TODO later add more specific stuff here?
class TargetBoard {
    constructor(public readonly label: string, public readonly config: string) {}
}

// TODO later add more specific stuff here?
class TargetProgrammer {
    constructor(public readonly tag: string, public readonly serials: string[]) {}
}

// Status items in status bar
let boardStatus: vscode.StatusBarItem;
let programmerStatus: vscode.StatusBarItem;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    //TODO initialize defaults (target, serial, programmer...)
    //TODO use user-defined workspace settings for defaults?

    // Register all commands
    context.subscriptions.push(vscode.commands.registerCommand('fastarduino.setBoard', () => {
        setBoard(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('fastarduino.setProgrammer', () => {
        setProgrammer(context);
    }));

    // Add context in the status bar
    boardStatus = createStatus("No Board", "Select FastArduino Target Board", "fastarduino.setBoard", 1);
    programmerStatus = createStatus("No Programmer", "Select FastArduino Programmer", "fastarduino.setProgrammer", 0);
    
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
    disposeStatus(boardStatus);
    disposeStatus(programmerStatus);
}

// Internal implementation
//=========================
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
    const target: TargetBoard = context.workspaceState.get('fastarduino.target');
    const programmer: TargetProgrammer = context.workspaceState.get('fastarduino.programmer');
    
    // Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    let command: string = `make CONF=${target.config} -C ${makefileDir} `;
    allTasks.push(createTask(command + "build", "Build", vscode.TaskGroup.Build, true));
    allTasks.push(createTask(command + "clean", "Clean", vscode.TaskGroup.Clean, false));
    
    if (programmer) {
        command = command + `PROGRAMMER=${programmer.tag} `;
        if (programmer.serials) {
            command = command + `COM=${programmer.serials[0]} `;
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

async function setBoard(context: vscode.ExtensionContext) {
    // Ask user to pick one target
    const boardSelection = await vscode.window.showQuickPick(Object.keys(allBoards), { placeHolder: "Select Target Board or MCU" });
    const board = allBoards[boardSelection];
    let config = board.config;
    // Ask for frequency if not fixed
    let frequency: string;
    if (board.frequency.length > 1) {
        let listFrequencies: string[] = board.frequency.map<string>((f: number) => { return f.toString() + "MHz"});
        frequency = await vscode.window.showQuickPick(listFrequencies, { placeHolder: "Select Target MCU Frequency" });
        vscode.window.showInformationMessage(frequency);
        //TODO improve setup of config to ensure frequency is added at the right place i.e. inside config string...
        config = config.replace("%{FREQ}", frequency);
    }
    // Store somewhere for use by other commands
    context.workspaceState.update('fastarduino.target', new TargetBoard(boardSelection, config));
    if (frequency) {
        boardStatus.text = boardSelection + " (" + frequency + ")";
    } else {
        boardStatus.text = boardSelection;
    }
}

async function setProgrammer(context: vscode.ExtensionContext) {
    // Search list of available programmers for current board (empty if no board selected)
    const target: TargetBoard = context.workspaceState.get('fastarduino.target');
    if (target) {
        let programmers: string[] = [];
        for (var key in allProgrammers) {
            let onlyFor = allProgrammers[key].onlyFor;
            if (onlyFor === undefined || onlyFor === target.label) {
                programmers.push(key);
            }
        }
        // Ask user to pick programmer
        const programmerSelection = await vscode.window.showQuickPick(programmers, { placeHolder: "Select Programmer used for Target" });
        const programmer = allProgrammers[programmerSelection];
        // Ask user to pick serial port if programmer needs 1 or more
        let serial: string;
        if (programmer.serials > 0) {
            serial = await vscode.window.showInputBox({
                prompt: "Enter Serial Device:",
                value: "/dev/ttyACM0",
                valueSelection: [8,12]
            });
        }
        context.workspaceState.update('fastarduino.programmer', new TargetProgrammer(programmer.tag, serial ? [serial] : []));
        if (serial) {
            programmerStatus.text = programmer.label + " (" + serial + ")";
        } else {
            programmerStatus.text = programmer.label;
        }
    } else {
        vscode.window.showWarningMessage("No Target selected! First Select a Target Board or MCU!");
    }
}
