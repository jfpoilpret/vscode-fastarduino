# Change Log
All notable changes to the "vscode-fastarduino" extension will be documented in this file.

This file format is based on [Keep a Changelog](http://keepachangelog.com/).

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
