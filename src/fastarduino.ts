//   Copyright 2017 Jean-Francois Poilpret
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as utils from './utils';
import * as config from './config';
import { ConfigurationManager } from './config';
import { Substitution } from './substitution';

// Status items in status bar
let statusFeedback: vscode.StatusBarItem;

// All files for which we need variables substitutions
let cppPropertiesSubstitution: Substitution;
let tasksSubstitution: Substitution;

// Targets Configuration
let configuration: ConfigurationManager;

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
    context.subscriptions.push(cppPropertiesSubstitution);
    tasksSubstitution = new Substitution(context, "tasks", false);
    context.subscriptions.push(tasksSubstitution);
    
    // Read configuration and user settings
    configuration = new ConfigurationManager(context);
    context.subscriptions.push(configuration);
    
    // Register events listeners
    cppPropertiesSubstitution.onTemplateChange((s: Substitution) => {
        targetUpdated(s, configuration.getCurrentTarget());
    });
    tasksSubstitution.onTemplateChange((s) => {
        targetUpdated(s, configuration.getCurrentTarget());
    });
    configuration.onTargetChange((target: config.Target) => {
        statusFeedback.text = target.tag;
        statusFeedback.tooltip = "Select FastArduino Target\n" + targetDetails(target.tag);
        targetUpdated(cppPropertiesSubstitution, target);
        targetUpdated(tasksSubstitution, target);
    });

    // Load current target from settings
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
    const target: config.Target = configuration.getCurrentTarget();
    const board: config.Board = target.board;
    
    // Build several Tasks: Build, Clean, Flash, Eeprom, Fuses
    let allTasks: vscode.Task[] = [];
    let command: string = `make VARIANT=${board.variant} MCU=${board.mcu} F_CPU=${target.frequency} ARCH=${board.arch} -C "${makefileDir}" `;
    allTasks.push(createTask(command + "build", "Build", vscode.TaskGroup.Build, true));
    allTasks.push(createTask(command + "clean", "Clean", vscode.TaskGroup.Clean, false));
    allTasks.push(createTask(`make clean-all -C "${makefileDir}"`, "Clean All Targets", vscode.TaskGroup.Clean, false));
    
    // Do not create upload tasks if current project is just a library
    if (target.programmerName && !isLibrary) {
        const programmer: config.Programmer = target.programmer;
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
        if (programmer.canProgramFuses && configuration.targetSetting(target.tag).fuses) {
            const fuses: config.Fuses = target.fuses;
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
    const selection: string = await utils.pickItems("Select Target Board or MCU", configuration.allUserTargets().map((tag: string) => {
        return {
            label: tag,
            description: targetDetails(tag)
        }
    }));
    if (!selection) {
        return;
    }
    const targetSetting: config.TargetSetting = configuration.targetSetting(selection);
    
    // Ask user to pick serial port if programmer needs 1 or more
    let serial: string;
    const programmer: config.Programmer = configuration.programmer(targetSetting.programmer);
    if (programmer.serials > 0) {
        const devices = await utils.listSerialDevices();
        if (devices && devices.length > 1) {
            //TODO set default?
            serial = await utils.pick("Enter Serial Device:", devices);
        } else {
            serial = await vscode.window.showInputBox({
                prompt: "Enter Serial Device:",
                value: targetSetting.serial || "/dev/ttyACM0",
                valueSelection: targetSetting.serial ? undefined : [8,12]
            });
        }
        if (!serial) {
            return;
        }
    }

    configuration.setCurrentTarget(selection, serial);
}

function targetDetails(tag: string): string {
    const target: config.TargetSetting = configuration.targetSetting(tag);
    const frequency: string = target.frequency.toString() + "MHz";
    let description: string = `${target.board} (${frequency}) - ${target.programmer}`;
    if (target.serial) {
        description = description + ` (${target.serial})`;
    }
    return description;
}

//TODO rework variables list to avoid duplicates (AVR_FREQUENCY/F_CPU)
function targetUpdated(substitution: Substitution, target: config.Target) {
    const board: config.Board = target.board;
    const programmer: config.Programmer = target.programmer;
    const fuses: config.Fuses = target.fuses;
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
