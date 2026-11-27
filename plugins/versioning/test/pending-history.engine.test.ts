import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "@huhu/vault";
import { expect, test } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { FileHistory } from "../src/engine/history.js";
import { PendingHistory } from "../src/engine/pending-history.js";

async function call(engine: RunningEngine, capability: string, input: unknown) {
  const result = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  expect(result).toMatchObject({ ok: true });
}

async function versions(history: FileHistory, rel: string) {
  return Promise.all((await history.timeline(rel)).map(async (entry) => ({ source: entry.source, text: await history.read(entry) })));
}

test("保存后立即退出或停用 Versioning，末次已保存版本各记录一次", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-history-close-"));
  const rel = "末次版本.md";
  const files = new VaultFiles(root);
  const history = new FileHistory(files);
  let engine: RunningEngine | undefined;
  try {
    writeFileSync(path.join(root, rel), "启动时的正文");
    engine = await boot({ vaultPath: root, create: true });
    await call(engine, "notes.save", { path: rel, text: "退出时的正文", expectedVersion: files.read(rel)!.version });
    await engine.shutdown();
    expect(await versions(history, rel)).toEqual([{ source: "edit", text: "退出时的正文" }]);
    engine = await boot({ vaultPath: root });
    await call(engine, "notes.save", { path: rel, text: "停用时的正文", expectedVersion: files.read(rel)!.version });
    await call(engine, "plugins.setEnabled", { id: "versioning", enabled: false });
    await engine.shutdown();
    expect(await versions(history, rel)).toEqual([
      { source: "edit", text: "停用时的正文" },
      { source: "edit", text: "退出时的正文" },
    ]);
  } finally {
    await engine?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Git 引用锁保留原字节，重开恢复；提交后未清理回执也不会重复记账", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-history-journal-"));
  const rel = "n.md";
  const file = path.join(root, rel);
  const state = path.join(root, ".huhu");
  const files = new VaultFiles(root);
  const history = new FileHistory(files);
  const observed: string[] = [];
  const open = (h = new FileHistory(files)) => new PendingHistory(files, state, h, 60_000, (_id, message) => observed.push(message));
  try {
    writeFileSync(file, "原版");
    await history.record(rel, "edit");
    const repo = path.join(state, "history", "git");
    const ref = readFileSync(path.join(repo, "HEAD"), "utf8").trim().slice("ref: ".length);
    const lock = path.join(repo, `${ref}.lock`);
    writeFileSync(lock, "", { flag: "wx" });

    const first = open();
    writeFileSync(file, "已保存修订");
    first.observe(rel, "edit", Buffer.from("已保存修订"));
    writeFileSync(file, "外部编辑");
    first.observe(rel, "external");
    await first.close();
    expect(observed).toEqual(["文件历史待重试：n.md"]);
    expect(await versions(history, rel)).toEqual([{ source: "edit", text: "原版" }]);
    const directory = path.join(state, "history", "pending");
    const pending = path.join(directory, readdirSync(directory)[0]!);
    const beforeCommit = readFileSync(pending);
    rmSync(lock);

    // Recovery must use the frozen bytes even after a further unobserved overwrite.
    writeFileSync(file, "进程停止期间的改写");
    await open().close();
    expect(await versions(history, rel)).toEqual([
      { source: "external", text: "外部编辑" },
      { source: "edit", text: "已保存修订" },
      { source: "edit", text: "原版" },
    ]);

    // Recreate the durable state left by a crash between update-ref and journal removal.
    writeFileSync(pending, beforeCommit);
    await open().close();
    expect(await versions(history, rel)).toHaveLength(3);
    expect(readdirSync(directory)).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe("进程停止期间的改写");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
