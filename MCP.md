# AL Object ID Ninja MCP Server

MCP (Model Context Protocol) server for [AL Object ID Ninja](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid) - managing AL object IDs in Business Central development.

## Do You Need This?

**Visual Studio Code users: No.** The [AL Object ID Ninja extension](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid) already includes Language Model Tools integration. GitHub Copilot and other AI assistants in VS Code can automatically assign and manage object IDs without any additional setup.

**Cursor, Claude Code, or other AI tools: Yes.** Install this MCP server to enable AI-assisted object ID management outside of VS Code.

## Features

This MCP server provides two tools for AI assistants:

- **ninja_assignObjectId** - Assigns and commits the next available AL object ID
- **ninja_unassignObjectId** - Releases a previously assigned object ID

## Installation

### Claude Code

**Global** (available in all projects):

```bash
claude mcp add --scope user --transport stdio al-object-id-ninja -- npx -y @vjeko.com/al-object-id-ninja-mcp
```

**Local** (current project only):

```bash
claude mcp add --scope local --transport stdio al-object-id-ninja -- npx -y @vjeko.com/al-object-id-ninja-mcp
```

Then restart Claude Code or run `/mcp` to verify the server is available.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "al-object-id-ninja": {
      "command": "npx",
      "args": ["-y", "@vjeko.com/al-object-id-ninja-mcp"]
    }
  }
}
```

## Usage

Once configured, AI assistants can use the tools to manage object IDs:

### Assign an ID

```
"Assign a new table ID for my AL app"
```

The assistant will use `ninja_assignObjectId` with:
- `objectType`: The AL object type (table, page, codeunit, etc.)
- `targetFilePath`: Path to any file in your AL app
- `rangeName`: (Optional) Logical range name if multiple ranges exist

### Unassign an ID

```
"Release table ID 50100 - I deleted that object"
```

The assistant will use `ninja_unassignObjectId` with:
- `objectType`: The AL object type
- `objectId`: The ID to release
- `targetFilePath`: Path to any file in your AL app

## Supported Object Types

- `table`, `tableextension`
- `page`, `pageextension`
- `codeunit`
- `report`, `reportextension`
- `query`
- `xmlport`
- `enum`, `enumextension`
- `permissionset`, `permissionsetextension`
- `table_{id}` (for table fields)
- `enum_{id}` (for enum values)

## Links

- [AL Object ID Ninja Extension](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid)
- [Documentation](https://github.com/vjekob/al-objid)
- [Report Issues](https://github.com/vjekob/al-objid/issues)

## License

MIT
