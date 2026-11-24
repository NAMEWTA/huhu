import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { exportPackage, OperationLog, ReceiptLog, Trash, VaultFiles, versionOf } from "../src/index.js";
import * as moves from "../src/rename.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return { ...actual, link: vi.fn(actual.link), rm: vi.fn(actual.rm) };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

import { createRequire } from "node:module";
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function vault() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-w-"));
  dirs.push(d);
  const root = path.join(d, "v");
  const ops = path.join(d, "ops");
  for (const [f, c] of [
    ["a.md", "A-old"],
    ["b.md", "B-old"],
    ["c.md", "C-old"],
    ["e.md", "E-old"],
  ] as const) {
    writeFileSync(path.join(d, "v", f), c, { flag: "w" });
  }
  return { d, root, ops };
}
function init() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-w-"));
  dirs.push(d);
  const root = path.join(d, "v");
  const ops = path.join(d, "ops");
  require_mkdir(root);
  for (const [f, c] of [
    ["a.md", "A-old"],
    ["b.md", "B-old"],
    ["c.md", "C-old"],
    ["e.md", "E-old"],
  ] as const)
    writeFileSync(path.join(root, f), c);
  return { root, ops };
}
import { mkdirSync } from "node:fs";
function require_mkdir(p: string) {
  mkdirSync(p, { recursive: true });
}
void vault;

describe("VaultFiles", () => {
  test("并发独占创建恰有一个成功，落盘字节来自成功方", async () => {
    const { root } = init();
    const f = new VaultFiles(root);
    const first = Buffer.from("first");
    const second = Buffer.from("second");
    const results = await Promise.allSettled([f.write("new.md", first, { expectedVersion: null }), f.write("new.md", second, { expectedVersion: null })]);
    const i = results.findIndex((r) => r.status === "fulfilled");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results[1 - i]).toMatchObject({ status: "rejected", reason: { code: "NAME_CONFLICT" } });
    expect(readFileSync(path.join(root, "new.md"))).toEqual([first, second][i]);
    expect(readdirSync(root).filter((name) => name.startsWith(".huhu-create-"))).toEqual([]);
  });

  test.each([
    ["异步", false],
    ["beforeCommit 同步", true],
  ])("%s独占创建：目标已发布后暂存清理失败仍算成功，保留回执并稍后删除暂存", async (_name, sync) => {
    const { root } = init();
    const receipts = new ReceiptLog();
    const files = new VaultFiles(root, receipts);
    const busy = () => Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const stage = (target: unknown) => String(target).includes(".huhu-create-");
    const rmAsync = vi.mocked(fsPromises.rm);
    const rmSyncMock = vi.mocked(fs.rmSync);
    const realRm = rmAsync.getMockImplementation()!;
    const realRmSync = rmSyncMock.getMockImplementation()!;
    let failures = 0;
    rmAsync.mockImplementation(async (target, options) => {
      if (!sync && stage(target) && failures++ === 0) throw busy();
      return realRm(target, options);
    });
    rmSyncMock.mockImplementation((target, options) => {
      if (sync && stage(target) && failures++ === 0) throw busy();
      return realRmSync(target, options);
    });
    try {
      const bytes = Buffer.from("published");
      const result = await files.write("new.md", bytes, { expectedVersion: null, ...(sync ? { beforeCommit: () => undefined } : {}) });
      expect(result.version).toBe(versionOf(bytes));
      expect(read(root, "new.md")).toBe("published");
      expect(failures).toBe(1);
      const left = readdirSync(root).filter((name) => name.startsWith(".huhu-create-"));
      expect(left).toHaveLength(1);
      expect(receipts.isTemporaryFile(left[0]!)).toBe(true);
      expect(receipts.consume("new.md", result.version)).toBe(true);
      // 删除完成与解除登记在同一回调里先后发生：两者一起等待，避免在中间时刻取样
      await vi.waitFor(
        () => {
          expect(readdirSync(root).filter((name) => name.startsWith(".huhu-create-"))).toEqual([]);
          expect(receipts.isTemporaryFile(left[0]!)).toBe(false);
        },
        { timeout: 3000 },
      );
    } finally {
      rmAsync.mockImplementation(realRm);
      rmSyncMock.mockImplementation(realRmSync);
    }
  });

  test("延迟清理只删本次的暂存：同名条目被替换后保留新文件；持续失败的残留不进数据包", async () => {
    const { root } = init();
    const receipts = new ReceiptLog();
    const files = new VaultFiles(root, receipts);
    const busy = () => Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const stage = (target: unknown) => String(target).includes(".huhu-create-");
    const rmAsync = vi.mocked(fsPromises.rm);
    const realRm = rmAsync.getMockImplementation()!;
    let failures = 0;
    rmAsync.mockImplementation(async (target, options) => {
      if (stage(target) && failures++ === 0) throw busy();
      return realRm(target, options);
    });
    try {
      await files.write("replaced.md", Buffer.from("published"), { expectedVersion: null });
      const [left] = readdirSync(root).filter((name) => name.startsWith(".huhu-create-"));
      expect(left).toBeDefined();
      // 外部同步程序在延迟窗口把该路径换成另一个文件
      rmSync(path.join(root, left!));
      writeFileSync(path.join(root, left!), "someone else");
      await vi.waitFor(() => expect(receipts.isTemporaryFile(left!)).toBe(false), { timeout: 3000 });
      expect(readFileSync(path.join(root, left!), "utf8")).toBe("someone else");
      rmSync(path.join(root, left!));

      rmAsync.mockImplementation(async (target, options) => {
        if (stage(target)) throw busy();
        return realRm(target, options);
      });
      await files.write("stuck.md", Buffer.from("stuck"), { expectedVersion: null });
      fs.mkdirSync(path.join(root, ".huhu"), { recursive: true });
      writeFileSync(path.join(root, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-stage1", name: "暂存", description: "", formatVersion: 1, createdAt: "2026-11-22T00:00:00Z" }));
      const zip = path.join(path.dirname(root), "out.zip");
      const manifest = await exportPackage(root, zip);
      expect(readdirSync(root).some((name) => name.startsWith(".huhu-create-"))).toBe(true);
      expect(JSON.stringify(manifest)).not.toContain(".huhu-create-");
    } finally {
      rmAsync.mockImplementation(realRm);
    }
  });

  test.each(["EPERM", "EXDEV", "ENOTSUP"])("卷不支持硬链接时仍可独占发布（%s）", async (code) => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const link = vi.spyOn(fsPromises, "link").mockRejectedValue(Object.assign(new Error(code), { code }));
    try {
      const results = await Promise.allSettled(["first", "second"].map((value) => files.write("new.md", Buffer.from(value), { expectedVersion: null })));
      const winner = results.findIndex((result) => result.status === "fulfilled");
      expect(results[1 - winner]).toMatchObject({ status: "rejected", reason: { code: "NAME_CONFLICT" } });
      expect(read(root, "new.md")).toBe(["first", "second"][winner]);
      await expect(
        log.run("fallback", "copy", [
          { action: "write", path: "copy.md", bytes: Buffer.from("copy"), expectedVersion: null },
          { action: "rename", from: "a.md", path: "b.md" },
        ]),
      ).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
      expect(read(root, "copy.md")).toBeNull();
      expect(read(root, "b.md")).toBe("B-old");
      expect(readdirSync(root).some((name) => name.startsWith(".huhu-create-"))).toBe(false);
    } finally {
      link.mockRestore();
    }
  });

  test("转换发布前外部同名创建时保留当前文件及原始备份", () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const target = path.join(root, "a.md");
    const move = moves.renameNoReplace;
    const spy = vi.spyOn(moves, "renameNoReplace").mockImplementation((from, to, label) => {
      if (path.basename(from) === "converted") writeFileSync(to, "rival", { flag: "wx" });
      move(from, to, label);
    });
    try {
      expect(() => files.replaceRecoverably("a.md", Buffer.from("A-old"), Buffer.from("conversion"), 32, ops)).toThrow(/转换已停止/);
      const recovery = path.join(ops, "operations", "encoding-recovery");
      const copy = path.join(recovery, readdirSync(recovery)[0]!);
      expect(readFileSync(path.join(copy, "original"))).toEqual(Buffer.from("A-old"));
      expect(readFileSync(path.join(copy, "inspected"))).toEqual(Buffer.from("A-old"));
      expect(readFileSync(target)).toEqual(Buffer.from("rival"));
    } finally {
      spy.mockRestore();
    }
  });

  test("版本冲突、必须不存在、回执", async () => {
    const { root } = init();
    const f = new VaultFiles(root);
    const v1 = (await f.write("n.md", Buffer.from("1"), { expectedVersion: null })).version;
    await expect(f.write("n.md", Buffer.from("2"), { expectedVersion: null })).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    await expect(f.write("n.md", Buffer.from("2"), { expectedVersion: "deadbeef" })).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: v1 } });
    const v2 = (await f.write("n.md", Buffer.from("2"), { expectedVersion: v1 })).version;
    expect(f.receipts.consume("n.md", v2)).toBe(true);
    expect(f.receipts.consume("n.md", v2)).toBe(false);
    expect(v2).toBe(versionOf(Buffer.from("2")));
  });
  test("同一文件在两个句柄并发条件写时，只接受第一个版本", async () => {
    const { root } = init();
    const f = new VaultFiles(root);
    const parallel = new VaultFiles(root);
    const expectedVersion = f.currentVersion("a.md");
    const [first, second] = await Promise.allSettled([f.write("a.md", Buffer.from("accepted"), { expectedVersion }), parallel.write("a.md", Buffer.from("stale"), { expectedVersion })]);
    const committed = versionOf(Buffer.from("accepted"));
    expect(first).toEqual({ status: "fulfilled", value: { version: committed } });
    expect(second).toMatchObject({ status: "rejected", reason: { code: "VERSION_CONFLICT", details: { currentVersion: committed } } });
    expect(f.read("a.md")?.bytes.toString()).toBe("accepted");
    expect(parallel.receipts.consume("a.md", versionOf(Buffer.from("stale")))).toBe(false);
    await expect(parallel.write("a.md", Buffer.from("retried"), { expectedVersion: committed })).resolves.toEqual({ version: versionOf(Buffer.from("retried")) });
  });
  test("回执过期", () => {
    let t = 0;
    const r = new ReceiptLog(() => t);
    r.record("a", "v");
    t = 20_000;
    expect(r.consume("a", "v")).toBe(false);
  });
  test("路径越界被拒", async () => {
    const { root } = init();
    await expect(new VaultFiles(root).write("../x.md", Buffer.from("x"))).rejects.toMatchObject({ code: "PATH_OUTSIDE_VAULT" });
  });
});

const read = (root: string, f: string) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : null);

describe("多文件操作", () => {
  test.each(["write", "delete", "rename"] as const)("在途条件写先于多文件 %s 提交，旧版本不得同时成功", async (action) => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(new VaultFiles(root), ops);
    const old = versionOf(Buffer.from("A-old"));
    const accepted = files.write("a.md", Buffer.from("first"), { expectedVersion: old });
    const step =
      action === "write"
        ? { action, path: "a.md", bytes: Buffer.from("stale") }
        : action === "rename"
          ? { action, from: "a.md", path: "moved.md" }
          : { action, path: "a.md" };
    const stale = expect(log.run("stale", action, [step])).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      details: { path: "a.md", currentVersion: versionOf(Buffer.from("first")) },
    });
    await expect(accepted).resolves.toEqual({ version: versionOf(Buffer.from("first")) });
    await stale;
    expect(read(root, "a.md")).toBe("first");
    expect(read(root, "moved.md")).toBeNull();
  });

  test.each(["delete", "rename"] as const)("先排队的 %s 提交后迟到的旧写入不能复生原路径", async (action) => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const expectedVersion = files.currentVersion("a.md")!;
    const step = action === "rename" ? { action, from: "a.md", path: "A.md", caseOnly: true as const } : { action, path: "a.md" };
    const moved = log.run("move-first", action, [step]);
    const stale = files.write("./a.md", Buffer.from("stale"), { expectedVersion });
    const insensitive = action === "rename" && existsSync(path.join(root, "A.md"));
    if (insensitive) {
      // A case alias still addresses the same published entry and its current version.
      await expect(stale).resolves.toEqual({ version: versionOf(Buffer.from("stale")) });
    } else {
      await expect(stale).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(moved).resolves.toMatchObject({ state: "committed", steps: [{ done: true }] });
    expect(readdirSync(root)).not.toContain("a.md");
    if (action === "rename") expect(read(root, "A.md")).toBe(insensitive ? "stale" : "A-old");
  });

  test("在真正发布前重新比较版本，保留暂存期间到达的外部改动", async () => {
    const { root } = init();
    const files = new VaultFiles(root);
    const expectedVersion = files.currentVersion("a.md")!;
    await expect(
      files.write("a.md", Buffer.from("mine"), {
        expectedVersion,
        beforeCommit: () => writeFileSync(path.join(root, "a.md"), "outside"),
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: versionOf(Buffer.from("outside")) } });
    expect(read(root, "a.md")).toBe("outside");
    expect(files.receipts.consume("a.md", versionOf(Buffer.from("mine")))).toBe(false);
  });

  test("外部更新在队列等待期间落盘，两个等待的旧版本操作都拒绝提交", async () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const blocker = files.withCommit(["a.md"], () => writeFileSync(path.join(root, "a.md"), "outside"));
    const old = versionOf(Buffer.from("A-old"));
    const staleWrite = files.write("a.md", Buffer.from("stale"), { expectedVersion: old });
    const staleDelete = log.run("stale-delete", "delete", [{ action: "delete", path: "a.md", expectedVersion: old }]);
    const errors = [staleWrite, staleDelete].map((result) => expect(result).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: versionOf(Buffer.from("outside")) } }));
    await blocker;
    await Promise.all(errors);
    expect(read(root, "a.md")).toBe("outside");
  });

  test("目录移动与后代条件写共用预留边界，旧目录不会被重建", async () => {
    const { root, ops } = init();
    mkdirSync(path.join(root, "folder"));
    writeFileSync(path.join(root, "folder/note.md"), "old");
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const moved = log.run("folder", "rename", [{ action: "rename", from: "folder", path: "next" }]);
    await expect(files.write("folder/note.md", Buffer.from("late"), { expectedVersion: versionOf(Buffer.from("old")) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await moved).state).toBe("committed");
    expect(existsSync(path.join(root, "folder"))).toBe(false);
    expect(read(root, "next/note.md")).toBe("old");
  });

  test("同步回收站与在途写入冲突时拒绝搬移，重试可回收已提交版本", async () => {
    const { root } = init();
    const files = new VaultFiles(root);
    const trash = new Trash(files);
    const writing = files.write("a.md", Buffer.from("saved"));
    expect(() => trash.moveIn("a.md")).toThrow(expect.objectContaining({ code: "VERSION_CONFLICT" }));
    await writing;
    const { trashId } = trash.moveIn("a.md");
    expect(read(root, "a.md")).toBeNull();
    expect(read(root, `.huhu/trash/${trashId}/a.md`)).toBe("saved");
  });

  test("后续步骤按同一规范路径的中间版本检查并保留各步回执", async () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const middle = Buffer.from("middle");
    const final = Buffer.from("final");
    const result = await log.run("repeat", "repeat", [
      { action: "write", path: "./a.md", bytes: middle, expectedVersion: files.currentVersion("a.md") },
      { action: "write", path: "a.md", bytes: final, expectedVersion: versionOf(middle) },
    ]);
    expect(result.steps).toMatchObject([
      { done: true, path: "a.md", afterVersion: versionOf(middle) },
      { done: true, path: "a.md", beforeVersion: versionOf(middle), afterVersion: versionOf(final) },
    ]);
    expect(files.read("a.md")).toMatchObject({ bytes: final, version: versionOf(final) });
  });

  test("正常提交", async () => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    const op = await log.run("ok1", "t", [
      { action: "write", path: "a.md", bytes: Buffer.from("A2") },
      { action: "rename", from: "c.md", path: "d.md" },
    ]);
    expect(op.state).toBe("committed");
    expect(read(root, "a.md")).toBe("A2");
    expect(read(root, "d.md")).toBe("C-old");
    expect(read(root, "c.md")).toBeNull();
  });
  test("步骤失败回滚并抛 WRITE_PARTIAL", async () => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    await expect(
      log.run("bad1", "t", [
        { action: "write", path: "a.md", bytes: Buffer.from("A2") },
        { action: "rename", from: "c.md", path: "e.md" },
      ]),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL" });
    expect(read(root, "a.md")).toBe("A-old");
    expect(read(root, "c.md")).toBe("C-old");
    expect(read(root, "e.md")).toBe("E-old");
    expect(log.load("bad1")?.state).toBe("rolled_back");
  });
  test.each([false, true])("最后一次检查后同名写入保留双方（大小写改名：%s）", async (caseOnly) => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const destination = caseOnly ? "A.md" : "new.md";
    const aliasesSource = caseOnly && existsSync(path.join(root, destination));
    const exists = files.exists.bind(files);
    vi.spyOn(files, "exists").mockImplementation((rel) => {
      const found = exists(rel);
      if (rel === destination && !found) writeFileSync(path.join(root, rel), "rival", { flag: "wx" });
      return found;
    });
    await expect(log.run("late-collision", "rename", [{ action: "rename", from: "a.md", path: destination, ...(caseOnly ? { caseOnly: true } : {}) }])).rejects.toMatchObject(
      aliasesSource ? { code: "WRITE_PARTIAL", details: { state: "needs_attention" } } : { code: "NAME_CONFLICT" },
    );
    expect(read(root, destination)).toBe("rival");
    const original = aliasesSource ? log.load("late-collision")?.steps[0]?.renameStage : "a.md";
    expect(original && read(root, original)).toBe("A-old");
  });

  test("大小写改名在第一跳后检测到目标冲突时恢复原路径", async () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const exists = files.exists.bind(files);
    vi.spyOn(files, "exists").mockImplementation((rel) => {
      if (rel !== "A.md") return exists(rel);
      expect(readdirSync(root)).not.toContain("a.md");
      expect(readdirSync(root)).toEqual(expect.arrayContaining([expect.stringMatching(/^\.huhu-case-/)]));
      return true;
    });
    await expect(log.run("case-fails", "rename-case", [{ action: "rename", from: "a.md", path: "A.md", caseOnly: true }])).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    expect(readdirSync(root).sort()).toEqual(["a.md", "b.md", "c.md", "e.md"]);
    expect(read(root, "a.md")).toBe("A-old");
    expect(log.load("case-fails")?.state).toBe("rolled_back");
  });

  test("大小写不敏感的目标冲突保留第三方文件及暂存原件", async () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const absolute = files.abs.bind(files);
    const exists = files.exists.bind(files);
    let aliased = false;
    vi.spyOn(files, "abs").mockImplementation((rel) => absolute(aliased && rel === "a.md" ? "A.md" : rel));
    const exactName = vi.spyOn(log as unknown as { hasExactName(rel: string): boolean }, "hasExactName");
    exactName.mockImplementation((rel) => readdirSync(root).includes(rel));
    vi.spyOn(files, "exists").mockImplementation((rel) => {
      if (rel !== "A.md") return exists(rel);
      writeFileSync(path.join(root, rel), "competing file");
      aliased = true;
      return true;
    });
    await expect(log.run("case-alias", "rename-case", [{ action: "rename", from: "a.md", path: "A.md", caseOnly: true }])).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "needs_attention" } });
    expect(read(root, "A.md")).toBe("competing file");
    const stage = log.load("case-alias")?.steps[0]?.renameStage;
    expect(stage && read(root, stage)).toBe("A-old");
  });

  test("新文件已提交到目标而后续步骤失败，只移除本操作创建的文件", async () => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    await expect(
      log.run("copy-rollback", "t", [
        { action: "write", path: "copy.md", bytes: Buffer.from("A-old"), expectedVersion: null },
        { action: "rename", from: "c.md", path: "e.md" },
      ]),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL" });
    expect(read(root, "a.md")).toBe("A-old");
    expect(read(root, "copy.md")).toBeNull();
    expect(readdirSync(root).sort()).toEqual(["a.md", "b.md", "c.md", "e.md"]);
  });
  for (const crashAfter of [0, 1, 2, 3]) {
    test(`在第 ${crashAfter} 步后崩溃 → 重启恢复到操作前状态`, () => {
      const { root, ops } = init();
      const script = path.resolve(import.meta.dirname, "fixtures/crash-op.mjs");
      const r = spawnSync(process.execPath, [tsxCli, script, root, ops, String(crashAfter)], { encoding: "utf8" });
      expect(r.status, r.stderr).toBe(7);
      const log = new OperationLog(new VaultFiles(root), ops);
      expect(log.load("op1")?.state).toBe("prepared");
      const [res] = log.recover();
      expect(res?.state).toBe("rolled_back");
      expect(read(root, "a.md")).toBe("A-old");
      expect(read(root, "b.md")).toBe("B-old");
      expect(read(root, "c.md")).toBe("C-old");
      expect(read(root, "d.md")).toBeNull();
      expect(read(root, "e.md")).toBe("E-old");
    });
  }
  test("执行期间第三方改动目标 → VERSION_CONFLICT 回滚，不覆盖", async () => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    await expect(
      log.run(
        "race1",
        "t",
        [
          { action: "write", path: "e.md", bytes: Buffer.from("E2") },
          { action: "write", path: "a.md", bytes: Buffer.from("A2") },
        ],
        {
          afterStep: (i) => {
            if (i === 0) writeFileSync(path.join(root, "a.md"), "THIRD");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL" });
    expect(read(root, "a.md")).toBe("THIRD");
    expect(read(root, "e.md")).toBe("E-old");
  });
  test("rename 后第三方在源路径新建文件 → needs_attention", async () => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    await expect(
      log.run(
        "race2",
        "t",
        [
          { action: "rename", from: "c.md", path: "d.md" },
          { action: "write", path: "a.md", bytes: Buffer.from("A2") },
        ],
        {
          afterStep: (i) => {
            if (i === 0) writeFileSync(path.join(root, "c.md"), "THIRD");
            if (i === 0) writeFileSync(path.join(root, "a.md"), "X");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL" });
    expect(log.load("race2")?.state).toBe("needs_attention");
    expect(read(root, "c.md")).toBe("THIRD");
    expect(read(root, "d.md")).toBe("C-old");
  });
  test("第三方在崩溃后改动文件 → needs_attention，不覆盖", () => {
    const { root, ops } = init();
    const script = path.resolve(import.meta.dirname, "fixtures/crash-op.mjs");
    spawnSync(process.execPath, [tsxCli, script, root, ops, "0"]);
    writeFileSync(path.join(root, "a.md"), "第三方修改");
    const [res] = new OperationLog(new VaultFiles(root), ops).recover();
    expect(res?.state).toBe("needs_attention");
    expect(res?.attention).toContain("a.md");
    expect(read(root, "a.md")).toBe("第三方修改");
  });

  test.each(["write", "delete"] as const)("未受理的 %s 遇第三方同文或删除，只回滚本操作的前一步", async (action) => {
    const { root, ops } = init();
    const log = new OperationLog(new VaultFiles(root), ops);
    const next = Buffer.from("same intended bytes");
    await expect(
      log.run(
        "unaccepted",
        "test",
        [{ action: "write", path: "a.md", bytes: Buffer.from("own bytes") }, action === "write" ? { action, path: "b.md", bytes: next } : { action, path: "b.md" }],
        {
          afterStep: () => {
            if (action === "write") writeFileSync(path.join(root, "b.md"), next);
            else rmSync(path.join(root, "b.md"));
            throw new Error("stop before second step");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
    expect(read(root, "a.md")).toBe("A-old");
    expect(read(root, "b.md")).toBe(action === "write" ? next.toString() : null);
    expect(log.load("unaccepted")?.steps[1]).toMatchObject({ phase: "prepared", done: false });
  });

  test.each([0, 1, 2])("步骤 %i 发布后确认前进程退出，按原条目身份恢复", (crashAfter) => {
    const { root, ops } = init();
    const script = path.resolve(import.meta.dirname, "fixtures/crash-op.mjs");
    const child = spawnSync(process.execPath, [tsxCli, script, root, ops, String(crashAfter), "afterPublish"], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(7);
    const reopened = new OperationLog(new VaultFiles(root), ops);
    expect(reopened.load("op1")?.steps[crashAfter]).toMatchObject({ phase: "accepted", done: false });
    expect(reopened.recover()).toMatchObject([{ state: "rolled_back" }]);
    expect(new OperationLog(new VaultFiles(root), ops).recover()).toEqual([]);
    expect(read(root, "a.md")).toBe("A-old");
    expect(read(root, "b.md")).toBe("B-old");
    expect(read(root, "c.md")).toBe("C-old");
    expect(read(root, "d.md")).toBeNull();
    expect(readdirSync(root).sort()).toEqual(["a.md", "b.md", "c.md", "e.md"]);
  });

  test.each(["same bytes", "removed"] as const)("同名替换结果被外部修改（%s）后保留现场与原条目", (change) => {
    const { root, ops } = init();
    const script = path.resolve(import.meta.dirname, "fixtures/crash-op.mjs");
    const child = spawnSync(process.execPath, [tsxCli, script, root, ops, "0", "afterPublish"], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(7);
    fs.renameSync(path.join(root, "a.md"), path.join(root, "retained-by-external.md"));
    if (change === "same bytes") writeFileSync(path.join(root, "a.md"), "A-new");
    const reopened = new OperationLog(new VaultFiles(root), ops);
    const retained = reopened.load("op1")?.steps[0]?.retained;
    expect(retained).toBeDefined();
    expect(reopened.recover()).toMatchObject([{ state: "needs_attention", attention: ["a.md"] }]);
    expect(new OperationLog(new VaultFiles(root), ops).recover()).toEqual([]);
    expect(read(root, "a.md")).toBe(change === "same bytes" ? "A-new" : null);
    expect(read(root, `${retained!.dir}/original`)).toBe("A-old");
  });

  test("已删除的路径被占用时保留新条目与原文件，重复启动和重交不动两者", async () => {
    const { root, ops } = init();
    const script = path.resolve(import.meta.dirname, "fixtures/crash-op.mjs");
    const child = spawnSync(process.execPath, [tsxCli, script, root, ops, "1", "afterPublish"], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(7);
    writeFileSync(path.join(root, "b.md"), "replacement");
    const log = new OperationLog(new VaultFiles(root), ops);
    const retained = log.load("op1")?.steps[1]?.retained;
    expect(retained).toBeDefined();
    expect(log.recover()).toMatchObject([{ state: "needs_attention", attention: ["b.md"] }]);
    expect(log.recover()).toEqual([]);
    await expect(log.run("op1", "test", [{ action: "delete", path: "b.md" }])).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { opId: "op1", state: "needs_attention" } });
    expect(read(root, "b.md")).toBe("replacement");
    expect(read(root, `${retained!.dir}/original`)).toBe("B-old");
    expect(read(root, "a.md")).toBe("A-old");
  });

  test("回滚同路径多次修改时逐步核对并还原原条目", async () => {
    const { root, ops } = init();
    const files = new VaultFiles(root);
    const log = new OperationLog(files, ops);
    const original = fs.statSync(path.join(root, "a.md")).ino;
    await expect(
      log.run(
        "repeat-rollback",
        "test",
        [
          { action: "write", path: "a.md", bytes: Buffer.from("middle") },
          { action: "write", path: "a.md", bytes: Buffer.from("last") },
        ],
        {
          afterPublish: (i) => {
            if (i === 1) throw new Error("stop");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
    expect(read(root, "a.md")).toBe("A-old");
    expect(fs.statSync(path.join(root, "a.md")).ino).toBe(original);
    expect(readdirSync(root).sort()).toEqual(["a.md", "b.md", "c.md", "e.md"]);
  });

  test("旧日志即使有相同内容的备份也不认领缺失文件", () => {
    const { root, ops } = init();
    mkdirSync(path.join(ops, "backups/legacy"), { recursive: true });
    writeFileSync(path.join(ops, "backups/legacy/0"), "A-old");
    rmSync(path.join(root, "a.md"));
    writeFileSync(
      path.join(ops, "legacy.json"),
      JSON.stringify({
        opId: "legacy",
        kind: "test",
        state: "prepared",
        createdAt: new Date().toISOString(),
        steps: [{ action: "delete", path: "a.md", beforeVersion: versionOf(Buffer.from("A-old")), afterVersion: null, done: true }],
      }),
    );
    const log = new OperationLog(new VaultFiles(root), ops);
    expect(log.recover()).toMatchObject([{ state: "needs_attention", attention: ["a.md"] }]);
    expect(read(root, "a.md")).toBeNull();
    expect(read(ops, "backups/legacy/0")).toBe("A-old");
  });

  test("事务移动带暂存文件的目录后，从实际落点清理本操作的暂存", async () => {
    const { root, ops } = init();
    mkdirSync(path.join(root, "old"));
    writeFileSync(path.join(root, "old/note.md"), "original");
    const log = new OperationLog(new VaultFiles(root), ops);
    await expect(
      log.run("move-during-op", "test", [
        { action: "write", path: "old/note.md", bytes: Buffer.from("updated") },
        { action: "rename", from: "old", path: "new" },
      ]),
    ).resolves.toMatchObject({ state: "committed" });
    expect(readdirSync(path.join(root, "new"))).toEqual(["note.md"]);
    expect(read(root, "new/note.md")).toBe("updated");
  });
});
