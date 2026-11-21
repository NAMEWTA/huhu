import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { OperationLog, ReceiptLog, VaultFiles, versionOf } from "../src/index.js";
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
      await vi.waitFor(() => expect(readdirSync(root).filter((name) => name.startsWith(".huhu-create-"))).toEqual([]), { timeout: 3000 });
      expect(receipts.isTemporaryFile(left[0]!)).toBe(false);
    } finally {
      rmAsync.mockImplementation(realRm);
      rmSyncMock.mockImplementation(realRmSync);
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
});
