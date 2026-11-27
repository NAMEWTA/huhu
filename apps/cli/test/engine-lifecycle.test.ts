import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { engineEndpointPath, probeEngine, readEngineEndpoint, Vault } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { connect, engineLifecycle } from "../src/connect.js";
import { run } from "../src/main.js";

const engineEntry = path.resolve(import.meta.dirname, "../../engine/src/main.ts");

test.skipIf(!process.getuid)("常驻 Engine 在无页面时运行计划，CLI 同实例，退出重启后按原身份补偿", { timeout: 55_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-engine-lifecycle-"));
  const other = mkdtempSync(path.join(tmpdir(), "huhu-engine-lifecycle-other-"));
  const command = async (action: string, vault = root, extra: string[] = []) => {
    const output: string[] = [];
    const errors: string[] = [];
    const code = await run(["engine", action, "--vault", vault, "--json", ...extra], { out: (line) => output.push(line), err: (line) => errors.push(line) });
    return { code, ...(output.length > 0 && { result: JSON.parse(output.join("")) }), ...(errors.length > 0 && { error: errors.join("\n") }) };
  };
  const attach = async () => {
    const record = readEngineEndpoint(root);
    if (record.state !== "running") throw new Error(`expected live Engine, got ${record.state}`);
    const { status, rendererToken } = await probeEngine(record.endpoint, "attach");
    const baseUrl = `http://127.0.0.1:${status.port}`;
    const call = async <T = unknown>(capability: string, input: unknown = {}, intentKey?: string): Promise<T> => {
      const response = await fetch(`${baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: intentKey ?? randomUUID(), intentKey }),
      });
      const reply = await response.json();
      if (!reply || typeof reply !== "object" || !("ok" in reply) || reply.ok !== true || !("data" in reply)) {
        throw new Error(`Engine call failed: ${capability} ${JSON.stringify(reply)}`);
      }
      return reply.data as T;
    };
    return { status, baseUrl, call };
  };
  try {
    await (await Vault.open(root, { create: true })).close();
    await (await Vault.open(other, { create: true })).close();
    vi.stubEnv("HUHU_ENGINE_ENTRY", engineEntry);
    vi.stubEnv("HUHU_DESKTOP_USER_DATA", path.join(root, "instance-data"));
    expect(await command("status")).toEqual({ code: 0, result: { state: "stopped" } });
    const duplicates = await Promise.all([command("start"), command("start")]);
    expect(duplicates[0]).toMatchObject({ code: 0, result: { state: "running", mode: "resident", pid: expect.any(Number) } });
    expect(duplicates[1]).toEqual(duplicates[0]);
    expect(duplicates[0].result).not.toHaveProperty("cliToken");
    expect(duplicates[0].result).not.toHaveProperty("rendererToken");
    expect(await command("start", root, ["--mode", "temporary"])).toMatchObject({ code: 3, error: expect.stringContaining("请先停止") });

    let host = await attach();
    expect(await connect(root, { engineEntry: "" })).toMatchObject({ baseUrl: host.baseUrl, vaultId: host.status.vaultId });
    await host.call("gateway.mcp.update", { enabled: true });
    mkdirSync(path.dirname(engineEndpointPath(other)), { recursive: true });
    copyFileSync(engineEndpointPath(root), engineEndpointPath(other));
    expect(await command("stop", other)).toMatchObject({ code: 3, error: expect.stringContaining("不属于所选 Vault") });
    expect(await command("status")).toEqual(duplicates[0]);

    const online = new Date(Date.now() + 3_000);
    const cron = [online.getUTCSeconds(), online.getUTCMinutes(), online.getUTCHours(), online.getUTCDate(), online.getUTCMonth() + 1, "*"].join(" ");
    const rule = await host.call<{ id: string; version: string }>("automations.create", { title: "在线", trigger: { preset: "custom", cron, zone: "UTC" }, action: { kind: "reminder", mode: "notification", text: "在线" } });
    await host.call("automations.setEnabled", { id: rule.id, expectedVersion: rule.version, enabled: true });
    await expect.poll(() => host.call("notifications.list"), { timeout: 7_000 }).toMatchObject([{ title: "在线" }]);
    const addReminder = async (title: string, at: string, enabled = true) => {
      const task = await host.call<{ id: string }>("tasks.create", { title, type: "human" });
      const intentId = randomUUID();
      const plan = await host.call<{ planId: string; revision: string }>("automations.plans.createTaskReminder", { taskId: task.id, scheduledFor: at, intentId }, intentId);
      if (enabled) return;
      const pauseIntent = randomUUID();
      expect(await host.call("automations.plans.submit", { planId: plan.planId, expectedRevision: plan.revision, intentId: pauseIntent, change: "set-intent", intent: "paused" }, pauseIntent)).toMatchObject({ outcome: "completed" });
    };
    const future = new Date(Date.now() + 3_100).toISOString();
    await addReminder("停机期间到点", future);
    await addReminder("已停用", future, false);
    expect(await command("stop")).toEqual({ code: 0, result: { state: "stopped" } });
    expect(readEngineEndpoint(root).state).toBe("stopped");
    await delay(Math.max(0, Date.parse(future) - Date.now() + 150));

    const firstUrl = host.baseUrl;
    expect(await command("start")).toMatchObject({ code: 0, result: { mode: "resident", state: "running" } });
    host = await attach();
    expect(host.baseUrl).toBe(firstUrl);
    const check = async () => {
      const notifications = await host.call<{ title: string }[]>("notifications.list");
      expect(notifications.map(({ title }) => title).sort()).toEqual(["任务提醒：停机期间到点", "在线"].sort());
    };
    await expect
      .poll(
        async () => {
          await check();
          return true;
        },
        { timeout: 5_000 },
      )
      .toBe(true);
    await command("stop");
    await engineLifecycle("start", root, "temporary", { engineEntry, idleExitMs: 850 });
    host = await attach();
    expect(host.status.mode).toBe("temporary");
    await check();
    await expect.poll(() => readEngineEndpoint(root).state, { timeout: 5_000 }).toBe("stopped");
  } finally {
    try {
      await engineLifecycle("stop", root);
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  }
});
