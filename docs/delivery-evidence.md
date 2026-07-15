# Chwezi Markdown Reader 1.0.0 — Delivery Evidence

Date: 2026-07-15  
Owner: Peter Bamuhigire  
Deliverable: shared Windows/macOS source tree, Windows x64 release, and macOS packaging workflow

## Decision record

| Decision | Rationale | Alternative | Reversal trigger |
| --- | --- | --- | --- |
| Electron + TypeScript | One renderer and clipboard implementation serves Windows and macOS; platform-specific work stays in file opening and packaging. | Separate native Windows and macOS projects would duplicate the reader and clipboard logic. | Reconsider a native shell if installer size becomes a stronger constraint than shared-code value. |
| Sanitize rendered HTML before DOM insertion | Markdown can contain raw HTML; scripts, forms, frames, embedded objects, and authored style attributes are not required for a reader. | Trusting local Markdown would allow active or interface-spoofing content. | None for untrusted files. |
| Installer and portable builds | The NSIS installer supports file associations; the portable executable is useful for no-install use. | A portable-only build cannot register itself cleanly as a Windows default app. | Remove portable output if release size becomes costly. |

## Contract evidence

| Contract | Evidence | Result |
| --- | --- | --- |
| File opening | `.md`, `.markdown`, `.mdown`, and `.mkd` are validated in `src/main/main.ts` and registered in `package.json`. | Pass |
| Renderer boundary | `contextIsolation: true`, `nodeIntegration: false`, sandbox enabled, and a narrow preload API. | Pass |
| Rich clipboard | Packaged smoke test produced 26,808 bytes of HTML with inline heading styles and a rendered table. | Pass |
| Markdown clipboard fallback | The packaged app's text payload matched the 758-character `tests/fixtures/sample.md` source exactly. | Pass |
| Help/About | Packaged `app.asar` contains the Chwezi Markdown Reader About menu plus Peter Bamuhigire, email, phone, and Kampala location. | Pass |

## Test evidence

| Check | Result |
| --- | --- |
| Strict TypeScript (`npm run typecheck`) | Pass |
| Vitest Markdown rendering and sanitization | 4/4 pass |
| Production dependency audit (`npm audit --omit=dev`) | 0 vulnerabilities |
| Packaged executable launch with an absolute Markdown path | Pass |
| Light and dark visual capture | Pass; `tests/artifacts/chwezi-reader-light.png` and `tests/artifacts/chwezi-reader-dark.png` |
| Packaged visual capture | Pass; both captures came from the renamed portable executable |
| macOS package configuration | DMG and ZIP targets for `x64` and `arm64`; package schema accepted by Electron Builder |
| macOS runtime and clipboard | Not assessed on this Windows host; queued in `.github/workflows/build-desktop.yml` |
| WCAG text contrast | Light 14.53:1, light muted 5.50:1, dark 14.30:1, dark muted 8.13:1 |
| UI states | Empty, loading, error, disabled, focus-visible, drag, and document states implemented |

## Release artifacts

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Chwezi-Markdown-Reader-Setup-1.0.0-x64.exe` | 100,252,819 bytes | `D7DCC24270F40E350A43EF3B804785BB075CDC3A0DF0D9E14242BC8D8E3A865D` |
| `Chwezi-Markdown-Reader-Portable-1.0.0-x64.exe` | 100,022,246 bytes | `1099FA2B3285FCC9A75F5D297664F827634C615BEA04E8AD50B700D5CACE9B9D` |

## Operational notes

- The installer registers the supported Markdown extensions. Windows still gives the user final control of the default-app choice.
- Both executables are unsigned development builds. They are suitable for local testing; apply an Authenticode certificate before public distribution.
- macOS packages must be produced on macOS. The GitHub Actions job creates unsigned Intel and Apple Silicon artifacts; sign and notarize them before public distribution.
- Markdown files are limited to 20 MB. The renderer watches the open file and refreshes after disk changes.
- A Word/Outlook-specific paste round trip was not automated. Clipboard evidence confirms that inline computed styles, headings, and tables are present; text-only destinations receive the original Markdown source.

## Release verdict

Ship the Windows build for local use and acceptance testing. Run the macOS GitHub Actions job and complete Mac runtime testing before calling version 1.0.0 cross-platform. Hold public distribution until Windows is code-signed and macOS is signed and notarized.
