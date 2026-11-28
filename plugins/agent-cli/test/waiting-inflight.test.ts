import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const pending: { resolve(sub: unknown): void }[] = [];
const closed: number[] = [];
vi.mock("@huhu/herdr-client", () => ({
  subscribeEvents: vi.fn(() => new Promise((resolve) => pending.push({ resolve }))),
}));

const { WaitingWatcher } = await import("../src/engine/waiting.js");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  pending.splice(0);
  closed.splice(0);
});

test.skipIf(process.platform === "win32")("订阅仍在建立时 poke 不再开第二条订阅，stop 关闭唯一的订阅", async () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-wt-"));
  dirs.push(d);
  const endpoint = path.join(d, "core.sock");
  writeFileSync(endpoint, "");
  const sessions = { list: () => [], reconcile: async () => undefined };
  const w = new WaitingWatcher({ endpoint, vaultId: "vault-x", sessions: sessions as never, onBlocked: async () => undefined, backoffMs: { min: 10, max: 20 } });
  w.start();
  w.poke(); // 打开终端时由调用方触发，此时第一条订阅还在连接
  expect(pending).toHaveLength(1);
  pending[0]!.resolve({ snapshot: { seq: 0, terminals: [] }, close: () => closed.push(0) });
  await new Promise((r) => setTimeout(r, 0));
  w.poke();
  expect(pending).toHaveLength(1);
  w.stop();
  expect(closed).toEqual([0]);
});
