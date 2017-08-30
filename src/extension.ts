'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

// Internal structure holding important definitions for one board
//TODO for new Makefile, we'll need more stuuf here (variant, mcu, arch, freq, default programmer...)
//TODO for frequency we need to allow a range e.g. 1-20MHz
class Board {
    constructor(public readonly label: string, public readonly config: string, public readonly frequency: number[]) {}
}

// TODO later add more specific stuff here?
class Target {
    constructor(public readonly config: string) {}
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

// Status items in status bar
let boardStatus: vscode.StatusBarItem;
let frequencyStatus: vscode.StatusBarItem;
let portStatus: vscode.StatusBarItem;
let programmerStatus: vscode.StatusBarItem;

//TODO need additional commands for EEPROM & fuses upload (fuses must be defined in workspace settings)
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    //TODO initialize defaults (target, serial, programmer...)
    //TODO use user-defined workspace settings for defaults?

    // Register all commands
    context.subscriptions.push(vscode.commands.registerCommand('extension.setBoard', () => {
        setBoard(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.setSerial', () => {
        // TODO
        vscode.window.showInformationMessage('Set serial');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.setProgrammer', () => {
        // TODO
        vscode.window.showInformationMessage('Set programmer');
    }));

    //TODO improve context status display with several items (board, frequency, port, programmer)
    // Add context in the status bar
    boardStatus = createStatus("No board", "FastArduino target board", "extension.setBoard");
    frequencyStatus = createStatus("-", "FastArduino target frequency", null);
    portStatus = createStatus("No serial port", "FastArduino serial port", "extension.setSerial");
    programmerStatus = createStatus("No programmer", "FastArduino programmer", "extension.setProgrammer");
    
    // Register a TaskProvider to assign dynamic tasks based on context (board target, serial port, programmer...)
    context.subscriptions.push(vscode.workspace.registerTaskProvider('make', {
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
    disposeStatus(frequencyStatus);
    disposeStatus(portStatus);
    disposeStatus(programmerStatus);
}

// Internal implementation
//=========================
function createStatus(text: string, tooltip: string, command: string): vscode.StatusBarItem {
    let status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
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

async function createTasks(context: vscode.ExtensionContext): Promise<vscode.Task[]> {
    // Check current directory has a Makefile
    let makefileDir: string = "";
    if (vscode.workspace.workspaceFolders && vscode.window.activeTextEditor) {
        const currentFolder: string = vscode.workspace.workspaceFolders[0].uri.fsPath;
        // vscode.window.showInformationMessage('Current folder path: ' + currentFolder);
        const currentDocument: string = vscode.window.activeTextEditor.document.fileName;
        // vscode.window.showInformationMessage('Current open document path: ' + currentDocument);
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
    
    //TODO Get current target, serial...
    const target: Target = context.workspaceState.get('fastarduino.target');
    
    //TODO Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    let command: string = `make CONF=${target.config} -C ${makefileDir} `;

    allTasks.push(createTask(command + "build", "build", vscode.TaskGroup.Build, true));

    return allTasks;
}

function createTask(command: string, label: string, group: vscode.TaskGroup | null, matcher: boolean): vscode.Task {
    // Create task invoking make command in the right directory and using the right problem matcher
    let task = new vscode.Task( { type: "fastarduino" }, 
                                "FastArduino: " + label, 
                                "fastarduino", 
                                //TODO set CWD properly
                                new vscode.ShellExecution(command, { cwd: "" }), 
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
    const boardSelection = await vscode.window.showQuickPick(Object.keys(allBoards), { placeHolder: "Select target board or MCU" });
    const board = allBoards[boardSelection];
    let config = board.config;
    // Ask for frequency if not fixed
    if (board.frequency.length > 1) {
        let listFrequencies: string[] = board.frequency.map<string>((f: number) => { return f.toString() + "MHz"});
        const frequencySelection = await vscode.window.showQuickPick(listFrequencies, { placeHolder: "Select target MCU frequency" });
        vscode.window.showInformationMessage(frequencySelection);
        //TODO improve setup of config to ensure frequency is added at the right palce i.e. inside config string...
        config = config.replace("%{FREQ}", frequencySelection);
    }
    vscode.window.showInformationMessage(config);
    //TODO Store somewhere for use by other commands
    context.workspaceState.update('fastarduino.target', new Target(config));
    boardStatus.text = boardSelection;
}
