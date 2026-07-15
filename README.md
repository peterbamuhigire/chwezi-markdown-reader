# Chwezi Markdown Reader

Chwezi Markdown Reader is a focused Windows desktop reader for local Markdown files. It renders GitHub-flavoured Markdown, watches the open file for changes, and copies rendered content as rich HTML so headings, tables, lists, links, and code retain their formatting when pasted into compatible editors.

## Features

- Open Markdown from the toolbar, Windows Explorer, or drag-and-drop.
- Read in light or dark mode with an automatically generated table of contents.
- Copy a selection with `Ctrl+C`, or copy the complete rendered document with `Ctrl+Shift+C`.
- Search with `Ctrl+F`, print with `Ctrl+P`, and track reading progress.
- Refresh automatically when the open file changes on disk.
- Display local relative images referenced by the document.
- Sanitize raw HTML before rendering it.
- Register `.md`, `.markdown`, `.mdown`, and `.mkd` through the Windows installer.

## Installation

Download the latest Windows installer from the repository’s **Releases** page and run:

```text
Chwezi-Markdown-Reader-Setup-1.0.0-x64.exe
```

To make Chwezi Markdown Reader the default application:

1. Right-click a Markdown file in Windows Explorer.
2. Select **Open with → Choose another app**.
3. Select **Chwezi Markdown Reader**.
4. Enable **Always use this app** and confirm.

The portable executable runs without installation but does not register file associations.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Open a file | `Ctrl+O` |
| Find in the document | `Ctrl+F` |
| Copy selected rendered content | `Ctrl+C` |
| Copy the complete rendered document | `Ctrl+Shift+C` |
| Toggle light/dark mode | `Ctrl+Shift+L` |
| Toggle the table of contents | `Ctrl+Shift+T` |
| Print | `Ctrl+P` |

## Build from source

Requirements:

- Windows x64
- Node.js and npm

```powershell
npm install
npm test
npm run build
npm run dist
```

`npm run dist` writes the NSIS installer and portable executable to `release/`.

## Project structure

```text
src/main/       Electron main process and secure preload bridge
src/renderer/   Markdown rendering, clipboard handling, and interface
build-resources/ Application icon
tests/          Markdown fixtures and visual evidence
docs/           Release and audit evidence
```

## Security and privacy

- Files are read and rendered locally; their Markdown content is not uploaded by Chwezi Markdown Reader.
- Raw Markdown HTML is sanitized with DOMPurify before insertion into the document.
- The Electron renderer runs with context isolation, sandboxing, and Node integration disabled.
- Remote images referenced inside a Markdown document may still be requested from their original servers.
- Published Windows builds should be Authenticode-signed before broad distribution.

## Developer

Peter Bamuhigire  
[peter@techguypeter.com](mailto:peter@techguypeter.com)  
[techguypeter.com](https://techguypeter.com)  
+256784464178  
Kampala, Uganda

## License

Chwezi Markdown Reader is available under the [MIT License](LICENSE).
