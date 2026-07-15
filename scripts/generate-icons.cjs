const { copyFile, mkdir, readFile, rm, stat } = require("node:fs/promises");
const { basename, resolve } = require("node:path");
const { convertIcon } = require("app-builder-lib/out/util/iconConverter");

const projectRoot = resolve(__dirname, "..");
const buildResources = resolve(projectRoot, "build-resources");
const temporaryRoot = resolve(buildResources, ".generated-icons");
const checkOnly = process.argv.includes("--check");

const iconSources = [
  { source: resolve(projectRoot, "icons", "App-Icon.svg"), outputName: "app-icon" },
  { source: resolve(projectRoot, "icons", "File-Icon.svg"), outputName: "file-icon" },
];

async function validateSvg(source) {
  const svg = await readFile(source, "utf8");
  const forbiddenMarkup = /<(?:script|foreignObject)\b|\bon\w+\s*=|\b(?:href|src)\s*=\s*["'](?:https?:|file:|data:)/i;

  if (!/<svg\b/i.test(svg) || !/viewBox\s*=\s*["']0\s+0\s+1024\s+1024["']/i.test(svg)) {
    throw new Error(`${basename(source)} must be an SVG with a 0 0 1024 1024 viewBox.`);
  }
  if (forbiddenMarkup.test(svg)) {
    throw new Error(`${basename(source)} contains active or externally referenced content.`);
  }
}

async function convert(source, outputName, format) {
  const conversionDirectory = resolve(temporaryRoot, `${outputName}-${format}`);
  const destination = resolve(buildResources, `${outputName}.${format}`);
  await rm(conversionDirectory, { recursive: true, force: true });

  const result = await convertIcon({
    sources: [source],
    fallbackSources: [],
    roots: [projectRoot],
    format,
    outDir: conversionDirectory,
  });
  const generated = result.icons[0]?.file;
  if (generated === undefined) {
    throw new Error(`Could not generate ${outputName}.${format} from ${basename(source)}.`);
  }

  const generatedContent = await readFile(generated);
  if (checkOnly) {
    const existingContent = await readFile(destination).catch(() => null);
    if (existingContent === null || !existingContent.equals(generatedContent)) {
      throw new Error(`${destination} is missing or stale. Run npm run icons:generate.`);
    }
  } else {
    await copyFile(generated, destination);
  }
  const bytes = checkOnly ? generatedContent.length : (await stat(destination)).size;
  if (bytes < 1_024) {
    throw new Error(`Generated icon is unexpectedly small: ${destination} (${bytes} bytes).`);
  }
  console.log(`${checkOnly ? "Verified" : "Generated"} ${destination} (${bytes} bytes)`);
}

async function main() {
  await mkdir(buildResources, { recursive: true });
  await rm(temporaryRoot, { recursive: true, force: true });

  try {
    for (const icon of iconSources) {
      await validateSvg(icon.source);
      await convert(icon.source, icon.outputName, "ico");
      await convert(icon.source, icon.outputName, "icns");
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
