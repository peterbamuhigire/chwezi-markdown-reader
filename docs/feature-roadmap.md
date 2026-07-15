# Chwezi Markdown Reader feature roadmap

Audit basis: repository evaluation dated 2026-07-15. Effort is XS/S/M/L/XL for this codebase, not elapsed calendar time.

## 1. Product positioning

Chwezi Markdown Reader should be the fast, private and dependable desktop reader for local Markdown, distinguished by excellent reading presentation and unusually faithful copying. It should not become a general editor, cloud workspace or plugin host. The sequence is reliability and trust first, stronger single-document reading second, modest collections/export third.

## 2. Design principles

1. Local and private by default; network access is explicit and visible.
2. Never lose the user's place because a file changes or another file opens.
3. Copy fidelity is a first-class product surface with measurable compatibility.
4. Stay responsive or state an honest limit with progress and cancellation.
5. Follow Windows and macOS conventions without platform-specific wording.
6. Add Markdown syntax deliberately through a versioned supported profile.
7. Prefer small modules and reversible changes; no framework rewrite.
8. Signed, reproducible release integrity precedes automatic updating.
9. Use a coherent SVG icon family in custom chrome and dialogs; keep native application menus text-first unless a platform convention calls for an icon.

## 3. Features to preserve

Preserve the clean reader-first chrome, local-file workflow, light/dark presentation, generated outline, search/progress, automatic refresh, printing, selection/full/source copy choices, sanitisation, renderer sandbox, Windows portable option and dual-architecture macOS packaging intent. Improvements must not introduce document mutation or require an account.

## 4. Feature scoring matrix

“Fit” is Strong/Conditional/Poor. Privacy notes identify the principal implication; “none” means no material new boundary. Architectural preparation is abbreviated in the Dependency/prep column.

### Reliability and foundation

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Atomic-save-resilient watching | Build | Strong | Very high | M | Medium | path/symlink policy | file + watcher services | 1.0.1 |
| Preserve scroll during reload | Build | Strong | Very high | M | Medium | none | reload state model | 1.0.1 |
| Deleted/moved-file recovery | Build | Strong | High | M | Medium | disclose path carefully | watcher state model | 1.0.1 |
| Safe second-instance queue | Build | Strong | Very high | S | Low | validate path grants | renderer-ready protocol | 1.0.1 |
| Consistent document/clipboard limits | Build | Strong | Very high | M | Medium | bounded payloads | clipboard service/benchmarks | 1.0.1 |
| Large-document performance | Build | Strong | High | L | High | resource exhaustion | pipeline metrics/worker spike | 1.1 |
| Remote-image privacy controls | Build | Strong | Very high | M | Medium | controls network disclosure | image policy/settings | 1.0.1 |
| PR/default-branch CI | Build | Strong | Very high | S | Low | least-privilege CI | scripts/action pins | 1.0.1 |
| Electron end-to-end tests | Build | Strong | Very high | L | Medium | fixtures must be local | test seams/Playwright | 1.0.1 |
| Signed/notarised pipeline | Build | Strong | Very high | L | High | key/secret custody | release promotion design | public 1.x |

### Core reader

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Recent files | Build | Strong | High | M | Low | stores sensitive paths locally | versioned settings | 1.1 |
| Reopen last document | Build | Strong | High | S | Low | opt-out/local path | recent-files store | 1.1 |
| Restore window/reading state | Build | Strong | High | M | Medium | local metadata only | settings + anchor model | 1.1 |
| Open folder as Markdown library | Build | Conditional | High | L | Medium | broadens path authority | folder grants/navigation | 1.2 |
| Folder tree navigation | Build | Conditional | High | L | Medium | metadata/path exposure | library model | 1.2 |
| Back/forward document navigation | Build | Strong | High | M | Medium | history stored locally | navigation service | 1.1 |
| Multiple document tabs | Defer | Conditional | Medium | L | Medium | more retained content/paths | demand + navigation model | 2.0 review |
| Reveal file in Explorer/Finder | Build | Strong | Medium | XS | Low | explicit user gesture | canonical active path | 1.1 |
| Open in external editor | Build | Strong | High | S | Low | OS association launch | canonical active path | 1.1 |
| Active TOC heading | Build | Strong | High | M | Low | none | IntersectionObserver/anchors | 1.1 |
| Back-to-top control | Build | Strong | Medium | XS | Low | none | accessible visibility rule | 1.1 |
| Collapsible headings | Defer | Conditional | Medium | M | Medium | none | stable section model | 2.0 review |
| Reader font selection | Build | Strong | Medium | S | Low | local fonts reveal no network | settings/theme tokens | 1.1 |
| Font-size control | Build | Strong | High | S | Low | none | settings/theme tokens | 1.1 |
| Line-height control | Build | Strong | Medium | S | Low | none | settings/theme tokens | 1.1 |
| Reading-width control | Build | Strong | High | S | Low | none | settings/theme tokens | 1.1 |
| Paragraph-spacing control | Build | Strong | Medium | S | Low | none | settings/theme tokens | 1.1 |
| Distraction-free mode | Investigate | Conditional | Medium | M | Low | none | usage research/window state | 1.2 |
| Full-screen reading | Build | Strong | Medium | XS | Low | none | native menu/shortcut | 1.1 |
| External bookmarks | Defer | Conditional | Medium | M | Medium | sensitive reading history | stable document identity | 2.0 |

### Markdown compatibility

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Syntax highlighting | Build | Strong | High | M | Medium | no CDN/language execution | pipeline + bundled highlighter | 1.1 |
| Copy-code buttons | Build | Strong | High | S | Low | clipboard gesture | code enhancement service | 1.1 |
| Footnotes | Build | Strong | High | M | Medium | sanitise generated anchors | explicit Markdown profile | 1.2 |
| YAML front matter presentation | Build | Strong | Medium | M | Medium | avoid exposing hidden secrets in copy by surprise | profile/metadata view | 1.2 |
| Definition lists | Defer | Conditional | Low | S | Low | none | profile demand | 2.0 review |
| GitHub alerts/callouts | Investigate | Conditional | Medium | M | Medium | sanitise output | compatibility research | 1.2 |
| Heading permalink buttons | Build | Strong | Medium | S | Low | copies local fragment only | slug compatibility | 1.1 |
| Mermaid | Investigate | Conditional | Medium | XL | High | script/render/DoS boundary | sandboxed rendering design | 2.0 |
| KaTeX mathematics | Investigate | Conditional | Medium | L | Medium | sanitise/bundle fonts | profile/performance spike | 2.0 |
| Emoji shortcodes | Reject | Poor | Low | S | Low | none | native Unicode is enough | — |
| Custom containers | Reject | Poor | Low | M | Medium | plugin-like grammar surface | conflicts with explicit profile | — |
| Automatic TOC directives | Reject | Poor | Low | M | Medium | duplicate app TOC | no need | — |
| CommonMark fixtures | Build | Strong | High | M | Low | none | golden fixture harness | 1.0.1 |
| GitHub compatibility fixtures | Build | Strong | High | M | Low | avoid remote fixtures at runtime | golden fixture harness | 1.0.1 |

Supported profile: CommonMark plus Marked's GFM tables, task lists, strikethrough and autolinks; raw HTML is accepted only after the documented DOMPurify policy. Footnotes and front matter may join in 1.2 after versioned fixtures. The app should disclose deliberate differences such as sanitised HTML and slug rules.

### Search and navigation

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Active-result highlighting | Build | Strong | High | S | Low | none | search service/fallback | 1.0.1 |
| Match case | Build | Strong | Medium | S | Low | none | search options model | 1.1 |
| Whole word | Build | Strong | Medium | M | Medium | Unicode boundary correctness | search service | 1.1 |
| Regular expressions | Defer | Conditional | Low | M | High | ReDoS/resource risk | safe engine/time budget | 2.0 review |
| Search history | Defer | Conditional | Low | S | Low | stores sensitive queries | demonstrated demand | 2.0 review |
| Folder-wide search | Build | Conditional | High | L | Medium | indexes filenames/content locally | library grants/index design | 1.2 |
| Search results panel | Build | Conditional | High | M | Medium | local snippets | folder search first | 1.2 |
| Outline filtering | Build | Strong | Medium | S | Low | none | TOC state model | 1.1 |
| Keyboard command palette | Defer | Conditional | Low | L | Medium | expands command surface | command density evidence | 2.0 review |

### Copy and export

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Copy rendered plain text | Build | Strong | High | S | Low | clipboard content explicit | clipboard serializer | 1.0.1 |
| Copy as standalone HTML | Build | Strong | High | M | Medium | local/remote resource leakage | export policy | 1.2 |
| Export self-contained HTML | Build | Strong | High | L | Medium | embed only authorised resources | export service | 1.2 |
| Export PDF | Build | Strong | High | M | Medium | path/output permission | print CSS + save dialog | 1.2 |
| Copy section from TOC | Investigate | Conditional | Medium | M | Medium | clear section boundary | stable heading ranges | 1.2 |
| Copy Markdown for selected section | Investigate | Conditional | Medium | L | High | source/render range mapping | parser source positions | 2.0 |
| Embed local images in HTML export | Build | Strong | High | M | Medium | size/MIME/path grants | export service/limits | 1.2 |
| Configurable clipboard theme | Build | Strong | High | M | Medium | none | clipboard serializer/profiles | 1.1 |
| Word/email/web compatibility profiles | Investigate | Strong | High | L | High | destination quirks; no network | paste lab/evidence | 1.2 |

### Distribution

| Feature / user problem | Decision | Fit | Value | Effort | Risk | Security/privacy | Dependency/prep | Release |
|---|---|---|---|---|---|---|---|---|
| Windows ARM64 | Defer | Conditional | Low | M | Medium | signing target | demand/native test device | 2.0 review |
| Linux AppImage/Deb | Defer | Conditional | Medium | L | Medium | third support platform | support capacity | 2.0 review |
| Mac App Store | Defer | Conditional | Low | XL | High | sandbox/store policy | business decision | later |
| Microsoft Store | Defer | Conditional | Low | L | Medium | store identity | business decision | later |
| Homebrew cask | Investigate | Strong | Medium | S | Low | signed/notarised URL/hash | stable releases | after signed 1.x |
| Winget | Investigate | Strong | Medium | S | Low | signed URL/hash | stable releases | after signed 1.x |
| Automatic updates | Defer | Conditional | High | L | High | privileged supply chain | signing/integrity/rollback | 2.0 earliest |
| Crash reporting | Defer | Conditional | Medium | M | High | document/path privacy | business/consent/DPA | later |
| Optional diagnostics | Investigate | Conditional | Medium | M | High | strict opt-in/minimisation | privacy design/support need | later |

## 5. Recommended features and acceptance criteria

### Resilient file lifecycle

**Decision:** Build  
**User problem:** Atomic saves, deletion, moves and rapid changes can stop or destabilise refresh.  
**Strategic fit:** Dependability is central to a reader that stays open beside an editor.  
**User value:** Very high  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** File service, parent-directory watcher, typed document states.  
**Implementation outline:** Filter parent-directory events by canonical basename, use generation-scoped debounce/retry, and expose changed/missing/moved/permission states without adding a watcher dependency initially.  
**Acceptance criteria:**
- [ ] Direct, atomic, rename, move, delete, permission, recreate and rapid-save fixtures pass on Windows and macOS.
- [ ] A stale callback can never replace the newly active document; recoverable errors explain recovery.
**Recommended release:** 1.0.1

### Reload-state preservation

**Decision:** Build  
**User problem:** Refresh currently loses the reader's place, selection and search result.  
**Strategic fit:** Makes live reading dependable without editor scope.  
**User value:** Very high  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Stable heading/text anchors and explicit reload state.  
**Implementation outline:** Restore heading plus pixel offset, fallback percentage, rerun search, map the active result and restore only verifiable selections.  
**Acceptance criteria:**
- [ ] Same-file refresh preserves position, query, nearest active match, progress and TOC state.
- [ ] Changed/missing anchors fall back predictably; opening another document resets state.
**Recommended release:** 1.0.1

### Safe open queue

**Decision:** Build  
**User problem:** OS/CLI file opens during startup can disappear.  
**Strategic fit:** Fundamental desktop correctness.  
**User value:** Very high  
**Effort:** S  
**Risk:** Low  
**Dependencies:** Renderer-ready acknowledgement and canonical path grant.  
**Implementation outline:** Queue all startup, association and second-instance opens in one FIFO and drain after readiness.  
**Acceptance criteria:**
- [ ] Opens before, during and after renderer load are processed exactly once in order.
- [ ] Two rapid distinct files are not collapsed; exact duplicate OS events may be safely coalesced.
**Recommended release:** 1.0.1

### Consistent limits and clipboard fallbacks

**Decision:** Build  
**User problem:** A document that opens may fail its most important copy command.  
**Strategic fit:** Directly protects rich-copy fidelity and predictable failure.  
**User value:** Very high  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Clipboard serializer, representative destination fixtures and performance budgets.  
**Implementation outline:** Measure generated bytes, reduce repeated styles, use a neutral theme, make rendered text the HTML fallback, retain a separate source command and show precise alternatives.  
**Acceptance criteria:**
- [ ] Every admitted fixture either richly copies within a documented bound or offers a successful rendered-text/source fallback.
- [ ] Heading, nested list, task, quote, table, inline/fenced code, links, images and mixed selections pass golden tests in light/dark modes.
**Recommended release:** 1.0.1, compatibility refinements in 1.1

### Remote-image privacy controls

**Decision:** Build  
**User problem:** A local document can silently report that it was opened.  
**Strategic fit:** Essential to the private-reader promise.  
**User value:** Very high  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Central image policy, versioned setting, CSP/request interception.  
**Implementation outline:** Block remote loads by default, show placeholders/indicator, support explicit per-document load and optional global opt-in.  
**Acceptance criteria:**
- [ ] Opening untrusted Markdown causes zero HTTP/S requests by default.
- [ ] Consent loads only HTTP/S image resources, is visible, and per-document consent does not silently persist.
**Recommended release:** 1.0.1

### CI and desktop regression foundation

**Decision:** Build  
**User problem:** Core desktop regressions can merge or ship undetected.  
**Strategic fit:** Enables every dependable reader improvement.  
**User value:** Very high  
**Effort:** L  
**Risk:** Medium  
**Dependencies:** Shared contracts/services, Playwright Electron support, local fixtures, axe-core.  
**Implementation outline:** Gate PR/main with typecheck/unit/integration/build, add Windows Electron E2E first, native macOS smoke coverage, and pin actions by SHA.  
**Acceptance criteria:**
- [ ] PR and `main` cannot pass without explicit typecheck, tests and build on Windows/macOS.
- [ ] Packaged smoke tests cover launch/open/reload/search/copy/print-link policy and axe has no serious known app-chrome violations.
**Recommended release:** 1.0.1 foundation; expand continuously

### Large-document responsiveness

**Decision:** Build  
**User problem:** 5–20 MB inputs can freeze the UI for 8–43 seconds.  
**Strategic fit:** Speed is in the product promise, but arbitrary giant-file support is not.  
**User value:** High  
**Effort:** L  
**Risk:** High  
**Dependencies:** Instrumented Markdown pipeline, structure budgets, worker/batching spike.  
**Implementation outline:** Publish a responsive limit, add progress/cancel and pathological-node limits, then move safe parse work off-thread and batch DOM work only if benchmarks prove benefit.  
**Acceptance criteria:**
- [ ] 1/5/10/20 MB prose/table/code/heading/image/list fixtures have recorded time, memory, search and copy budgets on both platforms.
- [ ] The window remains cancellable and communicates progress; oversized/complex inputs fail safely without data loss.
**Recommended release:** Guardrails in 1.0.1; optimisation in 1.1

### Safe document navigation and history

**Decision:** Build  
**User problem:** Relative Markdown links do not work and readers cannot return to prior documents.  
**Strategic fit:** Natural reader navigation without editing complexity.  
**User value:** High  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Link policy, navigation service, canonical grants and per-document state.  
**Implementation outline:** Resolve authorised relative Markdown paths/fragments in-reader; maintain back/forward entries with reading anchors; confirm local non-Markdown OS opens.  
**Acceptance criteria:**
- [ ] Relative paths, spaces, non-Latin names and fragments navigate safely with working back/forward state.
- [ ] JavaScript/data/file/protocol-relative/unknown schemes are rejected; permitted web/mail links remain external.
**Recommended release:** 1.1

### Reader continuity and appearance

**Decision:** Build  
**User problem:** Users repeatedly locate files and cannot tune typography to their needs.  
**Strategic fit:** High-value reading comfort, stored outside source files.  
**User value:** High  
**Effort:** M  
**Risk:** Low  
**Dependencies:** Versioned local settings with path-removal and reset controls.  
**Implementation outline:** Recent/reopen, window/reading restoration, font/size/line-height/width/paragraph controls, fullscreen and reveal/open-editor actions.  
**Acceptance criteria:**
- [ ] State survives restart, missing paths degrade cleanly, users can clear history/reset appearance, and no document is modified.
- [ ] Settings work at 200% zoom, narrow widths, RTL content and both themes on Windows/macOS.
- [ ] With no saved preference, light is the default unless the operating system reports dark mode; an explicit saved choice continues to win.
- [ ] Fullscreen is reachable from the native menu and reader UI, and `Esc` always returns an app-entered fullscreen window to its prior state.
**Recommended release:** 1.1

### TOC and search refinement

**Decision:** Build  
**User problem:** The current result/heading context is unclear and search has no fallback.  
**Strategic fit:** Core long-document navigation.  
**User value:** High  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Search/TOC services, compatible slug fixtures.  
**Implementation outline:** Distinguish active match, support fallback and cross-inline matches, add case/whole-word options, active heading, outline filtering, permalinks and back-to-top.  
**Acceptance criteria:**
- [ ] Multiple/split/Unicode/Turkish/accent/RTL/code/table cases and no-Highlight-API mode have deterministic results.
- [ ] Active search and TOC entries are visually and programmatically indicated; duplicate/non-Latin fragments have fixtures.
**Recommended release:** Active/fallback in 1.0.1; remaining scope in 1.1

### Code reading enhancements

**Decision:** Build  
**User problem:** Long technical documents are harder to scan and reuse without highlighted, easily copied code.  
**Strategic fit:** Common Markdown-reader need with bounded scope.  
**User value:** High  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Bundled, no-network highlighter; Markdown pipeline and clipboard tests.  
**Implementation outline:** Highlight an explicit language subset lazily and add keyboard-accessible copy buttons without executing code.  
**Acceptance criteria:**
- [ ] Unknown/huge blocks fall back safely; highlighting never loads a CDN or executes document content.
- [ ] Copy buttons have accessible names/status and preserve exact source text/newlines.
**Recommended release:** 1.1

### Folder collections and search

**Decision:** Build  
**User problem:** Readers with related local documents cannot browse or search the collection.  
**Strategic fit:** Conditional but valuable if kept a navigator, not a workspace/editor.  
**User value:** High  
**Effort:** L  
**Risk:** Medium  
**Dependencies:** Explicit folder grants, navigation/history, cancellable local index/search and privacy-safe settings.  
**Implementation outline:** Add a Markdown-only folder tree and on-demand/cancellable search; do not add file editing, Git or cloud sync.  
**Acceptance criteria:**
- [ ] Only authorised folders are enumerated; symlinks, permission failures, renames and large trees have defined behaviour.
- [ ] Search is cancellable, reports progress, handles Unicode, and stores no content outside local app data without disclosure.
**Recommended release:** 1.2

### Self-contained HTML and PDF export

**Decision:** Build  
**User problem:** Print is basic and copied HTML depends on source resources.  
**Strategic fit:** Extends faithful presentation without editing.  
**User value:** High  
**Effort:** L  
**Risk:** Medium  
**Dependencies:** Export service, image/MIME/size policy, improved print CSS and save-dialog grants.  
**Implementation outline:** Produce sanitised standalone HTML with authorised local images optionally embedded; add predictable PDF export after print pagination fixes.  
**Acceptance criteria:**
- [ ] Exported HTML opens offline with no unexpected network requests and deterministic neutral/light styling.
- [ ] PDF handles pages, heading breaks, wide tables, code, images, links and light output from dark mode; cancellation/errors preserve no partial output.
**Recommended release:** 1.2

### Footnotes and front matter

**Decision:** Build  
**User problem:** Common technical/publishing Markdown loses useful notes and metadata presentation.  
**Strategic fit:** Bounded profile additions with clear reading value.  
**User value:** High  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** Versioned profile, parser evaluation, sanitisation/copy/export fixtures.  
**Implementation outline:** Render accessible footnotes/backlinks and an optional collapsed metadata panel; never treat YAML as executable configuration.  
**Acceptance criteria:**
- [ ] Profile/version is documented and CommonMark/GitHub regression fixtures remain stable.
- [ ] Malformed/hostile metadata is plain data; footnote navigation, copy and print are accessible and deterministic.
**Recommended release:** 1.2

### Signed and notarised release pipeline

**Decision:** Build  
**User problem:** Public users cannot establish publisher identity or artifact integrity.  
**Strategic fit:** Required distribution foundation, not product bloat.  
**User value:** Very high  
**Effort:** L  
**Risk:** High  
**Dependencies:** Authenticode certificate, Apple Developer ID, hardened runtime/entitlements, protected CI environments and immutable promotion.  
**Implementation outline:** Sign on controlled runners, notarise/staple macOS, hash/SBOM artifacts, test clean installs and promote the exact approved release-candidate bytes.  
**Acceptance criteria:**
- [ ] Windows signature and macOS Gatekeeper/notarisation validate offline where applicable on clean machines.
- [ ] Published checksums match tested artifacts; secrets cannot reach PR jobs; revocation/rollback rehearsal is documented.
**Recommended release:** Before any public professional 1.x release

## 6. Deferred and rejected features

Deferred items need demand or foundations: tabs, collapsible headings, bookmarks/annotations, regex/history/command palette, additional architectures, Linux, stores, auto-update and crash reporting. Mermaid and KaTeX require sandbox/performance prototypes before commitment. Tabs should not precede a proven navigation/collection model. Store distribution, telemetry and crash reporting remain separate business/privacy decisions.

Rejected now: emoji shortcodes duplicate Unicode; custom containers create an open-ended grammar/plugin surface; in-document TOC directives duplicate the generated outline. A general extension system is not justified for 2.0 until multiple validated reading needs cannot be met safely in core. Editing, accounts, cloud storage and collaboration are outside positioning.

## 7. Version roadmap and sequencing

### Version 1.0.1 — Trust and correctness patch

Ship remote-image blocking, resilient watcher/recovery, reload preservation, safe open queue, consistent limits and rendered-text fallback, active-search/fallback basics, UTF-8 validation, cross-platform wording, IPC sender/path grants, production-map/fuse/ASAR hardening, compatibility fixtures, PR/main CI and the first Electron E2E smoke suite. Publish it as a controlled beta unless signing/native macOS qualification is also complete.

### Version 1.1 — Stronger single-document reader

Add recent/reopen and restored reading/window state; safe relative Markdown navigation with back/forward; reveal/open-editor; active/filterable TOC, permalinks and back-to-top; case/whole-word search; appearance controls/fullscreen; syntax highlighting/copy-code; clipboard theme refinements; and benchmark-driven large-document improvements.

### Version 1.2 — Collections and portable output

Add folder tree and cancellable folder-wide search/results; self-contained HTML and explicit PDF export; footnotes/front matter; then investigate section copy, callouts and destination-specific clipboard profiles. Tabs remain optional and require usability evidence. Signed/notarised releases must not wait for 1.2 if public distribution begins earlier.

### Possible version 2 — Advanced reading platform

Only after usage evidence: sandboxed Mermaid/math, bookmarks/annotations, optional tabs, Linux/Windows ARM64, automatic updates after mature signing/rollback, and selected store channels. Do not pre-commit to an extension system.

Critical sequence: contracts/policies → file/watcher and renderer-ready state → regression fixtures/E2E → privacy/clipboard/performance corrections → settings/navigation → collections/export → advanced renderers/distribution expansion.
