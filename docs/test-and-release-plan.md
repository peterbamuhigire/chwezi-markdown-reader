# Chwezi Markdown Reader test and release plan

Plan date: 2026-07-15. This plan treats behaviour and platform evidence—not a coverage percentage—as the release gate.

## 1. Current test coverage by behaviour

The automated suite is one jsdom/Vitest file with four tests. It verifies basic GFM rendering, removal of scripts/event handlers/`javascript:` URLs, deterministic slug generation and supported extensions (`src/renderer/markdown.test.ts:4-33`). TypeScript and production builds pass. No test launches Electron, drives the DOM application, invokes IPC, touches a temporary filesystem, checks a packaged binary, pastes into another app or runs accessibility analysis.

| Behaviour | Automated evidence | Manual/audit evidence | Release-significant gap |
|---|---|---|---|
| Parse/sanitise Markdown | Two unit tests | hostile URL/SVG/data probes | Full supported-profile corpus and policy snapshots |
| Slugs/extensions | Two unit tests | duplicate suffix inspection | GitHub/CommonMark, duplicate/non-Latin/fragment fixtures |
| Open/dialog/drop/CLI/association | None | Windows portable/CLI sample | E2E across all entry points and rejected inputs |
| Second instance | None | loss confirmed at 20–100 ms | renderer-ready queue regression |
| File watching/reload | None | Windows direct/replace/delete/recreate probes | temporary-FS matrix plus real editors on both OSes |
| Relative/local images | None | sample and sanitiser probes | path, missing, size, SVG, copy/export cases |
| Remote images/privacy | None | automatic HTTP request confirmed | default-zero-network E2E |
| Search/TOC/progress | None | static/runtime probes | Unicode, split text, fallback, active result, refresh |
| Clipboard | None | Windows fixture and size failure | structural goldens plus destination paste lab |
| Print/PDF | None | 17-page PDF inspected | print E2E and pagination/code/table/image fixtures |
| Themes/responsive/a11y | None | screenshots/contrast calculation | axe, keyboard, screen reader, zoom/forced colours |
| Packaging/install/upgrade | Workflow builds only | unsigned Windows portable launch | clean-machine smoke, signatures, macOS native evidence |

## 2. Test-gap matrix

| Layer | Current | Required scope | Tool/dependency and justification | Gate |
|---|---|---|---|---|
| Pure unit | Minimal | slugs, URL/image policy, encoding, limits, errors, reload anchors, settings migration | Keep Vitest; fast deterministic feedback already installed | PR |
| DOM/component | Minimal Markdown only | render/search/TOC/progress/copy selection/theme/error states | Vitest + jsdom already installed; use real Range/selection fixtures carefully | PR |
| Main process | None | file service, queue, menus, lifecycle, print/open policies | Vitest with dependency injection/mocks; no new runner | PR |
| IPC contract | None | schema/type parity, sender/top-frame, grants, malformed payloads | Shared Zod contract + Vitest | PR |
| Security | Two sanitiser assertions | malicious Markdown corpus, URL/protocol/image/CSP/permission/fuse/ASAR checks | Fixtures plus packaged scripts; no generic scanner substitutes for boundary tests | PR/RC |
| Filesystem integration | None | direct/atomic/rename/move/delete/permission/recreate/rapid/stale callback/symlinks/TOCTOU | Node temp directories; no dependency. Test native `fs.watch` before considering Chokidar | PR + OS CI |
| Clipboard integration | None | HTML/text payloads, sizes, local/remote images, themes, structural selections | Golden normaliser + Electron clipboard; destination lab remains manual because app formats differ | PR/RC |
| Electron E2E | None | 22 core flows, network interception, refresh state, error recovery | Add Playwright for Electron: mature cross-process automation, screenshots and request assertions | PR/main |
| Packaged smoke | None | launch, open, single instance, association, print/copy, signature | Small PowerShell/shell scripts plus Playwright where attachable | RC |
| Visual regression | Captured images only | empty/loaded/error/search/TOC/themes/narrow/200%/print | Playwright screenshot assertions; avoid another image-diff dependency initially | main/RC |
| Accessibility | None | axe, keyboard, names/status/contrast; manual Narrator/VoiceOver | Add `axe-core` for repeatable automated rules; manual AT remains mandatory | PR/RC |
| Windows | Build only | x64 install/portable/association/upgrade/uninstall/signature | GitHub-hosted runner + clean VM/device lab | main/RC |
| macOS Intel | Build only | DMG/ZIP launch/Finder/clipboard/print/Gatekeeper | Native Intel runner/device; cross-build is not evidence | RC |
| macOS Apple Silicon | Build only | same on arm64 | Native arm64 runner/device | RC |
| Upgrade/install | None | same-version, upgrade, downgrade policy, uninstall/app-data/file association | Disposable VMs and retained prior stable artifact | RC |

Add `@vitest/coverage-v8` only when reporting begins; use branch reports to locate omissions, never as a quality verdict. Do not add Chokidar until native parent-directory watcher tests demonstrate a portability gap. Do not add a large E2E framework wrapper around Playwright.

## 3. Required fixtures

Keep small human-reviewable golden files in `tests/fixtures`; generate large/repetitive data deterministically during tests and exclude generated output.

### Markdown profile and hostile input

- CommonMark examples selected for blocks, inline parsing and precedence; GitHub fixtures for tables, task lists, strikethrough and autolinks.
- Heading duplicates, punctuation, spaces, combining Unicode, emoji, Arabic/Hebrew RTL, CJK and fragments.
- Raw HTML with scripts, styles, forms, iframe/object/embed, event handlers, malformed nesting and encoded URLs.
- Links: fragment, relative Markdown with fragments/spaces, local PDF/file, HTTP, HTTPS, mailto, JavaScript, data, file, protocol-relative and unknown schemes.
- Images: relative/absolute local, missing, oversized, remote HTTP/S, one-pixel tracker, data PNG/SVG, relative SVG and malformed MIME.

### Clipboard and presentation

- Heading; nested ordered/unordered/task lists; blockquotes; tables; inline/fenced code; links; local/remote images; mixed selections beginning/ending inside nested nodes; cross-structure selections; full document.
- Light, dark and neutral clipboard-theme goldens with canonicalised computed styles.
- Narrow/wide tables, unbroken code lines, multi-page prose, page-break headings and images for print/PDF.

### Filesystem and encoding

- Save producers for direct write, temporary-replace, rename, move, delete, permission removal/restoration, same-path recreation and bursts.
- Two documents for stale-debounce and startup/open-queue races; optional symlink fixtures where the OS permits them.
- UTF-8, UTF-8 BOM, invalid UTF-8, UTF-16 LE/BE BOM, LF/CRLF/CR, extremely long line, RTL, combining characters, emoji and non-Latin search terms.

### Performance

- Deterministic ~1/5/10/20 MB composites and focused variants: prose, wide/long tables, thousands of headings, large fenced code, many image references and deeply nested lists.
- Each generator records seed, byte size and structural counts. Tests measure file read, parse, sanitise, insert/ready, search, clipboard generation/payload, peak working set and responsiveness probes.

## 4. Unit-test plan

1. Extract one shared Zod-backed IPC contract and test valid/invalid payloads and serialisable errors.
2. Unit-test fatal UTF-8 decoding, BOM behaviour, byte limits before/after read and typed error mapping.
3. Unit-test canonical link/image decisions independently of DOM click handlers.
4. Expand slug/profile fixtures for duplicates and international text.
5. Test search normalisation, multiple/cross-inline matches, case/whole-word policy and stable result anchors.
6. Test reload restoration decisions: heading+offset, percentage fallback, selection anchor validation and different-document reset.
7. Test clipboard serialisation/normalisation, neutral colours, rendered-text fallback and payload boundaries.
8. Test settings migrations, corrupt settings recovery, recent-path clearing and privacy defaults when settings arrive.

Tests must assert user-observable outputs and security decisions, not private implementation call counts unless the call is itself the contract.

## 5. Integration-test plan

Use per-test temporary directories and injected clocks/readers/watch factories. Do not use developer home files.

| Area | Scenarios | Assertions |
|---|---|---|
| File service | size, extension, invalid encoding, replace/grow between stat/read, permissions, symlink | bounded bytes, canonical grant, typed platform-neutral error |
| Watcher | all required save/delete/move/recreate/burst cases | one current-generation refresh, recovery/retry, no stale-document update |
| Open queue | CLI, association, second instance before/during/after ready | exactly once, FIFO, distinct paths retained |
| IPC | expected top frame vs subframe/unexpected URL, malformed/oversized data, ungranted path | reject before privileged action; safe error returned |
| Markdown pipeline | profile/sanitisation/link/image fixtures | deterministic safe DOM and policy metadata |
| Clipboard | selection/full/source/rendered text, payload thresholds | correct MIME flavours and recoverable fallback |
| Settings/navigation | recent/reopen/history/missing files/migrations | no source mutation; state restored/removed predictably |

Run filesystem integration tests natively on Windows and macOS because Node documents platform-specific `fs.watch` behaviour. A mock-only watcher suite is insufficient.

## 6. Electron end-to-end plan

Launch development Electron for fast PR scenarios and the packaged executable for smoke scenarios. Use deterministic hooks that report renderer-ready/document-ready; remove the existing fixed-delay capture assumption (`src/main/main.ts:243-288`) from release evidence.

Minimum scenarios:

1. Empty start; toolbar open; drag/drop; CLI; OS association; early/late second instance.
2. Direct and atomic reload preserving scroll/search/active result/TOC/progress and defensible selection.
3. Delete/move/permission/recreate states and manual reload recovery.
4. TOC/internal fragments/duplicate/non-Latin headings; relative Markdown/history; allowed external and rejected unsafe links.
5. Local/missing/large/SVG images and zero remote requests until explicit consent.
6. Search multiple/split/Unicode/Turkish/accent/RTL/code/table cases, active result and Highlight-API fallback.
7. Selection/full/rendered-text/source copy in both themes, size boundary and source-path-safe HTML.
8. Print invocation and generated-PDF fixture inspection; theme default/override, resize, fullscreen entry and `Esc` exit, 200%/keyboard/high-contrast/a11y checks.
9. 1/5/10/20 MB performance runs separated from ordinary PR tests, with event-loop/input responsiveness probes.

Use app-owned test hooks only behind a build-time test flag, never environment variables accepted by public release binaries without authentication. Capture console errors, renderer crashes and unhandled rejections as failures.

## 7. Clipboard compatibility lab

Automated HTML/text goldens cannot prove destination behaviour. Before release, paste selection and full-document fixtures into available current versions of Word, Outlook, Gmail, Google Docs, LibreOffice Writer, Slack or a comparable rich composer, and Notepad/TextEdit. Record OS, app version, source theme, destination, HTML/text choice, structure, colours, tables, links and images with screenshots.

Pass criteria:

- Headings, nested lists, tasks, quotes, tables and code remain recognisable and editable.
- Dark-source copy is readable on a white destination; application-only layout/states are absent.
- Plain destinations receive rendered text for rich-copy commands and original Markdown only for the explicit source command.
- Local images are embedded only where promised; remote resources never load unexpectedly during copy/paste/export.
- Oversized content gives a precise alternative instead of a generic failure.

## 8. Platform test matrix

| Stage | Windows x64 | macOS Intel | macOS Apple Silicon |
|---|---|---|---|
| PR | typecheck/unit/integration/build; selected Electron E2E | typecheck/unit/integration/build | build where native capacity exists |
| `main` | full dev E2E, visual/a11y, unsigned package smoke | selected dev E2E/package smoke | native package smoke |
| Release candidate | clean VM NSIS/portable, association, copy/print, sign, upgrade/uninstall | clean Intel DMG/ZIP, Finder, copy/print, Gatekeeper/notarisation | same natively on arm64 |
| Stable | verify exact RC hashes/signatures and download | verify exact RC hashes/staple and download | verify exact RC hashes/staple and download |

Optional targets—Windows ARM64 and Linux—do not enter the matrix until product/support decisions and native capacity exist. Every test report must say what was not run; a configured target is not a tested target.

## 9. CI and release pipeline proposal

### Pull requests

- Least-privilege `pull_request` workflow; no signing secrets and no execution of untrusted fork code in privileged contexts.
- `npm ci`, explicit `npm run typecheck`, unit/integration tests, production build and, when introduced, lint/format checks on Windows and macOS.
- Selected Electron E2E on Windows and macOS; upload failure screenshots/logs with short retention.
- Pin third-party/official actions to reviewed full commit SHAs; use dependency caching only through trusted action inputs.

### Merges to `main`

- Repeat all gates from a clean checkout; run full development E2E, visual/a11y checks and unsigned packages.
- Launch packaged outputs and exercise open/search/copy/print/network policy; publish non-release artifacts with explicit expiry.
- Produce test/performance/security summaries. Never infer success from an earlier PR run after merge.

### Release candidates

- Trigger from an annotated `vX.Y.Z-rc.N` tag after checking tag, `package.json` and lock version consistency and changelog entry.
- Build once in protected environments; sign Windows; sign with Developer ID, hardened runtime/entitlements, notarise and staple macOS.
- Generate SHA-256 checksums and an SBOM; scan dependencies and packaged contents; assert fuses, ASAR integrity and absence of production maps.
- Install/smoke/upgrade on clean native targets, run clipboard/print lab, then attach the exact artifacts to a draft GitHub Release.

### Stable releases

- Human approval promotes the **identical tested RC bytes**; do not rebuild.
- Create stable tag/release notes/changelog links, publish artifacts/checksums/SBOM and verify public downloads/signatures.
- Retain release artifacts and evidence according to a documented policy; announce known limitations and support/security contact.

The current workflow (`.github/workflows/build-desktop.yml:3-55`) should be split or parameterised around these trust boundaries. Its tag-only/manual triggers, mutable action tags, 14-day artifact retention and absence of typecheck/smoke/release creation are insufficient.

## 10. Signing and notarisation plan

### Windows

1. Obtain an organisation-appropriate Authenticode certificate; prefer hardware/cloud-backed key custody and timestamp all signatures.
2. Restrict the signing environment to protected release jobs with approval; PRs never receive credentials.
3. Sign installer, portable executable and relevant inner binaries; verify publisher, chain and timestamp on a clean VM.
4. Record certificate renewal/revocation owners and rehearse a compromised-key response.

### macOS

1. Enrol/maintain Apple Developer ID identities and app-specific/notary credentials in protected CI.
2. Define the minimum hardened-runtime entitlements; do not disable library validation or add broad file/network entitlements without evidence.
3. Sign all nested code, validate with `codesign`, submit to notarisation, staple DMG/app where supported, and test Gatekeeper offline/online on Intel and Apple Silicon.
4. Preserve notarisation logs and Team ID/bundle ID/version evidence with the release.

Do not implement automatic updates until signed artifact identity, immutable promotion, channel metadata verification and rollback are proven.

## 11. Stable release checklist

- [ ] Version, annotated tag, changelog, release notes and supported Markdown profile agree.
- [ ] Clean `npm ci`, typecheck, unit/integration/E2E/a11y/build gates pass on required native targets.
- [ ] No unresolved Blocker/Critical/High findings; accepted Medium risks have owner, rationale and user-facing limitation.
- [ ] Remote images are blocked by default and IPC/path/protocol/security fixtures pass.
- [ ] 1/5/10/20 MB budgets and documented admission/copy behaviour pass or fail predictably.
- [ ] Clipboard destination matrix and multi-page print/PDF matrix are signed off.
- [ ] Windows NSIS/portable clean install/launch/association/upgrade/uninstall and signature pass.
- [ ] macOS Intel/Apple Silicon DMG/ZIP launch/Finder/clipboard/print/Gatekeeper/notarisation pass.
- [ ] Packaged fuses/ASAR/source-map/dependency contents meet policy; `npm audit` and SBOM are reviewed.
- [ ] Exact tested artifacts, SHA-256 files and SBOM are attached to the draft release.
- [ ] Public download verification, support/security contacts, retention and rollback owner are ready.
- [ ] Release approval promotes rather than rebuilds the RC.

## 12. Rollback plan

1. Keep the prior signed stable installers, checksums, notes and test evidence available.
2. Define app-data/settings schema migrations as backward-compatible for the 1.x line; test upgrade and supported downgrade. Never mutate Markdown source.
3. For a bad release, unpublish/mark affected artifacts clearly, preserve them privately for investigation, publish an advisory, and restore links to the last known-good signed release.
4. If signing material is suspected, stop releases, revoke/rotate through the CA/Apple process, disclose affected versions and re-establish trust before shipping.
5. If a future updater exists, it may offer rollback only after signed metadata and anti-downgrade/security rules are designed; manual signed rollback remains the initial mechanism.

## 13. Definition of done for public release

A public professional release is done only when:

- The 1.0.1 correctness scope—privacy, watcher/reload, startup queue, limits/copy, UTF-8/error wording and IPC/package hardening—is complete with regression tests.
- Core behaviours pass Electron E2E and packaged smoke tests on Windows x64, macOS Intel and macOS Apple Silicon; untested platforms are not advertised.
- Windows artifacts are validly Authenticode-signed and macOS artifacts are Developer-ID-signed, hardened, notarised and stapled.
- The exact approved artifacts, checksums, SBOM, changelog, known limitations and security/support policy are public and mutually consistent.
- Accessibility keyboard/zoom/contrast/axe gates pass, and Narrator/VoiceOver results have no release-blocking defect.
- Large-document and clipboard bounds are documented and verified; valid admitted documents have an actionable successful copy fallback.
- Release/rollback ownership exists and no automatic-update dependency is assumed.

Minimum suite before that release: expanded parser/sanitiser/profile units; file/watcher/encoding/IPC/security integrations; the 22-flow Electron E2E set; remote-network denial; reload-state and startup-race regressions; clipboard goldens plus destination lab; print/PDF fixtures; performance budgets; axe/keyboard checks; and signed packaged clean-machine smoke/upgrade tests on all advertised platforms.
