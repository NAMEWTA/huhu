import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { Safe, safeGitSnapshots } from "../../safe/src/engine/index.js";
import { CreateEntry } from "../../safe/src/engine/personal.js";
import { signal } from "../../safe/test/signal.js";
import { VaultSync } from "../src/engine/sync.js";

vi.setConfig({ testTimeout: 60_000 });

const password = "synthetic-safe-git-password";
const access = { subject: "desktop", check: () => undefined };
const current = ".huhu/safe/current";
const ringPath = `${current}/keyring.json`;
const manifestPath = `${current}/manifest.json`;
const dirs: string[] = [];
const safes: Safe[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const safe of safes.splice(0)) safe.lock("close");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function temp() {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-safe-sync-"));
  dirs.push(dir);
  return dir;
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, "-c", "core.autocrlf=false", "-c", "user.name=fixture", "-c", "user.email=fixture@localhost", ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

function oid(root: string, ref = "HEAD") {
  return git(root, "rev-parse", ref).toString().trim();
}

function tree(root: string, ref: string) {
  return git(root, "ls-tree", "-rz", "--name-only", ref).toString().split("\0").filter(Boolean);
}

function put(root: string, file: string, data: string | Buffer) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
}

function fixture() {
  const remote = temp();
  git(remote, "init", "--bare", "-q", "--initial-branch=main");
  function device() {
    const root = temp();
    git(root, "init", "-q", "--initial-branch=main");
    const files = new VaultFiles(root);
    const safe = new Safe({ files, dir: path.join(root, ".huhu/safe"), now: Date.now, publish: () => undefined, kdfParams: { N: 1024, r: 8, p: 1 } });
    safes.push(safe);
    const session = () => {
      const { instanceId, generation } = safe.status();
      return { instanceId, generation };
    };
    const snapshots = safeGitSnapshots(files);
    const connect = () => new VaultSync(root, undefined, undefined, undefined, false, snapshots);
    const sync = connect();
    sync.update({ remote, mode: "full" });
    const createTag = async (name: string) => {
      const currentSession = session();
      const { revision } = await safe.listTags(currentSession, access);
      return safe.createTag({ session: currentSession, expectedRevision: revision, name, color: "blue" }, access);
    };
    return { root, files, safe, sync, connect, session, createTag, snapshots };
  }
  return { remote, device };
}

test("自动同步等待 Safe 发布并以原始字节构造整代，保留用户暂存与仅本机文件", async () => {
  const { remote, device } = fixture();
  const a = device();
  await a.safe.setup(password);
  const secret = "synthetic-personal-note-6ca11";
  const { entryId } = await a.safe.createEntry(CreateEntry.parse({ session: a.session(), expectedRevision: 0, name: secret, accounts: [{ account: secret, password: secret, note: secret }] }), access);
  const entry = `${current}/entries/${entryId}-1.bin`;
  const stale = `${current}/entries/${entryId}-999.bin`;
  const local = "local-only.md";
  const excluded = [stale, ".huhu/safe/legacy-metadata.json", ".huhu/safe/audit.ndjson", ".huhu/module-credentials/machine.key", ".huhu/runtime/git/askpass", ".huhu/runtime/rules/env.json", ".huhu/cache/safe-write-remainder/tags.bin"];
  for (const file of excluded.filter((p) => !p.endsWith("audit.ndjson"))) put(a.root, file, secret);
  put(a.root, ".gitignore", ".huhu/safe/\n");
  put(a.root, ".gitattributes", `${manifestPath} filter=fixture\n`);
  git(a.root, "config", "filter.fixture.clean", "cat /dev/null");
  put(a.root, ".huhu/automations/scripts.json", '{"scripts":[]}');
  put(a.root, local, "staged copy");
  git(a.root, "add", "--", local);
  put(a.root, local, "worktree copy");
  const staged = git(a.root, "ls-files", "--stage", "--", local);
  a.sync.update({ exclude: [local] });

  const stagedTag = signal();
  const release = signal();
  const write = a.files.write.bind(a.files);
  vi.spyOn(a.files, "write").mockImplementation(async (file, bytes, opts) => {
    const result = await write(file, bytes, opts);
    if (file.endsWith("/tags.bin")) {
      stagedTag.resolve();
      await release.promise;
    }
    return result;
  });
  const update = a.createTag(secret);
  await Promise.race([stagedTag.promise, update]);
  const waiting = signal();
  const run = vi.spyOn(a.snapshots, "withLock").mockImplementationOnce((operation) => {
    waiting.resolve();
    return safeGitSnapshots(a.files).withLock(operation);
  });
  const sync = a.sync.runAutomatic("sync", () => true);
  try {
    await Promise.race([waiting.promise, sync]);
    expect(run).toHaveBeenCalledOnce();
    expect(existsSync(path.join(remote, "refs/heads/main"))).toBe(false);
  } finally {
    release.resolve();
    await update;
    await expect(sync).resolves.toBe(true);
  }

  const included = [ringPath, manifestPath, entry, `${current}/tags/1.bin`];
  const remotePaths = tree(remote, "main");
  expect(remotePaths.filter((file) => file.startsWith(".huhu/safe/"))).toEqual(included.sort());
  expect(remotePaths).toContain(".huhu/automations/scripts.json");
  for (const file of [...excluded, local]) expect(remotePaths).not.toContain(file);
  for (const file of included) {
    const bytes = git(remote, "cat-file", "blob", `main:${file}`);
    expect(bytes.equals(readFileSync(path.join(a.root, file)))).toBe(true);
    expect(bytes.includes(secret)).toBe(false);
  }
  expect(git(a.root, "ls-files", "--stage", "--", local).equals(staged)).toBe(true);
  expect(readFileSync(path.join(a.root, local), "utf8")).toBe("worktree copy");
});

test("预览按整个保险箱选择，局部排除不会发布残缺代", async () => {
  const { remote, device } = fixture();
  const a = device();
  await a.safe.setup(password);
  await a.createTag("synthetic tag");
  put(a.root, "ordinary.md", "notes");
  const tags = `${current}/tags/1.bin`;
  const members = [ringPath, manifestPath, tags];
  const initial = await a.sync.preview();
  expect(initial.push).toEqual(expect.arrayContaining([...members, "ordinary.md"]));
  a.sync.update({ exclude: [tags] });
  const excluded = await a.sync.preview();
  expect(excluded.push).toEqual(["ordinary.md"]);
  for (const file of members) expect(excluded.skipped).toContainEqual({ path: file, reason: expect.stringContaining("整个保险箱") });
  await expect(a.sync.run("sync")).resolves.toMatchObject({ pushed: true });
  expect(tree(remote, "main")).toEqual(["ordinary.md"]);
  a.sync.update({ exclude: [] });
  await a.sync.run("push");
  const published = oid(remote, "main");
  a.sync.update({ exclude: [tags] });
  await expect(a.sync.run("push")).rejects.toThrow(/破坏已跟踪保险箱整代/);
  expect(oid(remote, "main")).toBe(published);
});

test("只从新树移除已跟踪的旧资料，并拒绝连带推送尚未公开的旧提交", async () => {
  const { remote, device } = fixture();
  const a = device();
  await a.safe.setup(password);
  await a.createTag("old tag");
  await a.sync.run("push");
  const oldTag = `${current}/tags/1.bin`;
  const oldBytes = git(remote, "cat-file", "blob", `main:${oldTag}`);
  const audit = ".huhu/safe/audit.ndjson";
  const runtime = ".huhu/runtime/rules/env.json";
  put(a.root, runtime, "synthetic old runtime");
  git(a.root, "add", "--", audit, runtime);
  git(a.root, "commit", "-qm", "legacy tracked audit");
  const older = oid(a.root);
  git(a.root, "push", "-q", "origin", "HEAD:main");

  await a.createTag("new tag");
  await a.sync.run("push");
  expect(tree(remote, "main")).toEqual([ringPath, manifestPath, `${current}/tags/2.bin`].sort());
  expect(readFileSync(path.join(a.root, oldTag)).equals(oldBytes)).toBe(true);
  expect(git(remote, "cat-file", "blob", `${older}:${oldTag}`).equals(oldBytes)).toBe(true);
  expect(git(remote, "cat-file", "blob", `${older}:${audit}`).byteLength).toBeGreaterThan(0);
  expect(git(remote, "cat-file", "blob", `${older}:${runtime}`).toString()).toBe("synthetic old runtime");
  expect(existsSync(path.join(a.root, audit))).toBe(true);
  expect(readFileSync(path.join(a.root, runtime), "utf8")).toBe("synthetic old runtime");

  const before = oid(remote, "main");
  const localCommit = ".huhu/safe/legacy-metadata.json";
  put(a.root, localCommit, "private unpublished fixture");
  git(a.root, "add", "--", localCommit);
  git(a.root, "commit", "-qm", "private unpublished legacy metadata");
  const unpublished = oid(a.root);
  await expect(a.sync.run("push")).rejects.toThrow(/同一代保险箱/);
  expect(tree(a.root, "HEAD")).not.toContain(localCommit);
  expect(git(a.root, "cat-file", "blob", `${unpublished}:${localCommit}`).toString()).toBe("private unpublished fixture");
  expect(readFileSync(path.join(a.root, localCommit), "utf8")).toBe("private unpublished fixture");
  expect(oid(remote, "main")).toBe(before);
});

test("两个副本同一密文路径发生分歧时保留双方整代，重开后仍拒绝逐文件解决", async () => {
  const { remote, device } = fixture();
  const a = device();
  const b = device();
  await a.safe.setup(password);
  await a.createTag("baseline");
  await a.sync.run("push");
  await expect(b.sync.run("pull")).resolves.toMatchObject({ pulled: true });
  await b.safe.unlock(password);
  expect((await b.safe.listTags(b.session(), access)).tags.map((tag) => tag.name)).toEqual(["baseline"]);

  await a.createTag("side A");
  await b.createTag("side B");
  await a.sync.run("push");
  const theirs = oid(remote, "main");
  const tags = `${current}/tags/2.bin`;
  const local = readFileSync(path.join(b.root, tags));
  await expect(b.sync.run("sync")).rejects.toMatchObject({ code: "GIT_CONFLICT", details: { files: expect.arrayContaining([manifestPath, tags]) } });
  const ours = oid(b.root);
  expect(git(b.root, "cat-file", "blob", `${ours}:${tags}`).equals(local)).toBe(true);
  expect(git(b.root, "cat-file", "blob", `${theirs}:${tags}`).equals(local)).toBe(false);
  expect(readFileSync(path.join(b.root, tags)).equals(local)).toBe(true);
  expect(git(b.root, "ls-files", "--unmerged").length).toBe(0);
  expect(existsSync(path.join(b.root, ".git/MERGE_HEAD"))).toBe(false);
  expect(oid(remote, "main")).toBe(theirs);

  const reopened = b.connect();
  const session = await reopened.conflicts();
  expect(session).toMatchObject({ localHead: ours, remoteHead: theirs });
  expect(reopened.status().name).toBe("conflict");
  await expect(reopened.conflictFile(manifestPath)).resolves.toMatchObject({ kind: "whole", ours: { binary: true }, theirs: { binary: true } });
  await expect(reopened.resolveConflicts(session!.id, [{ path: tags, whole: "ours" }])).rejects.toThrow(/无法按文件解决/);
  await expect(reopened.runAutomatic("sync", () => true)).resolves.toBe(false);
  expect(oid(b.root)).toBe(ours);
});

test("快进拉取验证真实整代并保留本地旧原件，残缺远端不会改动 HEAD 或 Safe", async () => {
  const { device } = fixture();
  const a = device();
  const b = device();
  await a.safe.setup(password);
  await a.createTag("first generation");
  await a.sync.run("push");
  await b.sync.run("pull");
  await b.safe.unlock(password);
  const first = oid(b.root);
  const old = `${current}/tags/1.bin`;
  const oldBytes = readFileSync(path.join(b.root, old));
  const original = ".huhu/safe/legacy-metadata.json";
  put(b.root, original, "local original");

  await a.createTag("second generation");
  await a.sync.run("push");
  await expect(b.sync.run("pull")).resolves.toMatchObject({ pulled: true });
  const second = oid(b.root);
  expect(git(b.root, "cat-file", "blob", `${first}:${old}`).equals(oldBytes)).toBe(true);
  expect(readFileSync(path.join(b.root, original), "utf8")).toBe("local original");
  const tags = `${current}/tags/2.bin`;
  const active = readFileSync(path.join(b.root, tags));
  expect((await b.safe.listTags(b.session(), access)).tags.map((tag) => tag.name)).toEqual(["first generation", "second generation"]);

  git(a.root, "rm", "--", tags);
  git(a.root, "commit", "-qm", "incomplete generation fixture");
  git(a.root, "push", "-q", "origin", "HEAD:main");
  await expect(b.sync.run("pull")).rejects.toThrow(/同一代保险箱/);
  expect(oid(b.root)).toBe(second);
  expect(readFileSync(path.join(b.root, tags)).equals(active)).toBe(true);
});
