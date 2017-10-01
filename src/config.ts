'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';

//TODO further refactoring to avoid exporting all interfaces and make ALL* and allTargets private
// => add dedicated methods to be used by main module!

export class Configuration {
    // Internal map of ALL supported targets
    public readonly ALLBOARDS: { [key: string]: Board; };
    public readonly ALLPROGRAMMERS: { [key: string]: Programmer; };
    // Targets list according to USER settings
    //TODO should be readonly?
    public allTargets: { [key: string]: TargetSetting; };
    private onChange: vscode.EventEmitter<Target> = new vscode.EventEmitter<Target>();
    public readonly onTargetChange: vscode.Event<Target> = this.onChange.event;
    
    public constructor(private context: vscode.ExtensionContext) {
        const configFile: string = context.asAbsolutePath("./fastarduino.json");
        const config: { boards: Board[], programmers: Programmer[] } = JSON.parse(fs.readFileSync(configFile).toString());
    
        this.ALLPROGRAMMERS = {};
        let generalProgrammers: string[] = [];
        config.programmers.forEach((programmer: Programmer) => {
            if (programmer.onlyFor === undefined) {
                generalProgrammers.push(programmer.name);
            }
            this.ALLPROGRAMMERS[programmer.name] = programmer;
        });
    
        this.ALLBOARDS = {};
        config.boards.forEach((board: Board) => {
            board.programmers = [];
            board.programmers.push(...generalProgrammers);
            this.ALLBOARDS[board.name] = board;
        });
    
        Object.keys(this.ALLPROGRAMMERS).forEach((key: string) => {
            const target: string = this.ALLPROGRAMMERS[key].onlyFor;
            if (target) {
                this.ALLBOARDS[target].programmers.push(key);
            }
        });

        // auto-reload settings if configuration change
        vscode.workspace.onDidChangeConfiguration(() => { this.readSettings(); });
    }

    // Must be called once after construction and after event listeners have been added
    public init() {
        // load and integrate user settings
        this.readSettings(true);
    }

    public dispose() {
        this.onChange.dispose();
    }

    private readSettings(forceDefault?: boolean) {
        let errors: string[] = [];
        const settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("fastarduino");
        const general: GeneralSetting = settings.get("general");
        const targets: { [tag: string]: TargetSetting } = settings.get("targets");
        this.allTargets = {};
        // Then find all boards
        Object.keys(targets).forEach((key: string) => {
            const setting: TargetSetting = targets[key];
            // Check setting is correct
            if (!this.ALLBOARDS[setting.board]) {
                // Check board exists
                errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': board '${setting.board}' does not exist!`);
            } else if (!this.ALLPROGRAMMERS[setting.programmer]) {
                // Check programmer exist
                errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': programmer '${setting.programmer}' does not exist!`);
            } else if (this.ALLBOARDS[setting.board].programmers.indexOf(setting.programmer) == -1) {
                // Check programmer is allowed for board
                errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': programmer '${setting.programmer}' not available for board '${setting.board}'!`);
            } else if (setting.frequency && this.ALLBOARDS[setting.board].frequencies.indexOf(setting.frequency) == -1) {
                // Check frequency is allowed for board
                errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': frequency '${setting.frequency}' is not allowed for board '${setting.board}'!`);
            } else if (!setting.frequency && this.ALLBOARDS[setting.board].frequencies.length > 1) {
                // Check frequency is allowed for board
                errors.push(`Invalid 'fastarduino.targets' setting for target '${key}': missing frequency '${setting.frequency}' for board '${setting.board}'!`);
            } else {
                // No error: add this to the validated list of targets
                // First calculate frequency for target (if not specified)
                let frequency: number = setting.frequency || this.ALLBOARDS[setting.board].frequencies[0];
                this.allTargets[key] = {
                    board: setting.board,
                    frequency,
                    programmer: setting.programmer,
                    serial: setting.serial,
                    fuses: setting.fuses
                };
            }
        });
        // Then check default target
        if (!this.allTargets[general.defaultTarget]) {
            errors.push(`Invalid 'fastarduino.general' setting for 'defaultTarget': there is no defined target named '${general.defaultTarget}'!`);
        } else {
            // Check current target is still available, if not replace it!
            const target: Target = this.context.workspaceState.get("fastarduino.target");
            if (forceDefault || !target || Object.keys(this.allTargets).indexOf(target.tag) == -1) {
                // Old target is not available anymore, replace it with new default
                const targetSelection: string = general.defaultTarget;
                const target: TargetSetting = this.allTargets[targetSelection];
    
                // Store to workspace state for use by other commands
                const actualTarget: Target = {
                    tag: targetSelection,
                    board: target.board, 
                    frequency: target.frequency.toString() + "000000UL",
                    programmer: target.programmer, 
                    serial: target.serial
                };
                this.context.workspaceState.update('fastarduino.target', actualTarget);
                this.onChange.fire(actualTarget);
            }
        }
        errors.forEach((error) => { vscode.window.showWarningMessage(error); });
    }
    
}

// Internal structure holding important definitions for one board
export interface Board {
    // The first part comes from fastarduino.json
    name: string; 
    frequencies: number[];
    programmer?: string;
    variant: string;
    mcu: string;
    mcuDefine: string;
    arch: string;
    // The following part is calculated from settings
    programmers?: string[];
    serial?: string;
}

// Internal structure holding important definitions for one programmer, comes from fastarduino.json
export interface Programmer {
    name: string;
    option: string;
    serials: number;
    canProgramEEPROM: boolean,
    canProgramFuses: boolean,
    onlyFor?: string;
}

// Maps to user settings used by current project
export interface GeneralSetting {
    defaultTarget: string;
}

export interface Fuses {
    hfuse: string;
    lfuse: string;
    efuse: string;
}
export interface TargetSetting {
    board: string;
    frequency?: number;
    programmer: string;
    serial?: string;
    fuses?: Fuses;
}

// Current target as selected by user
export interface Target {
    tag: string;
    board: string;
    frequency: string;
    programmer: string;
    serial?: string;
}
