// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  readonly version: string;
  readonly main: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly scripts: Readonly<Record<string, string>>;
  readonly build: {
    readonly asar: boolean;
    readonly electronFuses: {
      readonly runAsNode: boolean;
      readonly enableCookieEncryption: boolean;
      readonly enableNodeOptionsEnvironmentVariable: boolean;
      readonly enableNodeCliInspectArguments: boolean;
      readonly enableEmbeddedAsarIntegrityValidation: boolean;
      readonly onlyLoadAppFromAsar: boolean;
      readonly loadBrowserProcessSpecificV8Snapshot: boolean;
      readonly grantFileProtocolExtraPrivileges: boolean;
    };
    readonly files: readonly string[];
    readonly win: { readonly icon: string; readonly target: readonly string[] };
    readonly mac: {
      readonly icon: string;
      readonly hardenedRuntime: boolean;
      readonly target: readonly {
        readonly target: string;
        readonly arch: readonly string[];
      }[];
    };
    readonly fileAssociations: readonly {
      readonly ext: readonly string[];
      readonly icon: string;
      readonly role: string;
    }[];
  };
}

interface Lockfile {
  readonly version: string;
  readonly packages: Readonly<Record<string, {
    readonly version?: string;
    readonly integrity?: string;
  }>>;
}

const root = process.cwd();
const readText = (path: string): string => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(readText("package.json")) as PackageManifest;
const lockfile = JSON.parse(readText("package-lock.json")) as Lockfile;

describe("release configuration contract", () => {
  it("keeps package version and entry point consistent with the lockfile", () => {
    expect(lockfile.version).toBe(manifest.version);
    expect(lockfile.packages[""]?.version).toBe(manifest.version);
    expect(manifest.main).toBe("dist/main/main.js");
  });

  it("packages ASAR applications for the declared Windows and macOS targets", () => {
    expect(manifest.build.asar).toBe(true);
    expect(manifest.build.files).toContain("dist/**/*");
    expect(manifest.build.files).toContain("!node_modules/**/*.map");
    expect(manifest.build.files).toContain("build-resources/app-icon.ico");
    expect(manifest.build.win.icon).toBe("build-resources/app-icon.ico");
    expect(manifest.build.win.target).toEqual(expect.arrayContaining(["nsis", "portable"]));
    expect(manifest.build.mac.icon).toBe("build-resources/app-icon.icns");
    expect(manifest.build.mac.hardenedRuntime).toBe(true);
    expect(manifest.build.mac.target).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "dmg", arch: ["x64", "arm64"] }),
      expect.objectContaining({ target: "zip", arch: ["x64", "arm64"] }),
    ]));
  });

  it("removes production source maps and applies the explicit Electron fuse policy", () => {
    expect(readText("vite.config.ts")).toContain("sourcemap: false");
    expect(manifest.build.electronFuses).toEqual({
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      loadBrowserProcessSpecificV8Snapshot: false,
      // Local relative images currently use file: URLs. Keep this explicit until
      // the renderer moves to a narrowly scoped custom protocol.
      grantFileProtocolExtraPrivileges: true,
    });
  });

  it("keeps all supported Markdown associations in viewer mode", () => {
    expect(manifest.build.fileAssociations).toEqual([
      expect.objectContaining({
        ext: ["md", "markdown", "mdown", "mkd"],
        icon: "build-resources/file-icon",
        role: "Viewer",
      }),
    ]);
  });

  it("ships distinct, multi-resolution application and Markdown document icons", () => {
    const paths = [
      "build-resources/app-icon.ico",
      "build-resources/app-icon.icns",
      "build-resources/file-icon.ico",
      "build-resources/file-icon.icns",
    ];
    const icons = paths.map((path) => readFileSync(resolve(root, path)));

    for (const icon of [icons[0], icons[2]]) {
      expect(icon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
      expect(icon.readUInt16LE(4)).toBeGreaterThan(1);
    }
    for (const icon of [icons[1], icons[3]]) {
      expect(icon.subarray(0, 4).toString("ascii")).toBe("icns");
    }

    const digest = (content: Buffer): string => createHash("sha256").update(content).digest("hex");
    expect(digest(icons[0])).not.toBe(digest(icons[2]));
    expect(digest(icons[1])).not.toBe(digest(icons[3]));
  });

  it("keeps safe, deterministic SVG sources for the app and file-association icons", () => {
    for (const path of ["icons/App-Icon.svg", "icons/File-Icon.svg"]) {
      expect(existsSync(resolve(root, path)), `missing ${path}`).toBe(true);
      const source = readText(path);
      expect(source, path).toMatch(/<svg\b/iu);
      expect(source, path).toMatch(/viewBox\s*=\s*["']0\s+0\s+1024\s+1024["']/iu);
      expect(source, path).not.toMatch(/<script\b|<foreignObject\b|\son[a-z]+\s*=/iu);
      expect(source, path).not.toMatch(/(?:href|src)\s*=\s*["'](?:https?:|file:|data:|javascript:|\/\/)/iu);
    }
  });

  it("provides executable package smoke commands", () => {
    expect(manifest.scripts["package:smoke"]).toBe("node scripts/package-smoke.cjs");
    expect(manifest.scripts["test:package-static"]).toContain("verify-package.cjs");
    expect(manifest.scripts["test:smoke:packaged"]).toContain("smoke-electron.cjs");
    expect(manifest.scripts["test:smoke:packaged"]).not.toContain("--skip-clipboard");
    expect(manifest.scripts["icons:generate"]).toBe("node scripts/generate-icons.cjs");
    expect(manifest.scripts["icons:check"]).toBe("node scripts/generate-icons.cjs --check");
  });

  it("exact-pins the audited syntax highlighter and its lockfile integrity", () => {
    expect(manifest.dependencies["highlight.js"]).toBe("11.11.1");
    expect(lockfile.packages["node_modules/highlight.js"]).toMatchObject({
      version: "11.11.1",
      integrity: "sha512-Xwwo44whKBVCYoliBQwaPvtd/2tYFkRQtXDWj1nackaV2JPXx3L0+Jvd8/qCJ2p+ML0/XVkJ2q+Mr+UVdpJK5w==",
    });
  });
});

describe("GitHub Actions contract", () => {
  const qualityWorkflow = readText(".github/workflows/quality-gates.yml");
  const releaseWorkflow = readText(".github/workflows/build-desktop.yml");

  it("runs the quality workflow for pull requests and pushes to main", () => {
    expect(qualityWorkflow).toMatch(/\bpull_request:\s*\n/);
    expect(qualityWorkflow).toMatch(/\bpush:\s*\n\s+branches:\s*\n\s+- main/);
  });

  it("makes install, typecheck, test, build, package validation, and runtime smoke explicit", () => {
    for (const command of [
      "npm ci",
      "npm run icons:check",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run package:smoke",
      "npm run test:package-static",
      "npm run test:smoke:packaged",
    ]) {
      expect(qualityWorkflow).toContain(`run: ${command}`);
    }
    expect(qualityWorkflow).not.toContain("--skip-clipboard");
  });

  it("pins every third-party action to a full commit SHA", () => {
    const workflows = `${qualityWorkflow}\n${releaseWorkflow}`;
    const actionReferences = [...workflows.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^[^@]+@[a-f0-9]{40}$/);
    }
  });

  it("keeps release packaging tag/manual-only and emits checksum manifests", () => {
    expect(releaseWorkflow).toContain("workflow_dispatch:");
    expect(releaseWorkflow).toContain('- "v*"');
    expect(releaseWorkflow).toContain("npm run checksums");
    expect(releaseWorkflow.match(/npm run icons:check/g)).toHaveLength(2);
    expect(releaseWorkflow).not.toContain("pull_request:");
  });
});
