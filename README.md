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

- **FastArduino: Clean** TODO
- **FastArduino: Build** TODO
- **FastArduino: Flash** TODO
- **FastArduino: EEPROM** TODO
- **FastArduino: Fuses** TODO

TODO GIF

## Requirements

FastArduino is based on C++, hence this extension needs the following VSCode extensions installed:
- C/C++
- C/C++ Clang Command Adapter

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
