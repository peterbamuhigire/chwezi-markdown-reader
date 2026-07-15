export interface HtmlExportResource {
  readonly token: string;
  readonly fileUrl: string;
}

export interface HtmlExportPayload {
  readonly bodyHtml: string;
  readonly css: string;
  readonly resources: readonly HtmlExportResource[];
}

export const STANDALONE_HTML_CSS = `
:root{color-scheme:light;font-family:Georgia,"Times New Roman",serif;background:#eee8dc;color:#252924}
*{box-sizing:border-box}body{margin:0;padding:clamp(24px,6vw,72px);background:#eee8dc}
article{max-width:820px;margin:auto;padding:clamp(32px,7vw,76px);border:1px solid #d7cec0;border-radius:6px;background:#fffdf8;box-shadow:0 16px 42px rgba(56,48,36,.12);font-size:17px;line-height:1.72;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{font-family:"Segoe UI",Arial,sans-serif;line-height:1.22}h1{padding-bottom:.45em;border-bottom:2px solid #d7cec0;font-size:2.35em}h2{padding-bottom:.35em;border-bottom:1px solid #d7cec0;font-size:1.7em}
a{color:#174d45;text-underline-offset:3px}blockquote{margin:1.5em 0;padding:.15em 1.25em;border-left:4px solid #b6532d;background:#f8f3e9;color:#616a64}
pre{padding:18px 20px;overflow:auto;border-radius:6px;background:#18211e;color:#e8eee9;line-height:1.55;white-space:pre-wrap}code{font-family:"Cascadia Code",Consolas,monospace}p code,li code,td code{padding:.12em .3em;border:1px solid #d7cec0;border-radius:4px;background:#f8f3e9;color:#8d3e24}
table{display:block;width:max-content;max-width:100%;overflow:auto;border-spacing:0;border-collapse:collapse;font:14px/1.45 "Segoe UI",Arial,sans-serif}th,td{min-width:110px;padding:10px 13px;border:1px solid #d7cec0;text-align:left}th{background:#f8f3e9}img{display:block;max-width:100%;height:auto;margin:1.5em auto}
.document-metadata{margin-bottom:2em;padding:15px 17px;border:1px solid #d7cec0;border-left:4px solid #28685c;background:#f8f3e9;font:12px/1.45 "Segoe UI",Arial,sans-serif}.document-metadata h2{margin:0;color:#174d45;font-size:11px;text-transform:uppercase}.document-metadata dl{display:grid;grid-template-columns:minmax(90px,.35fr) minmax(0,1fr);gap:7px 14px;margin:14px 0 0}.document-metadata dt{font-weight:700}.document-metadata dd{margin:0}
@media(max-width:620px){body{padding:0}article{padding:30px 22px;border:0;border-radius:0}.document-metadata dl{grid-template-columns:1fr}}
@media print{body{padding:0;background:#fff}article{max-width:none;padding:0;border:0;box-shadow:none}a{color:#174d45}}
`;

export function createStandaloneHtmlPayload(source: HTMLElement): HtmlExportPayload {
  const clone = source.cloneNode(true);
  if (!(clone instanceof HTMLElement)) throw new Error("The rendered document could not be prepared for export.");
  clone.removeAttribute("id");
  for (const appControl of clone.querySelectorAll("[data-chwezi-ui]")) appControl.remove();
  for (const highlight of clone.querySelectorAll("mark.search-fallback")) highlight.replaceWith(...highlight.childNodes);

  const resources: HtmlExportResource[] = [];
  const exportId = crypto.randomUUID();
  const sourceImages = source.querySelectorAll<HTMLImageElement>("img");
  const cloneImages = clone.querySelectorAll<HTMLImageElement>("img");
  cloneImages.forEach((image, index) => {
    const sourceImage = sourceImages[index];
    const resolvedSource = sourceImage?.src ?? image.getAttribute("src") ?? "";
    if (/^data:image\/svg\+xml/iu.test(resolvedSource) || (/^file:/iu.test(resolvedSource) && /\.svg(?:[?#]|$)/iu.test(resolvedSource))) {
      image.removeAttribute("src");
      image.setAttribute("data-export-svg", "omitted");
      image.alt = image.alt === "" ? "SVG image omitted from export" : `${image.alt} (SVG omitted; convert to PNG to embed it)`;
    } else if (/^file:/iu.test(resolvedSource)) {
      const token = `__CHWEZI_RESOURCE_${exportId}_${String(resources.length + 1).padStart(4, "0")}__`;
      resources.push({ token, fileUrl: resolvedSource });
      image.setAttribute("src", token);
    } else if (/^https?:/iu.test(resolvedSource) || resolvedSource.startsWith("//")) {
      image.removeAttribute("src");
      image.setAttribute("data-export-remote-image", "omitted");
      image.alt = image.alt === "" ? "Remote image omitted from export" : `${image.alt} (remote image omitted)`;
    }
    image.removeAttribute("data-chwezi-remote-src");
  });

  return { bodyHtml: clone.outerHTML, css: STANDALONE_HTML_CSS.trim(), resources };
}
