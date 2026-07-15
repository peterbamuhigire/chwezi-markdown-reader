const { existsSync, readdirSync, statSync } = require("node:fs");
const { basename, extname, resolve } = require("node:path");
const { listPackage } = require("@electron/asar");
const { getCurrentFuseWire } = require("@electron/fuses");
const { FuseState } = require("@electron/fuses/dist/constants");
const { FuseV1Options } = require("@electron/fuses/dist/config");

const argumentIndex = process.argv.indexOf("--dir");
const packageRoot = resolve(
  process.cwd(),
  argumentIndex === -1 ? "release" : process.argv[argumentIndex + 1] ?? "release/smoke",
);

if (!existsSync(packageRoot)) {
  throw new Error(`Package output does not exist: ${packageRoot}`);
}

function filesBelow(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesBelow(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

const files = filesBelow(packageRoot);
const asarFiles = files.filter((file) => basename(file) === "app.asar");
if (asarFiles.length === 0) {
  throw new Error(`No packaged app.asar was found below ${packageRoot}.`);
}
for (const asarFile of asarFiles) {
  const bytes = statSync(asarFile).size;
  if (bytes < 100_000) {
    throw new Error(`Packaged app.asar is unexpectedly small (${bytes} bytes): ${asarFile}`);
  }
  const sourceMaps = listPackage(asarFile).filter((entry) => entry.toLocaleLowerCase().endsWith(".map"));
  if (sourceMaps.length > 0) {
    throw new Error(`Packaged app.asar contains production source maps: ${sourceMaps.join(", ")}`);
  }
}

const executable = process.platform === "win32"
  ? files.find((file) => basename(file) === "Chwezi Markdown Reader.exe")
  : process.platform === "darwin"
    ? files.find((file) => file.endsWith("Chwezi Markdown Reader.app/Contents/MacOS/Chwezi Markdown Reader"))
    : files.find((file) => basename(file) === "chwezi-markdown-reader");

if (executable === undefined || statSync(executable).size === 0) {
  throw new Error(`The packaged executable was not found below ${packageRoot}.`);
}

if (process.argv.includes("--artifacts")) {
  const topLevelFiles = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(packageRoot, entry.name));
  const minimumArtifactBytes = 10_000_000;

  if (process.platform === "win32") {
    for (const pattern of [/Setup-.*\.exe$/i, /Portable-.*\.exe$/i]) {
      const artifact = topLevelFiles.find((file) => pattern.test(basename(file)));
      if (artifact === undefined || statSync(artifact).size < minimumArtifactBytes) {
        throw new Error(`Missing or unexpectedly small Windows artifact matching ${String(pattern)}.`);
      }
    }
  } else if (process.platform === "darwin") {
    for (const architecture of ["x64", "arm64"]) {
      for (const extension of [".dmg", ".zip"]) {
        const artifact = topLevelFiles.find((file) => basename(file).includes(`macOS-${architecture}`) && extname(file) === extension);
        if (artifact === undefined || statSync(artifact).size < minimumArtifactBytes) {
          throw new Error(`Missing or unexpectedly small macOS ${architecture} ${extension} artifact.`);
        }
      }
    }
  }
}

console.log(`Verified package executable: ${executable}`);
for (const asarFile of asarFiles) {
  console.log(`Verified app.asar: ${asarFile} (${statSync(asarFile).size} bytes)`);
}

const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.ENABLE],
]);

getCurrentFuseWire(executable).then((fuses) => {
  for (const [fuse, expectedState] of expectedFuses) {
    if (fuses[fuse] !== expectedState) {
      throw new Error(`Packaged Electron fuse ${FuseV1Options[fuse]} has state ${String(fuses[fuse])}; expected ${String(expectedState)}.`);
    }
  }
  console.log("Verified packaged Electron fuse policy and absence of production source maps.");
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
