# FastArduino extension for Visual Studio Code

This is the Visual Studio Code extension for developing projects with [FastArduino](https://github.com/jfpoilpret/fast-arduino-lib) library.

This extension makes it easy to write C++ source code of programs for Arduino boards or AVR MCU, as supported by FastArduino library.

In addition, it enables you to build and upload these programs to your target(s).

The extension also supports development of FastArduino library itself.

## Features

FastArduino extension adds an item to the left of the status bar, showing the current target of all tasks. Clicking the item allows you to change that target.

![SetTarget](images/vscode-fastarduino-settarget.gif)

A Target is the combination of:
- a board (or AVR MCU)
- a frequency in MHz (for AVR MCU only)
- a programmer (e.g. board USB, ISP programmer)
- a serial device to which the programmer is connected (if required)

As seen in the animation above, the list of available targets is defined in VS Code settings (also see below).

When a Target has been defined, FastArduino extension dynamically adds the following tasks to the Workspace Folder:

- **FastArduino: Build** builds the current project into a binary ready for upload; this may also generate an EEPROM file that can be further uploaded by the task "FastArduino: EEPROM"
- **FastArduino: Clean** cleans all object and binary files created by a previous build
- **FastArduino: Flash** uploads (and builds if needed) the application code from the current project to the specified target
- **FastArduino: EEPROM** uploads (and builds if needed) the EEPROM values (extracted from source code) to the specified target; this task may not be available to all targets
- **FastArduino: Fuses** reprograms fuses of the specified target; fuses values must be defined in the project settings (see below)

![RunTasks](images/vscode-fastarduino-build-upload.gif)

## Requirements

This extension currently supports only Linux and Mac platforms, but only Linux has been tested so far.

FastArduino is based on C++, hence this extension will automatically require the installation of the following VSCode extension:
- C/C++

FastArduino relies on [AVR toolchain](http://www.atmel.com/tools/ATMELAVRTOOLCHAINFORLINUX.aspx) for building, hence it must be installed on your machine and added to the `$PATH`.

Then, the C/C++ extension must be properly configured for your workspace to use AVR toolchain, through the `c_cpp_properties.json` file which shall contain, e.g. for Linux:

    {
        "configurations": [
            {
                "name": "Linux",
                "includePath": [
                    "~/avr8-gnu-toolchain-linux_x86_64/avr/include",
                    "~/avr8-gnu-toolchain-linux_x86_64/avr/include/avr",
                    "${workspaceRoot}/../fast-arduino-lib/cores",
                    "${workspaceRoot}/../fast-arduino-lib/cores/boards",
                    "${workspaceRoot}/../fast-arduino-lib/cores/devices",
                    "${workspaceRoot}"
                ],
                "defines": ["ARDUINO_UNO", "F_CPU=16000000UL"],
                "intelliSenseMode": "clang-x64",
                "browse": {
                    "path": [
                        "${workspaceRoot}/../fast-arduino-lib/cores",
                        "${workspaceRoot}"
                    ],
                    "limitSymbolsToIncludedHeaders": true,
                    "databaseFilename": ""
                }
            },
            ...
        ]
    }

In this example, `~/avr8-gnu-toolchain-linux_x86_64/` must be changed to the location of the AVR toolchain. This sample also supposes that FastArduino library is checked out at the same level as your project.

In addition, I use the following extensions for my own developments but they are not mandatory:
- Include Autocomplete
- TODO Highlight

One easy way to create a new project based on FastArduino and use this VSCode extension with all predefined settings is to start with [this project template](https://github.com/jfpoilpret/fastarduino-project-template).

## Extension Settings

FastArduino extension adds the following specific settings to VS Code settings:

- `fastarduino.targets` defines the list of targets (Arduino boards or AVR MCU, programmers, USB devices) for your project. You may define one or more targets (e.g. one for prototyping on UNO and one for the final PCB with an ATmega328).
- `fastarduino.general` defines the default target to use when more than one target has been defined in `fastarduino.targets`.

Here is an example of settings with 2 targets:

    "fastarduino.general": {
        "defaultTarget": "Prototype"
    },
    "fastarduino.targets": {
        "Prototype": {
            "board": "Arduino UNO",
            "programmer": "UNO USB",
            "serial": "/dev/ttyACM0"
        },
        "Product": {
            "board": "ATmega328",
            "frequency": 8,
            "programmer": "ArduinoISP.cc",
            "fuses": {
                "hfuse": "0xDE",
                "lfuse": "0xE2",
                "efuse": "0x05"
            }
        }
    }

Note that for AVR MCU targets, you need to specify their frequency (expressed in MHz).

Specifiying a serial device is optional: when one is needed, you will be required to input it by hand; for some programmers (e.g. the ArduinoISP prgorammer), no serial device is needed, they get automatically recognized by your system.

In addition, you may define values for the MCU fuses that you may program with the task "FastArduino: Program Fuses".

The list of possible targets are based on FastArduino supported targets; it is defined in the extension's [`fastarduino.json`](https://github.com/jfpoilpret/vscode-fastarduino/blob/master/fastarduino.json).

## Known Issues

No issues have been reported sofar, but any problem or request for enhancement can be submitted to [the project site on GitHub](https://github.com/jfpoilpret/vscode-fastarduino/issues).

## Release Notes

### 0.1.0

Initial release of FastArduino extension for Visual Studio Code.
