'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';

// General handling of variable substitutions in json files
export class Substitution {
    private template?: string;
    private watcher?: vscode.FileSystemWatcher;
    private source: string;
    private destination: string;
    private onChange: vscode.EventEmitter<Substitution> = new vscode.EventEmitter<Substitution>();
    public readonly onTemplateChange: vscode.Event<Substitution> = this.onChange.event;
    
    public constructor(context: vscode.ExtensionContext, name: string, warning: boolean = true) {
        const currentFolder: string = vscode.workspace.workspaceFolders[0].uri.fsPath;
        this.destination = currentFolder + `/.vscode/${name}.json`;
        this.source = currentFolder + `/.vscode/${name}_source.json`;
        if (!fs.existsSync(this.source)) {
            if (warning) {
                vscode.window.showErrorMessage(`Missing file '${this.source}'! Defining this file is recommended.`);
            }
            this.template = null;
        } else {
            this.watcher = vscode.workspace.createFileSystemWatcher(this.source);
            this.template = fs.readFileSync(this.source).toString();
            let myself = this;
            let callback = function() {
                myself.template = fs.readFileSync(myself.source).toString();
                myself.onChange.fire(myself);
            };
            this.watcher.onDidChange(callback);
            this.watcher.onDidCreate(callback);
            this.watcher.onDidDelete(callback);
        }
    }

    public dispose() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        this.onChange.dispose();
    }

    public substitute(variables: { [key: string]: string; }) {
        if (this.template) {
            fs.writeFileSync(this.destination, this.substitute_string(variables));
        }
    }

    private substitute_string(variables: { [key: string]: string; }) {
        let output: string = null;
        if (this.template) {
            output = this.template;
            Object.keys(variables).forEach((key: string) => {
                const value: string = variables[key];
                // Substitute only if not null
                if (value !== null) {
                    // NOTE: split/join is one way to replace ALL occurrences of a string (string.replace() works only for one occurrence)
                    output = output.split("${" + key + "}").join(value);
                }
            });
        }
        return output;
    }
}
