const { existsSync, rmSync } = require("node:fs");
const { resolve, sep } = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = resolve(__dirname, "..");
const releaseRoot = resolve(repositoryRoot, "release");
const outputRoot = resolve(releaseRoot, "smoke");

if (!outputRoot.startsWith(`${releaseRoot}${sep}`)) {
  throw new Error(`Refusing to clean an unexpected package path: ${outputRoot}`);
}
if (existsSync(outputRoot)) {
  rmSync(outputRoot, { recursive: true, force: true });
}

const builderCli = resolve(repositoryRoot, "node_modules", "electron-builder", "out", "cli", "cli.js");
if (!existsSync(builderCli)) {
  throw new Error("electron-builder is not installed. Run npm ci first.");
}

const platformFlag = process.platform === "win32" ? "--win" : process.platform === "darwin" ? "--mac" : "--linux";
const architectureFlag = process.arch === "arm64" ? "--arm64" : "--x64";
const result = spawnSync(process.execPath, [
  builderCli,
  platformFlag,
  architectureFlag,
  "--dir",
  `--config.directories.output=${outputRoot}`,
], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
  encoding: "utf8",
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`electron-builder exited with status ${String(result.status)}.`);
}
