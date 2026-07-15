const { createHash } = require("node:crypto");
const { createReadStream, existsSync, readdirSync, writeFileSync } = require("node:fs");
const { basename, extname, resolve } = require("node:path");

const releaseRoot = resolve(process.cwd(), "release");
if (!existsSync(releaseRoot)) {
  throw new Error(`Release directory does not exist: ${releaseRoot}`);
}

const permittedExtensions = process.platform === "win32" ? new Set([".exe"]) : new Set([".dmg", ".zip"]);
const artifacts = readdirSync(releaseRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && permittedExtensions.has(extname(entry.name).toLowerCase()))
  .map((entry) => resolve(releaseRoot, entry.name))
  .sort();

if (artifacts.length === 0) {
  throw new Error(`No release artifacts were found in ${releaseRoot}.`);
}

function sha256(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", rejectHash);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolveHash(hash.digest("hex")));
  });
}

void (async () => {
  const lines = [];
  for (const artifact of artifacts) {
    lines.push(`${await sha256(artifact)}  ${basename(artifact)}`);
  }
  const platformName = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const outputPath = resolve(releaseRoot, `SHA256SUMS-${platformName}.txt`);
  writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${lines.length} SHA-256 checksums to ${outputPath}.`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
