# AI Slop Audit — Chwezi Markdown Reader 1.0.0 — 2026-07-15

Verdict: **A — Clean**  
Genericness score: **6/100**  
Artefact types: Windows/macOS desktop app, UI/UX, TypeScript code

## Blocking findings

None.

## Automated and structural evidence

- Package resolution: every declared package resolved with `npm ls --depth=0`; `npm audit --omit=dev` reported zero vulnerabilities.
- Unsafe HTML: `src/renderer/app.ts:232` inserts only the DOMPurify result. `src/renderer/markdown.ts:35` forbids scripts, style blocks/attributes, forms, frames, and embedded objects. The sanitization test passes.
- Desktop boundary: `src/main/main.ts:210-212` uses context isolation and sandboxing with Node integration disabled.
- State coverage: empty, loading, error, ready, disabled, focus, drag, and search states are present in `src/renderer/index.html` and `src/renderer/styles.css`.
- Contrast: all measured foreground/background pairs exceed 4.5:1; the lowest measured pair is light muted text at 5.50:1.
- Dependency and placeholder scan: no hard-coded secrets, unfinished stubs, or tautological tests. The one `innerHTML` assignment is the documented sanitized boundary.
- Clipboard regression: the rebuilt portable EXE produced styled heading/table HTML and a text payload that matched the 758-character `sample.md` fixture exactly.
- Cross-platform claim boundary: macOS packaging and Finder integration are configured, while Mac runtime and clipboard checks remain explicitly marked unassessed in `docs/mac-release-readiness.md`.
- Visual defaults: the interface uses an editorial cream/green/terracotta system, Segoe UI controls, and Georgia reading text. It does not use a purple gradient, glass cards, or an undifferentiated component-library default.

## Human review

- Substance: the app adds file association, auto-refresh, structured navigation, search, print, relative local images, and computed-style clipboard serialization beyond basic Markdown parsing.
- Authored intent: the paper-like reading surface keeps application chrome subordinate to the document. Light and dark captures show the same hierarchy.
- Hard cases: missing files, access denial, unsupported extensions, oversized files, broken images, duplicate heading slugs, dangerous HTML, and single-instance file opening are handled.
- Developer attribution: **Help → About Chwezi Markdown Reader** contains the requested name, email, phone, and Kampala location in the packaged application.

## What should be preserved

- The split between UI controls and the serif reading surface.
- The clipboard choices: inline-styled HTML with a Markdown fallback, plus a forced text-only Markdown command for chat composers and source editors.
- The installer/portable distinction and explicit unsigned-build warning.

## Recommended next step

Ship for local acceptance testing. Code-sign both executables before public distribution.
