import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PlanOccurrence, PlanSummary } from "../../../packages/contracts/src/automation-plan.js";
import { Vault } from "../../../packages/vault/src/index.js";
import { rmTree, root, USER_DATA_ARG } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const cli = path.resolve(import.meta.dirname, "../../../apps/cli/src/bin.ts");
const entry = path.resolve(import.meta.dirname, "../../../apps/engine/src/main.ts");
const tsx = createRequire(import.meta.url).resolve("tsx/cli");

function residentFixture() {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-engine-lifecycle-"));
  const env = { ...process.env, HUHU_VAULT: vault, HUHU_ENGINE_ENTRY: entry, HUHU_WEB_ASSETS_DIR: path.join(root, "out", "web") };
  const command = async (action: string) => {
    const { stdout } = await promisify(execFile)(process.execPath, [tsx, cli, "engine", action, "--vault", vault, "--json"], { env, timeout: 20_000 });
    return JSON.parse(stdout) as { mode?: string; state: string; port?: number; pid?: number; vaultId?: string };
  };
  const launch = () => electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env });
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  async function start() {
    await (await Vault.open(vault, { create: true })).close();
    const resident = await command("start");
    expect(resident).toMatchObject({ mode: "resident", state: "running", port: expect.any(Number), pid: expect.any(Number) });
    return resident;
  }
  async function openDesktop() {
    app = await launch();
    const page = await app.firstWindow();
    await engineReady(page);
    return page;
  }
  async function closeDesktop() {
    await app?.close();
    app = undefined;
  }
  async function dispose() {
    try {
      await closeDesktop();
    } finally {
      try {
        await command("stop");
      } finally {
        rmTree(vault);
      }
    }
  }
  return { start, openDesktop, closeDesktop, dispose, command };
}

test("TW7 桌面附着当前常驻 Engine，退出工作台后同一端点继续服务", async () => {
  test.skip(process.platform !== "linux");
  test.setTimeout(70_000);
  const fixture = residentFixture();
  try {
    const resident = await fixture.start();
    for (const _ of [0, 1]) {
      const page = await fixture.openDesktop();
      const endpoint = await page.evaluate(() => window.huhuHost.engine());
      expect(endpoint).toMatchObject({ vaultId: resident.vaultId, baseUrl: `http://127.0.0.1:${resident.port}` });
      await fixture.closeDesktop();
      expect(await fixture.command("status")).toEqual(resident);
    }
    expect(await fixture.command("stop")).toEqual({ state: "stopped" });
  } finally {
    await fixture.dispose();
  }
});

test("AW7 AU18 桌面和获邀 Web 全部关闭后，同一常驻 Engine 按原计划只递送一次", async () => {
  test.skip(process.platform !== "linux");
  test.setTimeout(85_000);
  const fixture = residentFixture();
  const title = "离开工作台后提醒";
  let browser: Browser | undefined;
  const openWeb = async (desktop: Page) => {
    const invitation = await call<{ links: string[] }>(desktop, "web.invitations.create", {});
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(invitation.links[0]!);
    await engineReady(page);
    return page;
  };
  try {
    const resident = await fixture.start();
    const desktop = await fixture.openDesktop();
    const endpoint = await desktop.evaluate(() => window.huhuHost.engine());
    expect(endpoint).toMatchObject({ vaultId: resident.vaultId, baseUrl: `http://127.0.0.1:${resident.port}` });
    const { id: taskId } = await call<{ id: string }>(desktop, "tasks.create", { title, type: "human" });
    await call(desktop, "web.share.start", { mode: "local", port: 0 });
    const web = await openWeb(desktop);
    const intentId = randomUUID();
    const scheduledFor = new Date(Date.now() + 15_000).toISOString();
    const plan = await call<PlanSummary>(desktop, "automations.plans.createTaskReminder", { taskId, scheduledFor, intentId }, intentId);
    const { planId, revision } = plan;
    const planInput = { planId };
    expect(await call<PlanSummary>(web, "automations.plans.read", planInput)).toMatchObject({
      planId, revision, nextAt: scheduledFor, lastOccurrence: null,
    });

    await browser!.close();
    browser = undefined;
    await fixture.closeDesktop();
    const clientsClosedAt = Date.now();
    expect(clientsClosedAt).toBeLessThan(Date.parse(scheduledFor));
    expect(await fixture.command("status")).toEqual(resident);

    // Observe the Engine directly while there are no renderer clients.
    const readPlan = async () => {
      const result = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
        body: JSON.stringify({ requestId: randomUUID(), capability: "automations.plans.read", input: planInput }),
      });
      const reply = await result.json() as { ok: true; data: PlanSummary } | { ok: false; error: { code: string } };
      if (!reply.ok) throw new Error(`automations.plans.read: ${reply.error.code}`);
      return reply.data;
    };
    await expect.poll(readPlan, { timeout: 30_000 }).toMatchObject({
      planId, revision, nextAt: null, lastOccurrence: { state: "completed", occurrenceId: expect.any(String) },
    });
    const { occurrenceId, at } = (await readPlan()).lastOccurrence!;
    expect(Date.parse(at)).toBeGreaterThan(clientsClosedAt);
    expect(await fixture.command("status")).toEqual(resident);

    const reopened = await fixture.openDesktop();
    const invitedAgain = await openWeb(reopened);
    for (const page of [reopened, invitedAgain]) {
      await page.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true }).click();
      await page.getByTestId("plan-directory").locator(`[data-plan-id="${planId}"]`).getByTestId("rule-row").click();
      await expect(page.getByTestId("rule-detail").getByRole("heading", { name: `任务提醒：${title}` })).toBeVisible();
      expect(await call<PlanSummary>(page, "automations.plans.read", planInput)).toMatchObject({
        planId, revision, lastOccurrence: { occurrenceId, at, state: "completed" },
      });
    }
    const notifications = await call<{ id: string; title: string }[]>(reopened, "notifications.list", {});
    const delivered = notifications.filter((notification) => notification.title === `任务提醒：${title}`);
    expect(delivered).toHaveLength(1);
    const occurrence = await call<PlanOccurrence>(reopened, "automations.plans.readOccurrence", { occurrenceId });
    expect(occurrence).toMatchObject({
      occurrenceId, plan: { planId, revision }, state: "completed", timing: { trigger: "scheduled", scheduledFor },
      effects: expect.arrayContaining([expect.objectContaining({
        effectId: delivered[0]!.id, kind: "notification", state: "completed", receiptId: delivered[0]!.id,
      })]),
    });
  } finally {
    try {
      await browser?.close();
    } finally {
      await fixture.dispose();
    }
  }
});
