//   Copyright 2017-2021 Jean-Francois Poilpret
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

// Current target as selected by user
export interface Target {
    readonly tag: string;
    readonly boardName: string;
    readonly frequency: string;
    readonly programmerName: string;
    readonly serial?: string;

    readonly board: Board;
    readonly programmer: Programmer;
    readonly fuses?: Fuses;

    readonly defines?: string[];
    readonly compilerOptions?: string;
    readonly linkerOptions?: string;
}

export class ConfigurationManager {
    private static readonly CURRENT_TARGET: string = "fastarduino.target";
    
    // Internal map of ALL supported targets
    private readonly ALLBOARDS: { [key: string]: Board; };
    private readonly ALLPROGRAMMERS: { [key: string]: Programmer; };
    // Targets list according to USER settings
    private allTargets: { [key: string]: TargetSetting; };
    // Event handler
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

    public setCurrentTarget(tag: string, serial?: string) {
        const settings: TargetSetting = this.allTargets[tag];
        const board: Board = this.ALLBOARDS[settings.board];
        const programmer: Programmer = this.ALLPROGRAMMERS[settings.programmer];
        let target: Target = {
            tag,
            boardName: settings.board,
            frequency: settings.frequency.toString() + "000000UL",
            programmerName: settings.programmer,
            serial: serial || settings.serial || null,
            board,
            programmer,
            fuses: programmer.canProgramFuses && settings.fuses || null,
            defines: settings.defines,
            compilerOptions: settings.compilerOptions,
            linkerOptions: settings.linkerOptions
        };
        this.context.workspaceState.update(ConfigurationManager.CURRENT_TARGET, target);
        this.onChange.fire(target);
    }

    public getCurrentTarget(): Target {
        return this.context.workspaceState.get(ConfigurationManager.CURRENT_TARGET);
    }

    public allUserTargets(): string[] {
        return Object.keys(this.allTargets);
    }

    public targetSetting(tag: string): TargetSetting {
        return this.allTargets[tag];
    }

    public programmer(tag: string): Programmer {
        return this.ALLPROGRAMMERS[tag];
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
                    fuses: setting.fuses,
                    defines: setting.defines,
                    compilerOptions: setting.compilerOptions,
                    linkerOptions: setting.linkerOptions
                };
            }
        });
        // Then check default target
        if (!this.allTargets[general.defaultTarget]) {
            errors.push(`Invalid 'fastarduino.general' setting for 'defaultTarget': there is no defined target named '${general.defaultTarget}'!`);
        } else {
            // Check current target is still available, if not replace it!
            if (forceDefault || !this.getCurrentTarget() || Object.keys(this.allTargets).indexOf(this.getCurrentTarget().tag) == -1) {
                // Old target is not available anymore, replace it with new default
                this.setCurrentTarget(general.defaultTarget);
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
interface GeneralSetting {
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
    defines?: string[];
    compilerOptions?: string;
    linkerOptions?: string;
}

