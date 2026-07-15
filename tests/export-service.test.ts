// @vitest-environment node

import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSelfContainedHtml,
  ensureExportExtension,
  normaliseExportFileName,
  writeExportFile,
} from "../src/main/export-service";
import {
  htmlExportRequestSchema,
  MAX_EXPORT_RESOURCE_BYTES,
  pdfExportRequestSchema,
} from "../src/main/ipc-contracts";

const RESOURCE_TOKEN = "__CHWEZI_RESOURCE_123e4567-e89b-42d3-a456-426614174000_0001__";
const SECOND_RESOURCE_TOKEN = "__CHWEZI_RESOURCE_123e4567-e89b-42d3-a456-426614174000_0002__";

describe.sequential("self-contained HTML export", () => {
  let directory = "";
  let documentPath = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-export-"));
    documentPath = join(directory, "notes.md");
    await writeFile(documentPath, "# Notes", "utf8");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("embeds local images, escapes the title and emits a restrictive CSP", async () => {
    const imagePath = join(directory, "map.png");
    await writeFile(imagePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const html = await buildSelfContainedHtml({
      documentPath,
      title: "Field <Notes> & maps",
      bodyHtml: `<article><h1>Field Notes</h1><img alt="Map" src="${RESOURCE_TOKEN}"></article>`,
      css: "article{color:#222}",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
    }, documentPath);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("default-src 'none'; img-src data:");
    expect(html).toContain("<title>Field &lt;Notes&gt; &amp; maps</title>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toMatch(/file:\/\/|https?:\/\//iu);
    expect(html).not.toContain("__CHWEZI_RESOURCE_");
  });

  it("rejects duplicate, unused, unsupported and escaping image resources", async () => {
    const imagePath = join(directory, "map.png");
    const textPath = join(directory, "not-image.txt");
    await writeFile(imagePath, "png", "utf8");
    await writeFile(textPath, "text", "utf8");
    const outside = await mkdtemp(join(tmpdir(), "chwezi-export-outside-"));
    const outsideImage = join(outside, "secret.png");
    await writeFile(outsideImage, "secret", "utf8");
    try {
      const base = { documentPath, title: "Notes", bodyHtml: `<img src="${RESOURCE_TOKEN}">`, css: "" };
      await expect(buildSelfContainedHtml({
        ...base,
        resources: [
          { token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() },
          { token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() },
        ],
      }, documentPath)).rejects.toThrow("unique placeholder");
      await expect(buildSelfContainedHtml({
        ...base,
        resources: [{ token: SECOND_RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
      }, documentPath)).rejects.toThrow("matching placeholder");
      await expect(buildSelfContainedHtml({
        ...base,
        resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(textPath).toString() }],
      }, documentPath)).rejects.toThrow("supported local image formats");
      await expect(buildSelfContainedHtml({
        ...base,
        resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(outsideImage).toString() }],
      }, documentPath)).rejects.toThrow("outside the active document folder");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a symlink escape and a resource that exceeds its byte limit", async () => {
    const outside = await mkdtemp(join(tmpdir(), "chwezi-export-outside-"));
    const outsideImage = join(outside, "secret.png");
    const linkedDirectory = join(directory, "linked");
    const linkPath = join(linkedDirectory, "secret.png");
    const oversizedPath = join(directory, "oversized.png");
    await writeFile(outsideImage, "secret", "utf8");
    await symlink(outside, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
    await writeFile(oversizedPath, "", "utf8");
    await truncate(oversizedPath, MAX_EXPORT_RESOURCE_BYTES + 1);
    const request = (filePath: string) => ({
      documentPath,
      title: "Notes",
      bodyHtml: `<img src="${RESOURCE_TOKEN}">`,
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(filePath).toString() }],
    });
    try {
      await expect(buildSelfContainedHtml(request(linkPath), documentPath)).rejects.toThrow("outside the active document folder");
      await expect(buildSelfContainedHtml(request(oversizedPath), documentPath)).rejects.toThrow("16 MB per-image limit");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects executable markup and remote CSS but accepts inert technical prose", async () => {
    const base = { documentPath, title: "Notes", css: "", resources: [] };
    await expect(buildSelfContainedHtml({ ...base, bodyHtml: '<script>alert(1)</script>' }, documentPath))
      .rejects.toThrow("active or non-self-contained HTML");
    await expect(buildSelfContainedHtml({ ...base, bodyHtml: "<p>Safe</p>", css: '@import "https://tracker.example/x.css";' }, documentPath))
      .rejects.toThrow("stylesheet refers to a local or remote resource");

    await expect(buildSelfContainedHtml({
      ...base,
      bodyHtml: '<pre><code>button onload= handler\nhref="file:///example"</code></pre>',
    }, documentPath)).resolves.toContain("button onload= handler");
  });

  it("does not confuse literal document text with generated resource placeholders", async () => {
    await expect(buildSelfContainedHtml({
      documentPath,
      title: "Token reference",
      bodyHtml: "<p>Protocol example: __CHWEZI_RESOURCE_0001__</p>",
      css: "",
      resources: [],
    }, documentPath)).resolves.toContain("__CHWEZI_RESOURCE_0001__");
  });

  it("preserves a valid-looking UUID placeholder that belongs to document text", async () => {
    const imagePath = join(directory, "map.png");
    const literalToken = "__CHWEZI_RESOURCE_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_0001__";
    await writeFile(imagePath, Buffer.from([137, 80, 78, 71]));

    const html = await buildSelfContainedHtml({
      documentPath,
      title: "Token reference",
      bodyHtml: `<p>${literalToken}</p><img src="${RESOURCE_TOKEN}">`,
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(imagePath).toString() }],
    }, documentPath);

    expect(html).toContain(literalToken);
    expect(html).not.toContain(RESOURCE_TOKEN);
    expect(html).toContain("data:image/png;base64,");
  });

  it("rejects active or externally-referencing SVG resources", async () => {
    const svgPath = join(directory, "tracking.svg");
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://tracker.example/pixel.png"/></svg>', "utf8");

    await expect(buildSelfContainedHtml({
      documentPath,
      title: "SVG",
      bodyHtml: `<img src="${RESOURCE_TOKEN}">`,
      css: "",
      resources: [{ token: RESOURCE_TOKEN, fileUrl: pathToFileURL(svgPath).toString() }],
    }, documentPath)).rejects.toThrow(/SVG|active|external/iu);
  });
});

describe("export filename, file-write and PDF contracts", () => {
  it("normalises names and adds the requested extension once", () => {
    expect(normaliseExportFileName("../Quarterly: Notes?.md", ".html")).not.toMatch(/[\\/]/u);
    expect(normaliseExportFileName("Report.pdf", ".pdf")).toMatch(/Report\.pdf$/u);
    expect(ensureExportExtension("C:/exports/report", ".pdf")).toBe("C:/exports/report.pdf");
    expect(ensureExportExtension("C:/exports/report.PDF", ".pdf")).toBe("C:/exports/report.PDF");
  });

  it("writes the exact export bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chwezi-export-write-"));
    const destination = join(directory, "result.html");
    try {
      await writeExportFile(destination, "<!doctype html><title>Reader</title>");
      expect(await readFile(destination, "utf8")).toBe("<!doctype html><title>Reader</title>");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("validates PDF requests without accepting extra or non-Markdown paths", () => {
    expect(pdfExportRequestSchema.safeParse({ documentPath: resolve("notes.md"), suggestedName: "Notes" }).success).toBe(true);
    expect(pdfExportRequestSchema.safeParse({ documentPath: resolve("notes.txt"), suggestedName: "Notes" }).success).toBe(false);
    expect(pdfExportRequestSchema.safeParse({ documentPath: resolve("notes.md"), suggestedName: "", extra: true }).success).toBe(false);
    expect(htmlExportRequestSchema.safeParse({
      documentPath: resolve("notes.md"), title: "Notes", bodyHtml: "<p>Safe</p>", css: "", resources: [], extra: true,
    }).success).toBe(false);
  });
});
