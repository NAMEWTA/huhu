import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CapabilityResult, TaskDto } from "../../../packages/contracts/src/index.js";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

async function withWorkbench(run: (desktop: Page, web: Page, vault: string) => Promise<void>) {
  const desktop = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop.page);
    const { addresses } = await call<{ addresses: { url: string }[] }>(desktop.page, "web.share.start", { mode: "local", port: 0 });
    const { links } = await call<{ links: string[] }>(desktop.page, "web.invitations.create", {});
    const invitation = new URL(links[0]!);
    expect(invitation.origin).toBe(new URL(addresses[0]!.url).origin);
    browser = await chromium.launch({ headless: true });
    const web = await browser.newPage();
    await web.goto(invitation.href);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    await run(desktop.page, web, desktop.vault);
  } finally {
    try {
      await browser?.close();
    } finally {
      await desktop.close();
    }
  }
}

function invoke<T>(page: Page, capability: string, input: unknown): Promise<CapabilityResult<T>> {
  return page.evaluate(async ({ capability, input }) => {
    const host = typeof window.huhuHost === "undefined" ? undefined : await window.huhuHost.engine();
    const headers = new Headers({ "content-type": "application/json" });
    if (host) headers.set("authorization", `Bearer ${host.token}`);
    const requestId = crypto.randomUUID();
    const result = await fetch(`${host?.baseUrl ?? location.origin}/api/v1/call`, {
      method: "POST",
      headers,
      body: JSON.stringify({ capability, input, requestId, idempotencyKey: requestId }),
    });
    return result.json();
  }, { capability, input });
}

const versionOf = (text: Buffer) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("F01 桌面保存与独立 Web 改名竞争同一旧版本，只提交一个结果", async () => {
  await withWorkbench(async (desktop, web, vault) => {
    const task = await call<TaskDto>(desktop, "tasks.create", { title: "Commit Original", body: "原正文" });
    const source = path.join(vault, task.path);
    const moved = path.join(vault, "Tasks", `Commit Renamed--${task.id}.md`);
    const newText = readFileSync(source, "utf8").replace("原正文", "桌面已保存");
    const [saved, renamed] = await Promise.all([
      invoke<{ version: string }>(desktop, "notes.save", { path: task.path, text: newText, expectedVersion: task.version }),
      invoke<TaskDto>(web, "tasks.update", { id: task.id, expectedVersion: task.version, patch: { title: "Commit Renamed" } }),
    ]);
    expect(Number(saved.ok) + Number(renamed.ok)).toBe(1);
    if (saved.ok) {
      expect(renamed).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(readFileSync(source, "utf8")).toBe(newText);
      expect(existsSync(moved)).toBe(false);
      expect(saved.data.version).toBe(versionOf(Buffer.from(newText)));
      expect(await invoke(web, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: { path: task.path, version: saved.data.version } });
    } else if (renamed.ok) {
      expect(["NOT_FOUND", "VERSION_CONFLICT"]).toContain(saved.error.code);
      expect(existsSync(source)).toBe(false);
      expect(renamed.data.version).toBe(versionOf(readFileSync(moved)));
      expect(await call(desktop, "tasks.read", { id: task.id })).toMatchObject({ path: renamed.data.path, version: renamed.data.version, body: task.body });
    }
  });
});

test("F03 桌面与独立 Web 改名均保留异常目标，清除冲突后保留原任务身份", async () => {
  await withWorkbench(async (desktop, web, vault) => {
    const task = await call<TaskDto>(desktop, "tasks.create", { title: "Rename Original", body: "原正文" });
    const target = `Tasks/Rename Target--${task.id}.md`;
    const source = path.join(vault, task.path);
    const destination = path.join(vault, target);
    const original = readFileSync(source);
    const placeholder = Buffer.from("---\nvalue: [\n---\n外部文件\n");
    writeFileSync(destination, placeholder, { flag: "wx" });
    const request = { id: task.id, expectedVersion: task.version, patch: { title: "Rename Target" } };
    for (const surface of [desktop, web]) {
      expect(await invoke(surface, "tasks.update", request)).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT", details: { path: target } } });
      expect(readFileSync(source)).toEqual(original);
      expect(readFileSync(destination)).toEqual(placeholder);
    }
    rmSync(destination);
    const renamed = await invoke<TaskDto>(web, "tasks.update", request);
    expect(renamed).toMatchObject({ ok: true, data: { id: task.id, path: target, body: task.body, version: versionOf(readFileSync(destination)) } });
    expect(existsSync(source)).toBe(false);
    expect(await call(desktop, "tasks.read", { id: task.id })).toMatchObject({ id: task.id, path: target });
  });
});
