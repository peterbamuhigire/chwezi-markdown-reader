// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve("src/main/main.ts"), "utf8");
const preloadSource = readFileSync(resolve("src/main/preload.ts"), "utf8");
const rendererSource = readFileSync(resolve("src/renderer/app.ts"), "utf8");

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("PDF export contracts", () => {
  const mainHandler = between(
    mainSource,
    "ipcMain.handle(IPC_CHANNELS.exportPdf",
    "ipcMain.handle(IPC_CHANNELS.clipboardWriteRich",
  );
  const rendererHandler = between(
    rendererSource,
    "async function exportPdf()",
    "async function revealCurrentFile()",
  );

  it("validates the sender, request and active document before generating PDF bytes", () => {
    expect(mainHandler).toContain("assertTrustedSender(event)");
    expect(mainHandler).toContain("pdfExportRequestSchema.parse(request)");
    expect(mainHandler.indexOf("resolveActiveDocumentPath(parsed.documentPath)"))
      .toBeLessThan(mainHandler.indexOf("dialog.showSaveDialog"));
    expect(preloadSource).toContain("pdfExportRequestSchema.parse({ documentPath, suggestedName })");
  });

  it("treats dialog cancellation as a non-error and generates a bounded, print-styled PDF", () => {
    expect(mainHandler).toMatch(/if \(result\.canceled \|\| result\.filePath === undefined\)\s*\{\s*return false;/u);
    expect(mainHandler).toContain("printToPDF({ printBackground: true, preferCSSPageSize: true })");
    expect(mainHandler).toContain("pdf.byteLength > 128 * 1024 * 1024");
    expect(mainHandler).toContain('ensureExportExtension(result.filePath, ".pdf")');
  });

  it("surfaces generation failures and always restores the renderer command", () => {
    expect(mainHandler).not.toContain("catch (");
    expect(rendererHandler).toContain("PDF export failed:");
    expect(rendererHandler).toMatch(/finally\s*\{[\s\S]*?exportPdfButton\.disabled = currentDocument === null \|\| currentDocument\.path === "";/u);
  });
});
