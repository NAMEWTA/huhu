import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityOperationLookup, CapabilityResult, TaskDto } from "@huhu/contracts";
import { OperationReceipts } from "@huhu/kernel";
import { directoryInstance, OperationLog } from "@huhu/vault";
import { expect, test } from "vitest";
import { EngineClient, type EngineEndpoint } from "../../../packages/workbench/src/engine-client/client.js";
import { boot, type RunningEngine } from "../src/boot.js";

type Entry = { endpoint: EngineEndpoint; headers: Record<string, string> };

function desktop(engine: RunningEngine): Entry {
  return {
    endpoint: { baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id },
    headers: { authorization: `Bearer ${engine.rendererToken}` },
  };
}

async function call<T>(entry: Entry, capability: string, input: unknown, intentKey?: string): Promise<CapabilityResult<T>> {
  const requestId = randomUUID();
  const response = await fetch(`${entry.endpoint.baseUrl}/api/v1/call`, {
    method: "POST",
    headers: { "content-type": "application/json", ...entry.headers },
    body: JSON.stringify({ capability, input, requestId, idempotencyKey: requestId, intentKey }),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<CapabilityResult<T>>;
}

function committed<T>(result: CapabilityResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function lookup(entry: Entry, identity: CapabilityOperationLookup): Promise<unknown> {
  const query = new URLSearchParams(identity);
  const response = await fetch(`${entry.endpoint.baseUrl}/api/v1/operations?${query}`, { headers: entry.headers });
  expect(response.status).toBe(200);
  return response.json();
}

const noReceipt = { ok: false, error: { code: "NOT_FOUND" } };

async function invite(host: Entry): Promise<Entry> {
  const addresses = committed(await call<{ addresses: { url: string }[] }>(host, "web.share.start", { mode: "local" })).addresses;
  const [link] = committed(await call<{ links: string[] }>(host, "web.invitations.create", {})).links;
  const origin = new URL(addresses[0]!.url).origin;
  const inviteToken = new URLSearchParams(new URL(link!).hash.slice(1)).get("invite");
  const joined = await fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${inviteToken}` } });
  expect(joined.status).toBe(204);
  return { endpoint: { baseUrl: origin, vaultId: host.endpoint.vaultId }, headers: { origin, cookie: joined.headers.get("set-cookie")!.split(";")[0]! } };
}

function clientWithoutReply(entry: Entry, intentKey?: string) {
  return new EngineClient(entry.endpoint, async (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(entry.headers)) headers.set(key, value);
    const body = intentKey ? JSON.stringify({ ...JSON.parse(String(init?.body)), intentKey }) : init?.body;
    const response = await fetch(input, { ...init, headers, ...(body !== undefined && { body }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    return new Response("incomplete reply");
  });
}

test("C12base 桌面和 Web 按原路径、计划修订及派遣标识核实写入", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-c12-workbench-"));
  let engine: RunningEngine | undefined;
  try {
    const vaultPath = path.join(root, "vault");
    const webAssetsDir = path.join(root, "web");
    mkdirSync(vaultPath);
    mkdirSync(webAssetsDir);
    writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>Workbench fixture</title>");
    engine = await boot({ vaultPath, webAssetsDir, create: true });
    const local = desktop(engine);
    const web = await invite(local);
    const log = new OperationLog(engine.vault.files, path.join(engine.vault.stateDir, "operations"));

    for (const [name, entry, other] of [
      ["desktop", local, web],
      ["web", web, local],
    ] as const) {
      // Notes 持久意图归调用主体。Vault 日志用其自己的步骤身份核对实际发布。
      const attachment = { name: `${name}.txt`, dataBase64: Buffer.from(name).toString("base64") };
      const rejectedIntent = randomUUID();
      expect(await call(entry, "notes.attach", { ...attachment, dataBase64: "" }, rejectedIntent)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(engine.vault.files.exists(`attachments/${attachment.name}`)).toBe(false);
      expect(await lookup(entry, { capability: "notes.attach", intentKey: rejectedIntent })).toMatchObject({ data: { state: "failed" } });
      const attachmentIntent = randomUUID();
      const noteIdentity = { capability: "notes.attach", intentKey: attachmentIntent };
      expect(await lookup(entry, noteIdentity)).toMatchObject(noReceipt);
      await expect(clientWithoutReply(entry, attachmentIntent).call("notes.attach", attachment, { write: true })).rejects.toMatchObject({ details: { outcome: "unknown" } });
      const receipt = await lookup(entry, noteIdentity);
      const attached = await call<{ path: string }>(entry, "notes.attach", attachment, attachmentIntent);
      if (!attached.ok) throw new Error(attached.error.message);
      const attachedPath = attached.data.path;
      expect(attached.opId).toEqual(expect.any(String));
      const matching = log.list().filter(({ steps }) => steps.some((step) => step.path === attachedPath));
      expect(matching).toHaveLength(1);
      const [published] = matching;
      expect(published).toMatchObject({ opId: expect.any(String), state: "committed", steps: [{ path: attachedPath, done: true, creationStageIdentity: expect.any(String) }] });
      expect(log.load(published!.opId)).toEqual(published);
      expect(readFileSync(path.join(vaultPath, attachedPath), "utf8")).toBe(name);
      expect(receipt).toMatchObject({ data: { operationId: attached.opId, state: "completed", result: attached } });
      expect(await lookup(other, noteIdentity)).toMatchObject(noReceipt);

      // 计划先拒绝过期任务版本。响应丢失后按同一任务读取已提交的计划修订。
      const created = committed(
        await call<TaskDto>(entry, "tasks.create", { title: name, type: "agent", body: "C12base", execution: { spaceId: "space-fixture-unavailable", provider: "codex" } }),
      );
      const taskId = created.id;
      const plan = { taskId, scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), expectedRevision: null, expectedTaskVersion: created.version };
      const schedule = "automations.followUps.schedule";
      expect(await call(entry, schedule, { ...plan, expectedTaskVersion: "stale" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await call(entry, "automations.followUps.get", { taskId })).toEqual({ ok: true, data: null });
      const unchecked = clientWithoutReply(entry);
      await expect(unchecked.call(schedule, plan, { write: true })).rejects.toMatchObject({ details: { outcome: "unknown" } });
      const followUp = await call(entry, "automations.followUps.get", { taskId });
      expect(followUp).toMatchObject({ ok: true, data: { taskId, scheduledFor: plan.scheduledFor, revision: expect.any(String), followUpId: expect.any(String), state: "scheduled" } });
      expect(await call(other, "automations.followUps.get", { taskId })).toEqual(followUp);

      // 受控派遣只验证本地受理回执。不存在的 Space 使样例不会启动 CLI。
      const dispatchId = randomUUID();
      const dispatch = { taskId, dispatchId, inputHash: created.inputHash, inputRevision: created.inputRevision, expectedVersion: created.version };
      const dispatchIdentity = { taskId, dispatchId };
      expect(await call(entry, "tasks.dispatch", { ...dispatch, inputHash: "0000000000000000" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await call(entry, "tasks.dispatch.read", dispatchIdentity)).toMatchObject(noReceipt);
      await expect(unchecked.call("tasks.dispatch", dispatch, { write: true })).rejects.toMatchObject({ details: { outcome: "unknown" } });
      const accepted = await call<{ eventId: string; runId: string }>(entry, "tasks.dispatch.read", dispatchIdentity);
      expect(accepted).toMatchObject({ ok: true, data: { taskId, dispatchId, eventId: expect.any(String), runId: expect.any(String) } });
      const { eventId, runId } = committed(accepted);
      expect(await call(other, "tasks.dispatch.read", dispatchIdentity)).toMatchObject({ ok: true, data: { eventId, runId } });
      expect(await call(entry, "tasks.dispatch", dispatch)).toMatchObject({ ok: true, data: { eventId, runId } });
    }
  } finally {
    await engine?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test("C12base HTTP 主体在重启后以原意图区分未受理、已提交和未知", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-c12-http-"));
  let engine: RunningEngine | undefined;
  try {
    engine = await boot({ vaultPath: root, create: true });
    const local = desktop(engine);
    const capability = "tasks.create";
    committed(await call(local, "gateway.update", { capability, exposed: true }));
    const owner = committed(await call<{ id: string; token: string }>(local, "gateway.tokens.create", { name: "owner" }));
    const stranger = committed(await call<{ id: string; token: string }>(local, "gateway.tokens.create", { name: "stranger" }));
    const http = (host: RunningEngine, credential: { token: string }): Entry => ({
      endpoint: { baseUrl: `http://127.0.0.1:${host.port}`, token: credential.token, vaultId: host.vault.id },
      headers: { authorization: `Bearer ${credential.token}` },
    });
    const submitted = { capability, intentKey: randomUUID() };
    const unsubmitted = { capability, intentKey: randomUUID() };
    const unknown = { capability, intentKey: randomUUID() };
    const input = { title: "C12 HTTP committed", type: "human" };
    const first = await call(http(engine, owner), capability, input, submitted.intentKey);
    if (!first.ok) throw new Error(first.error.message);
    expect(first).toMatchObject({ ok: true, opId: expect.any(String) });
    expect(await call(http(engine, owner), capability, {}, unsubmitted.intentKey)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const vaultInstance = directoryInstance(engine.vault.root);
    if (!vaultInstance) throw new Error("缺少 Vault 文件系统身份");
    const file = path.join(engine.vault.runtimeDir, "invocation-intents.ndjson");
    const ownerKey = JSON.stringify([JSON.stringify([engine.vault.id, ...vaultInstance]), "http", owner.id]);
    const admittedInput = engine.registry.get(capability)!.input.parse(input) as unknown;
    // 模拟受理记录已持久化、进程在调用 handler 前退出的磁盘现场。
    await engine.shutdown();
    engine = undefined;
    const { entry } = new OperationReceipts(file).claim(ownerKey, capability, unknown.intentKey, admittedInput);
    engine = await boot({ vaultPath: root });
    const same = http(engine, owner);
    const different = http(engine, stranger);
    expect(await lookup(same, unsubmitted)).toMatchObject(noReceipt);
    expect(await lookup(same, submitted)).toMatchObject({ data: { operationId: first.opId, state: "completed", result: first } });
    expect(await lookup(same, unknown)).toMatchObject({ data: { operationId: entry.operationId, state: "unknown" } });
    expect(await lookup(different, { operationId: entry.operationId })).toMatchObject(noReceipt);
    expect(await lookup(different, submitted)).toMatchObject(noReceipt);
    expect(await call(same, capability, input, unknown.intentKey)).toMatchObject({ ok: false, error: { retryable: false, details: { operationId: entry.operationId, outcome: "unknown" } } });
    expect(await call(same, capability, input, submitted.intentKey)).toEqual(first);
    expect(committed(await call<TaskDto[]>(desktop(engine), "tasks.list", { query: input.title })).filter((task) => task.title === input.title)).toHaveLength(1);
  } finally {
    await engine?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});
