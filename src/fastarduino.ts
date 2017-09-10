'use strict';

//TODO handle default target
//TODO improve feedback of status bar item: tag name + tooltip?
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';

// Status items in status bar
let statusFeedback: vscode.StatusBarItem;

// Called when your FastArduino extension is activated (i.e. when current Workspace folder contains a .fastarduino marker file)
export function activate(context: vscode.ExtensionContext) {
    // Add context in the status bar
    statusFeedback = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusFeedback.text = "No Target";
    statusFeedback.tooltip = "Select FastArduino Target";
    statusFeedback.command = "fastarduino.setTarget";
    statusFeedback.show();
    
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
    option: string;
    serials: number;
    canProgramEEPROM: boolean,
    canProgramFuses: boolean,
    onlyFor?: string;
}

// Internal map of all supported targets
let ALLBOARDS: { [key: string]: Board; } = {};
let ALLPROGRAMMERS: { [key: string]: Programmer; } = {};
// Targets list according to user settings
let allTargets: { [key: string]: TargetSetting; } = {};
// Type of project
let projectType: string;

// Initialize boards and programmers from fastarduino.json (only ocne at activation time)
function initBoardsList(context: vscode.ExtensionContext) {
    const configFile: string = context.asAbsolutePath("./fastarduino.json");
    const config: { boards: Board[], programmers: Programmer[] } = JSON.parse(fs.readFileSync(configFile).toString());

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
        const target: string = ALLPROGRAMMERS[key].onlyFor;
        if (target) {
            ALLBOARDS[target].programmers.push(key);
        }
    });
}

// Maps to user settings of board/programmers used by current project
interface GeneralSetting {
    projectType?: string;
    defaultTarget: string;
}

interface TargetSetting {
    board: string;
    frequency?: number;
    programmer: string;
    serial?: string;
}

// Rebuild list of boards and programmers used for current project (called whenever project configuration change)
function rebuildBoardsAndProgrammersList() {
    let errors: string[] = [];
    const settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("fastarduino");
    const general: GeneralSetting = settings.get("general");
    const targets: { [tag: string]: TargetSetting } = settings.get("targets");
    allTargets = {};
    // Then find all boards
    Object.keys(targets).forEach((key: string) => {
        const setting: TargetSetting = targets[key];
        // Check setting is correct
        if (!ALLBOARDS[setting.board]) {
            // Check board exists
            errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': board '${setting.board}' does not exist!`);
        } else if (!ALLPROGRAMMERS[setting.programmer]) {
            // Check programmer exist
            errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': programmer '${setting.programmer}' does not exist!`);
        } else if (ALLBOARDS[setting.board].programmers.indexOf(setting.programmer) == -1) {
            // Check programmer is allowed for board
            errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': programmer '${setting.programmer}' not available for board '${setting.board}'!`);
        } else if (setting.frequency && ALLBOARDS[setting.board].frequencies.indexOf(setting.frequency) == -1) {
            // Check frequency is allowed for board
            errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': frequency '${setting.frequency}' is not allowed for board '${setting.board}'!`);
        } else if (!setting.frequency && ALLBOARDS[setting.board].frequencies.length > 1) {
            // Check frequency is allowed for board
            errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': missing frequency '${setting.frequency}' for board '${setting.board}'!`);
        } else {
            // No error: add this to the validated list of targets
            // First calculate frequency for target (if not specified)
            let frequency: number = setting.frequency || ALLBOARDS[setting.board].frequencies[0];
            allTargets[key] = {
                board: setting.board,
                frequency,
                programmer: setting.programmer,
                serial: setting.serial
            };
        }
    });
    // Then check default target
    if (!allTargets[general.defaultTarget]) {
        errors.push(`Invalid 'fastarduino.general' setting for 'defaultTarget': there is no defined target named '${general.defaultTarget}'!`);
    } else {
        //TODO Check current target is still available, if not replace it!
        //TODO Handle default target
        // statusFeedback.text = "No Target";
    }
    projectType = general.projectType;
    errors.forEach((error) => { vscode.window.showWarningMessage(error); });
}

// Current target as selected by user
interface Target {
    tag: string;
    board: string;
    frequency: string;
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
            const path: string = dirs.join("/");
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
    const board: Board = ALLBOARDS[target.board];
    
    // Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    // let command: string = `make CONF=${target.config} -C ${makefileDir} `;
    let command: string = `make VARIANT=${board.variant} MCU=${board.mcu} F_CPU=${target.frequency} ARCH=${board.arch} -C ${makefileDir} `;
    allTasks.push(createTask(command + "build", "Build", vscode.TaskGroup.Build, true));
    allTasks.push(createTask(command + "clean", "Clean", vscode.TaskGroup.Clean, false));
    
    // Do not create upload tasks if current project is just a library
    if (projectType === "Application" && target.programmer) {
        const programmer: Programmer = ALLPROGRAMMERS[target.programmer];
        command = command + 
            `DUDE_OPTION=${programmer.option} CAN_PROGRAM_EEPROM=${programmer.canProgramEEPROM} CAN_PROGRAM_FUSES=${programmer.canProgramFuses} `;
        if (target.serial) {
            command = command + `DUDE_SERIAL=${target.serial} `;
        }
        //TODO Also need to set DUDE_SERIAL_RESET (for LEONARDO)
        allTasks.push(createTask(command + "flash", "Upload Flash", null, false));
        if (programmer.canProgramEEPROM) {
            allTasks.push(createTask(command + "eeprom", "Program EEPROM", null, false));
        }
        if (programmer.canProgramFuses) {
            allTasks.push(createTask(command + "fuses", "Program Fuses", null, false));
        }
    }
    
    return allTasks;
}

interface FastArduinoTaskDefinition extends vscode.TaskDefinition {
    kind: string;
}

function createTask(command: string, label: string, group: vscode.TaskGroup | null, matcher: boolean): vscode.Task {
    // Create specific TaskDefinition
    const definition: FastArduinoTaskDefinition = {
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

// This function is called by user in order to set current target (board, frequency, programmer, serial device)
//FIXME this function is async hence returns a Promise (on nothing...) which gonna be rejected... => messages in debug console...
async function setTarget(context: vscode.ExtensionContext) {
    // Ask user to pick one target
    const targetSelection: string = await pick("Select Target Board or MCU", Object.keys(allTargets));
    const target: TargetSetting = allTargets[targetSelection];

    // Ask user to pick serial port if programmer needs 1 or more
    let serial: string;
    const programmer: Programmer = ALLPROGRAMMERS[target.programmer];
    if (programmer.serials > 0) {
        const devices = await listSerialDevices();
        if (devices && devices.length > 1) {
            //TODO set default?
            serial = await pick("Enter Serial Device:", devices);
        } else {
            serial = await vscode.window.showInputBox({
                prompt: "Enter Serial Device:",
                value: target.serial ? target.serial : "/dev/ttyACM0",
                valueSelection: target.serial ? undefined : [8,12]
            });
        }
    }

    const frequency: string = target.frequency.toString() + "MHz";
    const boardText = `${target.board} (${frequency})`;
    const programmerText = serial ? ` [${target.programmer} (${serial})]` : ` [${target.programmer}]`;
    statusFeedback.text = boardText + programmerText;

    // Store to workspace state for use by other commands
    const actualTarget: Target = {
        tag: targetSelection,
        board: target.board, 
        frequency: target.frequency.toString() + "000000UL",
        programmer: programmer.name, 
        serial: serial
    };
    context.workspaceState.update('fastarduino.target', actualTarget);
}

async function pick(message: string, labels: string[]) {
    if (labels.length > 1) {
        return await vscode.window.showQuickPick(labels, { placeHolder: message });
    } else {
        return labels[0];
    }
}

const isLinux = (process.platform === "linux");
const isMac = (process.platform === "darwin");
const isWindows = (process.platform === "win32");

async function listSerialDevices(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const regex: RegExp = ( isLinux ? /^.*->\s*(.*)$/ :
                                isMac ? /^(.*)$/ :
                                /^.*$/);
        const command: string = (   isLinux ? "ls -l /dev/serial/by-id" :
                                    isMac ? "ls /dev/{tty,cu}.*" :
                                    "");
        child_process.exec(command, (error, stdout, stderr) => {
            if (!error) {
                const devices: string[] = stdout.split("\n")
                                                .filter((value) => regex.test(value))
                                                .map((value) => regex.exec(value)[1].replace("../../", "/dev/"));
                resolve(devices);
            } else {
                reject(error.message);
            }
        });
    });
}
