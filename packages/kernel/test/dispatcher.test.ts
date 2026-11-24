import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { getEventListeners } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore, OperationReceipts, defineCapability } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(
  opts: {
    enabled?: boolean;
    exposure?: boolean | undefined;
    granted?: string[];
    auditFile?: string;
    timeoutMs?: number;
    operations?: { ledger: OperationReceipts; vaultInstance: string };
    invalidOutput?: boolean;
    extraField?: boolean;
    externalIntent?: boolean;
  } = {},
) {
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
      idempotency: "durable",
      ...(opts.externalIntent && { externalIntentRequired: true as const }),
      handler: (_c, i) => {
        calls++;
        return { n: opts.invalidOutput ? ("wrong-output-fixture" as unknown as number) : calls + i.title.length, ...(opts.extraField && { hidden: "private-projection-fixture" }) };
      },
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
    ...(opts.operations && { operations: opts.operations }),
    isPluginEnabled: (p) => (opts.enabled === false ? p !== "tasks" : true),
    toolAccess: () => ({ state: "ready", revision: 0, choices: { "vault.info": opts.exposure === true, "tasks.create": opts.exposure === true } }),
    grantedPermissions: () => opts.granted ?? [],
    pluginOrigin: () => "external",
    log: (...a) => logs.push(a),
  });
  return { d, audit, logs, dir, calls: () => calls };
}
const req = (capability: string, input: unknown = {}, idempotencyKey?: string) => ({ capability, input, requestId: "r1", ...(idempotencyKey ? { idempotencyKey } : {}) });
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error?.code);

describe("Dispatcher 管线", () => {
  test("收据以完整记录恢复，最后无换行仍可追加，半行拒绝受理且保留旧结果", async () => {
    const { dir } = setup();
    const file = path.join(dir, "durable.jsonl");
    const vaultInstance = "isolated-vault";
    const attach = () => setup({ operations: { ledger: new OperationReceipts(file), vaultInstance }, exposure: true, extraField: true });
    const one = { ...req("tasks.create", { title: "开始" }), intentKey: "operation-one" };
    const first = await attach().d.call("cli", one);
    expect(first).toMatchObject({ ok: true, data: { n: 3 } });
    if (!first.ok || !first.opId) throw new Error("Expected stored receipt");
    expect(Object.keys(first.data as object)).toEqual(["n"]);
    expect(readFileSync(file, "utf8")).not.toContain("private-projection-fixture");
    writeFileSync(file, readFileSync(file, "utf8").trimEnd());
    const two = { ...one, intentKey: "operation-two" };
    const second = await attach().d.call("cli", two);
    expect(second).toMatchObject({ ok: true });
    expect(await attach().d.call("cli", one)).toEqual(first);
    expect(await attach().d.call("cli", two)).toEqual(second);
    appendFileSync(file, "{");
    const damaged = attach();
    expect(damaged.d.readOperation("cli", "cli", { operationId: first.opId })).toMatchObject({ ok: true, data: { state: "completed", result: first } });
    const rejected = await damaged.d.call("cli", { ...one, intentKey: "operation-three" });
    expect(rejected).toMatchObject({ ok: false, error: { retryable: false, details: { outcome: "not-accepted" } } });
    expect(damaged.calls()).toBe(0);
    expect(JSON.stringify(rejected)).not.toContain("operationId");
  });

  test("要求外部意图的能力：CLI/MCP/HTTP 缺意图键即使带旧幂等键也零执行零受理，工作台不受影响", async () => {
    const { dir } = setup();
    const file = path.join(dir, "durable.jsonl");
    const { d, calls } = setup({ operations: { ledger: new OperationReceipts(file), vaultInstance: "isolated-vault" }, exposure: true, externalIntent: true });
    for (const caller of ["cli", "mcp", "http"] as const) {
      const rejected = await d.call(caller, req("tasks.create", { title: "合成" }, `legacy-${caller}-key`));
      expect(rejected).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(calls()).toBe(0);
    expect(existsSync(file)).toBe(false);
    const intent = { ...req("tasks.create", { title: "合成" }), intentKey: "stable-intent-one" };
    const [a, b] = await Promise.all([d.call("cli", intent), d.call("cli", intent)]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect(calls()).toBe(1);
    expect((await d.call("desktop", req("tasks.create", { title: "合成" }, "desktop-key-1"))).ok).toBe(true);
    expect(calls()).toBe(2);
  });

  test("旧幂等键也按受信主体隔离", async () => {
    const { d, calls } = setup({ exposure: true });
    const same = req("tasks.create", { title: "合成" }, "legacy-wire-key");
    const one = await d.call("http", same, undefined, "service-one");
    const two = await d.call("http", same, undefined, "service-two");
    expect(one).toEqual({ ok: true, data: { n: 3 } });
    expect(two).toEqual({ ok: true, data: { n: 4 } });
    expect(await d.call("http", same, undefined, "service-one")).toEqual(one);
    expect(calls()).toBe(2);
  });

  test("已受理的持久意图重启后只能查询，直到领域能证明结果", async () => {
    const { dir } = setup();
    const file = path.join(dir, "durable.jsonl");
    const vaultInstance = "isolated-vault";
    const request = { ...req("tasks.create", { title: "合成任务" }), intentKey: "stable-accepted" };
    const accepted = new OperationReceipts(file).claim(JSON.stringify([vaultInstance, "http", "service-one"]), request.capability, request.intentKey, request.input);
    const { d, calls } = setup({ operations: { ledger: new OperationReceipts(file), vaultInstance }, exposure: true });
    const { operationId } = accepted.entry;
    expect(d.readOperation("http", "service-two", { operationId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(d.readOperation("http", "service-one", { operationId })).toMatchObject({ ok: true, data: { state: "unknown", operationId } });
    expect(await d.call("http", request, undefined, "service-one")).toMatchObject({ ok: false, error: { retryable: false, details: { operationId, outcome: "unknown" } } });
    expect(calls()).toBe(0);
  });

  test("副作用后的坏输出只留待核实回执，提交同一意图不重放", async () => {
    const { dir } = setup();
    const file = path.join(dir, "durable.jsonl");
    const operation = { ledger: new OperationReceipts(file), vaultInstance: "isolated-vault" };
    const { d, calls } = setup({ operations: operation, exposure: true, invalidOutput: true });
    const request = { ...req("tasks.create", { title: "合成任务" }), intentKey: "stable-invalid-output" };
    const first = await d.call("cli", request);
    expect(first).toMatchObject({ ok: false, error: { retryable: false, details: { operationId: expect.any(String), outcome: "unknown", verification: "invalid-output" } } });
    expect(await d.call("cli", request)).toEqual(first);
    expect(d.readOperation("cli", "cli", { capability: request.capability, intentKey: request.intentKey })).toMatchObject({ ok: true, data: { state: "invalid-output" } });
    expect(calls()).toBe(1);
    expect(readFileSync(file, "utf8")).not.toContain("wrong-output-fixture");
  });

  test("能力不存在", async () => expect(code((await setup().d.call("desktop", req("nope"))) as never)).toBe("CAPABILITY_NOT_FOUND"));
  test("插件停用", async () => expect(code((await setup({ enabled: false }).d.call("desktop", req("tasks.create", { title: "a" }))) as never)).toBe("PLUGIN_DISABLED"));
  test("桌面可调用不对外的能力", async () => expect((await setup().d.call("desktop", req("safe.reveal"))).ok).toBe(true));
  test("外部入口：不可暴露/默认关闭/开放后可用", async () => {
    expect(code((await setup().d.call("cli", req("safe.reveal"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
    expect(code((await setup().d.call("cli", req("tasks.create", { title: "a" }, "key-12345"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
    expect(code((await setup().d.call("cli", req("vault.info"))) as never)).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await setup({ exposure: true }).d.call("cli", req("vault.info"))).ok).toBe(true);
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
    const d = new Dispatcher({
      registry,
      audit: new GatewayAudit(),
      idempotency: new IdempotencyStore(),
      isPluginEnabled: () => true,
      toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
      grantedPermissions: () => [],
      pluginOrigin: () => "external",
    });
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
    const s = setup({ exposure: true });
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

describe("F15 Dispatcher 取消边界", () => {
  test("已取消的工作台、外部和插件调用不会执行或写入回执", async () => {
    const { dir } = setup();
    const operationFile = path.join(dir, "operations.jsonl");
    const ledger = new OperationReceipts(operationFile);
    const invoked: string[] = [];
    const registry = new CapabilityRegistry();
    for (const scope of ["read", "write", "execute", "admin"] as const) {
      registry.register(defineCapability({
        name: `test.${scope}`, plugin: "test", scope, input: z.object({}), output: z.string(), exposable: true,
        defaultExposed: false, ...(scope === "write" && { idempotency: "durable" as const }),
        handler: () => { invoked.push(scope); return scope; },
      }));
    }
    const legacyFile = path.join(dir, "cancelled-idem.ndjson");
    const auditFile = path.join(dir, "cancelled-audit.ndjson");
    const dispatcher = new Dispatcher({
      registry, audit: new GatewayAudit(auditFile), idempotency: new IdempotencyStore(legacyFile),
      operations: { vaultInstance: "fixture", ledger }, isPluginEnabled: () => true,
      toolAccess: () => ({ state: "ready", revision: 0, choices: { "test.write": true } }),
      pluginOrigin: () => "builtin", grantedPermissions: () => ["test.write"],
    });
    const signal = AbortSignal.abort();
    for (const scope of ["read", "write", "execute", "admin"]) {
      expect(await dispatcher.call("desktop", req(`test.${scope}`, {}, "legacy-key"), signal)).toMatchObject({
        ok: false, error: { code: "INVALID_INPUT", details: { outcome: "not-accepted" } },
      });
    }
    for (const caller of ["cli", "plugin:fixture"] as const) {
      expect(await dispatcher.call(caller, { ...req("test.write"), intentKey: "stable-write" }, signal)).toMatchObject({
        ok: false, error: { details: { outcome: "not-accepted" } },
      });
    }
    expect(invoked).toEqual([]);
    for (const file of [operationFile, legacyFile, auditFile]) expect(existsSync(file)).toBe(false);
    expect(await dispatcher.call("desktop", req("test.write", {}, "legacy-key"))).toEqual({ ok: true, data: "write" });
  });

  test("输入解析期间取消不会调用 handler，受理之后取消可查询回执", async () => {
    const { dir } = setup();
    const abortOnParse = new AbortController();
    const waiting = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const registry = new CapabilityRegistry();
    let executions = 0;
    registry.register(defineCapability({
      name: "test.write", plugin: "test", scope: "write",
      input: z.object({ abort: z.boolean() }).transform((input) => {
        if (input.abort) abortOnParse.abort();
        return input;
      }),
      output: z.string(), exposable: false, defaultExposed: false, idempotency: "durable",
      handler: (context) => {
        executions++;
        markStarted();
        return new Promise<string>((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new HuhuError("INVALID_INPUT", "cooperative stop")), { once: true });
        });
      },
    }));
    const dispatcher = new Dispatcher({
      registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(),
      operations: { vaultInstance: "fixture", ledger: new OperationReceipts(path.join(dir, "operations.jsonl")) },
      isPluginEnabled: () => true, toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
      pluginOrigin: () => "builtin", grantedPermissions: () => [],
    });
    expect(await dispatcher.call("desktop", req("test.write", { abort: true }, "legacy-key"), abortOnParse.signal)).toMatchObject({
      ok: false, error: { details: { outcome: "not-accepted" } },
    });
    expect(executions).toBe(0);
    const request = { ...req("test.write", { abort: false }), intentKey: "accepted-write" };
    const result = dispatcher.call("desktop", request, waiting.signal);
    await started;
    waiting.abort();
    expect(await result).toMatchObject({ ok: false, error: { code: "INTERNAL", retryable: false, details: { outcome: "unknown" } } });
    expect(dispatcher.readOperation("desktop", "desktop", { capability: "test.write", intentKey: "accepted-write" })).toMatchObject({ ok: true, data: { state: "unknown" } });
    expect(executions).toBe(1);
  });
});

describe("F16 公共输出投影", () => {
  test("普通调用、命中旧缓存和回执查询都使用同一输出规则", async () => {
    const { dir } = setup();
    const { d, calls } = setup({ exposure: true, extraField: true });
    const reqLegacy = req("tasks.create", { title: "AB" }, "legacy-output-key");
    const expected = { ok: true, data: { n: 3 } };
    for (const caller of ["desktop", "web:fixture", "cli", "mcp", "http"] as const) {
      const result = await d.call(caller, reqLegacy);
      expect(result).toEqual({ ok: true, data: { n: 2 + calls() } });
      expect(await d.call(caller, reqLegacy)).toEqual(result);
    }
    expect(calls()).toBe(5);

    const vaultInstance = "vault-for-output";
    const ledger = new OperationReceipts(path.join(dir, "output-receipts.ndjson"));
    const owner = JSON.stringify([vaultInstance, "http", "http"]);
    const { entry } = ledger.claim(owner, reqLegacy.capability, "old-public-result", reqLegacy.input);
    if (entry.phase !== "accepted") throw new Error("expected fresh test receipt");
    ledger.complete(entry, "completed", { ok: true, data: { n: 3, privateKey: "discard-me" }, opId: entry.operationId });
    const replay = setup({ exposure: true, operations: { vaultInstance, ledger } });
    expect(await replay.d.call("http", { ...reqLegacy, intentKey: "old-public-result" })).toEqual({ ...expected, opId: entry.operationId });
    const receipt = replay.d.readOperation("http", "http", { operationId: entry.operationId });
    expect(receipt).toMatchObject({ ok: true, data: { state: "completed", result: expected } });
    expect(JSON.stringify(receipt)).not.toContain("privateKey");
    expect(replay.calls()).toBe(0);
  });

  test("普通写入返回坏 DTO 时副作用只执行一次，缓存和重启也返回待核实", async () => {
    const { d, calls, dir } = setup({ invalidOutput: true });
    const request = req("tasks.create", { title: "fixture" }, "bad-output-key");
    const first = await d.call("desktop", request);
    expect(first).toMatchObject({ ok: false, error: { code: "INTERNAL", retryable: false, details: { verification: "invalid-output", outcome: "unknown" } } });
    expect(await d.call("desktop", request)).toEqual(first);
    expect(calls()).toBe(1);
    const saved = new IdempotencyStore(path.join(dir, "idem.ndjson")).lookup("desktop", "tasks.create", "bad-output-key", request.input);
    expect(saved).toMatchObject({ hit: true, result: first });
    expect(JSON.stringify(saved)).not.toContain("wrong-output-fixture");
  });

  test("高频递归联合输出每次调用只处理一遍，读错误返回可重试 INTERNAL", async () => {
    type Item = { kind: "leaf"; value: number } | { kind: "branch"; children: Item[] };
    let leaves = 0;
    const item: z.ZodType<Item> = z.lazy(() => z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("leaf"), value: z.number().refine(() => { leaves++; return true; }) }),
      z.object({ kind: z.literal("branch"), children: z.array(item) }),
    ]));
    const registry = new CapabilityRegistry();
    const children = Array.from({ length: 200 }, (_, value) => ({ kind: "leaf" as const, value, internal: true }));
    registry.register(defineCapability({
      name: "test.tree", plugin: "test", scope: "read", input: z.object({ invalid: z.boolean() }), output: item,
      exposable: true, defaultExposed: false,
      handler: (_context, { invalid }) => invalid ? { kind: "leaf", value: "bad" as unknown as number } : { kind: "branch", children },
    }));
    const dispatcher = new Dispatcher({
      registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(),
      isPluginEnabled: () => true, toolAccess: () => ({ state: "ready", revision: 0, choices: { "test.tree": true } }),
      pluginOrigin: () => "builtin", grantedPermissions: () => [],
    });
    const started = performance.now();
    for (let run = 0; run < 100; run++) {
      const result = await dispatcher.call("desktop", req("test.tree", { invalid: false }));
      expect(result.ok).toBe(true);
      if (run === 0) expect(result).toEqual({ ok: true, data: { kind: "branch", children: children.map(({ value, kind }) => ({ kind, value })) } });
    }
    console.info(`F16 投影测量，100 次调用 / 20,000 个叶节点，${(performance.now() - started).toFixed(1)} ms`);
    expect(leaves).toBe(20_000);
    expect(await dispatcher.call("http", req("test.tree", { invalid: true }))).toMatchObject({
      ok: false, error: { code: "INTERNAL", retryable: true, details: { verification: "invalid-output" } },
    });
  });
});
