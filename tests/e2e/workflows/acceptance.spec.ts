/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, root } from "../helpers/launch.js";

/** 验收补充：每条用真实桌面应用走一遍可观察行为（ACC-WB-05 / ACC-KN-09 / ACC-AG-11）。 */
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

test("ACC-WB-05 首页“我的任务”勾选：待推进任务数减少，任务进入已完成", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const t = await call("tasks.create", { title: "首页勾选", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    expect(t.ok).toBe(true);
    const open = page.getByTestId("card-open");
    await expect(open).toContainText("1");
    await page.getByTestId("card-tasks").getByRole("button", { name: "完成任务 首页勾选" }).click();
    await expect(open).toContainText("0");
    await expect(page.getByTestId("card-tasks").getByText("首页勾选")).toHaveCount(0);
    const list = await call("tasks.list", { category: "ended" });
    expect((list.data as { title: string }[]).map((x) => x.title)).toContain("首页勾选");
  } finally {
    await close();
  }
});

test("ACC-KN-09 阅读模式：<script> 与 javascript: 链接不会执行，也不会成为可点击链接", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.writeFileSync(`${vault}/危险.md`, '# 危险\n\n<script>window.__pwned = 1</script>\n\n[点我](javascript:window.__pwned=2)\n\n<img src=x onerror="window.__pwned=3">\n');
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("note-item").filter({ hasText: "危险" }).click();
    await page.getByRole("tab", { name: "阅读" }).click();
    const pane = page.locator(".knowledge-reading-pane");
    await expect(pane).toContainText("危险");
    expect(await pane.locator("script").count()).toBe(0);
    expect(await pane.locator('a[href^="javascript:" i]').count()).toBe(0);
    expect(await pane.locator("[onerror]").count()).toBe(0);
    await pane
      .getByText("点我")
      .click({ trial: false })
      .catch(() => undefined);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  } finally {
    await close();
  }
});

test("ACC-AG-11 本机没有任何受支持 CLI：“+”只提供“新终端”，并提示未检测到", async () => {
  const { page, close } = await openApp({ PATH: "/nonexistent-huhu-bin" });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByRole("button", { name: "新终端" }).first().click();
    const menu = page.getByRole("menu", { name: "新终端" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(1);
    await expect(menu).toContainText("新终端");
    await expect(page.getByText("此主机未检测到支持的 CLI")).toBeVisible();
  } finally {
    await close();
  }
});

test("ACC-SY-03 取消诊断：显示“已取消”，在途结果迟到也不会变成当前结果", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 让 health.run 的响应延迟，才能在它返回前点取消
    await page.evaluate(() => {
      const orig = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        const res = await orig(input, init);
        if (body.includes('"health.run"')) await new Promise((r) => setTimeout(r, 2500));
        return res;
      };
    });
    await page.getByRole("button", { name: "健康中心" }).first().click();
    await page.getByTestId("health-run").click();
    await expect(page.getByTestId("health-overall")).toHaveText("正在检查Vault…");
    await page.getByTestId("health-run").click(); // 取消
    await expect(page.getByTestId("health-overall")).toHaveText("已取消");
    await expect(page.getByTestId("health-check").first()).toHaveAttribute("data-status", "unchecked");
    await page.waitForTimeout(3200); // 在途响应此时已返回
    await expect(page.getByTestId("health-overall")).toHaveText("已取消");
    await expect(page.getByText("检查已取消，之前的结果不再有效。")).toBeVisible();
  } finally {
    await close();
  }
});

test("ACC-TK-11 看板：把卡片拖到“已完成”列等同于勾选完成（并可拖回重开）", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await call("tasks.create", { title: "拖拽任务", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-views").getByRole("tab", { name: "看板" }).click();
    await expect(page.getByTestId("board-open").getByTestId("board-card")).toHaveCount(1);
    await page.getByTestId("board-open").getByTestId("board-card").dragTo(page.getByTestId("board-done"));
    await expect(page.getByTestId("board-done").getByTestId("board-card")).toHaveCount(1, { timeout: 10_000 });
    const done = await call("tasks.list", { category: "ended" });
    expect((done.data as { title: string }[]).map((x) => x.title)).toContain("拖拽任务");
    // 回执前同一任务不会重复提交，所以等上一次提交结束后再拖回（失败则重试拖拽）
    await expect(async () => {
      await page.getByTestId("board-done").getByTestId("board-card").dragTo(page.getByTestId("board-open"));
      await expect(page.getByTestId("board-open").getByTestId("board-card")).toHaveCount(1, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  } finally {
    await close();
  }
});

test("ACC-TK-06 关联资料选择器：Enter 选中高亮的文件夹；输入的自由文字不会变成资源", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.mkdirSync(`${vault}/Research`);
    fs.writeFileSync(`${vault}/Research/资料.md`, "# 资料\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    const picker = page.getByTestId("resource-picker");
    await picker.getByRole("button", { name: "关联 Vault 文件或文件夹" }).click();
    const search = page.getByRole("combobox", { name: "搜索 Vault 资源" });
    await search.fill("不存在的路径xyz");
    await search.press("Enter");
    await expect(picker.locator(".vrp-chip")).toHaveCount(0);
    await search.fill("Research");
    await expect(page.getByRole("option").first()).toBeVisible();
    await search.press("Enter");
    await expect(picker.locator(".vrp-chip")).toHaveCount(1);
    await expect(picker.locator(".vrp-chip").first()).toContainText("Research");
  } finally {
    await close();
  }
});

test("ACC-WB-03 切换 Vault 时有未保存修改：选“保留草稿并切换”，B 中看不到 A 的数据，回到 A 提示恢复草稿且内容一致", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "huhu-wb03-"));
  const A = path.join(base, "甲库");
  const B = path.join(base, "乙库");
  mkdirSync(A);
  mkdirSync(B);
  const env = { ...process.env } as Record<string, string>;
  delete env["HUHU_VAULT"];
  const app: ElectronApplication = await electron.launch({ args: [root, "--no-sandbox"], env });
  const pick = (...paths: string[]) =>
    app.evaluate(({ dialog }, queue) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [queue.shift() ?? ""] })) as typeof dialog.showOpenDialog;
    }, paths);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await pick(A);
    await page.getByTestId("vault-new").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    // 手动保存模式，才会有“未保存的修改”
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click();
    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByRole("button", { name: "新建笔记" }).first().click();
    await page.getByTestId("new-note-dialog").getByLabel("文件名").fill("草稿甲");
    await page.getByTestId("new-note-submit").click();
    await page.getByTestId("markdown-editor").locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nA库未保存的内容");
    await expect(page.getByTestId("save-state")).toHaveText("未保存修改");

    await page.getByRole("button", { name: "切换 Vault" }).click(); // 标题栏的 Vault 切换器；笔记仍在编辑中
    await expect(page.getByTestId("svault-dirty-list")).toContainText("草稿甲");
    await page.getByTestId("svault-switch-draft").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    expect(readFileSync(path.join(A, "草稿甲.md"), "utf8")).not.toContain("A库未保存的内容"); // 文件没被改

    // B：看不到 A 的任何数据
    await pick(B);
    await page.getByTestId("vault-new").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("note-item")).toHaveCount(0);
    await expect(page.getByText("草稿甲")).toHaveCount(0);

    // 回到 A：笔记提示恢复草稿，内容与切换前一致
    await page.getByRole("button", { name: "切换 Vault" }).click();
    await page.getByTestId("svault-switch-confirm").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("vault-recent").filter({ hasText: "甲库" }).click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByTestId("note-item").filter({ hasText: "草稿甲" }).click();
    await expect(page.getByTestId("note-draft-restore")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("note-draft-restore").click();
    await expect(page.getByTestId("markdown-editor")).toContainText("A库未保存的内容");
    expect(existsSync(path.join(B, "草稿甲.md"))).toBe(false);
  } finally {
    await app.close();
    rmSync(base, { recursive: true, force: true });
  }
});

test("ACC-AG-05 切换 Space：右侧历史只显示当前 Space 目录的会话，搜索框被清空", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "huhu-ag05-"));
  const dirA = path.join(base, "项目甲");
  const dirB = path.join(base, "项目乙");
  const claude = path.join(base, "claude-config");
  mkdirSync(dirA);
  mkdirSync(dirB);
  const enc = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");
  const row = (cwd: string, text: string, id: string) => JSON.stringify({ type: "user", cwd, sessionId: id, isMeta: false, message: { role: "user", content: text } }) + "\n";
  for (const [dir, id, text] of [
    [dirA, "sess-a", "甲目录里的提问"],
    [dirB, "sess-b", "乙目录里的提问"],
  ] as const) {
    const d = path.join(claude, "projects", enc(realpathSync(dir)));
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, `${id}.jsonl`), row(realpathSync(dir), text, id));
  }
  const { page, close } = await openApp({ CLAUDE_CONFIG_DIR: claude });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    for (const [name, dir] of [
      ["空间甲", dirA],
      ["空间乙", dirB],
    ] as const) {
      await page.getByTestId("space-new").click();
      await page.getByLabel("Space 名称").fill(name);
      await page.getByLabel("工作目录").fill(dir);
      await page.getByTestId("space-save").click();
      await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    }
    const items = page.getByTestId("history-item");
    // 当前是刚建好的“空间乙”
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("乙目录里的提问");
    await page.getByLabel("搜索当前 Space 历史").fill("乙目录");
    await page.getByRole("button", { name: /空间甲/ }).click();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("甲目录里的提问");
    await expect(page.getByLabel("搜索当前 Space 历史")).toHaveValue("");
  } finally {
    await close();
    rmSync(base, { recursive: true, force: true });
  }
});

async function launchBare(): Promise<{ app: ElectronApplication; pick(...paths: string[]): Promise<void> }> {
  const env = { ...process.env } as Record<string, string>;
  delete env["HUHU_VAULT"];
  const app = await electron.launch({ args: [root, "--no-sandbox"], env });
  return {
    app,
    pick: (...paths: string[]) =>
      app.evaluate(({ dialog }, queue) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [queue.shift() ?? ""] })) as typeof dialog.showOpenDialog;
      }, paths),
  };
}

test("ACC-WB-01 打开含 3 篇 Markdown 的普通文件夹：新增 .huhu/vault.json 与 Agent 指南三份文件，3 篇笔记字节与 mtime 不变", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-wb01-"));
  const names = ["一.md", "二.md", "三.md"];
  const raw = new Map<string, Buffer>();
  const mtimes = new Map<string, number>();
  for (const n of names) {
    const b = Buffer.from(`\uFEFF# ${n}\r\n\r\n正文 ${n}\r\n`, "utf8");
    writeFileSync(path.join(dir, n), b);
    raw.set(n, b);
    mtimes.set(n, statSync(path.join(dir, n)).mtimeMs);
  }
  const { app, pick } = await launchBare();
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await pick(dir);
    await page.getByTestId("vault-open").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("note-item")).toHaveCount(3);
    expect(existsSync(path.join(dir, ".huhu/vault.json"))).toBe(true);
    await expect.poll(() => (existsSync(path.join(dir, ".agents/skills/huhu")) ? readdirSync(path.join(dir, ".agents/skills/huhu"), { recursive: true }).filter((f) => String(f).endsWith(".md")).length : 0)).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(1500);
    for (const n of names) {
      expect(readFileSync(path.join(dir, n)).equals(raw.get(n)!)).toBe(true);
      expect(statSync(path.join(dir, n)).mtimeMs).toBe(mtimes.get(n));
    }
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("目录无写权限：打开时给出“无法写入”提示且不创建任何文件（ACC-WB-02 的前半；“只读浏览”见 progress.md 缺口）", async () => {
  test.skip(process.platform === "win32" || process.getuid?.() === 0, "需要非 root 的 POSIX 权限");
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-wb02-"));
  writeFileSync(path.join(dir, "只读笔记.md"), "# 只读笔记\n\n内容\n");
  chmodSync(dir, 0o555);
  const { app, pick } = await launchBare();
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await pick(dir);
    await page.getByTestId("vault-open").click();
    await expect(page.getByTestId("vault-error")).toContainText("无法写入");
    expect(readdirSync(dir)).toEqual(["只读笔记.md"]); // 没有 .huhu、没有新文件
  } finally {
    await app.close();
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});
