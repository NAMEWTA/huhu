import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

const master = "safe tags test vault";
const shared = "共有标记5c61";
const extra = "交集标记5c61";
const renamed = "改名标记5c61";
const draft = "放弃标记5c61";
const privateNote = "私人备注5c61";
const privateEmail = "account5c61@example.test";
const secretWord = "password-only-5c61";

async function setup(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "保险箱", exact: true }).first().click();
  await expect(page.getByTestId("safe-setup")).toBeVisible();
  await page.getByLabel("主密码", { exact: true }).fill(master);
  await page.getByLabel("确认主密码").fill(master);
  await page.getByLabel("我已了解").check();
  await page.getByRole("button", { name: "创建保险箱" }).click();
  await expect(page.getByTestId("safe-new")).toBeEnabled({ timeout: 15_000 });
}

async function unlock(page: Page) {
  await expect(page.getByTestId("safe-locked")).toBeVisible();
  await page.getByLabel("主密码", { exact: true }).fill(master);
  await page.getByRole("button", { name: "解锁保险箱" }).click();
  await expect(page.getByTestId("safe-new")).toBeEnabled({ timeout: 15_000 });
}

async function desktopCall(page: Page) {
  const endpoint = await page.evaluate(() => window.huhuHost.engine());
  expect(new URL(endpoint.baseUrl).hostname).toBe("127.0.0.1");
  return async <T>(capability: string, input: unknown = {}): Promise<T> => {
    const response = await page.request.post(`${endpoint.baseUrl}/api/v1/call`, {
      headers: { authorization: `Bearer ${endpoint.token}` },
      data: { capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() },
    });
    try {
      const result = await response.json();
      expect(result.ok).toBe(true);
      return result.data as T;
    } finally {
      await response.dispose();
    }
  };
}

test("保险箱标签：复用、随条目保存、改名变色、冲突和解除关联", async () => {
  const { page, vault, close } = await openApp();
  try {
    await setup(page);
    const manage = page.getByRole("button", { name: "标签管理", exact: true });
    const manager = page.getByTestId("safe-tag-dialog");
    const editor = page.getByTestId("safe-item-dialog");
    const newEntry = page.getByTestId("safe-new");
    const row = (name: string) => page.getByTestId("safe-item").filter({ hasText: name });
    const tagRow = (name: string) => manager.getByTestId("safe-tag-row").filter({ hasText: name });
    const closeManager = () => manager.getByRole("button", { name: "完成" }).click();
    async function createTag(name: string, color: string) {
      await manager.getByRole("button", { name: "新建标签" }).press("Enter");
      await manager.getByLabel("标签名称").fill(name);
      await manager.getByLabel("颜色").selectOption(color);
      await manager.getByRole("button", { name: "保存标签" }).press("Enter");
      await expect(tagRow(name)).toBeVisible();
    }
    async function startEntry(name: string) {
      await newEntry.press("Enter");
      await editor.getByLabel("名称（必填）").fill(name);
      await editor.getByLabel("账号（必填）").fill("测试账号");
    }
    async function inlineTag(name: string) {
      await editor.getByRole("button", { name: "新增标签" }).press("Enter");
      await expect(editor.getByLabel("标签名称")).toBeFocused();
      await editor.getByLabel("标签名称").fill(name);
      await editor.getByLabel("颜色").selectOption("green");
      await editor.getByRole("button", { name: "应用标签" }).press("Enter");
      await expect(editor.getByRole("checkbox", { name, exact: true })).toBeChecked();
    }
    await manage.press("Enter");
    await createTag(shared, "blue");
    await createTag(shared, "orange");
    await expect(manager.getByRole("status")).toHaveText("已复用现有标签");
    await expect(tagRow(shared)).toHaveCount(1);
    await expect(tagRow(shared).getByTitle("蓝色")).toBeVisible();
    await closeManager();

    await startEntry("放弃的条目");
    await inlineTag(draft);
    await editor.getByRole("button", { name: "取消编辑" }).click();
    await editor.getByRole("button", { name: "放弃更改" }).click();
    await manage.click();
    await expect(tagRow(draft)).toHaveCount(0);
    await closeManager();

    await startEntry("合成条目甲");
    await inlineTag(shared);
    await inlineTag(extra);
    await editor.getByLabel("备注").fill(privateNote);
    await editor.getByLabel("邮箱").fill(privateEmail);
    await editor.getByLabel("密码", { exact: true }).fill(secretWord);
    await editor.getByTestId("safe-save").press("Enter");
    await expect(row("合成条目甲")).toContainText(extra);
    await startEntry("合成条目乙");
    await editor.getByTestId("safe-save").press("Enter");
    await expect(row("合成条目乙")).toBeVisible();
    await page.getByRole("button", { name: "编辑条目" }).click();
    await editor.getByRole("checkbox", { name: shared, exact: true }).check();
    await editor.getByTestId("safe-save").press("Enter");
    await expect(row("合成条目乙")).toContainText(shared);

    await manage.click();
    await expect(tagRow(shared)).toContainText("2 个条目");
    await manager.getByRole("button", { name: `编辑 ${shared}` }).click();
    await manager.getByLabel("标签名称").fill(extra);
    const saveTag = manager.getByRole("button", { name: "保存标签" });
    await saveTag.click();
    await expect(manager.getByRole("alert")).toContainText("已有同名标签");
    await expect(manager.getByLabel("标签名称")).toHaveValue(extra);
    await manager.getByRole("button", { name: "返回标签管理" }).click();
    await expect(tagRow(shared)).toContainText("2 个条目");
    await expect(tagRow(extra)).toContainText("1 个条目");
    await manager.getByRole("button", { name: `编辑 ${shared}` }).click();
    await manager.getByLabel("标签名称").fill(renamed);
    await manager.getByLabel("颜色").selectOption("purple");
    await saveTag.click();
    await expect(tagRow(renamed)).toContainText("2 个条目");
    await closeManager();
    for (const name of ["合成条目甲", "合成条目乙"]) {
      await expect(row(name).getByTitle("紫色")).toHaveText(renamed);
    }
    await page.screenshot({ path: test.info().outputPath("safe-tag-links.png"), animations: "disabled" });
    const html = page.locator("html");
    const mode = await html.getAttribute("data-mode");
    const alternate = mode === "dark" ? "light" : "dark";
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-mode", alternate);
    await expect(row("合成条目甲").getByTitle("紫色")).toHaveText(renamed);
    await expect(row("合成条目甲").getByTitle("绿色")).toHaveText(extra);
    await page.screenshot({ path: test.info().outputPath(`safe-tag-links-${alternate}.png`), animations: "disabled" });

    await manage.click();
    const deleteTag = manager.getByRole("button", { name: `删除 ${renamed}` });
    await deleteTag.click();
    await expect(manager.getByText(/解除 2 个条目/)).toBeVisible();
    await manager.getByRole("button", { name: "取消删除" }).press("Enter");
    await expect(tagRow(renamed)).toContainText("2 个条目");
    await deleteTag.click();
    await manager.getByRole("button", { name: "确认删除标签" }).click();
    await expect(manager.getByRole("status")).toHaveText("已删除标签");
    await closeManager();
    await page.getByRole("button", { name: "手动锁定" }).click();
    await unlock(page);
    await expect(page.getByTestId("safe-item")).toHaveCount(2);
    await expect(row("合成条目甲")).toContainText(extra);
    const call = await desktopCall(page);
    const session = await call<{ instanceId: string; generation: number }>("safe.status");
    const index = await call<{ entries: Array<{ entryId: string }> }>("safe.entries.list", { session });
    const details = await Promise.all(index.entries.map(({ entryId }) => call<{ tagIds: string[]; accounts: unknown[] }>("safe.entries.get", { session, entryId })));
    expect(details.map((entry) => entry.tagIds.length).sort()).toEqual([0, 1]);
    expect(details.map((entry) => entry.accounts.length)).toEqual([1, 1]);

    const markers = [shared, extra, renamed, draft, privateNote, "account5c61", secretWord];
    for (const entry of readdirSync(vault, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const bytes = readFileSync(path.join(entry.parentPath, entry.name));
      expect(markers.some((marker) => bytes.includes(marker))).toBe(false);
    }
    for (const query of markers) {
      expect((await call<{ hits: unknown[] }>("vault.search", { query })).hits).toEqual([]);
    }
  } finally {
    await close();
  }
});

test("保险箱只复制所选第三个账号，剪贴板拒绝有反馈且锁定拦截迟到复制", async () => {
  const { app, page, close } = await openApp();
  const value = "synthetic-third-clipboard-value";
  try {
    await setup(page);
    const call = await desktopCall(page);
    const { instanceId, generation } = await call<{ instanceId: string; generation: number }>("safe.status");
    const session = { instanceId, generation };
    await call("safe.entries.create", {
      session,
      expectedRevision: 0,
      name: "复制测试条目",
      accounts: [
        { account: "第一账号", password: "synthetic-first-clipboard-value" },
        { account: "第二账号", password: "synthetic-second-clipboard-value" },
        { account: "第三账号", password: value },
      ],
    });
    // The backdoor write skips the list refresh; relock as the tag test does.
    await page.getByRole("button", { name: "手动锁定" }).click();
    await unlock(page);
    await page.getByTestId("safe-item").filter({ hasText: "复制测试条目" }).click();
    await page.getByTestId("safe-accounts").getByTestId("safe-account-row").filter({ hasText: "第三账号" }).click();
    const copy = page.getByRole("button", { name: "复制密码", exact: true });
    const masked = page.getByTestId("secret-value");
    await expect(masked).toHaveText("••••••••");
    await copy.click();
    await expect(page.getByText("已复制密码。", { exact: true })).toBeVisible();
    await expect(masked).toHaveText("••••••••");
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "隔离粘贴检查");
      document.body.prepend(input);
    });
    const paste = page.getByRole("textbox", { name: "隔离粘贴检查" });
    await paste.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(paste).toHaveValue(value);
    await paste.evaluate((input) => input.remove());
    await app.evaluate(({ clipboard }) => clipboard.clear());

    await app.evaluate(({ clipboard }) => {
      const write = clipboard.writeText;
      clipboard.writeText = (...args) => {
        clipboard.writeText = write;
        throw new Error(`Synthetic clipboard refused ${args.length} arguments`);
      };
    });
    await copy.click();
    await expect(page.getByText("无法复制密码。可重试，或选择「显示密码」后手动复制。")).toBeVisible();
    await expect(masked).toHaveText("••••••••");
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "safe.accounts.reveal") return route.continue();
      const response = await route.fetch();
      ready.resolve();
      try {
        await release.promise;
        await route.fulfill({ response }).catch(() => undefined);
      } finally {
        await response.dispose();
        finished.resolve();
      }
    });
    try {
      await copy.click();
      await ready.promise;
      const current = await call<{ instanceId: string; generation: number }>("safe.status");
      await call("safe.lock", { session: { instanceId: current.instanceId, generation: current.generation } });
      await expect(page.getByTestId("safe-locked")).toBeVisible();
    } finally {
      release.resolve();
    }
    await finished.promise;
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("");
  } finally {
    await app
      .evaluate(({ clipboard }, expected) => {
        if (clipboard.readText() === expected) clipboard.clear();
      }, value)
      .catch(() => undefined);
    await close();
  }
});

test("保险箱标签：多标签交集、账号命中、无标签及锁定清除", async () => {
  const { page, close } = await openApp();
  try {
    await setup(page);
    const call = await desktopCall(page);
    const session = await call<{ instanceId: string; generation: number }>("safe.status");
    const a = await call<{ tagId: string }>("safe.tags.create", { session, expectedRevision: 0, name: shared, color: "blue" });
    const b = await call<{ tagId: string }>("safe.tags.create", { session, expectedRevision: 1, name: extra, color: "green" });
    await call("safe.entries.create", {
      session,
      expectedRevision: 2,
      name: "两个标签",
      url: "https://url-marker5c61.example.test",
      tagIds: [a.tagId, b.tagId],
      accounts: [{ account: "同名账号" }, { account: "同名账号", email: privateEmail, phone: "0012561", note: privateNote, password: secretWord }],
    });
    await call("safe.entries.create", { session, expectedRevision: 3, name: "一个标签", tagIds: [a.tagId], accounts: [{ account: "一个" }] });
    await call("safe.entries.create", { session, expectedRevision: 4, name: "没有标签", accounts: [{ account: "无" }] });
    await page.getByRole("button", { name: "手动锁定" }).click();
    await unlock(page);

    const rows = page.getByTestId("safe-item");
    const filters = page.getByRole("group", { name: "筛选标签" });
    const search = page.getByPlaceholder("搜索名称、账号、标签或备注…");
    const unlabeled = filters.getByRole("button", { name: "无标签" });
    const all = filters.getByRole("button", { name: "全部" });
    const first = filters.getByRole("button", { name: shared, exact: true });
    const second = filters.getByRole("button", { name: extra, exact: true });
    await expect(rows).toHaveCount(3);
    await first.press("Enter");
    await expect(rows).toHaveCount(2);
    await second.press("Enter");
    await expect(rows).toHaveCount(1);
    const selectedAccount = page.getByTestId("safe-accounts").locator('[data-testid="safe-account-row"][aria-pressed="true"]');
    for (const query of [privateEmail, privateNote, "0012561"]) {
      await search.fill(query);
      await expect(rows).toContainText("命中账号 · 2. 同名账号");
      await rows.press("Enter");
      await expect(selectedAccount).toContainText("2. 同名账号");
    }
    for (const query of [extra, "url-marker5c61", "两个标签"]) {
      await search.fill(query);
      await expect(rows).toHaveCount(1);
    }
    await search.fill(secretWord);
    await expect(rows).toHaveCount(0);
    await search.fill("");
    await unlabeled.press("Enter");
    await expect(unlabeled).toHaveAttribute("aria-pressed", "true");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(second).toHaveAttribute("aria-pressed", "false");
    await expect(rows).toHaveText(/没有标签/);
    await unlabeled.press("Enter");
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(rows).toHaveCount(3);
    await unlabeled.press("Enter");
    await first.press("Enter");
    await expect(unlabeled).toHaveAttribute("aria-pressed", "false");
    await expect(rows).toHaveCount(2);
    await all.press("Enter");
    await expect(rows).toHaveCount(3);
    await second.press("Enter");
    await search.fill(privateNote);
    await rows.press("Enter");
    await page.getByRole("button", { name: "手动锁定" }).click();
    await expect(search).toHaveCount(0);
    await expect(filters).toHaveCount(0);
    await expect(selectedAccount).toHaveCount(0);
    await unlock(page);
    await expect(search).toHaveValue("");
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(rows).toHaveCount(3);
    await expect(selectedAccount).toHaveCount(0);

    const fetched = Promise.withResolvers<boolean>();
    const release = Promise.withResolvers<void>();
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "safe.tags.list") return route.continue();
      const response = await route.fetch();
      try {
        fetched.resolve((await response.json()).ok === true);
        await release.promise;
        await route.fulfill({ response }).catch(() => undefined);
      } finally {
        await response.dispose();
      }
    });
    try {
      await page.getByRole("button", { name: "工作台", exact: true }).first().click();
      await page.getByRole("button", { name: "保险箱", exact: true }).first().click();
      expect(await fetched.promise).toBe(true);
      await call("safe.lock");
      await expect(page.getByTestId("safe-locked")).toBeVisible();
    } finally {
      release.resolve();
      await page.unrouteAll({ behavior: "wait" });
    }
    await expect(filters).toHaveCount(0);
    await expect(rows).toHaveCount(0);
  } finally {
    await close();
  }
});
