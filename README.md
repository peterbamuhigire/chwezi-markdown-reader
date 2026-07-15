# Chwezi Markdown Reader

Chwezi Markdown Reader is a focused desktop reader for local Markdown files on Windows and macOS. It renders GitHub-flavoured Markdown, watches the open file for changes, and copies rendered content as rich HTML so formatting survives when pasted into compatible rich-text editors.

## What it does

- Opens `.md`, `.markdown`, `.mdown`, and `.mkd` files from the toolbar, drag-and-drop, Windows Explorer, or macOS Finder.
- Renders headings, links, task lists, tables, blockquotes, images, and fenced code.
- Copies a selection with its rendered formatting using `Ctrl+C` on Windows or `Command+C` on macOS.
- Copies the complete rendered document using `Ctrl+Shift+C`, `Command+Shift+C`, or the **Copy** button.
- Copies the original Markdown using `Ctrl+Alt+C` on Windows/Linux or `Command+Option+C` on macOS for destinations that do not accept rich HTML.
- Includes light and dark reading modes, a table of contents, search, print, reading progress, and automatic refresh when the file changes.
- Includes **Help → About Chwezi Markdown Reader** with the developer’s contact details.
- Reads files locally. Markdown is sanitized before it is placed in the document.

## Windows installation

1. Run `Chwezi-Markdown-Reader-Setup-1.0.0-x64.exe` from the `release` folder and complete the installer.
2. Right-click a Markdown file in File Explorer and choose **Open with → Choose another app**.
3. Select **Chwezi Markdown Reader**, enable **Always use this app**, and confirm.

The installer registers all four supported extensions. Windows controls the final default-app choice, so the portable executable does not change file associations by itself.

## macOS installation

The macOS build produces `.dmg` and `.zip` packages for Intel (`x64`) and Apple Silicon (`arm64`). Open the DMG, move **Chwezi Markdown Reader** to Applications, then launch it.

To make it the default Markdown reader, select a Markdown file in Finder, choose **File → Get Info**, select **Chwezi Markdown Reader** under **Open with**, and click **Change All**.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Open a file | `Ctrl+O` / `Command+O` |
| Find in the document | `Ctrl+F` / `Command+F` |
| Copy selection with formatting | `Ctrl+C` / `Command+C` |
| Copy the full rendered document | `Ctrl+Shift+C` / `Command+Shift+C` |
| Copy the original Markdown | `Ctrl+Alt+C` / `Command+Option+C` |
| Toggle light/dark mode | `Ctrl+Shift+L` / `Command+Shift+L` |
| Toggle table of contents | `Ctrl+Shift+T` / `Command+Shift+T` |
| Print | `Ctrl+P` / `Command+P` |

## Build from source

Requires Node.js and npm.

```powershell
npm install
npm test
npm run build
npm run dist
```

`npm run dist` packages the current operating system. Use `npm run dist:win` for the Windows targets or `npm run dist:mac` on macOS to create Intel and Apple Silicon DMG/ZIP packages. GitHub Actions runs both platform builds from the same source tree. Build outputs are written to `release/`.

Unsigned Windows builds trigger publisher warnings. macOS packages distributed outside the App Store need Apple Developer ID signing and notarization for a normal Gatekeeper experience.
