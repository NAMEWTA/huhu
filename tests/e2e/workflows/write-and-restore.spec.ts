/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "../helpers/launch.js";

/** 工作流 W-B：写笔记 → 批注 → 外部入口（CLI 令牌）捕获 → 命名版本 → 改动后恢复上一版 → 重开应用结果一致。 */
type Call = (capability: string, input?: unknown) => Promise<{ ok: boolean; data?: any; error?: { code: string } }>;

async function caller(page: Page): Promise<Call> {
  const ep = await page.evaluate(() => window.huhuHost.engine());
  return (capability, input = {}) =>
    page.evaluate(
      async ([e, cap, inp]) => {
        const r = await fetch(`${e.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability: cap, input: inp, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        return r.json();
      },
      [ep, capability, input] as const,
    );
}

test("写作与恢复：批注、版本、恢复，重开后一致", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-wf-"));
  const launch = () => electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
  let app: ElectronApplication = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    let call = await caller(page);

    // 写笔记（v1）
    const created = await call("notes.create", { name: "周报" });
    const note = created.data.path as string;
    const v0 = await call("notes.read", { path: note });
    const text1 = `${v0.data.text}\n这周完成了发布准备。\n`;
    const saved1 = await call("notes.save", { path: note, text: text1, expectedVersion: v0.data.version });
    expect(saved1.ok).toBe(true);

    // 批注锚定在“发布准备”
    const start = text1.indexOf("发布准备");
    const c = await call("comments.create", { path: note, target: "body", start, end: start + 4, text: "补充发布清单" });
    expect(c.ok).toBe(true);

    // 外部入口（CLI 令牌）捕获一条想法，来源为 cli
    const runtime = path.join(vault, ".huhu/runtime");
    const desc = JSON.parse(readFileSync(path.join(runtime, readdirSync(runtime)[0] as string, "engine.json"), "utf8")) as { cliToken: string; port: number };
    const cap = await fetch(`http://127.0.0.1:${desc.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${desc.cliToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "inbox.capture", input: { body: "外部捕获的想法" }, requestId: "r1", idempotencyKey: "key-wf-capture-1" }),
    }).then((r) => r.json() as Promise<{ ok: boolean; data: { source: string } }>);
    expect(cap.data.source).toBe("cli");

    // 命名版本 → 继续修改 → 恢复到命名版本
    expect((await call("history.checkpoint", { path: note, title: "周报初稿" })).ok).toBe(true);
    const cur = await call("notes.read", { path: note });
    const text2 = `${text1}\n之后又写了一段，需要撤回。\n`;
    await call("notes.save", { path: note, text: text2, expectedVersion: cur.data.version });
    const timeline = await call("history.timeline", { path: note });
    const named = (timeline.data as { id: string; title?: string }[]).find((e) => e.title === "周报初稿");
    expect(named).toBeTruthy();
    const now = await call("notes.read", { path: note });
    const restored = await call("history.restore", { path: note, entryId: named!.id, expectedCurrentVersion: now.data.version });
    expect(restored.ok).toBe(true);
    expect(readFileSync(path.join(vault, note), "utf8")).toBe(text1);

    // 重开应用：笔记、批注、捕获都在，批注仍锚定
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    call = await caller(page);
    expect((await call("notes.read", { path: note })).data.text).toBe(text1);
    const comments = await call("comments.list", { path: note });
    expect(comments.data).toHaveLength(1);
    expect(comments.data[0]).toMatchObject({ state: "anchored", resolved: false });
    expect(comments.data[0].anchor.exact).toBe("发布准备");
    expect(((await call("inbox.list", {})).data as unknown[]).length).toBe(1);
    expect(existsSync(path.join(vault, "Comments"))).toBe(true);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
