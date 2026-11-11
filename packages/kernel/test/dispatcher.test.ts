import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { getEventListeners } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore, defineCapability } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(opts: { enabled?: boolean; exposure?: boolean | undefined; granted?: string[]; auditFile?: string; timeoutMs?: number } = {}) {
  const registry = new CapabilityRegistry();
  let calls = 0;
  registry.register(
    defineCapability({
      name: "tasks.create",
      plugin: "tasks",
      scope: "write",
      input: z.object({ title: z.string() }),
      output: z.object({ n: z.number() }),
      exposable: true,
      defaultExposed: false,
      handler: (_c, i) => ({ n: ++calls + i.title.length }),
    }),
  );
  registry.register(
    defineCapability({
      name: "vault.info",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      exposable: true,
      defaultExposed: true,
      handler: () => ({ ok: true }),
    }),
  );
  registry.register(
    defineCapability({
      name: "safe.reveal",
      plugin: "safe",
      scope: "admin",
      input: z.object({}),
      output: z.string(),
      exposable: false,
      defaultExposed: false,
      handler: () => "secret",
    }),
  );
  registry.register(
    defineCapability({
      name: "x.boom",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.unknown(),
      exposable: true,
      defaultExposed: true,
      handler: () => {
        throw new Error("kaboom");
      },
    }),
  );
  registry.register(
    defineCapability({
      name: "x.busi",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.unknown(),
      exposable: true,
      defaultExposed: true,
      handler: () => {
        throw new HuhuError("NOT_FOUND", "没了");
      },
    }),
  );
  registry.register(
    defineCapability({
      name: "x.slow",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.unknown(),
      exposable: true,
      defaultExposed: true,
      timeoutMs: opts.timeoutMs ?? 20,
      handler: (c) => new Promise((_, rej) => c.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    }),
  );
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-k-"));
  dirs.push(dir);
  const audit = new GatewayAudit(opts.auditFile ?? path.join(dir, "audit.ndjson"));
  const logs: unknown[] = [];
  const d = new Dispatcher({
    registry,
    audit,
    idempotency: new IdempotencyStore(path.join(dir, "idem.ndjson")),
    isPluginEnabled: (p) => (opts.enabled === false ? p !== "tasks" : true),
    exposureOverride: () => opts.exposure,
    grantedPermissions: () => opts.granted ?? [],
    log: (...a) => logs.push(a),
  });
  return { d, audit, logs, dir };
}
const req = (capability: string, input: unknown = {}, idempotencyKey?: string) => ({ capability, input, requestId: "r1", ...(idempotencyKey ? { idempotencyKey } : {}) });
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error?.code);

describe("Dispatcher 管线", () => {
  test("能力不存在", async () => expect(code((await setup().d.call("desktop", req("nope"))) as never)).toBe("CAPABILITY_NOT_FOUND"));
  test("插件停用", async () => expect(code((await setup({ enabled: false }).d.call("desktop", req("tasks.create", { title: "a" }))) as never)).toBe("PLUGIN_DISABLED"));
  test("桌面可调用不对外的能力", async () => expect((await setup().d.call("desktop", req("safe.reveal"))).ok).toBe(true));
  test("外部入口：不可暴露/默认关闭/开放后可用", async () => {
    expect(code((await setup().d.call("cli", req("safe.reveal"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
    expect(code((await setup().d.call("cli", req("tasks.create", { title: "a" }, "key-12345"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await setup().d.call("cli", req("vault.info"))).ok).toBe(true);
    expect((await setup({ exposure: true }).d.call("mcp", req("tasks.create", { title: "a" }, "key-12345"))).ok).toBe(true);
    expect(code((await setup({ exposure: false }).d.call("cli", req("vault.info"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
  });
  test("插件权限", async () => {
    expect(code((await setup().d.call("plugin:foo", req("vault.info"))) as never)).toBe("PERMISSION_DENIED");
    expect((await setup({ granted: ["vault.read"] }).d.call("plugin:foo", req("vault.info"))).ok).toBe(true);
    expect(code((await setup({ granted: ["vault.read"] }).d.call("plugin:foo", req("safe.reveal"))) as never)).toBe("PERMISSION_DENIED");
  });
  test("输入校验", async () => {
    const r = await setup().d.call("desktop", req("tasks.create", { title: 1 }, "k-123456"));
    expect(code(r as never)).toBe("INVALID_INPUT");
    expect(!r.ok && r.error.details?.["issues"]).toBeTruthy();
  });
  test("幂等：同 key 同输入返回首次结果，不重复执行", async () => {
    const { d } = setup();
    const a = await d.call("desktop", req("tasks.create", { title: "ab" }, "key-aaaa"));
    const b = await d.call("desktop", req("tasks.create", { title: "ab" }, "key-aaaa"));
    expect(b).toEqual(a);
    const c = await d.call("desktop", req("tasks.create", { title: "ab" }, "key-bbbb"));
    expect(c).not.toEqual(a);
  });
  test("写入类缺少 idempotencyKey → INVALID_INPUT", async () => {
    expect(code((await setup().d.call("desktop", req("tasks.create", { title: "a" }))) as never)).toBe("INVALID_INPUT");
  });
  test("幂等：并发同 key 只执行一次", async () => {
    const { d } = setup();
    const [a, b] = await Promise.all([d.call("desktop", req("tasks.create", { title: "ab" }, "key-cccc")), d.call("desktop", req("tasks.create", { title: "ab" }, "key-cccc"))]);
    expect(a).toEqual(b);
    const next = await d.call("desktop", req("tasks.create", { title: "ab" }, "key-dddd"));
    expect((next as { data: { n: number } }).data.n).toBe((a as { data: { n: number } }).data.n + 1);
  });
  test("幂等：同 key 不同输入 → IDEMPOTENCY_MISMATCH", async () => {
    const { d } = setup();
    await d.call("desktop", req("tasks.create", { title: "a" }, "key-aaaa"));
    expect(code((await d.call("desktop", req("tasks.create", { title: "b" }, "key-aaaa"))) as never)).toBe("IDEMPOTENCY_MISMATCH");
  });
  test("幂等记录持久化后重启仍有效", async () => {
    const s = setup();
    await s.d.call("desktop", req("tasks.create", { title: "a" }, "key-aaaa"));
    const store2 = new IdempotencyStore(path.join(s.dir, "idem.ndjson"));
    expect(store2.lookup("desktop", "tasks.create", "key-aaaa", { title: "a" }).hit).toBe(true);
  });
  test("HuhuError 原样返回；其他异常转 INTERNAL 并记录", async () => {
    const s = setup();
    expect(code((await s.d.call("desktop", req("x.busi"))) as never)).toBe("NOT_FOUND");
    const r = await s.d.call("desktop", req("x.boom"));
    expect(code(r as never)).toBe("INTERNAL");
    expect(s.logs.length).toBe(1);
  });
  test("handler 超时 → INTERNAL，并触发 signal", async () => {
    expect(code((await setup().d.call("desktop", req("x.slow"))) as never)).toBe("INTERNAL");
  });
  test("写入类超时：结果未知且不重放", async () => {
    const registry = new CapabilityRegistry();
    let runs = 0;
    registry.register(
      defineCapability({
        name: "x.w",
        plugin: "kernel",
        scope: "write",
        input: z.object({}),
        output: z.unknown(),
        exposable: true,
        defaultExposed: true,
        timeoutMs: 10,
        handler: async () => {
          runs++;
          await new Promise((r) => setTimeout(r, 60));
        },
      }),
    );
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-k-"));
    dirs.push(dir);
    const d = new Dispatcher({ registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(), isPluginEnabled: () => true, exposureOverride: () => undefined, grantedPermissions: () => [] });
    const a = await d.call("desktop", req("x.w", {}, "key-slow1"));
    const b = await d.call("desktop", req("x.w", {}, "key-slow1"));
    expect(a).toEqual(b);
    expect(!a.ok && a.error.retryable).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(runs).toBe(1);
  });
  test("共享 signal 上不泄漏监听器", async () => {
    const s = setup();
    const ac = new AbortController();
    for (let i = 0; i < 20; i++) await s.d.call("desktop", req("vault.info"), ac.signal);
    expect(getEventListeners(ac.signal, "abort").length).toBe(0);
  });
  test("客户端断开 → signal abort", async () => {
    const ac = new AbortController();
    const p = setup({ timeoutMs: 5000 }).d.call("desktop", req("x.slow"), ac.signal);
    ac.abort();
    expect(code((await p) as never)).toBe("INTERNAL");
  });
  test("关闭中：写调用 ENGINE_CLOSING，读调用仍可", async () => {
    const { d } = setup();
    d.beginClose();
    expect(code((await d.call("desktop", req("tasks.create", { title: "a" }, "key-aaaa"))) as never)).toBe("ENGINE_CLOSING");
    expect((await d.call("desktop", req("vault.info"))).ok).toBe(true);
  });
  test("审计：只记外部入口，不含输入", async () => {
    const s = setup();
    await s.d.call("cli", req("vault.info", { secret: 1 }));
    await s.d.call("desktop", req("vault.info"));
    const rec = s.audit.list();
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ entry: "cli", capability: "vault.info", code: "OK" });
    expect(readFileSync(path.join(s.dir, "audit.ndjson"), "utf8")).not.toContain("secret");
  });
  test("审计只保留最近 500 条", () => {
    const a = new GatewayAudit();
    for (let i = 0; i < 520; i++) a.add({ at: "", entry: "cli", capability: "c", code: "OK", ms: i });
    expect(a.list().length).toBe(500);
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-a-"));
    dirs.push(dir);
    const f = new GatewayAudit(path.join(dir, "a.ndjson"));
    for (let i = 0; i < 520; i++) f.add({ at: "", entry: "cli", capability: "c", code: "OK", ms: i });
    expect(f.list().length).toBe(500);
    expect(new GatewayAudit(path.join(dir, "a.ndjson")).list().length).toBe(500);
  });
});
