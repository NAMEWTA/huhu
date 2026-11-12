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
    await page.reload(); // 首页数据在挂载时取：重新载入后一定包含刚创建的任务（CI 上事件刷新的时机不稳）
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
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
    await expect.poll(async () => ((await call("tasks.list", { category: "ended" })).data as { title: string }[]).map((x) => x.title)).toContain("拖拽任务");
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

test("ACC-WB-02 目录无写权限：提示“无法写入”并可“以只读方式打开”；打开后可浏览，写操作被拒绝，磁盘无变化", async () => {
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
    await page.getByTestId("vault-readonly").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("note-item").filter({ hasText: "只读笔记" })).toBeVisible();
    const call = await caller(page);
    const created = await call("notes.create", { name: "新笔记" });
    expect(created.ok).toBe(false);
    expect(created.error?.code).toBe("READ_ONLY_VAULT");
    expect(readdirSync(dir)).toEqual(["只读笔记.md"]); // 没有 .huhu、没有新文件
  } finally {
    await app.close();
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Agent CLI 历史固定：固定后置顶、重新进入后仍在；取消固定恢复时间顺序（落盘 agent-cli/pins.json）", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "huhu-pin-"));
  const dir = path.join(base, "项目");
  const claude = path.join(base, "claude-config");
  mkdirSync(dir);
  const real = realpathSync(dir);
  const enc = real.replace(/[^a-zA-Z0-9]/g, "-");
  const proj = path.join(claude, "projects", enc);
  mkdirSync(proj, { recursive: true });
  const row = (text: string, id: string) => JSON.stringify({ type: "user", cwd: real, sessionId: id, isMeta: false, message: { role: "user", content: text } }) + "\n";
  const { utimesSync } = await import("node:fs");
  for (const [id, text, at] of [
    ["old", "较旧的提问", new Date("2026-11-01T00:00:00Z")],
    ["new", "较新的提问", new Date("2026-11-05T00:00:00Z")],
  ] as const) {
    writeFileSync(path.join(proj, `${id}.jsonl`), row(text, id));
    utimesSync(path.join(proj, `${id}.jsonl`), at, at);
  }
  const { page, vault, close } = await openApp({ CLAUDE_CONFIG_DIR: claude });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByTestId("space-new").click();
    await page.getByLabel("Space 名称").fill("项目");
    await page.getByLabel("工作目录").fill(dir);
    await page.getByTestId("space-save").click();
    const titles = page.getByTestId("history-title");
    await expect(titles).toHaveText(["较新的提问", "较旧的提问"]);
    await page.getByRole("button", { name: "固定 较旧的提问" }).click();
    await expect(titles).toHaveText(["较旧的提问", "较新的提问"]); // 固定项置顶
    expect(readFileSync(path.join(vault, ".huhu/agent-cli/pins.json"), "utf8")).toContain("claude:old");
    await page.getByRole("button", { name: "取消固定 较旧的提问" }).click();
    await expect(titles).toHaveText(["较新的提问", "较旧的提问"]);
  } finally {
    await close();
    rmSync(base, { recursive: true, force: true });
  }
});

test("ACC-SH-04 远程连接：编辑主机、从已有主机里按顺序选跳板；跳板链不能形成循环", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const mk = (name: string, host: string) => call("ssh.hosts.save", { name, host, port: 22, user: "ops", auth: { kind: "agent" }, jumpHostIds: [] });
    const a = await mk("跳板甲", "a.example.internal");
    const b = await mk("目标乙", "b.example.internal");
    expect(a.ok && b.ok).toBe(true);
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page
      .getByRole("button", { name: /目标乙/ })
      .first()
      .click();

    // 编辑：改地址并选甲作为跳板
    await page.getByTestId("ssh-host-edit").click();
    const dialog = page.getByTestId("ssh-host-dialog");
    await expect(dialog.getByLabel("显示名称")).toHaveValue("目标乙");
    await dialog.getByLabel("主机名或 IP").fill("b2.example.internal");
    await dialog.getByLabel("添加跳板").selectOption({ label: "跳板甲（a.example.internal）" });
    await expect(dialog.getByTestId("ssh-jump-item")).toHaveCount(1);
    await dialog.getByTestId("ssh-host-save").click();
    await expect(page.getByTestId("ssh-route")).toContainText("跳板甲");
    await expect(page.getByTestId("ssh-route")).toContainText("b2.example.internal");

    // 反向再选乙作为甲的跳板：形成循环，被拒绝并提示
    await page
      .getByRole("button", { name: /跳板甲/ })
      .first()
      .click();
    await page.getByTestId("ssh-host-edit").click();
    await dialog.getByLabel("添加跳板").selectOption({ label: "目标乙（b2.example.internal）" });
    await dialog.getByTestId("ssh-host-save").click();
    await expect(dialog.getByRole("alert")).toContainText("跳板链不能形成循环");
    const list = (await call("ssh.hosts.list", {})).data as { name: string; jumpHostIds: string[] }[];
    expect(list.find((h) => h.name === "跳板甲")?.jumpHostIds).toEqual([]);
  } finally {
    await close();
  }
});

test("首页自定义：卡片可在同一列内上移 / 下移，顺序持久化并立即生效", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const order = () => page.locator(".home-main-column > section").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    await expect.poll(order).toEqual(["card-tasks", "card-recent", "card-activity"]);
    await page.getByTestId("home-customize").click();
    const panel = page.getByTestId("home-customize-panel");
    await panel.getByRole("button", { name: "下移 我的任务" }).click();
    await expect.poll(order).toEqual(["card-recent", "card-tasks", "card-activity"]);
    await panel.getByRole("button", { name: "上移 最近活动" }).click();
    await expect.poll(order).toEqual(["card-recent", "card-activity", "card-tasks"]);
    await expect(panel.getByRole("button", { name: "上移 最近笔记" })).toBeDisabled(); // 已经是第一个
  } finally {
    await close();
  }
});

test("版本历史：对比基准“与当前内容 / 与前一版”切换，标签与 +n −m 随之变化", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const n = (await call("notes.create", { name: "基准笔记" })).data;
    let v = (await call("notes.read", { path: n.path })).data.version;
    v = (await call("notes.save", { path: n.path, text: "# 基准笔记\n\n一\n", expectedVersion: v })).data.version;
    await call("history.checkpoint", { path: n.path, title: "版本一" });
    v = (await call("notes.save", { path: n.path, text: "# 基准笔记\n\n一\n二\n三\n", expectedVersion: v })).data.version;
    await call("history.checkpoint", { path: n.path, title: "版本二" });
    await page.getByRole("button", { name: "版本历史" }).first().click();
    await expect(page.getByTestId("history-entry")).toHaveCount(2, { timeout: 10_000 });
    await page.getByTestId("history-entry").filter({ hasText: "版本二" }).click();
    // 与当前内容：所选就是当前，没有差异
    await expect(page.locator(".version-v9-diff-labels")).toContainText("当前有效内容");
    // 与前一版：版本二相对版本一新增两行
    await page.getByRole("tab", { name: "与前一版" }).click();
    await expect(page.locator(".version-v9-diff-labels")).toContainText("前一版本");
    await expect(page.getByTestId("history-stats")).toContainText("+2");
    // 最早的一版没有前一版：与空文件比
    await page.getByTestId("history-entry").filter({ hasText: "版本一" }).click();
    await expect(page.locator(".version-v9-diff-labels")).toContainText("没有更早的版本");
  } finally {
    await close();
  }
});

test("笔记拖放移动：把笔记拖到文件夹，文件移到该目录；拖到空白处回到 Vault 根", async () => {
  test.skip(process.platform !== "linux", "Playwright 在 Windows / macOS 的 Electron 上模拟原生拖放会卡住（拖看板卡片可以，拖树节点不行）；移动本身由 notes.move 的单元 / 引擎测试覆盖");
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    expect((await call("folders.create", { path: "归档" })).ok).toBe(true);
    expect((await call("notes.create", { name: "待移动" })).ok).toBe(true); // 经能力创建：不依赖文件监听的时机（Windows 上更慢）
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    const item = page.getByTestId("note-item").filter({ hasText: "待移动" });
    await expect(item).toBeVisible();
    await item.dragTo(page.getByTestId("folder-line").filter({ hasText: "归档" }));
    await expect.poll(() => fs.existsSync(`${vault}/归档/待移动.md`)).toBe(true);
    expect(fs.existsSync(`${vault}/待移动.md`)).toBe(false);
    // 展开文件夹，把笔记拖回根（树容器的空白处）
    await page.getByTestId("folder-line").filter({ hasText: "归档" }).getByRole("button").first().click();
    const moved = page.getByTestId("note-item").filter({ hasText: "待移动" });
    await expect(moved).toBeVisible();
    await moved.dragTo(page.locator(".knowledge-explorer-tree"), { targetPosition: { x: 20, y: 300 } });
    await expect.poll(() => fs.existsSync(`${vault}/待移动.md`)).toBe(true);
  } finally {
    await close();
  }
});

test("能力网关 MCP：配置传输（对话框）、复制客户端配置、管理所属插件", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByTestId("gateway-mcp-config").click();
    const dialog = page.getByTestId("gateway-mcp-dialog");
    await dialog.getByLabel("传输方式").selectOption("http");
    await expect(page.getByText("Streamable HTTP · 能力按模块授权")).toBeVisible();
    await dialog.getByRole("button", { name: "完成" }).click();
    await page.getByTestId("gateway-mcp-copy").click();
    await expect(page.getByRole("status").filter({ hasText: "客户端配置已复制" })).toBeVisible();
    await page.getByRole("button", { name: "管理所属插件" }).click();
    await expect(page.getByTestId("plugin-center")).toBeVisible();
  } finally {
    await close();
  }
});

test("工作流 W-A：收件箱想法 → 转为 Agent 任务 → 自动化立即运行（假 Codex）→ 任务详情显示结果，任务仍未完成，可勾选完成", async () => {
  test.skip(process.platform === "win32", "假 Codex 是 POSIX shell 脚本；Windows 需要 .cmd 假程序");
  const fs = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-wa-bin-"));
  writeFileSync(path.join(bin, "codex"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex 1.0.0"; exit 0; fi\necho "假 Codex 已整理完成"\n');
  fs.chmodSync(path.join(bin, "codex"), 0o755);
  const { page, vault, close } = await openApp({ PATH: `${bin}:${process.env["PATH"] ?? ""}` });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    // 1. 想法进入收件箱（外部入口同样走这条能力）
    expect((await call("inbox.capture", { title: "整理研究资料", body: "把本周的研究笔记整理成摘要" })).ok).toBe(true);
    const task = await (async () => {
      // 2. 转为任务：执行方式 Agent（Space 与 Codex）
      const spaces = (await call("agent.spaces.list", {})).data as { id: string }[];
      await expect.poll(async () => ((await call("agent.providers.detect", { refresh: true })).data as { provider: string; status: string }[]).find((x) => x.provider === "codex")?.status).toBe("found");
      const created = await call("tasks.create", { title: "整理研究资料", body: "把本周的研究笔记整理成摘要", execution: { kind: "agent", spaceId: spaces[0]!.id, provider: "codex" } });
      expect(created.ok, JSON.stringify(created.error ?? created)).toBe(true);
      const listed = ((await call("tasks.list", { category: "all" })).data as { title: string }[]).map((x) => x.title);
      expect(listed, "创建后任务列表里应有这条任务").toContain("整理研究资料");
      return created.data as { id: string };
    })();
    // 3. 自动化：内置规则立即运行
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").first().click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page
      .getByRole("button", { name: /激活记录/ })
      .first()
      .click();
    await expect(page.getByTestId("activation-row").first()).toBeVisible({ timeout: 30_000 }); // 激活记录出现
    // 4. 任务详情显示运行结果；任务仍未完成，用户阅读后自己勾选
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByRole("button", { name: "打开任务 整理研究资料" }).click(); // 点任务名按钮：点行的中心在不同窗口宽度下可能落在空白处
    try {
      await expect(page.getByTestId("task-runs")).toContainText("已完成", { timeout: 30_000 });
    } catch (e) {
      // 诊断（macOS CI）：运行记录到底有没有落盘、状态是什么
      const ls = (d: string) => (fs.existsSync(`${vault}/${d}`) ? fs.readdirSync(`${vault}/${d}`) : "（不存在）");
      console.log(
        "W-A 诊断：",
        JSON.stringify({
          taskRuns: ls("Task Runs"),
          automationRuns: ls("Automation Runs"),
          activations: (await call("automations.activations", {})).data,
          runs: (await call("tasks.runs", { id: task.id })).data,
          runsList: (await call("automations.runs.list", {})).data,
        }).slice(0, 1500),
      );
      throw e;
    }
    await page.getByTestId("task-runs").getByRole("button", { name: "展开结果" }).click();
    await expect(page.getByTestId("run-result")).toContainText("假 Codex 已整理完成");
    expect(((await call("tasks.read", { id: task.id })).data as { completed: boolean }).completed).toBe(false);
    await page.getByTestId("task-row").filter({ hasText: "整理研究资料" }).getByRole("checkbox").click();
    await expect.poll(async () => ((await call("tasks.read", { id: task.id })).data as { completed: boolean }).completed).toBe(true);
    expect(fs.readdirSync(`${vault}/Task Runs`).length).toBe(1);
  } finally {
    await close();
    rmSync(bin, { recursive: true, force: true });
  }
});

test("知识库资源栏顶部的 Vault 名称按钮：打开“切换 Vault”对话框（原型 title=切换 Vault）", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-vault-switch").click();
    await expect(page.getByTestId("svault-switch-dialog")).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByTestId("svault-switch-dialog")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("笔记拖放移动文件夹：拖到另一个文件夹下，其中的笔记随之移动；不能拖进自己的后代", async () => {
  test.skip(process.platform !== "linux", "同上：Windows / macOS 上的拖放模拟不稳定");
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    expect((await call("folders.create", { path: "甲" })).ok).toBe(true);
    expect((await call("folders.create", { path: "目标" })).ok).toBe(true);
    expect((await call("notes.create", { name: "里面的笔记", folder: "甲" })).ok).toBe(true);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    const lines = page.getByTestId("folder-line");
    await expect(lines.filter({ hasText: "甲" })).toBeVisible();
    await lines.filter({ hasText: "甲" }).dragTo(lines.filter({ hasText: "目标" }));
    await expect.poll(() => fs.existsSync(`${vault}/目标/甲/里面的笔记.md`)).toBe(true);
    expect(fs.existsSync(`${vault}/甲/里面的笔记.md`)).toBe(false);
    // 拖进自己的后代：被拒绝，磁盘不变
    await page.getByTestId("folder-line").filter({ hasText: "目标" }).getByRole("button").first().click();
    const parent = page.getByTestId("folder-line").filter({ hasText: "目标" }).first();
    const child = page.getByTestId("folder-line").filter({ hasText: "甲" }).first();
    await expect(child).toBeVisible();
    await parent.dragTo(child);
    await page.waitForTimeout(800); // UI 直接忽略这种拖放：磁盘不变，也没有错误提示
    expect(fs.existsSync(`${vault}/目标/甲/里面的笔记.md`)).toBe(true);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(fs.readdirSync(`${vault}/目标`)).toEqual(["甲"]);
  } finally {
    await close();
  }
});

test("切换笔记再切回：撤销历史保留（编辑器按笔记路径重建时由快照恢复）", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.writeFileSync(`${vault}/甲.md`, "# 甲\n\n原文\n");
    fs.writeFileSync(`${vault}/乙.md`, "# 乙\n\n别的\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("note-item").filter({ hasText: "甲" }).click();
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("新增的一行");
    await expect(editor).toContainText("新增的一行");
    await expect.poll(() => fs.readFileSync(`${vault}/甲.md`, "utf8")).toContain("新增的一行");
    await page.getByTestId("note-item").filter({ hasText: "乙" }).click();
    await expect(editor).toContainText("别的");
    await page.getByTestId("note-item").filter({ hasText: "甲" }).click();
    await expect(editor).toContainText("新增的一行");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("新增的一行"); // 撤销历史还在
  } finally {
    await close();
  }
});

test("工作流 W-C 远程运维脚本：保险箱 → SSH 用密码引用连接并 Exec → 自动化脚本用 Token 环境变量运行，输出进运行结果且文件里没有明文", async () => {
  test.skip(process.platform === "win32", "用 POSIX 脚本；Windows 需要 .cmd 假程序");
  const fs = await import("node:fs");
  const { startFakeSsh } = await import("../../../plugins/ssh/test/fake-server.js");
  const srv = await startFakeSsh({ password: "wc-ssh-pw" });
  const prog = path.join(mkdtempSync(path.join(tmpdir(), "huhu-wc-bin-")), "report.sh");
  writeFileSync(prog, '#!/bin/sh\necho "token=${API_TOKEN:+已提供} 长度=${#API_TOKEN}"\n');
  fs.chmodSync(prog, 0o755);
  const { page, vault, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 1. 保险箱：设置主密码（界面）
    await page.getByRole("button", { name: "保险箱" }).first().click();
    await page.getByLabel("主密码", { exact: true }).fill("correct horse battery");
    await page.getByLabel("确认主密码").fill("correct horse battery");
    await page.getByLabel("我已了解").check();
    await page.getByRole("button", { name: "创建保险箱" }).click();
    await expect(page.getByTestId("safe-unlocked")).toBeVisible({ timeout: 15_000 });
    // 2. SSH：新增主机（密码进保险箱，主机配置只存引用），确认指纹、连接、Exec（界面）
    await page.getByRole("button", { name: "远程连接" }).first().click();
    await page.getByRole("button", { name: "新增 SSH 主机" }).click();
    const hostDialog = page.getByTestId("ssh-host-dialog");
    await hostDialog.getByLabel("显示名称").fill("运维机");
    await hostDialog.getByLabel("主机名或 IP").fill("127.0.0.1");
    await hostDialog.getByLabel("端口", { exact: true }).fill(String(srv.port));
    await hostDialog.getByLabel("用户名").fill("ops");
    await hostDialog.getByLabel("密码", { exact: true }).fill("wc-ssh-pw");
    await hostDialog.getByRole("button", { name: "新增主机" }).click();
    await page.getByRole("button", { name: "连接", exact: true }).click();
    await page.getByRole("button", { name: "信任并连接" }).click();
    await expect(page.getByRole("button", { name: "断开" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("tab", { name: "Exec" }).click();
    await page.getByLabel("命令", { exact: true }).fill("echo 巡检完成");
    await page.getByRole("button", { name: "运行" }).click();
    await expect(page.getByTestId("exec-output")).toContainText("巡检完成");
    const hostFiles = fs.readdirSync(`${vault}/.huhu/ssh/hosts`).map((f) => fs.readFileSync(`${vault}/.huhu/ssh/hosts/${f}`, "utf8"));
    expect(hostFiles.join()).toContain("safe://");
    expect(hostFiles.join()).not.toContain("wc-ssh-pw"); // 主机配置里只有引用

    // 3. API Token 存进保险箱，允许 automations 引用；脚本把它当环境变量用
    const call = await caller(page);
    const item = (await call("safe.items.save", { name: "运维 API Token", type: "token", allowedModules: ["ssh", "automations"], value: "TOP-SECRET-WC-TOKEN" })).data as { id: string };
    const script = (await call("automations.scripts.save", { title: "运维日报", program: prog, args: [], cwd: vault, envRefs: { API_TOKEN: `safe://${item.id}` }, timeoutSec: 10 })).data as { id: string };
    expect((await call("automations.create", { title: "每日运维脚本", trigger: { preset: "custom", cron: "0 9 * * *", zone: "UTC" }, action: { kind: "script", scriptId: script.id, args: [] } })).ok).toBe(true);
    // 4. 自动化：立即运行，运行页看到结果（界面）
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: "每日运维脚本" }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const row = page.getByTestId("run-row").filter({ hasText: "每日运维脚本" });
    await expect(row).toContainText("已完成", { timeout: 30_000 });
    await row.getByRole("button").first().click();
    await expect(page.getByTestId("run-body")).toContainText("token=已提供 长度=19");
    // 5. 明文不落盘：整个 Vault 目录里都找不到 Token 与 SSH 密码
    const all = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    for (const f of all(vault)) {
      const text = fs.readFileSync(f).toString("latin1");
      expect(text, f).not.toContain("TOP-SECRET-WC-TOKEN");
      expect(text, f).not.toContain("wc-ssh-pw");
    }
  } finally {
    await close();
    await srv.close();
  }
});

test("Agent CLI 启动设置面板：选 CLI 后出现模型 / 推理深度 / 附加提示词，启动参数带上所选项（假 Claude 记录 argv）", async () => {
  test.skip(process.platform === "win32", "假 Claude 是 POSIX shell 脚本");
  const fs = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-launch-bin-"));
  const log = path.join(bin, "argv.log");
  writeFileSync(path.join(bin, "claude"), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi\necho "$@" > "${log}"\nsleep 30\n`);
  fs.chmodSync(path.join(bin, "claude"), 0o755);
  const { page, close } = await openApp({ PATH: `${bin}:${process.env["PATH"] ?? ""}` });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByRole("button", { name: "新终端" }).first().click();
    await page.getByRole("menuitem", { name: /Claude Code/ }).click();
    const panel = page.getByTestId("launch-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("option", { name: /Opus/i }).click();
    await panel.getByLabel("附加提示词").fill("整理周报");
    await panel.getByTestId("launch-start").click();
    await expect.poll(() => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : ""), { timeout: 20_000 }).toContain("整理周报");
    expect(fs.readFileSync(log, "utf8")).toMatch(/--model\s+opus/i);
  } finally {
    await close();
    rmSync(bin, { recursive: true, force: true });
  }
});

test("Agent CLI 智能体设置：列出本机 CLI 的检测状态，设置默认模型并持久化，启动面板默认选中它；重新检测；重启 Core 需确认", async () => {
  test.skip(process.platform === "win32", "假 Claude 是 POSIX shell 脚本");
  const fs = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-aset-bin-"));
  writeFileSync(path.join(bin, "claude"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi\nsleep 30\n');
  fs.chmodSync(path.join(bin, "claude"), 0o755);
  const { page, vault, close } = await openApp({ PATH: `${bin}:${process.env["PATH"] ?? ""}` });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByTestId("agent-settings-open").click();
    const dialog = page.getByTestId("agent-settings");
    const row = dialog.locator('[data-provider="claude"]');
    await expect(row).toContainText("已找到", { timeout: 15_000 });
    await expect(row).toContainText("2.1.0");
    await row.getByLabel("Claude Code 默认模型").selectOption("opus");
    await expect.poll(() => (fs.existsSync(`${vault}/.huhu/agent-cli/providers.json`) ? fs.readFileSync(`${vault}/.huhu/agent-cli/providers.json`, "utf8") : "")).toContain("opus");
    await dialog.getByTestId("agent-redetect").click();
    await expect(row).toContainText("已找到");
    await dialog.getByTestId("agent-core-restart").click();
    await expect(dialog.getByTestId("agent-core-restart-yes")).toBeVisible(); // 先确认，不会直接重启
    await dialog.getByRole("button", { name: "取消" }).click();
    await dialog.getByRole("button", { name: "完成" }).click();
    // 启动面板默认选中设置里的默认模型
    await page.getByRole("button", { name: "新终端" }).first().click();
    await page.getByRole("menuitem", { name: /Claude Code/ }).click();
    await expect(page.getByTestId("launch-panel").getByRole("option", { name: /Opus/i })).toHaveAttribute("aria-selected", "true");
  } finally {
    await close();
    rmSync(bin, { recursive: true, force: true });
  }
});
