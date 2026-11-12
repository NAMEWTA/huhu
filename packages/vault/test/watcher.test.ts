import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ReceiptLog, VaultFiles, VaultWatcher, type FileChange } from "../src/index.js";

const dirs: string[] = [];
const watchers: VaultWatcher[] = [];
afterEach(async () => {
  for (const w of watchers.splice(0)) await w.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function setup(opts: { forcePolling?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-wt-"));
  dirs.push(root);
  const receipts = new ReceiptLog();
  const seen: FileChange[] = [];
  const degraded: string[] = [];
  const w = new VaultWatcher({ root, receipts, batchMs: 50, pollMs: 100000, ...opts, onChanges: (c) => seen.push(...c), onDegraded: (r) => degraded.push(r) });
  watchers.push(w);
  await w.start();
  return { root, receipts, seen, degraded, w };
}
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
}

describe("原生监听", () => {
  test("外部创建/修改/删除在 1 秒内反映", async () => {
    const { root, seen } = await setup();
    const t0 = Date.now();
    writeFileSync(path.join(root, "a.md"), "1");
    await until(() => seen.some((c) => c.path === "a.md" && c.change === "created"));
    expect(Date.now() - t0).toBeLessThan(1000);
    await new Promise((r) => setTimeout(r, 1100)); // 让 mtime 变化可辨
    writeFileSync(path.join(root, "a.md"), "22");
    await until(() => seen.some((c) => c.change === "modified"));
    expect(seen.some((c) => c.path === "a.md" && c.change === "modified")).toBe(true);
    rmSync(path.join(root, "a.md"));
    await until(() => seen.some((c) => c.change === "deleted"));
    expect(seen.some((c) => c.path === "a.md" && c.change === "deleted")).toBe(true);
  });
  test("外部重命名按 inode 配对为 renamed", async () => {
    const { root, seen } = await setup();
    writeFileSync(path.join(root, "old.md"), "hello");
    await until(() => seen.length > 0);
    seen.length = 0;
    renameSync(path.join(root, "old.md"), path.join(root, "new.md"));
    await until(() => seen.some((c) => c.change === "renamed"));
    expect(seen).toContainEqual({ path: "new.md", change: "renamed", from: "old.md" });
    expect(seen.some((c) => c.change === "created" || c.change === "deleted")).toBe(false);
  });
  test.skipIf(process.platform === "win32")("自写不回声", async () => {
    const { root, receipts, seen } = await setup();
    const files = new VaultFiles(root, receipts);
    await files.write("self.md", Buffer.from("mine"));
    writeFileSync(path.join(root, "other.md"), "theirs");
    await until(() => seen.some((c) => c.path === "other.md"));
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.map((c) => c.path)).toEqual(["other.md"]);
  });
  test("忽略 .huhu、.git 与 .DS_Store", async () => {
    const { root, seen } = await setup();
    mkdirSync(path.join(root, ".huhu"));
    mkdirSync(path.join(root, ".git"));
    writeFileSync(path.join(root, ".huhu/x.json"), "1");
    writeFileSync(path.join(root, ".git/y"), "1");
    writeFileSync(path.join(root, ".DS_Store"), "1");
    writeFileSync(path.join(root, "visible.md"), "1");
    await until(() => seen.some((c) => c.path === "visible.md"));
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.map((c) => c.path)).toEqual(["visible.md"]);
  });
});

describe("轮询回退", () => {
  test("强制轮询：通知 degraded，poll() 发现变化与重命名", async () => {
    const { root, seen, degraded, w } = await setup({ forcePolling: true });
    expect(w.mode).toBe("polling");
    expect(degraded).toHaveLength(1);
    writeFileSync(path.join(root, "p.md"), "x");
    w.poll();
    expect(seen).toContainEqual({ path: "p.md", change: "created" });
    seen.length = 0;
    renameSync(path.join(root, "p.md"), path.join(root, "q.md"));
    w.poll();
    expect(seen).toContainEqual({ path: "q.md", change: "renamed", from: "p.md" });
  });
});
