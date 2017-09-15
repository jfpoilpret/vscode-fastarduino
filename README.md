# FastArduino extension for Visual Studio Code

This is the Visual Studio Code extension for developing projects with [FastArduino](https://github.com/jfpoilpret/fast-arduino-lib) library.

This extension makes it easy to write C++ source code of programs for Arduino boards or AVR MCU, as supported by FastArduino library.

In addition, it enables you to build and upload these programs to your target(s).

The extension also supports development of FastArduino library itself.

## Features

FastArduino extension adds an item to the left of the status bar, showing the current target of all tasks. Clicking the item allows you to change that target.

TODO GIF

A Target is the combination of:
- a board (or AVR MCU)
- a frequency in MHz (for AVR MCU only)
- a programmer (e.g. board USB, ISP programmer)
- a serial device to which the programmer is connected (if required)

The list of available targets is defined in VS Code settings (see below).

When a Target has been defined, FastArduino extension dynamically adds the following tasks to the Workspace Folder:

- **FastArduino: Build** builds the current project into a binary ready for upload; this may also generate an EEPROM file that can be further uploaded by the task "FastArduino: EEPROM" 
- **FastArduino: Clean** cleans all object and binary files created by a previous build
- **FastArduino: Flash** uploads (and builds if needed) the application code from the current project to the specified target
- **FastArduino: EEPROM** uploads (and builds if needed) the EEPROM values (extracted from source code) to the specified target; this task may not be available to all targets
- **FastArduino: Fuses** reprograms fuses of the specified target; fuses values must be defined in the project settings (see below)

TODO GIF

## Requirements

FastArduino is based on C++, hence this extension needs the following VSCode extensions installed:
- C/C++
- C/C++ Clang Command Adapter

FastArduino relies on AVR toolchain (TODO link) for building, hence it must be installed on your machine and added to the `$PATH`.

Then, the C/C++ extension must be properly configured for your workspace to use AVR toolchain, through the `c_cpp_properties.jsn` file which shall contain, e.g. for Linux:
    {
        "configurations": [
            {
                "name": "Linux",
                "includePath": [
                    "~/avr8-gnu-toolchain-linux_x86_64/avr/include",
                    "${workspaceRoot}/cores"
                ],
                "defines": [],
                "intelliSenseMode": "clang-x64",
                "browse": {
                    "path": [
                        "~/avr8-gnu-toolchain-linux_x86_64/avr/include",
                        "${workspaceRoot}/cores"
                    ],
                    "limitSymbolsToIncludedHeaders": true,
                    "databaseFilename": ""
                }
            },
            ...
        ]
    }

In this example, `~/avr8-gnu-toolchain-linux_x86_64/` must be changed to the location of the AVR toolchain.
TODO buildchain or toolchain

TODO C/C++ Clang Command Adapter configuration

In addition, I use the following extensions for my own developments but they are not mandatory:
- Include Autocomplete
- TODO Highlight

TODO Windows not supported.

TODO necessary settings for these extensions.

## Extension Settings

TODO
FastArduino extension adds the following specific settings to VS Code settings:

- `fastarduino.general` TODO
- `fastarduino.targets` TODO

TODO example settings

## Known Issues

No issues have been reported sofar, but any problem or request for enhancement can be submitted to [TODO]().

## Release Notes

### 1.0.0

Initial release of FastArduino extension for Visual Studio Code
