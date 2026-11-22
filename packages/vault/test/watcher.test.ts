import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import parcelWatcher from "@parcel/watcher";
import { afterEach, describe, expect, test, vi } from "vitest";
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
async function until(cond: () => boolean, ms = process.platform === "win32" ? 10_000 : 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
}

describe("目录变化（A05）", () => {
  test("目录删除事件补报该目录内仍在快照中的文件删除", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-wt-"));
    dirs.push(root);
    const folder = path.join(root, "记录");
    mkdirSync(folder);
    writeFileSync(path.join(folder, "index.md"), "正文");
    const received: FileChange[] = [];
    const dirChanges: string[] = [];
    const backend = vi.spyOn(parcelWatcher, "subscribe");
    backend.mockResolvedValueOnce({ unsubscribe: async () => {} });
    try {
      const w = new VaultWatcher({ root, receipts: new ReceiptLog(), batchMs: 5, onChanges: (changes) => received.push(...changes), onDirChanges: (paths) => dirChanges.push(...paths) });
      watchers.push(w);
      await w.start();
      const removed = realpathSync(folder);
      rmSync(folder, { recursive: true });
      backend.mock.calls[0]![1](null, [{ path: removed, type: "delete" }]);
      await until(() => dirChanges.includes("记录"));
      expect(dirChanges).toContain("记录");
      expect(received).toEqual([{ path: "记录/index.md", change: "deleted" }]);
    } finally {
      backend.mockRestore();
    }
  });
  test("外部创建 / 删除空目录触发 onDirChanges，且不产生文件事件", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-wt-"));
    dirs.push(root);
    const dirChanges: string[] = [];
    const files: FileChange[] = [];
    const w = new VaultWatcher({ root, receipts: new ReceiptLog(), batchMs: 50, pollMs: 100000, onChanges: (c) => files.push(...c), onDirChanges: (p) => dirChanges.push(...p) });
    watchers.push(w);
    await w.start();
    mkdirSync(path.join(root, "新目录"));
    await until(() => dirChanges.includes("新目录"));
    expect(dirChanges).toContain("新目录");
    rmSync(path.join(root, "新目录"), { recursive: true });
    await until(() => dirChanges.filter((p) => p === "新目录").length >= 2);
    expect(dirChanges.filter((p) => p === "新目录").length).toBeGreaterThanOrEqual(2);
    expect(files).toEqual([]);
  }, 30_000);
});

describe("原生监听", () => {
  test("暂扣创建后轮询发现改名时，只用仍存在的新名配对删除记录", async () => {
    const backend = vi.spyOn(parcelWatcher, "subscribe").mockResolvedValue({ unsubscribe: async () => {} });
    vi.useFakeTimers();
    try {
      const { root, seen, w } = await setup();
      const original = path.join(root, "readme.md");
      writeFileSync(original, "正文");
      backend.mock.calls[0]![1](null, [{ path: realpathSync(original), type: "create" }]);
      await vi.advanceTimersByTimeAsync(50);
      expect(seen).toEqual([]);
      renameSync(original, path.join(root, "README.md"));
      w.poll();
      expect(seen).toEqual([{ path: "README.md", change: "renamed", from: "readme.md" }]);
      await vi.advanceTimersByTimeAsync(100);
      w.poll();
      expect(seen).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      backend.mockRestore();
    }
  });

  test.skipIf(process.platform !== "linux")("移入完整目录后继续监听所有子目录里的文件", async () => {
    const { root, seen } = await setup();
    const staging = mkdtempSync(path.join(tmpdir(), "huhu-wt-stage-"));
    dirs.push(staging);
    mkdirSync(path.join(staging, "类型", "档案"), { recursive: true });
    writeFileSync(path.join(staging, "类型", "档案", "index.md"), "原题");
    renameSync(staging, path.join(root, "Archives"));
    const entry = "Archives/类型/档案/index.md";
    await until(() => seen.some((change) => change.path === entry));
    expect(seen).toContainEqual({ path: entry, change: "created" });
    writeFileSync(path.join(root, entry), "外部改写的新正文");
    await until(() => seen.some((change) => change.path === entry && change.change === "modified"));
    expect(seen).toContainEqual({ path: entry, change: "modified" });
  });

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
  }, 30_000);
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
