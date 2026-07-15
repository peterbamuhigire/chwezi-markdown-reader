# macOS release readiness

Date checked: 2026-07-15

Chwezi Markdown Reader uses the same Electron and TypeScript source tree on Windows and macOS. Platform-specific code is limited to file-opening integration and packaging.

## Implemented

- The main process listens for Electron’s macOS `open-file` event before `ready`, allowing Finder and Dock file launches to enter the existing document-opening path.
- Electron Builder targets DMG and ZIP packages for Intel (`x64`) and Apple Silicon (`arm64`).
- The shared 512×512 PNG icon meets Electron Builder’s documented macOS icon input size.
- GitHub Actions uses separate `windows-latest` and `macos-latest` jobs because macOS code signing and packaging require a macOS build environment.

## Verification boundary

The Windows build and runtime have been tested locally. The macOS configuration and workflow structure have been validated, but the DMG, Finder association, clipboard paste, Intel runtime, and Apple Silicon runtime remain untested until the workflow runs on GitHub or the project is built on a Mac.

## Distribution requirement

Unsigned GitHub Actions artifacts are suitable only for internal testing. Before public macOS distribution, configure a Developer ID Application certificate and Apple notarization credentials. Keep hardened runtime enabled.

## Primary sources

- [Electron introduction](https://www.electronjs.org/docs/latest/) — one JavaScript codebase for Windows and macOS; official Electron documentation, accessed 2026-07-15.
- [Electron `app` API](https://www.electronjs.org/docs/latest/api/app) — macOS `open-file` event and early registration requirement; official Electron documentation, accessed 2026-07-15.
- [Electron Builder multi-platform builds](https://www.electron.build/multi-platform-build.html) — target-platform build and macOS signing constraints; official project documentation, accessed 2026-07-15.
- [Electron Builder icons](https://www.electron.build/icons) — macOS PNG/icon requirements; official project documentation, accessed 2026-07-15.
- [Electron Builder macOS notarization](https://www.electron.build/docs/notarization/) — signing and notarization requirements; official project documentation, accessed 2026-07-15.
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — `windows-latest` and `macos-latest` runner labels; official GitHub documentation, accessed 2026-07-15.
- [Apple default file app guidance](https://support.apple.com/guide/mac-help/mh35597/mac) — Finder’s Get Info, Open with, and Change All flow; official Apple documentation, accessed 2026-07-15.
