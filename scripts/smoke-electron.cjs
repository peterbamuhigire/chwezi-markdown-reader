const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const sourceFixturePath = resolve(repositoryRoot, "tests", "fixtures", "sample.md");
const packagedIndex = process.argv.indexOf("--packaged");
const packageRoot = packagedIndex === -1
  ? null
  : resolve(repositoryRoot, process.argv[packagedIndex + 1] ?? "release/smoke");
const skipClipboard = process.argv.includes("--skip-clipboard");
const outputLimit = 32_000;

function filesBelow(directory) {
  const { readdirSync } = require("node:fs");
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

function packagedExecutable(directory) {
  if (!existsSync(directory)) {
    throw new Error(`Packaged application directory does not exist: ${directory}`);
  }
  const files = filesBelow(directory);
  if (process.platform === "win32") {
    return files.find((file) => basename(file) === "Chwezi Markdown Reader.exe");
  }
  if (process.platform === "darwin") {
    return files.find((file) => file.endsWith("Chwezi Markdown Reader.app/Contents/MacOS/Chwezi Markdown Reader"));
  }
  return files.find((file) => basename(file) === "chwezi-markdown-reader");
}

function startTrackingServer(onRequest) {
  const server = createServer((_request, response) => {
    onRequest();
    response.writeHead(200, { "Content-Type": "image/png", "Content-Length": "0" });
    response.end();
  });
  return new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function runElectron(executable, argumentsList, environment) {
  return new Promise((resolveRun, rejectRun) => {
    let standardOutput = "";
    let standardError = "";
    let timedOut = false;
    const child = spawn(executable, argumentsList, {
      cwd: repositoryRoot,
      env: environment,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk) => {
      standardOutput = `${standardOutput}${String(chunk)}`.slice(-outputLimit);
    });
    child.stderr.on("data", (chunk) => {
      standardError = `${standardError}${String(chunk)}`.slice(-outputLimit);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid !== undefined) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else {
        child.kill("SIGKILL");
      }
    }, 45_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectRun(new Error(`Could not start the Electron smoke application: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      const output = [
        standardOutput.trim() === "" ? "" : `stdout:\n${standardOutput.trim()}`,
        standardError.trim() === "" ? "" : `stderr:\n${standardError.trim()}`,
      ].filter(Boolean).join("\n\n");
      if (timedOut) {
        rejectRun(new Error(`Electron smoke test exceeded the 45 second timeout.\n${output}`));
      } else if (code !== 0) {
        rejectRun(new Error(`Electron smoke application exited with code ${String(code)} and signal ${String(signal)}.\n${output}`));
      } else {
        resolveRun({ standardOutput, standardError });
      }
    });
  });
}

void (async () => {
  const executable = packageRoot === null ? require("electron") : packagedExecutable(packageRoot);
  if (typeof executable !== "string" || !existsSync(executable)) {
    throw new Error(`Electron executable was not found${packageRoot === null ? "" : ` below ${packageRoot}`}.`);
  }

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "chwezi-reader-smoke-"));
  const userDataPath = resolve(temporaryRoot, "user-data");
  const fixturePath = resolve(temporaryRoot, "sample-with-remote-image.md");
  const screenshotPath = resolve(temporaryRoot, "reader.png");
  const aboutScreenshotPath = resolve(temporaryRoot, "about.png");
  const clipboardHtmlPath = resolve(temporaryRoot, "clipboard.html");
  const clipboardTextPath = resolve(temporaryRoot, "clipboard.md");
  const fullscreenStatePath = resolve(temporaryRoot, "fullscreen.json");
  let remoteRequests = 0;
  const server = await startTrackingServer(() => {
    remoteRequests += 1;
  });

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The tracking server did not expose a TCP port.");
    }
    const fixtureText = `${readFileSync(sourceFixturePath, "utf8")}\n\n![Remote tracking test](http://127.0.0.1:${address.port}/tracking-pixel.png?document=smoke)\n`;
    writeFileSync(fixturePath, fixtureText, "utf8");

    const userDataArgument = `--user-data-dir=${userDataPath}`;
    const argumentsList = packageRoot === null
      ? [userDataArgument, repositoryRoot, fixturePath]
      : [userDataArgument, fixturePath];
    const captureEnvironment = {
      ...process.env,
      MD_VIEWER_CAPTURE_PATH: screenshotPath,
      MD_VIEWER_CAPTURE_ABOUT_PATH: aboutScreenshotPath,
      MD_VIEWER_CAPTURE_FULLSCREEN_STATE_PATH: fullscreenStatePath,
    };
    if (!skipClipboard) {
      captureEnvironment.MD_VIEWER_CAPTURE_CLIPBOARD_PATH = clipboardHtmlPath;
      captureEnvironment.MD_VIEWER_CAPTURE_CLIPBOARD_TEXT_PATH = clipboardTextPath;
    }
    const runResult = await runElectron(executable, argumentsList, captureEnvironment);
    if (runResult.standardError.trim() !== "") {
      console.error(runResult.standardError.trim());
    }

    const expectedOutputs = skipClipboard
      ? [screenshotPath, aboutScreenshotPath, fullscreenStatePath]
      : [screenshotPath, aboutScreenshotPath, clipboardHtmlPath, clipboardTextPath, fullscreenStatePath];
    for (const outputPath of expectedOutputs) {
      if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
        throw new Error(`Expected smoke output was not created: ${outputPath}`);
      }
    }

    const fullscreenState = JSON.parse(readFileSync(fullscreenStatePath, "utf8"));
    if (fullscreenState.entered !== true || fullscreenState.exited !== true) {
      throw new Error(`Fullscreen smoke did not enter and exit with Escape: ${JSON.stringify(fullscreenState)}`);
    }

    const png = readFileSync(screenshotPath);
    if (png.length < 10_000 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error("The captured reader image is not a non-trivial PNG.");
    }
    const aboutPng = readFileSync(aboutScreenshotPath);
    if (aboutPng.length < 10_000 || !aboutPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error("The captured About dialog image is not a non-trivial PNG.");
    }

    let clipboardHtml = "";
    if (!skipClipboard) {
      clipboardHtml = readFileSync(clipboardHtmlPath, "utf8");
      for (const marker of ["Field Notes", "<h1", "<table", "<pre", "data-chwezi-remote-src"]) {
        if (!clipboardHtml.includes(marker)) {
          throw new Error(`Rich clipboard HTML is missing ${marker}.`);
        }
      }
      if (/<script\b|javascript:/i.test(clipboardHtml)) {
        throw new Error("Rich clipboard HTML contains executable content.");
      }

      const clipboardText = readFileSync(clipboardTextPath, "utf8");
      for (const marker of ["Field Notes", "representative Markdown document", "Delivery table", "const message"]) {
        if (!clipboardText.includes(marker)) {
          throw new Error(`Rendered plain-text fallback is missing ${marker}.`);
        }
      }
      for (const sourceMarker of ["```", "[project repository](", "| --- | --- | --- |"]) {
        if (clipboardText.includes(sourceMarker)) {
          throw new Error(`Rendered plain-text fallback still contains Markdown source syntax: ${sourceMarker}`);
        }
      }
    }
    if (remoteRequests !== 0) {
      throw new Error(`Opening the document made ${remoteRequests} remote image request(s) before consent.`);
    }

    console.log(`Electron smoke passed (${packageRoot === null ? "built app" : "packaged app"}).`);
    console.log(`Reader screenshot: ${png.length} bytes; About screenshot: ${aboutPng.length} bytes; clipboard HTML: ${skipClipboard ? "skipped" : `${Buffer.byteLength(clipboardHtml)} bytes`}; remote requests: ${remoteRequests}.`);
    await closeServer(server);
    rmSync(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    await closeServer(server);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n\nSmoke state retained at: ${temporaryRoot}`);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
