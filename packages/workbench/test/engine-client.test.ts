import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";
import { CapabilityError, EngineClient, EventStream, invalidateForEvent, queryKey } from "../src/index.js";

const endpoint = { baseUrl: "http://127.0.0.1:1", token: "t", vaultId: "vault-a" };

describe("EngineClient", () => {
  test("成功返回 data；写入带幂等键；业务错误抛 CapabilityError", async () => {
    const calls: { body: Record<string, unknown> }[] = [];
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ body });
      return new Response(JSON.stringify(body["capability"] === "bad" ? { ok: false, error: { code: "NOT_FOUND", message: "没了", retryable: false } } : { ok: true, data: { n: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new EngineClient(endpoint, f);
    expect(await c.call("x.read")).toEqual({ n: 1 });
    expect(calls[0]?.body["idempotencyKey"]).toBeUndefined();
    await c.call("x.write", {}, { write: true });
    expect(calls[1]?.body["idempotencyKey"]).toBeTypeOf("string");
    await expect(c.call("bad")).rejects.toMatchObject({ name: "CapabilityError", code: "NOT_FOUND" });
    expect(CapabilityError).toBeDefined();
  });
  test("401 → UNAUTHENTICATED", async () => {
    const c = new EngineClient(endpoint, (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch);
    await expect(c.call("x")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

class FakeWS {
  static instances: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string, public protocols: string[]) { FakeWS.instances.push(this); }
  close() { this.onclose?.(); }
}

describe("EventStream", () => {
  test("丢弃其他 Vault 的事件；重连带 lastSeq/epoch；resync 触发回调", async () => {
    FakeWS.instances = [];
    const events: unknown[] = [];
    let resyncs = 0;
    const s = new EventStream(endpoint, { onEvent: (e) => events.push(e), onResync: () => resyncs++, WebSocketImpl: FakeWS as never, backoffMs: () => 1 });
    s.start();
    const ws = FakeWS.instances[0] as FakeWS;
    expect(ws.protocols).toEqual(["bearer.t"]);
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "hello", seq: 0, epoch: "e1" }) });
    ws.onmessage?.({ data: JSON.stringify({ type: "entity.changed", seq: 1, vaultId: "vault-a", payload: {} }) });
    ws.onmessage?.({ data: JSON.stringify({ type: "entity.changed", seq: 2, vaultId: "vault-OTHER", payload: {} }) });
    expect(events).toHaveLength(1);
    ws.onclose?.();
    await new Promise((r) => setTimeout(r, 20));
    const ws2 = FakeWS.instances[1] as FakeWS;
    expect(ws2.url).toContain("lastSeq=2");
    expect(ws2.url).toContain("epoch=e1");
    ws2.onmessage?.({ data: JSON.stringify({ type: "resync", seq: 9, epoch: "e2" }) });
    expect(resyncs).toBe(1);
    s.close();
    const n = FakeWS.instances.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeWS.instances.length).toBe(n); // 关闭后不再重连
  });
});

describe("查询失效", () => {
  test("entity.changed(task) 只让同 Vault 的 tasks.* 查询失效", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("vault-a", "tasks.list"), []);
    qc.setQueryData(queryKey("vault-a", "notes.list"), []);
    qc.setQueryData(queryKey("vault-b", "tasks.list"), []);
    await invalidateForEvent(qc, "vault-a", { type: "entity.changed", payload: { kind: "task", id: "task-1", op: "updated" } });
    expect(qc.getQueryState(queryKey("vault-a", "tasks.list"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("vault-a", "notes.list"))?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKey("vault-b", "tasks.list"))?.isInvalidated).toBe(false);
  });
  test("首页与健康汇总查询随实体变化失效", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("vault-a", "home.summary"), {});
    qc.setQueryData(queryKey("vault-a", "health.run"), {});
    await invalidateForEvent(qc, "vault-a", { type: "entity.changed", payload: { kind: "task", id: "task-1", op: "created" } });
    expect(qc.getQueryState(queryKey("vault-a", "home.summary"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("vault-a", "health.run"))?.isInvalidated).toBe(true);
  });
});

describe("通知与自动化事件失效", () => {
  test("notification.created 让 notifications.* 失效；automation.activated 让 automations.* 失效", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("v", "notifications.list"), []);
    qc.setQueryData(queryKey("v", "automations.activations"), []);
    await invalidateForEvent(qc, "v", { type: "notification.created", payload: { id: "n", title: "t", module: "m" } });
    expect(qc.getQueryState(queryKey("v", "notifications.list"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("v", "automations.activations"))?.isInvalidated).toBe(false);
    await invalidateForEvent(qc, "v", { type: "automation.activated", payload: { ruleId: "r", activationId: "a", trigger: "manual" } });
    expect(qc.getQueryState(queryKey("v", "automations.activations"))?.isInvalidated).toBe(true);
  });
});
