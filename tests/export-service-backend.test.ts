// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSelfContainedHtml,
  ensureExportExtension,
  normaliseExportFileName,
} from "../src/main/export-service";

const RESOURCE_TOKEN = "__CHWEZI_RESOURCE_123e4567-e89b-42d3-a456-426614174000_0001__";

describe.sequential("self-contained HTML export backend", () => {
  let directory = "";
  let outsideDirectory = "";
  let documentPath = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-export-"));
    outsideDirectory = await mkdtemp(join(tmpdir(), "chwezi-export-outside-"));
    documentPath = join(directory, "reader.md");
    await writeFile(documentPath, "# Reader", "utf8");
  });

  afterEach(async () => {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(outsideDirectory, { recursive: true, force: true }),
    ]);
  });

  it("embeds an authorised local image and emits a restrictive offline shell", async () => {
    const imagePath = join(directory, "chart.png");
    await writeFile(imagePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const html = await buildSelfContainedHtml({
      documentPath,
      title: "Reader <report>",
      bodyHtml: `<article><img src="${RESOURCE_TOKEN}" alt="Chart"></article>`,
      css: "article { max-width: 70ch; }",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
    }, documentPath);

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("data:image/png;base64,iVBORw==");
    expect(html).toContain("<title>Reader &lt;report&gt;</title>");
    expect(html).not.toContain("file:");
    expect(html).not.toContain(RESOURCE_TOKEN);
  });

  it("rejects images outside the active document folder", async () => {
    const imagePath = join(outsideDirectory, "private.png");
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: `<img src="${RESOURCE_TOKEN}">`,
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
    }, documentPath)).rejects.toThrow("outside the active document folder");
  });

  it("rejects active markup, remote CSS and resource reads without placeholders", async () => {
    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: "<script>alert(1)</script>",
      css: "",
      resources: [],
    }, documentPath)).rejects.toThrow("active or non-self-contained HTML");

    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: "<p>Safe</p>",
      css: "@import url(https://example.test/theme.css);",
      resources: [],
    }, documentPath)).rejects.toThrow("stylesheet");

    const imagePath = join(directory, "unused.png");
    await writeFile(imagePath, new Uint8Array([1]));
    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: "<p>Safe</p>",
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
    }, documentPath)).rejects.toThrow("matching placeholder");
  });

  it("does not mistake ordinary technical prose for an active HTML attribute", async () => {
    const html = await buildSelfContainedHtml({
      documentPath,
      title: "Technical notes",
      bodyHtml: "<p>The examples use onload= and href=\"file: only as text.</p>",
      css: "",
      resources: [],
    }, documentPath);

    expect(html).toContain("onload=");
    expect(html).toContain('href="file:');
  });

  it("keeps inert task-list checkboxes but rejects interactive inputs", async () => {
    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Tasks",
      bodyHtml: '<ul><li><input disabled="" type="checkbox" checked=""> Complete</li></ul>',
      css: "",
      resources: [],
    }, documentPath)).resolves.toContain('type="checkbox"');

    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Form",
      bodyHtml: '<input type="text" value="editable">',
      css: "",
      resources: [],
    }, documentPath)).rejects.toThrow("disabled task-list checkboxes");
  });

  it("rejects document-structure and style-element breakout markup", async () => {
    const base = { documentPath, title: "Reader", css: "", resources: [] };
    for (const bodyHtml of ["</body><p>outside</p>", "<style>body{display:none}</style>", "<title>Replacement</title>"]) {
      await expect(buildSelfContainedHtml({ ...base, bodyHtml }, documentPath))
        .rejects.toThrow("active or non-self-contained HTML");
    }
    await expect(buildSelfContainedHtml({
      ...base,
      bodyHtml: "<p>Safe</p>",
      css: "article{} </style><script>alert(1)</script>",
    }, documentPath)).rejects.toThrow("break out of the generated style element");
  });

  it("rejects SVG files and SVG data URLs without claiming to sanitise them", async () => {
    const svgPath = join(directory, "diagram.svg");
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: `<img src="${RESOURCE_TOKEN}">`,
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(svgPath).toString() }],
    }, documentPath)).rejects.toThrow("SVG images cannot be embedded safely");

    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Reader",
      bodyHtml: '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
      css: "",
      resources: [],
    }, documentPath)).rejects.toThrow("SVG images cannot be embedded safely");
  });
});

describe("export filename policy", () => {
  it("removes path components and enforces the selected export extension", () => {
    expect(normaliseExportFileName("reports/Quarter: 1.md", ".html")).not.toContain("/");
    expect(normaliseExportFileName("reports/Quarter: 1.md", ".html")).toMatch(/\.html$/u);
    expect(ensureExportExtension("C:\\exports\\reader", ".pdf")).toBe("C:\\exports\\reader.pdf");
    expect(ensureExportExtension("C:\\exports\\reader.PDF", ".pdf")).toBe("C:\\exports\\reader.PDF");
    expect(normaliseExportFileName("guide.MD", ".html")).toBe("guide.html");
    expect(normaliseExportFileName("release.notes.markdown", ".pdf")).toBe("release.notes.pdf");
  });
});
