/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree, root, USER_DATA_ARG } from "../helpers/launch.js";
import { treeFileRows, treeFolder, treeItem, treeMenu, treeSettled } from "../helpers/tree.js";

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
    const t = await call("tasks.create", { title: "首页勾选", body: "", due: null, project: null, type: "human", tags: [], reminders: [] });
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
    await treeItem(page, "危险").click();
    await page.getByRole("tab", { name: "阅读" }).click();
    const pane = page.getByTestId("notes-reading-pane");
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

test("ACC-AG-11 本机没有任何受支持 CLI：新建菜单提供“新终端”，智能体显示“未检测到”且不可启动", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "huhu-nohome-")); // 检测会回退到各 CLI 的默认安装目录（~/.local/bin 等）：用空的 HOME 才算“本机没有”
  // Windows 上把 USERPROFILE 指到空目录会让 Electron 起不来；那里 PATH 指向不存在的目录就足够（CI 机器上没有这些 CLI）
  const { page, close } = await openApp(process.platform === "win32" ? { PATH: "/nonexistent-huhu-bin" } : { PATH: "/nonexistent-huhu-bin", HOME: home, USERPROFILE: home });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByRole("button", { name: "新终端" }).first().click();
    const menu = page.getByRole("menu", { name: "新建" });
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("launch-shell")).toBeEnabled();
    const claude = menu.locator('[data-agent="claude"]');
    await expect(claude).toBeDisabled();
    await expect(claude).toContainText("未检测到");
    await expect(menu.getByTestId("launch-open-settings")).toBeVisible();
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

test("ACC-TK-11 看板：把卡片拖到“已完成”列等同于改状态为已完成（并可拖回“未开始”重开）", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await call("tasks.create", { title: "拖拽任务", type: "human", body: "", due: null, project: null, tags: [], reminders: [] });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-views").getByRole("tab", { name: "看板" }).click();
    await expect(page.getByTestId("board-not_started").getByTestId("board-card")).toHaveCount(1);
    await page.getByTestId("board-not_started").getByTestId("board-card").dragTo(page.getByTestId("board-completed"));
    await expect(page.getByTestId("board-completed").getByTestId("board-card")).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(async () => ((await call("tasks.list", { category: "ended" })).data as { title: string }[]).map((x) => x.title)).toContain("拖拽任务");
    // 回执前同一任务不会重复提交，所以等上一次提交结束后再拖回（失败则重试拖拽）
    await expect(async () => {
      await page.getByTestId("board-completed").getByTestId("board-card").dragTo(page.getByTestId("board-not_started"));
      await expect(page.getByTestId("board-not_started").getByTestId("board-card")).toHaveCount(1, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  } finally {
    await close();
  }
});

test("ACC-TK-06 任务内容里输入 @ 引用 Vault 文件夹：补全列出匹配项，选中后插入 [[相对路径/]]", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.mkdirSync(`${vault}/Research`);
    fs.writeFileSync(`${vault}/Research/资料.md`, "# 资料\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    await page.getByLabel("任务名称").fill("引用资料");
    const body = page.getByTestId("task-body").locator(".ProseMirror");
    await body.click();
    await page.keyboard.type("参考 @Resea");
    await expect(page.getByTestId("editor-ref-menu")).toContainText("Research");
    await page.keyboard.press("Enter");
    await expect(body).toContainText("Research/"); // 选中后插入 wikiLink 节点（芯片显示目标），保存后序列化为 [[Research/]]
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("detail-references")).toContainText("Research");
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
  const app: ElectronApplication = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env });
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
    await page.getByTestId("markdown-editor").locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nA库未保存的内容");
    await expect(page.getByTestId("save-state")).toHaveText("未保存修改");

    await page.getByRole("button", { name: "切换 Vault" }).click(); // 标题栏的 Vault 切换器（下拉菜单）；笔记仍在编辑中
    await page.getByRole("menuitem", { name: "关闭 Vault" }).click();
    await expect(page.getByTestId("svault-dirty-list")).toContainText("草稿甲");
    await page.getByTestId("svault-switch-draft").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    expect(readFileSync(path.join(A, "草稿甲.md"), "utf8")).not.toContain("A库未保存的内容"); // 文件没被改

    // B：看不到 A 的任何数据
    await pick(B);
    await page.getByTestId("vault-new").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(treeFileRows(page)).toHaveCount(0);
    await expect(page.getByText("草稿甲")).toHaveCount(0);

    // 回到 A：笔记提示恢复草稿，内容与切换前一致
    await page.getByRole("button", { name: "切换 Vault" }).click();
    await page.getByRole("menuitem", { name: "关闭 Vault" }).click();
    await page.getByTestId("svault-switch-confirm").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("vault-recent").filter({ hasText: "甲库" }).click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "草稿甲").click();
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
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env });
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
    await expect(treeFileRows(page)).toHaveCount(3);
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
    await expect(treeItem(page, "只读笔记")).toBeVisible();
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
    const call = await caller(page);
    const spaces = (await call("agent.spaces.list")).data as { id: string; name: string }[];
    const spaceId = spaces.find((space) => space.name === "项目")!.id;
    const entries = (await call("agent.history.list", { spaceId })).data.entries as { historyId: string; nativeSessionId: string }[];
    const selected = entries.find((item) => item.nativeSessionId === "old")!;
    await page.getByRole("button", { name: "固定 较旧的提问" }).click();
    await expect(titles).toHaveText(["较旧的提问", "较新的提问"]); // 固定项置顶
    expect(JSON.parse(readFileSync(path.join(vault, ".huhu/agent-cli/pins.json"), "utf8"))).toEqual({ [spaceId]: [selected.historyId] });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByTestId("agent-space-item").filter({ hasText: "项目" }).click();
    await expect(titles).toHaveText(["较旧的提问", "较新的提问"]);
    await page.getByRole("button", { name: "取消固定 较旧的提问" }).click();
    await expect(titles).toHaveText(["较新的提问", "较旧的提问"]);
    await page.getByRole("button", { name: "查看记录 较旧的提问" }).click();
    await expect(page.getByTestId("history-transcript")).toBeVisible();
    await expect(page.getByTestId("transcript-message").first()).toContainText("较旧的提问");
    await expect(page.getByTestId("transcript-message").first()).toHaveAttribute("data-role", "user");
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
    const mk = (name: string, host: string) => call("ssh.hosts.configure", { name, host, port: 22, user: "ops", authKind: "agent", expectedRevision: null, jumpHostIds: [] });
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

test("首页看板：宽屏拖动与缩放预览保持草稿，退出拖动恢复原位置", async () => {
  const { page, close, vault } = await openApp();
  try {
    await page.setViewportSize({ width: 1430, height: 1000 });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByTestId("home-customize").click();
    const board = page.getByTestId("home-dashboard");
    const focus = board.locator('[data-instance-id="default-focus"]');
    const move = focus.getByRole("button", { name: "移动 专注", exact: true });
    const resize = focus.getByRole("button", { name: "拖动调整 专注 尺寸", exact: true });
    const stride = await board.locator(".hu-dashboard-grid").evaluate((grid) => (grid.getBoundingClientRect().width + Number.parseFloat(getComputedStyle(grid).columnGap)) / 6);
    const begin = async (handle: typeof move) => {
      await handle.scrollIntoViewIfNeeded();
      const bounds = (await handle.boundingBox())!;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + stride, y, { steps: 5 });
      await expect(focus).toHaveAttribute("data-placement-preview", "true");
    };
    await begin(move);
    await expect(focus).toHaveCSS("grid-column-start", "2");
    await page.mouse.up();
    await begin(resize);
    await expect(focus).toHaveCSS("grid-column-end", "span 4");
    await page.mouse.up();
    await begin(move);
    await expect(focus).toHaveCSS("grid-column-start", "3");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(focus).toHaveCSS("grid-column-start", "2");
    const file = path.join(vault, ".huhu/home/widgets.json");
    expect(existsSync(file)).toBe(false);
    await board.getByTestId("home-dashboard-save").click();
    await expect(board.getByRole("status")).toContainText("布局已保存");
    expect(JSON.parse(readFileSync(file, "utf8")).layout).toContainEqual({ instanceId: "default-focus", x: 1, y: 5, w: 4, h: 2 });
  } finally {
    if (!page.isClosed())
      await page
        .getByRole("button", { name: "取消编辑", exact: true })
        .click({ timeout: 500 })
        .catch(() => undefined);
    await close();
  }
});

test("首页看板：概览读取失败由卡片重试，近期笔记、专注和规则摘要仍可用", async () => {
  const { page, close, vault } = await openApp();
  let failSummary = true;
  try {
    await page.route("**/api/v1/call", async (route) => {
      if (failSummary && route.request().postDataJSON()?.capability === "home.summary") {
        await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: { ok: false, error: { code: "INTERNAL", message: "fixture: summary unavailable" } } });
      } else await route.continue();
    });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const rule = await call("automations.create", {
      title: "看板独立规则",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "看板验收", taskId: null },
    });
    expect(rule.ok, JSON.stringify(rule.error)).toBe(true);
    const rules = (await call("automations.list")).data as { data: { enabled: boolean } }[];
    const before = (await call("automations.runs.list")).data;
    const metrics = page.getByTestId("home-dashboard").locator('[data-instance-id="default-metrics"]');
    await expect(metrics.getByRole("alert")).toHaveText("无法读取卡片数据");
    await expect(page.getByTestId("card-focus")).toBeVisible();
    await expect(page.getByTestId("card-recent")).toBeVisible();
    const beforeRetry = (await call("home.dashboard.get")).data.board;
    failSummary = false;
    await metrics.getByRole("button", { name: "重试" }).click();
    await expect(metrics.getByTestId("card-notes")).toBeVisible();
    expect((await call("home.dashboard.get")).data.board).toEqual(beforeRetry);
    await page.getByTestId("home-customize").click();
    await page.getByRole("button", { name: "添加卡片", exact: true }).click();
    await page.getByRole("button", { name: "添加 自动化摘要", exact: true }).click();
    await page.getByTestId("home-dashboard-save").click();
    const summary = page.getByTestId("card-automations-summary");
    await expect(summary.getByTestId("automation-widget-rule-count")).toHaveText(`已启用 ${rules.filter(({ data }) => data.enabled).length} 条规则`);
    await expect(summary.getByText("暂无运行记录")).toBeVisible();
    const board = path.join(vault, ".huhu", "home", "widgets.json");
    const saved = readFileSync(board);
    expect((await call("automations.runs.list")).data).toEqual(before);
    await summary.getByRole("button", { name: "打开自动化" }).click();
    await expect(page.getByTestId("automations-module")).toBeVisible();
    expect(readFileSync(board)).toEqual(saved);
  } finally {
    if (!page.isClosed()) {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      const cancel = page.getByRole("button", { name: "取消编辑", exact: true });
      if (await cancel.isVisible()) await cancel.click();
    }
    await close();
  }
});

test("首页看板：窄屏调整顺序时保留草稿，保存后在宽屏重开使用同一布局", async () => {
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const board = page.getByTestId("home-dashboard");
    const order = () => board.locator("[data-instance-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-instance-id")));
    const expected = ["default-metrics", "default-notes", "default-tasks", "default-focus"];
    await expect.poll(order).toEqual(["default-metrics", "default-tasks", "default-notes", "default-focus"]);
    const file = path.join(vault, ".huhu/home/widgets.json");
    await page.setViewportSize({ width: 700, height: 768 });
    await page.getByTestId("home-customize").click();
    await board.getByRole("button", { name: "前移 最近笔记" }).click();
    await expect.poll(order).toEqual(expected);
    expect(existsSync(file)).toBe(false);
    await board.getByTestId("home-dashboard-save").click();
    await expect(board.getByRole("status")).toContainText("布局已保存");
    const bytes = readFileSync(file, "utf8");
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload();
    await expect.poll(order).toEqual(expected);
    expect(readFileSync(file, "utf8")).toBe(bytes);
  } finally {
    await close();
  }
});

test("首页看板：默认布局只替换草稿，保存后重开保留启用的卡片", async () => {
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const original = (await call("home.dashboard.get")).data.board;
    const custom = await call("home.dashboard.update", {
      baseRevision: original.revision,
      instances: [{ instanceId: "custom-focus", widgetType: "widget:kernel:focus", title: "午后专注", hidden: false, config: {} }],
      layout: [{ instanceId: "custom-focus", x: 2, y: 0, w: 3, h: 2 }],
    });
    expect(custom.ok).toBe(true);
    expect((await call("plugins.setEnabled", { id: "tasks", enabled: false })).ok).toBe(true);
    const file = path.join(vault, ".huhu/home/widgets.json");
    const originalBytes = readFileSync(file);
    await page.reload();
    const dashboard = page.getByTestId("home-dashboard");
    await page.getByTestId("home-customize").click();
    const trigger = dashboard.getByRole("button", { name: "恢复默认布局", exact: true });
    const dialog = dashboard.getByRole("dialog", { name: "恢复默认布局" });
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(dashboard.locator('[data-instance-id="custom-focus"]')).toBeVisible();
    await trigger.click();
    await dialog.getByRole("button", { name: "恢复草稿默认布局" }).click();
    await expect(dashboard.locator('[data-instance-id="default-focus"]')).toBeVisible();
    await expect(dashboard.locator('[data-instance-id="default-tasks"]')).toHaveCount(0);
    expect(readFileSync(file)).toEqual(originalBytes);
    await dashboard.getByRole("button", { name: "取消编辑" }).click();
    await expect(dashboard.locator('[data-instance-id="custom-focus"]')).toBeVisible();
    expect(readFileSync(file)).toEqual(originalBytes);

    await page.getByTestId("home-customize").click();
    await trigger.click();
    await dialog.getByRole("button", { name: "恢复草稿默认布局" }).click();
    await dashboard.getByTestId("home-dashboard-save").click();
    await expect(dashboard.getByRole("status")).toContainText("布局已保存");
    await page.reload();
    await expect(dashboard.locator('[data-instance-id="default-focus"]')).toBeVisible();
    const committed = JSON.parse(readFileSync(file, "utf8"));
    expect(committed.revision).not.toBe(custom.data.board.revision);
    expect(committed.instances.map((item: { instanceId: string }) => item.instanceId)).toEqual(["default-metrics", "default-notes", "default-focus"]);
  } finally {
    await close();
  }
});

test("首页看板：只备份已提交布局并在确认后恢复", async () => {
  const { app, page, close, vault } = await openApp();
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-layout-backup-"));
  const backupPath = path.join(directory, "layout.json");
  const file = path.join(vault, ".huhu/home/widgets.json");
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const defaults = (await call("home.dashboard.get")).data.board;
    expect((await call("home.dashboard.update", { baseRevision: defaults.revision, instances: defaults.instances, layout: defaults.layout })).ok).toBe(true);
    const committed = readFileSync(file, "utf8");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: output })) as typeof dialog.showSaveDialog;
    }, backupPath);
    await page.reload();
    const dashboard = page.getByTestId("home-dashboard");
    await page.getByTestId("home-customize").click();
    const focus = dashboard.locator('[data-instance-id="default-focus"]');
    await focus.getByRole("checkbox", { name: "隐藏" }).check();
    await dashboard.getByRole("button", { name: "备份布局", exact: true }).click();
    await expect(dashboard.getByRole("status")).toContainText("已导出保存的布局");
    expect(JSON.parse(readFileSync(backupPath, "utf8"))).toEqual(JSON.parse(committed));
    expect(readFileSync(file, "utf8")).toBe(committed);
    await dashboard.getByTestId("home-dashboard-save").click();
    await expect(dashboard.getByRole("status")).toContainText("布局已保存");
    const hidden = readFileSync(file, "utf8");
    expect(JSON.parse(hidden).instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));

    const selectBackup = async () => {
      await dashboard.getByRole("button", { name: "恢复布局备份" }).click();
      await page.getByRole("dialog", { name: "选择布局备份" }).getByLabel("布局备份文件（JSON）").setInputFiles(backupPath);
    };
    await selectBackup();
    const preview = page.getByRole("dialog", { name: "预览备份布局" });
    await expect(preview.getByText("专注", { exact: false })).toBeVisible();
    await preview.getByRole("button", { name: "保留原样" }).click();
    expect(readFileSync(file, "utf8")).toBe(hidden);
    await selectBackup();
    await preview.getByRole("button", { name: "确认恢复" }).click();
    await expect(dashboard.getByRole("status")).toContainText("布局已恢复");
    const restored = JSON.parse(readFileSync(file, "utf8"));
    expect(restored.instances).toEqual(JSON.parse(committed).instances);
    expect(restored.layout).toEqual(JSON.parse(committed).layout);
    await page.reload();
    await expect(focus).toBeVisible();
  } finally {
    await close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("首页看板：预览已知格式的布局修复，核对版本并保全原件", async () => {
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const original = (await call("home.dashboard.get")).data.board;
    const file = path.join(vault, ".huhu/home/widgets.json");
    mkdirSync(path.dirname(file), { recursive: true });
    const damaged = {
      ...original,
      revision: "invalid-geometry-1",
      layout: [...original.layout.map((item: { instanceId: string }) => (item.instanceId === "default-focus" ? { ...item, x: 9, y: -1 } : item)), { instanceId: "orphan-position", x: 0, y: 2, w: 3, h: 2 }],
    };
    writeFileSync(file, JSON.stringify(damaged));
    await page.reload();
    const dashboard = page.getByTestId("home-dashboard");
    await expect(dashboard.getByText("布局原件已保留", { exact: false })).toBeVisible();
    await expect(page.getByTestId("home-customize")).toBeDisabled();
    const preview = dashboard.getByRole("button", { name: "预览布局修复" });
    const dialog = dashboard.getByRole("dialog", { name: "预览布局修复" });
    await preview.click();
    await expect(dialog.getByText("移除未关联卡片的位置记录", { exact: false })).toBeVisible();
    await expect(dialog.getByText("移回看板范围、避开其他卡片", { exact: false })).toBeVisible();
    const firstPreview = await dialog.getByRole("list").first().innerText();
    await page.keyboard.press("Escape");
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(damaged));
    expect(readdirSync(path.dirname(file))).toEqual(["widgets.json"]);

    await preview.click();
    expect(await dialog.getByRole("list").first().innerText()).toBe(firstPreview);
    const revisedBytes = JSON.stringify({ ...damaged, revision: "invalid-geometry-2" });
    writeFileSync(file, revisedBytes);
    await dialog.getByRole("button", { name: "确认修复" }).click();
    await expect(dashboard.getByRole("status")).toContainText("布局已变化");
    expect(readFileSync(file, "utf8")).toBe(revisedBytes);
    expect(readdirSync(path.dirname(file))).toEqual(["widgets.json"]);

    await preview.click();
    await dialog.getByRole("button", { name: "确认修复" }).click();
    await expect(dashboard.getByRole("status")).toContainText("布局已恢复");
    const savedOriginal = readdirSync(path.dirname(file)).find((name) => name.startsWith("widgets.json.corrupt-"));
    expect(savedOriginal).toBeDefined();
    expect(readFileSync(path.join(path.dirname(file), savedOriginal!), "utf8")).toBe(revisedBytes);
    const repaired = JSON.parse(readFileSync(file, "utf8"));
    expect(repaired.revision).not.toBe("invalid-geometry-2");
    expect(repaired.instances).toEqual(original.instances);
    expect(repaired.layout).toContainEqual({ instanceId: "default-focus", x: 0, y: 5, w: 3, h: 2 });
    await page.reload();
    await expect(page.getByTestId("home-customize")).toBeVisible();
    await expect(dashboard.locator('[data-instance-id="default-focus"]')).toBeVisible();
  } finally {
    await close();
  }
});

test("首页看板：其他会话先保存后，保留草稿并显式采用新版本为基准", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const board = page.getByTestId("home-dashboard");
    const focus = board.locator('[data-instance-id="default-focus"]');
    await page.getByTestId("home-customize").click();
    await focus.getByRole("checkbox", { name: "隐藏" }).check();
    const original = (await call("home.dashboard.get", {})).data.board;
    const changed = {
      baseRevision: original.revision,
      instances: original.instances,
      layout: original.layout.map((item: { instanceId: string }) => (item.instanceId === "default-focus" ? { ...item, x: 1 } : item)),
    };
    const first = await call("home.dashboard.update", changed);
    expect(first.ok).toBe(true);
    await board.getByTestId("home-dashboard-save").click();
    await expect(board.getByRole("status")).toContainText("其他会话已保存新版本");
    await expect(focus.getByRole("checkbox", { name: "隐藏" })).toBeChecked();
    expect((await call("home.dashboard.get", {})).data.board.revision).toBe(first.data.board.revision);
    await board.getByRole("button", { name: "对照最新版本" }).click();
    const comparison = page.getByRole("dialog", { name: "对照最新布局" });
    await expect(comparison.getByText("最新布局", { exact: true })).toBeVisible();
    await expect(comparison.getByText("当前草稿", { exact: true })).toBeVisible();
    await comparison.getByRole("button", { name: "以此版本为基准保留草稿" }).click();
    await board.getByTestId("home-dashboard-save").click();
    await expect(board.getByRole("status")).toContainText("布局已保存");
    expect((await call("home.dashboard.get", {})).data.board.instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));
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
    await expect(page.getByTestId("version-diff-labels")).toContainText("当前有效内容");
    // 与前一版：版本二相对版本一新增两行
    await page.getByRole("tab", { name: "与前一版" }).click();
    await expect(page.getByTestId("version-diff-labels")).toContainText("前一版本");
    await expect(page.getByTestId("history-stats")).toContainText("+2");
    // 最早的一版没有前一版：与空文件比
    await page.getByTestId("history-entry").filter({ hasText: "版本一" }).click();
    await expect(page.getByTestId("version-diff-labels")).toContainText("没有更早的版本");
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
    const item = treeItem(page, "待移动");
    await expect(item).toBeVisible();
    await treeSettled(page);
    await item.dragTo(treeFolder(page, "归档"));
    await expect.poll(() => fs.existsSync(`${vault}/归档/待移动.md`)).toBe(true);
    expect(fs.existsSync(`${vault}/待移动.md`)).toBe(false);
    // 回到根：OK 树“拖到空白处回根”依赖 pierre 在宿主容器里的空白命中区，Electron 下的拖放模拟未验证（见 evidence/s5）；
    // 这里用菜单“移动到…”走同一条 notes.move 能力验证回根
    await treeFolder(page, "归档").first().click();
    const moved = treeItem(page, "待移动");
    await expect(moved).toBeVisible();
    await treeSettled(page);
    await treeMenu(page, moved, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("");
    await page.getByRole("button", { name: "移动", exact: true }).click();
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

test("能力网关：逐项和批量选择先预览，旧版本保留草稿并在刷新后整批保存", async () => {
  const { page, vault, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const policyFile = path.join(vault, ".huhu/gateway/tool-access.json");
    const readPolicy = () => JSON.parse(readFileSync(policyFile, "utf8")) as { revision: number; choices: Record<string, boolean> };
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    const filter = page.getByRole("textbox", { name: "筛选能力" });
    await filter.fill("notes.read");
    const single = page.getByRole("switch", { name: "暴露 notes.read" });
    await expect(single).not.toBeChecked();
    await single.click();
    const draft = page.getByRole("dialog", { name: "开放工具" });
    await expect(draft).toContainText("notes.read");
    await page.keyboard.press("Escape");
    await expect(draft).toBeHidden();
    await expect(single).toBeFocused();
    expect(readPolicy().revision).toBe(0);

    await page.getByRole("checkbox", { name: "选择 notes.read", exact: true }).check();
    await filter.fill("notes.list");
    await page.getByRole("checkbox", { name: "选择 notes.list", exact: true }).check();
    await page.getByRole("button", { name: "开启所选" }).click();
    const bulk = page.getByRole("dialog", { name: "开启所选" });
    await expect(bulk.getByRole("listitem")).toHaveCount(2);
    await expect(bulk).toContainText("策略版本 0");
    expect((await call("gateway.update", { capability: "vault.info", exposed: true })).ok).toBe(true);
    await bulk.getByRole("button", { name: "保存选择" }).click();
    await expect(bulk.getByRole("alert")).toContainText("策略或工具目录已变化");
    expect(readPolicy().choices).toMatchObject({ "vault.info": true, "notes.read": false, "notes.list": false });
    await bulk.getByRole("button", { name: "刷新预览" }).click();
    await expect(bulk).toContainText("策略版本 1");
    await expect(bulk.getByRole("listitem")).toHaveCount(2);
    await bulk.getByRole("button", { name: "保存选择" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存 2 项工具选择" })).toBeVisible();
    expect(readPolicy()).toMatchObject({ revision: 2, choices: { "vault.info": true, "notes.read": true, "notes.list": true } });
  } finally {
    await close();
  }
});

test("任务详情：提前派遣先核对原目标，不可用时重开仍显示原派遣", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await expect.poll(async () => (await call("agent.spaces.list")).data?.length).toBeGreaterThan(0);
    const [{ id: spaceId }] = (await call("agent.spaces.list")).data as { id: string }[];
    const created = await call("tasks.create", {
      title: "先核对原会话",
      type: "agent",
      body: "只发给指定会话",
      availableAt: "2099-11-21T09:00:00Z",
      execution: { spaceId, target: { mode: "existing", sessionId: "fixture-missing-original-session" } },
    });
    expect(created.ok).toBe(true);
    const taskId = created.data.id as string;
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    const task = page.getByRole("button", { name: "打开任务 先核对原会话" });
    await task.click();
    const detail = page.getByTestId("task-detail");
    const button = detail.getByRole("button", { name: "提前派遣", exact: true });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "提前派遣" });
    await expect(dialog).toContainText("2099");
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
    expect((await call("tasks.dispatch.list", { taskId })).data).toEqual([]);
    await button.click();
    await dialog.getByRole("button", { name: "确认提前派遣" }).click();
    const managed = detail.getByTestId("managed-task-run");
    await expect(managed).toContainText("原会话未连接或已不可用", { timeout: 12_000 });
    const rows = (await call("tasks.dispatch.list", { taskId })).data as { runId: string; overriddenAvailableAt: string; state: string }[];
    expect(rows).toMatchObject([{ state: "blocked", overriddenAvailableAt: "2099-11-21T09:00:00.000Z" }]);
    await detail.getByRole("button", { name: "关闭任务详情", exact: true }).click();
    await task.click();
    await expect(detail.getByTestId("managed-task-run")).toHaveAttribute("data-run-id", rows[0]!.runId);
    expect((await call("agent.sessions.list", { spaceId })).data).toEqual([]);
  } finally {
    await close();
  }
});

test("任务详情的一次性跟进可辨别时钟回拨、改期和取消", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    expect(await call("settings.update", { patch: { dateTime: { zone: "America/New_York" } } })).toMatchObject({ ok: true, data: { dateTime: { zone: "America/New_York" } } });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const created = await call("tasks.create", { title: "跟进原任务", type: "agent", body: "查看处理结果" });
    expect(created.ok).toBe(true);
    const taskId = created.data.id as string;
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    const task = page.getByRole("button", { name: "打开任务 跟进原任务" });
    await task.click();
    const detail = page.getByTestId("task-detail");
    const section = detail.getByRole("region", { name: "一次性跟进", exact: true });
    const schedule = section.getByRole("button", { name: "安排一次性跟进" });
    await schedule.click();
    const editor = page.getByRole("dialog", { name: "一次性跟进", exact: true });
    const timestamp = editor.getByLabel("跟进时间");
    await expect(timestamp).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(schedule).toBeFocused();
    await schedule.click();
    await expect(editor).toContainText("America/New_York");
    await timestamp.fill("2099-03-08T02:30");
    await editor.getByRole("button", { name: "保存跟进" }).click();
    await expect(editor.getByRole("alert")).toContainText("此时区没有这个本地时间");
    expect((await call("automations.followUps.get", { taskId })).data).toBeNull();

    await timestamp.fill("2099-11-01T01:30");
    await editor.getByLabel("回拨时间选项").selectOption("2099-11-01T06:30:00.000Z");
    await editor.getByRole("button", { name: "保存跟进" }).click();
    await expect(section.getByRole("status")).toHaveText("一次性跟进已保存。");
    const first = (await call("automations.followUps.get", { taskId })).data;
    expect(first).toMatchObject({ taskId, state: "scheduled", scheduledFor: "2099-11-01T06:30:00.000Z" });
    await section.getByRole("button", { name: "改期", exact: true }).click();
    await timestamp.fill("2099-11-01T03:45");
    await editor.getByRole("button", { name: "保存跟进" }).click();
    await expect(section.locator("time")).toHaveAttribute("datetime", "2099-11-01T08:45:00.000Z");
    const rescheduled = (await call("automations.followUps.get", { taskId })).data;
    expect(rescheduled).toMatchObject({ taskId, scheduledFor: "2099-11-01T08:45:00.000Z", state: "scheduled" });
    expect(rescheduled.followUpId).not.toBe(first.followUpId);
    await page.getByRole("button", { name: "关闭任务详情", exact: true }).click();
    await task.click();
    await section.getByRole("button", { name: "取消跟进", exact: true }).click();
    await page.getByRole("dialog", { name: "取消一次性跟进" }).getByRole("button", { name: "确认取消" }).click();
    await expect(section).toContainText("已取消");
    expect((await call("automations.followUps.get", { taskId })).data).toMatchObject({ taskId, followUpId: rescheduled.followUpId, state: "cancelled" });
    expect((await call("tasks.dispatch.list", { taskId })).data).toEqual([]);
  } finally {
    await close();
  }
});

test("工作流 W-A：收件箱想法进入 Agent 任务后，自动化在任务详情留下同一笔受控派遣", async () => {
  const { page, vault, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    expect((await call("inbox.capture", { title: "整理研究资料", body: "把本周的研究笔记整理成摘要" })).ok).toBe(true);
    const [{ id: spaceId }] = (await call("agent.spaces.list")).data as { id: string }[];
    const created = await call("tasks.create", {
      title: "整理研究资料",
      type: "agent",
      body: "把本周的研究笔记整理成摘要",
      execution: { spaceId, target: { mode: "existing", sessionId: "fixture-missing-automation-target" } },
    });
    expect(created.ok).toBe(true);
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    await page.getByLabel("规则名称").fill("处理 Agent 任务");
    await page.getByTestId("rule-kind").selectOption("agent_tasks");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByTestId("rule-row").first().click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page
      .getByRole("button", { name: /激活记录/ })
      .first()
      .click();
    await expect(page.getByTestId("activation-row")).toHaveCount(1);
    await expect.poll(async () => (await call("automations.activations")).data).toMatchObject([{ activationId: expect.stringMatching(/^inv-/), summary: { processed: 1 } }]);
    await expect(page.getByTestId("activation-row")).toContainText("处理 1");
    const taskId = created.data.id as string;
    const rows = (await call("tasks.dispatch.list", { taskId })).data as { dispatchId: string; runId: string }[];
    expect(rows).toMatchObject([{ dispatchId: expect.stringMatching(/^scan-/) }]);
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const listedRun = page.getByRole("button", { name: "整理研究资料", exact: true });
    await listedRun.click();
    const drawer = page.getByRole("dialog", { name: "整理研究资料" });
    await expect(drawer.locator("[data-run-id]")).toHaveAttribute("data-run-id", rows[0]!.runId);
    await expect(drawer).toContainText("原会话未连接或已不可用", { timeout: 12_000 });
    await page.keyboard.press("Escape");
    await expect(listedRun).toBeFocused();
    await listedRun.click();
    await drawer.getByRole("button", { name: "打开原任务" }).click();
    const row = page.getByTestId("managed-task-run");
    await expect(row).toContainText("原会话未连接或已不可用");
    await expect(row).toHaveAttribute("data-run-id", rows[0]!.runId);
    expect((await call("tasks.read", { id: taskId })).data.status).toBe("not_started");
    expect((await call("agent.sessions.list", { spaceId })).data).toEqual([]);
    expect(existsSync(path.join(vault, "Task Runs"))).toBe(false);
  } finally {
    await close();
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
    const tree = page.getByTestId("notes-resource-tree");
    const oldRow = tree.locator('[data-item-path="甲/"]');
    const parent = tree.locator('[data-item-path="目标/"]');
    const child = tree.locator('[data-item-path="目标/甲/"]');
    const movedNote = path.join(vault, "目标/甲/里面的笔记.md");
    const oldDir = path.join(vault, "甲");
    await expect(oldRow).toBeVisible();
    await oldRow.dragTo(parent);
    await expect.poll(() => fs.existsSync(movedNote) && !fs.existsSync(oldDir)).toBe(true);
    const movedBytes = fs.readFileSync(movedNote);

    // 模拟第二次拖放命中过期的根级「甲」行。
    expect(await call("notes.move", { path: "目标", targetDir: "甲" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", message: "目标文件夹不存在：甲" },
    });
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.readFileSync(movedNote)).toEqual(movedBytes);

    // 拖进自己的后代：被拒绝，磁盘不变
    await expect(oldRow).toHaveCount(0);
    if ((await parent.getAttribute("aria-expanded")) !== "true") await parent.click();
    await expect(child).toBeVisible();
    await treeSettled(page);
    await parent.dragTo(child);
    await page.waitForTimeout(800); // UI 直接忽略这种拖放：磁盘不变，也没有错误提示
    expect(fs.readFileSync(movedNote)).toEqual(movedBytes);
    expect(fs.existsSync(oldDir)).toBe(false);
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
    await treeItem(page, "甲").click();
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("新增的一行");
    await expect(editor).toContainText("新增的一行");
    await expect.poll(() => fs.readFileSync(`${vault}/甲.md`, "utf8")).toContain("新增的一行");
    await treeItem(page, "乙").click();
    await expect(editor).toContainText("别的");
    await treeItem(page, "甲").click();
    await expect(editor).toContainText("新增的一行");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("新增的一行"); // 撤销历史还在
  } finally {
    await close();
  }
});

test("终端规则在桌面配置和清除受保护环境，Safe 停用后仍可运行", async () => {
  test.skip(process.platform !== "win32" || process.arch !== "x64", "使用 Windows Credential Manager 和 PowerShell 夹具");
  const { page, close } = await openApp();
  const prefix = "automations.terminal.environment";
  const variable = "HUHU_RULE_SECRET_STAGED_FIXTURE";
  let clearSynthetic: (() => Promise<void>) | undefined;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const rule = await call("automations.create", {
      title: "桌面规则的独立环境",
      trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
      action: {
        kind: "terminal",
        command: "if (-not $env:HUHU_RULE_SECRET_STAGED_FIXTURE) { exit 7 }; [Console]::WriteLine('protected-environment-ok'); [Console]::WriteLine($env:HUHU_RULE_SECRET_STAGED_FIXTURE)",
        shell: "powershell",
        spaceId: null,
      },
    });
    expect(rule.ok).toBe(true);
    clearSynthetic = async () => {
      const current = (await call(`${prefix}.get`, { ruleId: rule.data.id })).data;
      if (current?.states?.[variable] === "configured") {
        await call(`${prefix}.save`, { ruleId: rule.data.id, expectedRevision: current.revision, names: [], changes: [{ name: variable, action: "clear" }] });
      }
    };
    expect((await call("safe.status")).data.initialized).toBe(false);
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: "桌面规则的独立环境" }).click();
    await page.getByRole("button", { name: "添加受保护变量" }).click();
    const config = page.getByRole("dialog", { name: "配置受保护变量" });
    await config.getByLabel("变量名").fill(variable);
    const synthetic = "synthetic-module-only-environment";
    await config.getByLabel("受保护值").fill(synthetic);
    await config.getByRole("button", { name: "保存配置" }).click();
    await expect(page.getByRole("status").filter({ hasText: "规则环境已保存" })).toBeVisible();
    const approval = page.getByRole("dialog", { name: "终端规则的外部授权" });
    const openApproval = page.getByRole("button", { name: "管理 CLI / MCP 授权" });
    await openApproval.click();
    await expect(approval.getByRole("region", { name: "PowerShell 命令" })).toContainText(variable);
    await expect(approval.getByLabel("批准的变量名")).toHaveValue(variable);
    await page.keyboard.press("Escape");
    await expect(approval).not.toBeVisible();
    await expect(openApproval).toBeFocused();
    expect((await call("automations.terminal.approval.review", { ruleId: rule.data.id })).data.approvalId).toBeNull();
    await openApproval.click();
    await approval.getByRole("button", { name: "批准这条规则" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已批准本机手动使用" })).toBeVisible();
    expect((await call("plugins.setEnabled", { id: "safe", enabled: false })).ok).toBe(true);
    await page.getByRole("button", { name: "立即运行", exact: true }).click();
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const run = page.getByTestId("run-row").filter({ hasText: "桌面规则的独立环境" });
    await expect(run).toContainText("已完成", { timeout: 25_000 });
    await run.getByRole("button").first().click();
    await expect(page.getByTestId("run-body")).toContainText("protected-environment-ok");
    await expect(page.getByTestId("run-body")).toContainText("***");
    await expect(page.getByTestId("run-body")).not.toContainText(synthetic);
    await page.getByTestId("run-detail").getByRole("button", { name: "关闭", exact: true }).click();
    await page
      .getByRole("navigation", { name: "自动化导航" })
      .getByRole("button", { name: /^定时自动化/ })
      .click();
    await page.getByTestId("rule-row").filter({ hasText: "桌面规则的独立环境" }).click();
    await openApproval.click();
    await approval.getByRole("button", { name: "撤销批准" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已撤销本机批准" })).toBeVisible();
    await page.getByRole("button", { name: `清除 ${variable}` }).click();
    await page.getByRole("dialog", { name: "清除受保护变量" }).getByRole("button", { name: "确认清除" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已清除本机值" })).toBeVisible();
    const row = (await call(`${prefix}.get`, { ruleId: rule.data.id })).data;
    expect(row).toMatchObject({ states: { [variable]: "unconfigured" } });
    expect(JSON.stringify(row)).not.toContain(synthetic);
    expect(await call("automations.runNow", { id: rule.data.id })).toMatchObject({ ok: true, data: { summary: { state: "failed" } } });
  } finally {
    if (!page.isClosed()) await clearSynthetic?.().catch(() => undefined);
    await close();
  }
});

test("Agent CLI 新建菜单：悬停智能体打开子菜单，选模型 / 附加提示词后启动，参数带上所选项与完全访问参数（假 Claude 记录 argv）", async () => {
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
    const menu = page.getByTestId("launch-menu");
    await menu.locator('[data-agent="claude"]').hover();
    const sub = page.getByTestId("launch-submenu");
    await expect(sub).toBeVisible();
    await sub.getByLabel("模型").selectOption("opus");
    await sub.getByLabel("附加提示词").fill("整理周报");
    await sub.getByTestId("launch-submenu-start").click();
    await expect.poll(() => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : ""), { timeout: 20_000 }).toContain("整理周报");
    const argv = fs.readFileSync(log, "utf8");
    expect(argv).toMatch(/--model\s+opus/i);
    expect(argv).toContain("--dangerously-skip-permissions");
  } finally {
    await close();
    rmSync(bin, { recursive: true, force: true });
  }
});

test("Agent CLI 智能体设置页：列出检测状态，设置默认模型并持久化到 agents.json，命令行预览实时刷新；刷新检测；重启 Core 需确认；菜单里的“智能体设置…”可达", async () => {
  test.skip(process.platform === "win32", "假 Claude 是 POSIX shell 脚本");
  const fs = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-aset-bin-"));
  writeFileSync(path.join(bin, "claude"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi\nsleep 30\n');
  fs.chmodSync(path.join(bin, "claude"), 0o755);
  const { page, vault, close } = await openApp({ PATH: `${bin}:${process.env["PATH"] ?? ""}` });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    // 经新建菜单底部的“智能体设置…”进入插件设置页
    await page.getByRole("button", { name: "新终端" }).first().click();
    await page.getByTestId("launch-open-settings").click();
    const settingsPage = page.getByTestId("agent-settings");
    await expect(settingsPage).toBeVisible();
    const row = settingsPage.locator('[data-provider="claude"]');
    await expect(row).toContainText("2.1.0", { timeout: 15_000 });
    await expect(row.getByTestId("agent-command-preview")).toContainText("claude --dangerously-skip-permissions");
    await row.getByRole("button", { expanded: false }).first().click();
    await row.getByLabel("Claude Code 模型").selectOption("opus");
    await expect.poll(() => (fs.existsSync(`${vault}/.huhu/agent-cli/agents.json`) ? fs.readFileSync(`${vault}/.huhu/agent-cli/agents.json`, "utf8") : "")).toContain("opus");
    await expect(row.getByTestId("agent-command-preview")).toContainText("--model opus");
    await settingsPage.getByTestId("agent-redetect").click();
    await expect(row).toContainText("2.1.0");
    await settingsPage.getByTestId("agent-core-restart").click();
    await expect(settingsPage.getByTestId("agent-core-restart-yes")).toBeVisible(); // 先确认，不会直接重启
    await settingsPage.getByRole("button", { name: "取消" }).click();
  } finally {
    await close();
    rmSync(bin, { recursive: true, force: true });
  }
});

test("任务提醒到点：持久提示（打开任务 / 知道了）+ 通知中心条目带正文、时间、来源，点击跳转来源并标已读", async () => {
  test.setTimeout(120_000);
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const t = await call("tasks.create", {
      title: "到点提醒任务",
      body: "",
      due: null,
      project: null,
      type: "human",
      reminders: [{ id: "rem-e2e", channel: "in_app", at: "2020-01-01T00:00:00Z", enabled: true }],
    });
    expect(t.ok).toBe(true);
    // 到点检查每 30 秒一轮
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "任务提醒：到点提醒任务" });
    await expect(toast).toBeVisible({ timeout: 50_000 });
    await page.waitForTimeout(4500); // 持久：过了普通提示的消失时间仍在
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "知道了" }).click();
    await expect(toast).toHaveCount(0);
    await page.getByTestId("bell").click();
    const item = page.getByTestId("notice-item").filter({ hasText: "到点提醒任务" });
    await expect(item).toContainText("提醒时间");
    await expect(item).toContainText("任务");
    await item.click();
    await expect(page.getByTestId("task-detail").or(page.getByTestId("task-new"))).toBeVisible(); // 跳到任务模块
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notice-item").filter({ hasText: "到点提醒任务" })).toHaveAttribute("data-read", "true");
  } finally {
    await close();
  }
});

test("命令面板：搜索结果按来源分组（笔记 / 任务 / 档案 / 收件箱），选中任务结果跳到任务模块", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await call("notes.create", { name: "分组测试笔记" });
    await call("tasks.create", { title: "分组测试任务", body: "", due: null, project: null, type: "human", tags: [], reminders: [] });
    await expect.poll(async () => ((await call("vault.search", { query: "分组测试" })).data as { hits: unknown[] }).hits.length).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox", { name: "搜索模块、命令和内容" }).fill("分组测试");
    const groups = page.getByTestId("palette-group");
    await expect(groups.first()).toBeVisible({ timeout: 10_000 });
    await expect(groups.filter({ hasText: "笔记" })).toBeVisible();
    await expect(groups.filter({ hasText: "任务" })).toBeVisible();
    await page.getByTestId("palette-item").filter({ hasText: "分组测试任务" }).click();
    await expect(page.getByTestId("task-new")).toBeVisible(); // 在任务模块
  } finally {
    await close();
  }
});

test("笔记被外部修改且有未保存编辑：Banner 有“查看差异 / 保留我的修改”；保留后保存覆盖磁盘", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click(); // 手动保存，才会有未保存编辑
    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByRole("button", { name: "新建笔记" }).first().click();
    await page.getByTestId("new-note-dialog").getByLabel("文件名").fill("外改笔记");
    await page.getByTestId("new-note-submit").click();
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("我的一行");
    const file = `${vault}/外改笔记.md`;
    fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}\n外部一行\n`);
    await expect(page.getByTestId("note-view-diff")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("note-view-diff").click();
    const dialog = page.getByTestId("note-diff-dialog");
    await expect(dialog).toContainText("外部一行");
    await expect(dialog).toContainText("我的一行");
    await dialog.getByRole("button", { name: "关闭" }).last().click();
    await page.getByTestId("note-keep-mine").click();
    await expect(page.getByTestId("note-keep-mine")).toHaveCount(0); // Banner 消失
    await page.getByTestId("note-save").click();
    await expect.poll(() => fs.readFileSync(file, "utf8")).toContain("我的一行");
    expect(fs.readFileSync(file, "utf8")).not.toContain("外部一行"); // 用户明确选择保留自己的修改
  } finally {
    await close();
  }
});

test("知识库查看器：文本 / JSON（带语法诊断）/ 图片 / SVG 直接查看，二进制只有元信息；都有“用系统应用打开”", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.writeFileSync(`${vault}/说明.txt`, "第一行\n第二行 hello\n");
    fs.writeFileSync(`${vault}/数据.json`, '{"a": 1,}');
    fs.writeFileSync(`${vault}/图.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    fs.writeFileSync(`${vault}/矢量.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__svgpwn=1</script><rect width="10" height="10" fill="red"/></svg>');
    fs.writeFileSync(`${vault}/二进制.bin`, Buffer.from([0, 1, 2, 3, 0, 255]));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    const open = (name: string) => treeItem(page, name).click();
    await open("说明");
    await expect(page.getByTestId("file-text-view")).toContainText("第二行 hello");
    await expect(page.getByTestId("file-open-external")).toBeVisible();
    await open("数据");
    await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法错误");
    await open("图");
    await expect(page.getByTestId("file-image")).toBeVisible();
    await expect.poll(() => page.getByTestId("file-image").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await open("矢量");
    await expect(page.getByTestId("file-image")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __svgpwn?: number }).__svgpwn)).toBeUndefined(); // SVG 里的脚本不会执行
    await open("二进制");
    await expect(page.getByTestId("file-size")).toHaveText("6 B");
    await expect(page.getByTestId("file-text-view")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("阅读模式：数学公式（KaTeX）与 Mermaid 图表渲染；错误的图表显示错误并保留源码；.mmd 文件有图表预览", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.writeFileSync(
      `${vault}/公式与图.md`,
      ["# 公式与图", "", "行内公式 $E=mc^2$ 与块公式：", "", "$$", "\\int_0^1 x^2 dx = \\frac13", "$$", "", "```mermaid", "graph TD", "  A[开始] --> B[结束]", "```", "", "```mermaid", "这不是合法的图", "```", ""].join("\n"),
    );
    fs.writeFileSync(`${vault}/流程.mmd`, "graph LR\n  X --> Y\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, "公式与图").click();
    await page.getByRole("tab", { name: "阅读" }).click();
    const pane = page.getByTestId("notes-reading-pane");
    await expect(pane.locator(".katex").first()).toBeVisible({ timeout: 15_000 });
    expect(await pane.locator(".katex").count()).toBeGreaterThanOrEqual(2); // 行内 + 块
    await expect(pane.locator(".mermaid svg").first()).toBeVisible({ timeout: 30_000 }); // OK 的 MermaidFence 节点视图
    await expect(pane).toContainText("这不是合法的图"); // 错误的图表保留源码可见
    await treeItem(page, "流程").click();
    await expect(page.getByTestId("file-mermaid").locator("svg")).toBeVisible({ timeout: 30_000 });
  } finally {
    await close();
  }
});

test("本机没有 git：Git 页显示“需要安装 Git”和安装说明，而不是错误", async () => {
  test.skip(process.platform === "win32", "Windows 上去掉 PATH 会让 Electron 子进程找不到系统目录");
  const { page, close } = await openApp({ PATH: "/nonexistent-huhu-bin" });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "版本历史", exact: true }).first().click();
    await page.getByTestId("versioning-nav-git").click();
    await expect(page.getByTestId("git-missing")).toContainText("需要安装 Git");
    await expect(page.getByTestId("git-missing")).toContainText("git-scm.com");
  } finally {
    await close();
  }
});

test("远程连接：认证方式可选 密码 / SSH 私钥 / 系统 ssh-agent；选 ssh-agent 不需要保险箱与口令", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "新增 SSH 主机" }).first().click();
    const dialog = page.getByTestId("ssh-host-dialog");
    await dialog.getByLabel("显示名称").fill("代理机");
    await dialog.getByLabel("主机名或 IP").fill("agent.example.internal");
    await dialog.getByLabel("用户名").fill("ops");
    await expect(dialog.getByTestId("ssh-host-save")).toBeDisabled(); // 默认是密码：还没填
    await dialog.getByLabel("认证方式").selectOption("key");
    await expect(dialog.getByLabel("私钥", { exact: true })).toBeVisible();
    await expect(dialog.getByTestId("ssh-host-save")).toBeDisabled(); // 私钥为空
    await dialog.getByLabel("认证方式").selectOption("agent");
    await expect(dialog.getByText("SSH_AUTH_SOCK")).toBeVisible();
    await dialog.getByTestId("ssh-host-save").click();
    await expect(page.getByRole("button", { name: /代理机/ }).first()).toBeVisible();
    await expect(page.getByText("SSH Agent").first()).toBeVisible();
  } finally {
    await close();
  }
});

test("知识库：详情“关联”显示关联任务；笔记菜单“保存版本”写入版本历史", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const note = (await call("notes.create", { name: "关联笔记" })).data as { path: string; id: string };
    await call("tasks.create", { title: "引用这篇笔记的任务", body: `参考 [[${note.path}]]`, due: null, project: null, type: "human", tags: [], reminders: [] });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, "关联笔记").click();
    await page.getByRole("button", { name: "文档详情" }).first().click();
    await page.getByRole("tab", { name: "关联" }).click();
    await expect(page.getByTestId("related-task")).toContainText("引用这篇笔记的任务");
    // 保存版本
    await treeMenu(page, treeItem(page, "关联笔记"), "保存版本…");
    await page.getByLabel("版本名称").fill("里程碑一");
    await page.getByRole("button", { name: "保存版本" }).last().click();
    await expect.poll(async () => ((await call("history.timeline", { path: note.path })).data as { title?: string }[]).some((e) => e.title === "里程碑一")).toBe(true);
  } finally {
    await close();
  }
});

test("Agent CLI：Space 可以编辑（改名）与删除（只删配置，不动目录文件）", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-space-"));
  writeFileSync(path.join(dir, "keep.txt"), "x");
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByTestId("space-new").click();
    await page.getByLabel("Space 名称").fill("旧名字");
    await page.getByLabel("工作目录").fill(dir);
    await page.getByTestId("space-save").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "旧名字" })).toBeVisible();
    await page.getByTestId("space-edit").click();
    await page.getByLabel("Space 名称").fill("新名字");
    await page.getByTestId("space-save").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "新名字" })).toBeVisible();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "旧名字" })).toHaveCount(0);
    await page.getByTestId("space-delete").click();
    await page.getByTestId("space-delete-confirm").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "新名字" })).toHaveCount(0);
    expect(existsSync(path.join(dir, "keep.txt"))).toBe(true);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("数据与存储：开启“关闭前提示导出数据包”后，切换 Vault 必须先导出并确认备份可用", async () => {
  const out = mkdtempSync(path.join(tmpdir(), "huhu-bk-"));
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-data").click();
    await page.getByRole("tab", { name: "导出与迁移" }).click();
    await page.getByRole("switch", { name: "关闭前提示导出数据包" }).click();
    await page.getByTestId("settings-nav-vault").click();
    await page.getByTestId("svault-switch").click();
    await expect(page.getByTestId("svault-backup")).toBeVisible();
    const confirm = page.getByTestId("svault-switch-confirm");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("svault-backup-path").fill(path.join(out, "关闭前.zip"));
    await page.getByTestId("svault-backup-export").click();
    await expect(page.getByTestId("svault-backup-done")).toBeVisible({ timeout: 20_000 });
    await expect(confirm).toBeDisabled(); // 还没勾选“我已确认备份文件可用”
    await page.getByTestId("svault-backup-confirm").check();
    await expect(confirm).toBeEnabled();
    expect(existsSync(path.join(out, "关闭前.zip"))).toBe(true);
  } finally {
    await close();
    rmSync(out, { recursive: true, force: true });
  }
});

test("顶栏 Vault 菜单：列出最近打开的 Vault、打开其他 Vault…、关闭 Vault；选“关闭 Vault”回到启动页", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByTestId("vault-name").click();
    const menu = page.getByTestId("vault-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "打开其他 Vault…" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "关闭 Vault" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await page.getByTestId("vault-name").click();
    await menu.getByRole("menuitem", { name: "关闭 Vault" }).click();
    await page.getByTestId("svault-switch-confirm").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
  } finally {
    await close();
  }
});

test("F6 / Shift+F6 在功能栏、模块侧栏、内容之间循环焦点", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-data").click();
    await page.getByRole("tab", { name: "索引与恢复" }).click();
    const region = () => page.evaluate(() => document.activeElement?.closest("[data-region]")?.getAttribute("data-region") ?? "none");
    expect(await region()).toBe("content");
    await page.keyboard.press("F6");
    expect(await region()).toBe("rail");
    await page.keyboard.press("F6");
    expect(await region()).toBe("sidebar");
    await page.keyboard.press("F6");
    expect(await region()).toBe("content");
    await page.keyboard.press("Shift+F6");
    expect(await region()).toBe("sidebar");
  } finally {
    await close();
  }
});

test("Combobox：任务“项目”可从已有项目中搜索选择，也可直接输入新项目；版本历史“当前文件”可搜索", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    for (const project of ["工作", "家庭"]) await call("tasks.create", { title: `任务-${project}`, body: "", due: null, project, type: "human", tags: [], reminders: [] });
    await call("notes.create", { name: "甲笔记" });
    await call("notes.create", { name: "乙笔记" });
    await page.getByRole("button", { name: "版本历史", exact: true }).first().click();
    await page.getByTestId("versioning-nav-history").click();
    const file = page.getByTestId("history-file");
    await file.fill("乙");
    await expect(page.getByRole("listbox", { name: "当前文件" }).getByRole("option")).toHaveText(["乙笔记.md"]);
    await page.getByRole("listbox", { name: "当前文件" }).getByRole("option", { name: "乙笔记.md" }).click();
    await expect(file).toHaveValue("乙笔记.md");
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    const editor = page.getByTestId("task-editor");
    const project = editor.getByLabel("任务项目");
    await project.click();
    await expect(page.getByRole("listbox", { name: "任务项目" }).getByRole("option")).toHaveCount(2);
    await project.fill("家");
    await expect(page.getByRole("listbox", { name: "任务项目" }).getByRole("option")).toHaveText(["家庭"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(project).toHaveValue("家庭");
    await project.fill("全新项目");
    await expect(page.getByText("按回车使用“全新项目”")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(project).toHaveValue("全新项目");
  } finally {
    await close();
  }
});

test("DataTable：网关“调用记录”显示外部调用；超过 200 行时只渲染可见行，键盘 ↑↓ 移动、表头列宽可拖动", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const tok = (await call("gateway.tokens.create", { name: "e2e" })).data as { token: string };
    const ep = await page.evaluate(() => window.huhuHost.engine());
    const sent = await page.evaluate(
      async ([e, token]) => {
        let ok = 0;
        for (let i = 0; i < 260; i++) {
          const r = await fetch(`${e.baseUrl}/api/v1/call`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ capability: "vault.info", input: {}, requestId: crypto.randomUUID() }),
          });
          if (r.ok) ok++;
        }
        return ok;
      },
      [ep, tok.token] as const,
    );
    expect(sent).toBe(260);
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByRole("tab", { name: "服务端" }).click();
    const rows = page.getByTestId("audit-row");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(await rows.count()).toBeLessThan(120); // 260 条记录，只渲染可见行（虚拟化）
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-row-index"))).toBe("1");
    // 表头列宽可拖动
    const th = page.getByRole("table", { name: "外部调用记录" }).locator("th").first();
    const before = (await th.boundingBox())!.width;
    const handle = th.getByTestId("col-resizer");
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + 3, hb.y + 5);
    await page.mouse.down();
    await page.mouse.move(hb.x + 63, hb.y + 5, { steps: 4 });
    await page.mouse.up();
    expect((await th.boundingBox())!.width).toBeGreaterThan(before + 30);
  } finally {
    await close();
  }
});

test("首页看板通过可信目录添加 Git 和 SSH 卡片，停用后保留 SSH 实例", async () => {
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await page.getByTestId("home-customize").click();
    for (const title of ["版本与同步", "SSH 主机"]) {
      await page.getByRole("button", { name: "添加卡片", exact: true }).click();
      await page.getByRole("button", { name: `添加 ${title}`, exact: true }).click();
    }
    await page.getByTestId("home-dashboard-save").click();
    await expect(page.getByTestId("card-versioning-git")).toBeVisible();
    await expect(page.getByTestId("card-ssh-hosts")).toBeVisible();
    const file = path.join(vault, ".huhu/home/widgets.json");
    const before = readFileSync(file, "utf8");
    expect(before).toContain("widget:versioning:git");
    expect(before).toContain("widget:ssh:hosts");
    await call("plugins.setEnabled", { id: "ssh", enabled: false });
    await expect(page.getByTestId("card-ssh-hosts")).toHaveCount(0);
    expect(readFileSync(file, "utf8")).toBe(before);
    await call("plugins.setEnabled", { id: "ssh", enabled: true });
    await expect(page.getByTestId("card-ssh-hosts")).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(before);
  } finally {
    await close();
  }
});

test("ACC-KN-02 输入法正在组合中文时点击“源码”：组合结束后才切换，已输入文字完整保留，撤销可撤回该段输入", async () => {
  test.skip(process.platform === "win32", "CDP 输入法组合在 Windows 的 Electron 上不稳定");
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const n = (await call("notes.create", { name: "输入法" })).data;
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, "输入法").click();
    await page.getByRole("tab", { name: "实时预览" }).click();
    const editor = page.getByTestId("markdown-editor");
    const content = editor.locator(".ProseMirror");
    await content.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "你好", selectionStart: 2, selectionEnd: 2 });
    await expect.poll(() => page.evaluate(() => document.querySelector(".ProseMirror")?.textContent ?? "")).toContain("你好");
    await page.getByRole("tab", { name: "源码" }).click(); // 点击会使编辑区失焦、结束组合
    await expect(editor).toHaveAttribute("data-editor-mode", "source", { timeout: 5000 });
    await expect(editor.locator(".cm-content").first()).toContainText("你好"); // 源码视图读同一份 Y.Text
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(content).toContainText("你好");
    // 撤销可撤回该段输入
    await content.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(content).not.toContainText("你好");
    expect(n.path).toContain("输入法");
  } finally {
    await close();
  }
});

test("有未完成操作：数据页列出它，关闭 / 切换 Vault 前即使没开提示也要先导出并确认备份", async () => {
  const { page, close, vault } = await openApp();
  const out = mkdtempSync(path.join(tmpdir(), "huhu-pend-"));
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    mkdirSync(path.join(vault, ".huhu/operations"), { recursive: true });
    writeFileSync(path.join(vault, ".huhu/operations/op-pending-1.json"), JSON.stringify({ opId: "op-pending-1", kind: "rename-note", state: "needs_attention", steps: [], createdAt: new Date().toISOString(), attention: ["a.md"] }));
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-data").click();
    await page.getByRole("tab", { name: "索引与恢复" }).click();
    await expect(page.getByTestId("storage-pending-op")).toContainText("rename-note");
    await page.getByTestId("vault-name").click();
    await page.getByRole("menuitem", { name: "关闭 Vault" }).click();
    await expect(page.getByTestId("svault-backup")).toContainText("有未完成的操作");
    await expect(page.getByTestId("svault-switch-confirm")).toBeDisabled();
    await page.getByTestId("svault-backup-path").fill(path.join(out, "x.zip"));
    await page.getByTestId("svault-backup-export").click();
    await expect(page.getByTestId("svault-backup-done")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("svault-backup-confirm").check();
    await expect(page.getByTestId("svault-switch-confirm")).toBeEnabled();
  } finally {
    await close();
    rmSync(out, { recursive: true, force: true });
  }
});

test("专注计时：运行中关闭应用，退出前暂停并保存剩余时间", async () => {
  const { app, page, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    expect((await call("home.focus.update", { action: "start" })).ok).toBe(true);
    expect((await call("home.focus.get", {})).data.running).toBe(true);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click(); // 首页卡片已卸载：暂停不能依赖它
    await app.close();
    const saved = JSON.parse(readFileSync(path.join(vault, ".huhu/home/focus.json"), "utf8")) as { running: boolean; remainingSec: number };
    expect(saved.running).toBe(false);
    expect(saved.remainingSec).toBeGreaterThan(0);
    expect(saved.remainingSec).toBeLessThanOrEqual(25 * 60);
  } finally {
    rmTree(vault);
  }
});

test("AR-06 / AR-10 / AR-09 档案：笔记里的 [[Archives/…/]] 在阅读模式可点击并打开档案视图，被链接出现该笔记；命令面板把档案单独分组；档案里可以添加附件", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await call("archives.types.save", { name: "通讯录", fields: [{ name: "电话", type: "text" }] });
    await call("archives.create", { type: "通讯录", name: "张三", fields: { 电话: "123" } });
    fs.writeFileSync(`${vault}/年度计划.md`, "# 年度计划\n\n联系 [[Archives/通讯录/张三/]]\n");
    await expect.poll(async () => ((await call("vault.search", { query: "年度计划" })).data as { hits: unknown[] }).hits.length).toBeGreaterThan(0);
    // AR-06：阅读模式点击双链 → 档案视图；被链接里有这篇笔记
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, "年度计划").first().click();
    await page.getByRole("tab", { name: "阅读" }).click();
    await page.locator('[data-wiki-link][data-target="Archives/通讯录/张三/"]').click();
    await expect(page.getByTestId("archive-view")).toContainText("张三");
    await expect(page.getByTestId("archive-backlink").filter({ hasText: "年度计划" })).toBeVisible();
    // AR-09：添加附件（pdf）→ 出现在档案文件列表，磁盘上也有
    await page.getByTestId("archive-file-input").setInputFiles({ name: "合同.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await expect(page.getByTestId("archive-file").filter({ hasText: "合同.pdf" })).toBeVisible();
    expect(fs.existsSync(`${vault}/Archives/通讯录/张三/合同.pdf`)).toBe(true);
    // AR-10：命令面板里档案单独分组，标题是文件夹名而不是 index
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox", { name: "搜索模块、命令和内容" }).fill("张三");
    const groups = page.getByTestId("palette-group");
    await expect(groups.filter({ hasText: "档案" })).toBeVisible({ timeout: 10_000 });
    const hit = page.getByTestId("palette-item").filter({ hasText: "张三" });
    await expect(hit.first()).toBeVisible();
    await expect(page.getByTestId("palette-item").filter({ hasText: /^index/ })).toHaveCount(0); // 标题是文件夹名，不是 index
  } finally {
    await close();
  }
});

test("AR-16 随包 demo vault：能看到“通讯录”示例，双链与被链接可用", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    const demo = path.resolve(import.meta.dirname, "../../../apps/desktop/resources/demo-vault");
    fs.cpSync(demo, vault, { recursive: true });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await expect.poll(async () => ((await call("vault.search", { query: "双链示例" })).data as { hits: unknown[] }).hits.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-open-archives").click();
    await expect(page.getByTestId("archive-category-card").filter({ hasText: "通讯录" })).toBeVisible();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await expect(page.getByTestId("archive-row")).toHaveCount(2);
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    await expect(page.getByTestId("archive-fields").getByLabel("电话")).toHaveValue("13800000000");
    await expect(page.getByTestId("archive-backlink").filter({ hasText: "双链示例" })).toBeVisible();
    await expect(page.getByTestId("archive-file").filter({ hasText: "会议记录" })).toBeVisible();
  } finally {
    await close();
  }
});
