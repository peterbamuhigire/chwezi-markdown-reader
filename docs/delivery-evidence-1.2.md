# Version 1.2 delivery evidence

**Evidence date:** 15 July 2026  
**Baseline commit:** `7105df42b3021f141e459cfe66dad02582713da6`  
**Disposition:** Windows package candidate passed automated and visual smoke checks. Public release remains held for native macOS verification, signing/notarisation, a healthy-host clipboard interoperability run, and native folder/export dialog checks.

## Delivered scope

- Session-only folder grants with bounded depth-first Markdown enumeration.
- Canonical containment checks for symlinks, junctions and directory replacement.
- Cancellable folder-wide search with Unicode, match-case, whole-word, byte and result limits.
- Explicit-save self-contained HTML and PDF export.
- UUID-namespaced image tokens, local-image containment and passive exported HTML.
- Safe scalar front-matter presentation with an exact 64 KiB UTF-8 limit.
- Accessible folder navigation, roving Outline/Folder tabs and active-document state.
- Application and Markdown file-type icons generated from the supplied SVG masters.
- Purchased interface icons applied to implemented actions and normalised with `currentColor` where appropriate.
- Explicit Electron fuse policy, embedded ASAR integrity and production source-map exclusion.

## Security decisions

- Folder paths and search contents are not persisted.
- Folder grants are opaque UUIDs and expire with the process.
- Folder reads stay inside the canonical granted root; symlinks are not followed during enumeration.
- Folder search is capped at 100 MiB aggregate input and 200 results; individual files retain the 20 MiB document limit.
- HTML export embeds only supported raster images inside the active document folder.
- Remote resources, active/structural markup, CSS breakouts and SVG export are rejected.
- Export destinations come only from native save dialogs; renderer code cannot provide an arbitrary output path.

## Verification results

| Command or check | Result |
| --- | --- |
| `npm run icons:check` | Exit 0; deterministic app ICO 23,703 B, app ICNS 134,687 B, file ICO 12,445 B, file ICNS 63,950 B |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0; 22 files, 166 tests passed |
| `npm run build` | Exit 0 |
| `npm run package:smoke` | Exit 0; Windows x64 unpacked package created |
| `npm run test:package-static` | Exit 0; executable, 11,777,538-byte ASAR, fuse states and absence of source maps verified |
| `node scripts/smoke-electron.cjs --packaged release/smoke --skip-clipboard` | Exit 0; document rendered, remote requests 0, fullscreen entered and escaped |
| NSIS installer icon verification build | Exit 0; `Chwezi-Markdown-Reader-Setup-1.0.0-x64.exe` built with distinct app/file icon configuration |
| Renderer SVG safety scan | 30 assets; 0 script, foreign-object, event-handler or external/data reference matches |
| Mojibake scan | Clean across source, tests, scripts, package and workflows |
| `npm audit --audit-level=high` | Exit 0; 0 vulnerabilities |
| `git diff --check` | Exit 0; only Git LF-to-CRLF notices |

## Visual evidence

- Packaged reader screenshot: `release/visual-evidence-1.2/reader.png` (96,959 B).
- Packaged About screenshot: `release/visual-evidence-1.2/about.png` (200,275 B).
- Fullscreen evidence: `{"entered":true,"exited":true}`.
- The app identity is recognizable at toolbar size and in the About dialog.
- Action icons use a consistent monochrome treatment; app identity and HTML/PDF format icons retain intentional colour.
- Default light presentation was observed on this light-mode Windows host.

## Defects found and fixed during the gate

1. A complete front-matter block could exceed its documented 64 KiB limit by one byte. The limit now includes both delimiters and the closing newline.
2. Outline and Folder tabs lacked a roving tab stop. The selected tab now has `tabindex="0"`; the inactive tab has `-1`.
3. The active library document was only visually marked. It now exposes `aria-current="page"`.
4. Breadth-first enumeration made an indented flat tree ambiguous. Folder snapshots now use depth-first order.
5. Fixed export tokens could collide with literal document text. Tokens now carry a per-export UUID namespace.
6. The print stylesheet could include the remote-image privacy banner. All application chrome is now excluded from print/PDF output.
7. Purchased toolbar icons retained unrelated source colours. Functional controls now use `currentColor` masks.
8. The first hardened package still contained seven dependency source maps from DOMPurify and Marked. Packaging now excludes `node_modules/**/*.map`, and the ASAR check passes.

## Failed or unavailable checks

- Full rich-clipboard packaged smoke was skipped because the Windows host clipboard is unavailable system-wide; Electron and PowerShell readback both fail on this host. The default CI command still requires clipboard verification.
- Windows UI automation could not connect to its native control pipe, so folder chooser, search cancellation, HTML save and PDF save were not driven through the packaged UI in this run.
- A first manual screenshot command checked for capture files before Electron's spawned process finished. The corrected polling run produced all expected evidence.
- The first hardened `npm run test:package-static` exited 1 because it found seven dependency source maps. The package filter was corrected; the rerun verified no maps and the expected fuse states.
- macOS Intel and Apple Silicon packaging/runtime, Finder association icons, Developer ID signing and notarisation were not run on this Windows host.
- The NSIS installer compiled successfully, but it was not installed; Explorer association display and upgrade behavior remain unverified.

## Release hold

Do not call this a professionally distributed public release yet. Required external gates are:

1. Run the complete packaged smoke suite on a Windows host with a healthy clipboard.
2. Exercise folder navigation, cancellation, HTML export and multi-page PDF export through native dialogs.
3. Run macOS x64 and arm64 package, launch, Finder association, print/export and accessibility checks.
4. Configure and verify Windows Authenticode plus Apple Developer ID signing/notarisation.
5. Archive the purchased icon-platform redistribution licence with the release records.
