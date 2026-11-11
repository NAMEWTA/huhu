import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { OperationLog, ReceiptLog, VaultFiles, versionOf } from "../src/index.js";

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
