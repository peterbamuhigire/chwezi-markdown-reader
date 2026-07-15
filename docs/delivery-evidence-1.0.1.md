# Chwezi Markdown Reader 1.0.1 delivery evidence

Date: 2026-07-15  
Owner: Peter Bamuhigire  
Implementation reviewer: Codex root integration  
Related roadmap: `docs/feature-roadmap.md`

## Problem and success criteria

This slice addresses the release-blocking 1.0.1 findings: silent remote-image requests, atomic-save watcher fragility, lost startup opens, refresh-state loss, unbounded/ambiguous clipboard failure, permissive path IPC, invalid encoding, weak CI, and the limited native About message box.

Success requires a sandboxed renderer, explicit file grants, zero remote requests by default, deterministic open ordering, recoverable file replacement, preserved reading context, accurate clipboard errors, an accessible About dialog, fullscreen Escape recovery, PR/main quality gates, and packaged Windows evidence.

## Decision record

| Decision | Rationale | Alternative rejected | Reversal trigger |
|---|---|---|---|
| Watch the parent directory and filter the active basename | Survives inode-replacing editor saves without a new dependency | Keep exact-file `fs.watch`; add Chokidar immediately | Native macOS/network-volume tests show parent watching is inadequate |
| Grant canonical paths before reads | Stops arbitrary renderer path reads while retaining dialog/drop/OS flows | Extension-only authorisation | Folder-library scope introduces explicit directory grants |
| Block remote HTTP/S images in both renderer policy and session requests | Defence in depth for the private-reader promise | Permit or prompt after the request begins | User explicitly changes the global/document policy |
| Bundle preload with Vite | Sandboxed preloads cannot require local emitted modules; bundling preserves sandbox and shared Zod contracts | Disable sandbox; duplicate runtime validation | Electron provides safe local-module support for sandboxed preloads |
| Use rendered text as rich-copy plain-text flavour | Matches destination expectations; source remains a separate command | Original Markdown fallback for every rich copy | Compatibility testing demonstrates a better destination-specific profile |
| Keep native menus text-first | Matches Windows/macOS conventions | Decorative icon on every menu item | A platform-specific convention or usability test supports an icon |
| Display supplied multicolour SVGs as images | Preserves their internal shapes; alpha masking produced ambiguous blocks | Flatten mixed illustrations to monochrome masks | A coherent monochrome 24 px family is supplied and licensed |

## Architecture and contracts

- `src/main/ipc-contracts.ts`: central channels, Zod schemas, byte limits and event types.
- `src/main/document-service.ts`: canonical grants, fatal UTF-8 decoding and pre/post-read size checks.
- `src/main/document-watcher.ts`: parent watcher, generation-safe debounce, retry and document lifecycle states.
- `src/main/preload.ts`: bundled, sandbox-compatible narrow bridge.
- `src/renderer/app.ts`: reload snapshots, privacy consent, search fallback, copy policy, About and fullscreen controls.
- `vite.preload.config.ts`: produces a single sandbox-compatible `dist/main/preload.js` while keeping `electron` external.

Expected failures cross IPC as rejected promises with user-facing recovery text. Markdown source is never modified. Remote-image consent is either one-document state or an explicit stored global preference.

## Critical flows

| Actor/trigger | Happy path | Failure behaviour | Evidence |
|---|---|---|---|
| OS opens files during startup | FIFO waits for renderer readiness and opens each granted path | Malformed OS argument is ignored; app remains usable | Packaged open smoke; queue code review |
| Editor replaces/deletes/recreates file | Parent watcher emits changed/missing/restored and renderer preserves state | Recoverable error stays visible until restoration | Filesystem watcher tests |
| Untrusted Markdown contains remote image | Placeholder and privacy banner; no network request | User may allow only this document or persist allow | Renderer tests; loopback packaged smoke reports 0 requests |
| User richly copies | Sanitised HTML plus rendered text written within byte limits | Text fallback for oversized HTML; precise unavailable/oversize error | Contract tests; host clipboard limitation recorded below |
| User enters fullscreen | BrowserWindow enters fullscreen; Escape restores prior window state | Control remains synchronised with native menu state | Windows runtime result `entered=true`, `exited=true` |
| User opens About | Modal shows version, verified developer/contact/licence and privacy promise | Escape, close button and Done return focus | Windows visual capture inspected |

## Test evidence

| Gate | Result |
|---|---|
| `npm ci` | Passed after one EPERM retry; 366 packages, 367 audited, 0 vulnerabilities |
| `npm run typecheck` | Passed for main, preload and renderer |
| `npm test` | 38/38 passed across 6 files |
| `npm run build` | Passed; preload bundle 126.65 kB, renderer JS 87.08 kB, CSS 38.10 kB before gzip |
| Unpacked Windows package | Passed; `app.asar` 6,884,517 bytes |
| Static package verification | Executable and ASAR verified |
| Packaged open/render/privacy/fullscreen smoke | Passed; PNG 95,416 bytes, 0 remote requests, fullscreen entered/exited |
| About visual check | Passed at 1200×820 Windows capture; narrow/200% and macOS remain pending |
| `git diff --check` | Passed; line-ending conversion warnings only |

Test coverage includes GFM/profile/sanitisation/Unicode, IPC uniqueness and limits, UTF-8 BOM/invalid/UTF-16 cases, grant rejection, file growth between stat/read, direct and atomic saves, delete/recreate, stale debounce, rapid changes, remote-image policy and release workflow contracts.

## Failed commands and corrections

1. A concurrent `npm ci` failed with EPERM on Electron's `d3dcompiler_47.dll` and temporarily removed `.bin`; after Electron processes ended, `npm ci` passed. A build attempted during that window failed because `tsc` was unavailable.
2. The first integrated smoke captured the empty screen. Runtime diagnostics found the sandboxed preload could not require `./ipc-contracts`. Preload bundling fixed the bridge without weakening the sandbox.
3. The next smoke captured before the newly rendered frame painted. A two-frame render acknowledgement fixed the visual race.
4. Full clipboard smoke remains blocked because the Windows host clipboard is unavailable to both Electron and PowerShell (`Get-Clipboard` and `Set-Clipboard` fail). The app now retries and reports clipboard unavailability instead of claiming success. Packaged smoke was rerun with clipboard checks explicitly skipped; this is partial evidence, not a clipboard pass.

## Security and privacy evidence

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` remain enabled.
- Every privileged IPC handler validates the owning main frame and canonical renderer file URL.
- File reads require prior grant; adjacent Markdown paths are rejected in tests.
- Session request filtering and sanitiser-time image rewriting prevent remote-image requests before consent.
- Preload is bundled; no local runtime `require` remains in the sandbox.
- CI uses immutable action SHAs and read-only contents permission for PR/main gates.

## Operational and ownership notes

The application has no server-side telemetry or remote operational surface. Diagnostics remain local. Release owners must review CI artifacts, checksums, dependency audit, packaged smoke output and native platform results. Clipboard, watcher and file-open failures are user-visible; no document content should be included in diagnostic logs.

Rollback is source-level: revert the 1.0.1 change set and rebuild the previous signed/unsigned artifact. Settings added in this slice (`theme`, `remote-image-policy`) are optional strings; older builds ignore the remote-image key. No Markdown or irreversible user-data migration occurs.

## Residual risk and release verdict

- Full rich-clipboard packaged smoke must pass on a host with a working Windows clipboard and in representative destination applications.
- Native macOS Intel and Apple Silicon watcher, fullscreen, About, clipboard, Finder and packaging tests are not run locally.
- Installer signing, Apple signing/notarisation and immutable stable release promotion remain absent.
- Supplied premium SVG redistribution rights are not yet evidenced; do not publish them until the licence is retained in the release record.
- Windows network-volume and permission-change watcher behaviour remains unverified.

Architecture: pass. Security/privacy: pass for this slice. Reliability: conditional pass. UX: Windows visual pass with accessibility/platform gaps. Public professional release: **hold** pending clipboard, macOS and signing gates. Controlled Windows beta: **ship candidate** after the icon licence is verified.

## Anti-slop gate

Verdict: A. The implementation has named contracts, executable fixtures, recorded failures and residual risks. No placeholder tests, invented package claims or unverified platform-success statements are used.
