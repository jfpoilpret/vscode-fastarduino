# Change Log
All notable changes to the "vscode-fastarduino" extension will be documented in this file.

This file format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.9.0] - 2021-09-19
- Added support for ATmega 164,324,644,1284 MCU

## [0.8.0] - 2020-11-30
- Updated to use VSCode 1.50 API and removed deprecated API calls
- Refactored task provisioning in order to support fastarduino tasks in tasks.json
- Removed output errors when using menu "Run Task..." and selecting "Show All Tasks..."

## [0.7.0] - 2019-12-29
- Added support for USBtinyISP and ArduinoISPorg (old ArduinoISP, originally from arduino.org) programmers

## [0.6.0] - 2018-04-15
- Added possibility to set extra defines, for compiler, in target configuration
- Added possibility to set extra compiler or linker options in target configuration

## [0.5.0] - 2018-01-27
- Fixed issue with "Program Fuses" task: generated make command was wrong
- Fixed issue when selecting a board needing a serial device choice but no device is currently connected
- Added support for ATtinyX5 (to fit FastArduino latest support)
- Updated copyright headers

## [0.4.0] - 2017-11-05
- Now supports only VSCode 1.17 and above
- Extension is not a preview anymore
- Improved serial selection to always allow direct input by selecting "Other..."
- Improved README documentation (mention `.fastarduino` special marker file)
- Uses new VSCode 1.17 Task API
- Added ASL2.0 license and copyright headers to source code files

## [0.3.0] - 2017-10-01
- Fixed source file links in problems panel
- Added variables substitution for `tasks.json` 
- Improved extension design to simplify future enhancements

## [0.2.0] - 2017-09-26
- Fixed bad link to project issues in README.md
- Added automatic set of defines in `c_cpp_properties.json` matching the currently selected target
- Fixed regex for "serial" value in settings, in order to accept Mac devices too

## [0.1.0] - 2017-09-17
- Initial release
