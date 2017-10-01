'use strict';

//TODO Refactor: externalize utilities (Substitutions, Picks, Official Boards List, User Settings...)

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as utils from './utils';
import * as config from './config';
import { Configuration } from './config';
import { Substitution } from './substitution';

// Status items in status bar
let statusFeedback: vscode.StatusBarItem;

// All files for which we need variables substitutions
let cppPropertiesSubstitution: Substitution;
let tasksSubstitution: Substitution;

// Targets Configuration
let configuration: Configuration;

// Called when your FastArduino extension is activated (i.e. when current Workspace folder contains a .fastarduino marker file)
export function activate(context: vscode.ExtensionContext) {
    // Add context in the status bar
    statusFeedback = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusFeedback.text = "No Target";
    statusFeedback.tooltip = "Select FastArduino Target";
    statusFeedback.command = "fastarduino.setTarget";
    statusFeedback.show();

    // Prepare substitutions for c_cpp_properties.json and tasks.json files
    cppPropertiesSubstitution = new Substitution(context, "c_cpp_properties");
    cppPropertiesSubstitution.onTemplateChange((s: Substitution) => {
        targetUpdated(s, context.workspaceState.get("fastarduino.target"));
    });
    tasksSubstitution = new Substitution(context, "tasks", false);
    tasksSubstitution.onTemplateChange((s) => {
        targetUpdated(s, context.workspaceState.get("fastarduino.target"));
    });

    // Read configuration and suer settings
    configuration = new Configuration(context);
    configuration.onTargetChange((target: config.Target) => {
        statusFeedback.text = target.tag;
        statusFeedback.tooltip = "Select FastArduino Target\n" + targetDetails(target.tag);
        targetUpdated(cppPropertiesSubstitution, target);
        targetUpdated(tasksSubstitution, target);
    });
    configuration.init();

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
    cppPropertiesSubstitution.dispose();
    tasksSubstitution.dispose();
    configuration.dispose();
}

// Internal implementation
//=========================
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
    }
    if (!makefileDir) {
        return [];
    }

    // Check if the project is an application or a library (different make targets)
    const isLibrary: boolean = fs.existsSync(makefileDir + "/.fastarduino.library");
    
    // Get current target and programmer
    const target: config.Target = context.workspaceState.get('fastarduino.target');
    const board: config.Board = configuration.ALLBOARDS[target.board];
    
    // Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    let command: string = `make VARIANT=${board.variant} MCU=${board.mcu} F_CPU=${target.frequency} ARCH=${board.arch} -C "${makefileDir}" `;
    allTasks.push(createTask(command + "build", "Build", vscode.TaskGroup.Build, true));
    allTasks.push(createTask(command + "clean", "Clean", vscode.TaskGroup.Clean, false));
    
    // Do not create upload tasks if current project is just a library
    if (target.programmer && !isLibrary) {
        const programmer: config.Programmer = configuration.ALLPROGRAMMERS[target.programmer];
        command = command + 
            `DUDE_OPTION="${programmer.option}" CAN_PROGRAM_EEPROM=${programmer.canProgramEEPROM} CAN_PROGRAM_FUSES=${programmer.canProgramFuses} `;
        if (target.serial) {
            command = command + `DUDE_SERIAL=${target.serial} `;
        }
        // Also need to set DUDE_SERIAL_RESET (for LEONARDO)
        if (programmer.serials > 1) {
            command = command + `DUDE_SERIAL_RESET=${target.serial} `;
        }
        allTasks.push(createTask(command + "flash", "Upload Flash", null, false));
        if (programmer.canProgramEEPROM) {
            allTasks.push(createTask(command + "eeprom", "Program EEPROM", null, false));
        }
        if (programmer.canProgramFuses && configuration.allTargets[target.tag].fuses) {
            const fuses: config.Fuses = configuration.allTargets[target.tag].fuses;
            command = command + `HFUSE=${fuses.hfuse} LFUSE=${fuses.lfuse} EFUSE=${fuses.efuse}`;
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
async function setTarget(context: vscode.ExtensionContext) {
    // Ask user to pick one target
    const targetSelection: string = await utils.pickItems("Select Target Board or MCU", Object.keys(config.allTargets).map((tag: string) => {
        return {
            label: tag,
            description: targetDetails(tag)
        }
    }));
    if (!targetSelection) {
        return;
    }
    const target: config.TargetSetting = configuration.allTargets[targetSelection];
    
    // Ask user to pick serial port if programmer needs 1 or more
    let serial: string;
    const programmer: config.Programmer = configuration.ALLPROGRAMMERS[target.programmer];
    if (programmer.serials > 0) {
        const devices = await utils.listSerialDevices();
        if (devices && devices.length > 1) {
            //TODO set default?
            serial = await utils.pick("Enter Serial Device:", devices);
        } else {
            serial = await vscode.window.showInputBox({
                prompt: "Enter Serial Device:",
                value: target.serial || "/dev/ttyACM0",
                valueSelection: target.serial ? undefined : [8,12]
            });
        }
        if (!serial) {
            return;
        }
    }

    statusFeedback.text = targetSelection;
    statusFeedback.tooltip = "Select FastArduino Target\n" + targetDetails(targetSelection);

    // Store to workspace state for use by other commands
    const actualTarget: config.Target = {
        tag: targetSelection,
        board: target.board, 
        frequency: target.frequency.toString() + "000000UL",
        programmer: programmer.name, 
        serial: serial
    };
    context.workspaceState.update('fastarduino.target', actualTarget);
    targetUpdated(cppPropertiesSubstitution, actualTarget);
    targetUpdated(tasksSubstitution, actualTarget);
}

function targetDetails(tag: string): string {
    const target: config.TargetSetting = configuration.allTargets[tag];
    const frequency: string = target.frequency.toString() + "MHz";
    let description: string = `${target.board} (${frequency}) - ${target.programmer}`;
    if (target.serial) {
        description = description + ` (${target.serial})`;
    }
    return description;
}

//TODO rework variables list to avoid duplicates (AVR_FREQUENCY/F_CPU)
function targetUpdated(substitution: Substitution, target: config.Target) {
    const board: config.Board = configuration.ALLBOARDS[target.board];
    const programmer: config.Programmer = target.programmer && configuration.ALLPROGRAMMERS[target.programmer] || null;
    const fuses: config.Fuses = programmer.canProgramFuses && configuration.allTargets[target.tag].fuses || null;
    const variables: { [key: string]: string; } = {
        "VARIANT": board.variant, 
        "AVR_MCU_DEFINE": board.mcuDefine, 
        "AVR_FREQUENCY": target.frequency,
        "ARCH": board.arch,
        "MCU": board.mcu,
        "F_CPU": target.frequency,
        "DUDE_OPTION": programmer && programmer.option && `'${programmer.option}'` || null,
        "DUDE_SERIAL": target.serial,
        "DUDE_SERIAL_RESET": programmer && (programmer.serials > 1) && target.serial || null,
        "CAN_PROGRAM_EEPROM": programmer && programmer.canProgramEEPROM && "true" || null,
        "CAN_PROGRAM_FUSES": programmer && programmer.canProgramFuses && "true" || null,
        "HFUSE": fuses && fuses.hfuse || null,
        "LFUSE": fuses && fuses.lfuse || null,
        "EFUSE": fuses && fuses.efuse || null
    };
    // Put all variables in ono command line option variable
    variables["FA_MAKE_OPTIONS"] = utils.aggregateVariables(variables);
    substitution.substitute(variables);
}
