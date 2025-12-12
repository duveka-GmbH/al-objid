# Native Parser Binaries

This directory contains platform-specific native parser modules (`.node` files) for the AL Object ID Ninja extension.

## File Naming Convention

The native modules follow the naming pattern:
```
al-parser-ninja.<platform>-<arch>[-<toolchain>].node
```

## Supported Platforms

- **Windows (x64)**: `al-parser-ninja.win32-x64-msvc.node`
- **Linux (x64)**: `al-parser-ninja.linux-x64-gnu.node`
- **macOS (Intel/x64)**: `al-parser-ninja.darwin-x64.node`
- **macOS (Apple Silicon/ARM64)**: `al-parser-ninja.darwin-arm64.node`

## Platform Detection

The extension automatically detects the current platform and architecture using Node.js `process.platform` and `process.arch`, then loads the appropriate binary from this directory.

## Adding New Platforms

When adding support for a new platform:

1. Build the native module for the target platform
2. Place it in this `bin/` directory with the correct naming convention
3. The extension will automatically detect and load it

## Notes

- These files are included in the VS Code extension package
- The `bin/` directory is not excluded in `.vscodeignore`, so all files here will be packaged
- Only the file matching the user's platform will be loaded at runtime

