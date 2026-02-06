[![AL Object ID Ninja is licensed under MIT License](https://img.shields.io/github/license/vjekob/al-objid)](https://github.com/vjekob/al-objid/blob/master/LICENSE.md)
[![This extension is written in TypeScript](https://img.shields.io/github/languages/top/vjekob/al-objid)](https://www.typescriptlang.org/)
[![Number of installs](https://img.shields.io/visual-studio-marketplace/i/vjeko.vjeko-al-objid)](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid)
[![Share the love! If you like AL Object ID Ninja, give it 5 stars.](https://img.shields.io/visual-studio-marketplace/stars/vjeko.vjeko-al-objid)](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid&ssr=false#review-details)
[![Last Visual Studio Code Marketplace update](https://img.shields.io/visual-studio-marketplace/last-updated/vjeko.vjeko-al-objid)](https://marketplace.visualstudio.com/items?itemName=vjeko.vjeko-al-objid&ssr=false#version-history)

# AL Object ID Ninja

Zero-configuration, dead-simple, no-collision object ID assignment for multi-user repositories.

## About this repository

This is a monorepo containing the following repos:

- Backend (Azure Function App) at [backend](./backend)
- VS Code Extension at [extension](./extension)
- Documentation at [doc](./doc)

> **This is not the master code repository.** It contains only what self-hosting companies need to deploy their own infrastructure if they choose that path. The full platform is available at **[https://alid.ninja](https://alid.ninja)**. A private repository holds the authoritative, up-to-date versions of all components; this public repository is kept in sync when important or breaking changes are introduced in either the extension or the backend.

## MCP Server

AL Object ID Ninja has an official [MCP Server](MCP.md) for AI-assisted object ID management in Cursor, Claude Code, and other MCP-capable tools.

> **The official MCP Server is not available to self-hosting companies.** If you are self-hosting the backend, you must build and run your own MCP server that talks to your infrastructure.

## Contributing to this repository

Your contributions are welcome. If you want to contribute a feature, bug fix, improvement, or something
else, just create a pull request. The full process is described [here](https://docs.github.com/en/github/collaborating-with-pull-requests),
but it's far less scary than it looks at first.

Some advice before you start creating pull request:

- Check the [issues section](https://github.com/vjekob/al-objid/issues) to see what are the existing issues and
  where help is wanted.
- Create an issue before starting work! This is important. I may already be working on an improvement
  similar (or equal) to what you planned on working. Also, you may want to solicit feedback from other
  users about how to best implement the feature or improvement you had in mind.
- Do not add functionality to Azure Function App. I am not accepting changes to the back end unless they
  are some critical bug fixes.
- We use [Prettier](https://prettier.io/) around here to format the code. Please make sure you have all the right tooling installed
  so you can contribute code that's easy to read.

That's it. Welcome to this repository, and I am looking forward to your contributions!

## License

This entire repository is licensed under MIT License. Check the details [here](LICENSE.md).
