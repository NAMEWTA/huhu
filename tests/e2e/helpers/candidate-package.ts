import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

async function extractCandidate() {
  expect(process.platform).toBe("linux");
  expect(process.arch).toBe("x64");
  const profile = process.env["HUHU_ACCEPTANCE_PROFILE_ROOT"];
  expect(profile, "use scripts/accept-linux-candidate.sh for a private bus and profile").toBeTruthy();
  const profileStat = await stat(profile!);
  expect(profileStat.isDirectory()).toBe(true);
  expect(profileStat.mode & 0o077).toBe(0);
  expect(process.env["DBUS_SESSION_BUS_ADDRESS"]).toBeTruthy();
  expect(process.env["HUHU_ACCEPTANCE_DBUS_ADDRESS"]).toBe(process.env["DBUS_SESSION_BUS_ADDRESS"]);
  const artifact = await realpath(process.env["HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT"]!);

  const commit = process.env["HUHU_CANDIDATE_GIT_SHA"];
  expect(commit).toMatch(/^[a-f0-9]{40}$/u);
  const directory = await mkdtemp(path.join(tmpdir(), "huhu-candidate-"));
  candidateDirectory = directory;
  const snapshot = path.join(directory, "candidate.AppImage");
  await copyFile(artifact, snapshot);
  await chmod(snapshot, 0o500);
  const sha = await digest(snapshot);
  expect(sha).toBe(process.env["HUHU_TASK_JOURNEY_PACKAGE_SHA"]);
  await promisify(execFile)(snapshot, ["--appimage-extract"], { cwd: directory, env: candidateEnvironment(), maxBuffer: 16 * 1024 * 1024 });
  // The executable is derived from these exact artifact bytes, never supplied independently.
  const executablePath = await realpath(path.join(directory, "squashfs-root", "huhu"));
  expect(executablePath).toBe(path.join(directory, "squashfs-root", "huhu"));
  const resources = path.join(path.dirname(executablePath), "resources");
  const archive = path.join(resources, "app.asar");
  const desktopRequire = createRequire(new URL("../../../apps/desktop/package.json", import.meta.url));
  const builderRequire = createRequire(desktopRequire.resolve("electron-builder"));
  const libraryRequire = createRequire(builderRequire.resolve("app-builder-lib"));
  const { extractFile } = libraryRequire("@electron/asar") as { extractFile(file: string, entry: string): Buffer };
  const build = JSON.parse(extractFile(archive, "out/build-info.json").toString("utf8")) as { commit: string; version: string };
  expect(build.commit).toBe(commit);
  const files = [executablePath, archive, path.join(resources, "herdr/linux-x64/herdr-core"), path.join(resources, "codex-dispatch/helper.cjs"), path.join(resources, "bin/huhu"), path.join(resources, "cli/cli.mjs")];
  for (const file of files) expect(await realpath(file)).toBe(file);
  const hashes = Object.fromEntries(await Promise.all([snapshot, ...files].map(async (file) => [path.relative(directory, file), await digest(file)])));
  return { directory, artifact, sha, commit: build.commit, version: build.version, executablePath, resources, hashes };
}

let candidateDirectory: string | undefined;
let candidate: ReturnType<typeof extractCandidate> | undefined;
export function candidatePackage() {
  return (candidate ??= extractCandidate());
}

export async function disposeCandidate() {
  if (candidateDirectory) await rm(candidateDirectory, { recursive: true, force: true });
  candidateDirectory = undefined;
  candidate = undefined;
}

export async function confirmCandidate(app: ElectronApplication, page: Page) {
  const expected = await candidatePackage();
  for (const [file, sha] of Object.entries(expected.hashes)) expect(await digest(path.join(expected.directory, file))).toBe(sha);
  const running = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, resources: process.resourcesPath, platform: process.platform, arch: process.arch, version: app.getVersion() }));
  expect(running).toEqual({ packaged: true, executable: expected.executablePath, resources: expected.resources, platform: "linux", arch: "x64", version: expected.version });
  expect(page.url()).toMatch(/^huhu-app:\/\/workbench(?:\/|$)/u);
  expect(await page.evaluate(() => window.huhuHost.appInfo())).toMatchObject({ commit: expected.commit.slice(0, 12) });
  return { ...expected, running };
}

/** Only display, tooling and the caller's isolated Secret Service cross into a fixture. */
export function candidateEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "LANG", "LC_ALL", "TZ", "HUHU_CODEX_DISPATCH_BIN"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}
