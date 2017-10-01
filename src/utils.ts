'use strict';

import * as vscode from 'vscode';
import * as child_process from 'child_process';

export async function pick(message: string, labels: string[]) {
    if (labels.length > 1) {
        return await vscode.window.showQuickPick(labels, { placeHolder: message });
    } else {
        return labels[0];
    }
}

export async function pickItems(message: string, items: vscode.QuickPickItem[]) {
    if (items.length > 1) {
        const selection: vscode.QuickPickItem = await vscode.window.showQuickPick(items, { placeHolder: message });
        return (selection ? selection.label : null);
    } else {
        return items[0].label;
    }
}

const isLinux = (process.platform === "linux");
const isMac = (process.platform === "darwin");
const isWindows = (process.platform === "win32");

export async function listSerialDevices(): Promise<string[]> {
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

export function aggregateVariables(variables: { [key: string]: string; }): string {
    let result = "";
    Object.keys(variables).forEach((key: string) => {
        const value: string = variables[key];
        if (value !== null) {
            result = `${result} ${key}=${value}`;
        }
    });
    return result;
}
