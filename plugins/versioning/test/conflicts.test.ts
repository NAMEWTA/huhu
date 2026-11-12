import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VaultGit } from "../src/engine/repo.js";
import { VaultSync } from "../src/engine/sync.js";

// Windows 上每次 git 调用都要几百毫秒，一个用例里有几十次：默认的 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // Windows 上 git 子进程刚退出时目录可能还被占着
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-cf-"));
  dirs.push(d);
  return d;
};
const put = (root: string, rel: string, text: string | Buffer) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};
const read = (root: string, rel: string) => readFileSync(path.join(root, rel), "utf8");
const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, "-c", "core.quotepath=false", "-c", "core.autocrlf=false", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });

async function twoVaults(hooks = {}) {
  const remote = tmp();
  execFileSync("git", ["init", "--bare", "-q", "--initial-branch=main", remote]);
  const aroot = tmp();
  await new VaultGit(aroot).init();
  git(aroot, "checkout", "-q", "-b", "main");
  const a = new VaultSync(aroot);
  a.update({ remote, branch: "main", mode: "full" });
  const broot = tmp();
  execFileSync("git", ["init", "-q", "--initial-branch=main", broot]);
  const b = new VaultSync(broot, undefined, hooks);
  b.update({ remote, branch: "main", mode: "full" });
  return { remote, a: { root: aroot, sync: a }, b: { root: broot, sync: b } };
}

/** 制造一个冲突：返回 B（冲突方）。 */
async function conflicted(files: Record<string, [base: string | Buffer, mine: string | Buffer, theirs: string | Buffer]>, hooks = {}) {
  const v = await twoVaults(hooks);
  for (const [p, [base]] of Object.entries(files)) put(v.a.root, p, base);
  await v.a.sync.run("sync");
  await v.b.sync.run("pull");
  for (const [p, [, , theirs]] of Object.entries(files)) put(v.a.root, p, theirs);
  await v.a.sync.run("sync");
  for (const [p, [, mine]] of Object.entries(files)) put(v.b.root, p, mine);
  let err: { code?: string; details?: { sessionId?: string } } = {};
  await v.b.sync.run("sync").catch((e: unknown) => {
    err = e as typeof err;
  });
  expect(err.code).toBe("GIT_CONFLICT");
  return { ...v, sessionId: err.details?.sessionId as string };
}

const lines = (n: number, edit: Record<number, string> = {}) => Array.from({ length: n }, (_, i) => `${edit[i] ?? `行${i}`}\n`).join("");

describe("同步冲突解决", () => {
  test("冲突时工作区没有冲突标记、没有 MERGE_HEAD，会话只存 OID 不存内容，重启后状态仍为 conflict", async () => {
    const v = await conflicted({ "共享.md": [lines(10), lines(10, { 2: "本地改" }), lines(10, { 2: "远端改" })] });
    expect(read(v.b.root, "共享.md")).toBe(lines(10, { 2: "本地改" }));
    expect(existsSync(path.join(v.b.root, ".git/MERGE_HEAD"))).toBe(false);
    const raw = readFileSync(path.join(v.b.root, ".huhu/sync/conflict.json"), "utf8");
    expect(raw).not.toContain("本地改");
    expect(raw).not.toContain("远端改");
    const reopened = new VaultSync(v.b.root); // 模拟重启
    expect(reopened.status()).toMatchObject({ name: "conflict" });
    expect((await reopened.conflicts())?.files).toEqual([{ path: "共享.md", kind: "blocks", blocks: 1 }]);
  });

  test("逐块解决：多个冲突块各选不同，生成合并提交并推送；远端副本拿到结果", async () => {
    const v = await conflicted({ "n.md": [lines(20), lines(20, { 1: "L1", 15: "L15" }), lines(20, { 1: "R1", 15: "R15" })] });
    const view = await v.b.sync.conflictFile("n.md");
    expect(view.kind).toBe("blocks");
    if (view.kind !== "blocks") return;
    expect(view.segments.filter((s) => s.kind === "conflict")).toHaveLength(2);
    const r = await v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["theirs", { custom: "手工合并\n" }] }]);
    expect(r.pushed).toBe(true);
    expect(read(v.b.root, "n.md")).toBe(lines(20, { 1: "R1", 15: "手工合并" }));
    expect(git(v.b.root, "rev-list", "--parents", "-n1", "HEAD").trim().split(" ")).toHaveLength(3); // 合并提交有两个父提交
    expect(v.b.sync.status().name).toBe("idle");
    expect(existsSync(path.join(v.b.root, ".huhu/sync/conflict.json"))).toBe(false);
    await v.a.sync.run("pull");
    expect(read(v.a.root, "n.md")).toBe(lines(20, { 1: "R1", 15: "手工合并" }));
  });

  test("远端新增了无关文件：解决后一并合入", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    put(v.a.root, "另一个.md", "新文件\n");
    await v.a.sync.run("sync");
    // 不 fetch 的情况下解决：会话里的 remoteHead 仍是旧的，无关文件在随后的同步里拉到
    const r = await v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["ours"] }]);
    expect(read(v.b.root, "n.md")).toBe(lines(6, { 3: "L" }));
    expect(r.syncError).toBeUndefined();
    expect(read(v.b.root, "另一个.md")).toBe("新文件\n");
  });

  test("一方删除、一方修改：只能整文件选择；选择删除后文件被移除", async () => {
    const v = await twoVaults();
    put(v.a.root, "d.md", "x\ny\n");
    await v.a.sync.run("sync");
    await v.b.sync.run("pull");
    rmSync(path.join(v.a.root, "d.md"));
    await v.a.sync.run("sync");
    put(v.b.root, "d.md", "x\nY\n");
    const err = await v.b.sync.run("sync").catch((e: unknown) => e as { details: { sessionId: string } });
    const sessionId = (err as { details: { sessionId: string } }).details.sessionId;
    const view = await v.b.sync.conflictFile("d.md");
    expect(view).toMatchObject({ kind: "whole", ours: { exists: true }, theirs: { exists: false } });
    await expect(v.b.sync.resolveConflicts(sessionId, [{ path: "d.md", blocks: [] }])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await v.b.sync.resolveConflicts(sessionId, [{ path: "d.md", whole: "delete" }]);
    expect(existsSync(path.join(v.b.root, "d.md"))).toBe(false);
  });

  test("二进制文件：整文件二选一，内容字节保真", async () => {
    const bin = (n: number) => Buffer.from([0, 1, 2, n, 255, 0]);
    const v = await conflicted({ "a.bin": [bin(1), bin(2), bin(3)] });
    expect(await v.b.sync.conflictFile("a.bin")).toMatchObject({ kind: "whole", ours: { binary: true }, theirs: { binary: true } });
    await v.b.sync.resolveConflicts(v.sessionId, [{ path: "a.bin", whole: "theirs" }]);
    expect(readFileSync(path.join(v.b.root, "a.bin")).equals(bin(3))).toBe(true);
  });

  test("过期：解决前本地又提交了 → VERSION_CONFLICT，会话作废", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    git(v.b.root, "-c", "user.name=u", "-c", "user.email=u@u", "commit", "-q", "--allow-empty", "-m", "又提交了一次");
    await expect(v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["ours"] }])).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(existsSync(path.join(v.b.root, ".huhu/sync/conflict.json"))).toBe(false);
  });

  test("未提交的改动会被覆盖时拒绝，并且不留下半成品（HEAD 不变、会话保留）", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    const head = git(v.b.root, "rev-parse", "HEAD").trim();
    put(v.b.root, "n.md", lines(6, { 3: "L", 5: "解决期间又改了" }));
    await expect(v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["theirs"] }])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(git(v.b.root, "rev-parse", "HEAD").trim()).toBe(head);
    expect(read(v.b.root, "n.md")).toBe(lines(6, { 3: "L", 5: "解决期间又改了" }));
    expect(existsSync(path.join(v.b.root, ".huhu/sync/conflict.json"))).toBe(true);
  });

  test("用户自己暂存的无关文件不会被带进合并提交", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    put(v.b.root, "私人.md", "不该进提交\n");
    git(v.b.root, "add", "私人.md");
    v.b.sync.update({ mode: "follow" }); // full 模式的后续同步会按"纳入范围的改动"提交（含手动暂存的文件），这里只验证解决本身
    const r = await v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["ours"] }]);
    expect(git(v.b.root, "ls-tree", "-r", "--name-only", r.commit)).not.toContain("私人.md");
    expect(git(v.b.root, "diff", "--cached", "--name-only")).toContain("私人.md"); // 仍保持暂存
  });

  test("输入必须恰好覆盖冲突文件，块选择数量必须一致", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    await expect(v.b.sync.resolveConflicts(v.sessionId, [{ path: "其他.md", blocks: [] }])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: [] }])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(v.b.sync.resolveConflicts("cf-bad", [{ path: "n.md", blocks: ["ours"] }])).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("覆盖前调用检查点钩子；语义校验失败 → 拒绝并不改动", async () => {
    const seen: string[][] = [];
    const v = await conflicted(
      { "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] },
      {
        beforeOverwrite: (p: string[]) => {
          seen.push(p);
        },
        validateResolved: (_p: string, t: string) => {
          if (t.includes("坏")) throw new Error("kind 无效");
        },
      },
    );
    await expect(v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: [{ custom: "坏\n" }] }])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(seen).toEqual([]); // 校验先于覆盖
    await v.b.sync.resolveConflicts(v.sessionId, [{ path: "n.md", blocks: ["ours"] }]);
    expect(seen).toEqual([["n.md"]]);
  });

  test("放弃冲突：会话删除，文件不变，状态回到 idle；再次同步重新检测出同一冲突", async () => {
    const v = await conflicted({ "n.md": [lines(6), lines(6, { 3: "L" }), lines(6, { 3: "R" })] });
    expect(await v.b.sync.cancelConflicts()).toEqual({ cancelled: true });
    expect(v.b.sync.status().name).toBe("idle");
    expect(read(v.b.root, "n.md")).toBe(lines(6, { 3: "L" }));
    await expect(v.b.sync.run("sync")).rejects.toMatchObject({ code: "GIT_CONFLICT" });
    expect(await v.b.sync.cancelConflicts()).toEqual({ cancelled: true });
    expect(await v.b.sync.cancelConflicts()).toEqual({ cancelled: false });
  });
});
