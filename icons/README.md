# Icon source assets

The repository owner supplied the SVG files in this directory as purchased icon-platform assets on 15 July 2026. They are the source masters, not the renderer's runtime copies.

- `App-Icon.svg` is the application identity source.
- `File-Icon.svg` is the Markdown document association source.
- Numbered SVGs are the interface-icon source set. Only icons attached to implemented actions or states should be copied into `src/renderer/assets/`.

Run `npm run icons:generate` after changing either identity SVG. It validates the source and regenerates the Windows `.ico` and macOS `.icns` files under `build-resources/`.

Keep the purchase receipt and redistribution licence with the private release records. This repository note records provenance but is not a substitute for the platform's licence text.
