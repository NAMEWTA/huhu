import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";
import { CapabilityError, EngineClient, EventStream, createRequestId, invalidateForEvent, invalidateVaultQueries, queryKey } from "../src/index.js";

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

  test("响应体截断时只有写入报告结果未知", async () => {
    const c = new EngineClient(endpoint, async () => new Response('{"ok":'));
    const error = { code: "INTERNAL", message: "引擎返回了无法解析的响应（HTTP 200）" };
    await expect(c.call("x.write", {}, { write: true })).rejects.toMatchObject({ ...error, details: { outcome: "unknown" } });
    await expect(c.call("x.read")).rejects.toMatchObject({ ...error, details: undefined });
  });

  test.each([{ correlationId: "failed-write" }, { correlationId: "pending-write", outcome: "unknown" }])("已解码的写失败保留 Engine details %j", async (details) => {
    const c = new EngineClient(endpoint, async () => Response.json({ ok: false, error: { code: "INTERNAL", message: "写入失败", details } }));
    await expect(c.call("x.write", {}, { write: true })).rejects.toMatchObject({ code: "INTERNAL", message: "写入失败", details });
  });

  test("普通 HTTP 生成请求 ID，重试同一次写入可带回原键", async () => {
    const source = crypto;
    const calls: { requestId: string; idempotencyKey?: string }[] = [];
    vi.stubGlobal("crypto", { getRandomValues: source.getRandomValues.bind(source) });
    try {
      const c = new EngineClient(endpoint, async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)) as (typeof calls)[number]);
        return Response.json({ ok: true, data: {} });
      });
      const idempotencyKey = createRequestId();
      expect(idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
      await c.call("x.write", {}, { write: true, idempotencyKey });
      await c.call("x.write", {}, { write: true, idempotencyKey });
      expect(calls.map((call) => call.idempotencyKey)).toEqual([idempotencyKey, idempotencyKey]);
      expect(calls.every((call) => /^[0-9a-f]{32}$/.test(call.requestId))).toBe(true);
      expect(calls[0]?.requestId).not.toBe(calls[1]?.requestId);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

class FakeWS {
  static instances: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWS.instances.push(this);
  }
  close() {
    this.onclose?.();
  }
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

const fileChanged = { type: "vault.fileChanged", payload: { path: "Tasks/task.md", change: "modified" } } as const;

function watchVersion(qc: QueryClient, key: ReturnType<typeof queryKey>, read: () => number, cached = true) {
  const requests: { version: number; signal: AbortSignal; finish(): void; fail(): void }[] = [];
  if (cached) qc.setQueryData(key, read());
  const observer = new QueryObserver(qc, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      const version = read();
      return new Promise<number>((resolve, reject) => {
        requests.push({ version, signal, finish: () => resolve(version), fail: () => reject(new Error("Engine read failed")) });
      });
    },
  });
  const stop = observer.subscribe(() => {});
  return { requests, observer, stop };
}

describe("查询失效", () => {
  test.each([
    { source: "工具权限", event: { type: "entity.changed", payload: { kind: "tool-access", id: "policy", op: "updated" } } as const, capabilities: ["gateway.get", "capabilities.list"] },
    { source: "插件状态", event: { type: "plugin.stateChanged", payload: { id: "tasks", state: "disabled" } } as const, capabilities: ["plugins.list", "capabilities.list", "capabilities.discovered"] },
  ])("$source变化立即重查权限，首页和健康汇总继续合并", async ({ event, capabilities }) => {
    const qc = new QueryClient();
    let version = 0;
    const permissions = capabilities.map((capability) => watchVersion(qc, queryKey("vault-a", capability), () => version));
    const summaries = ["home.summary", "health.run"].map((capability) => watchVersion(qc, queryKey("vault-a", capability), () => version));
    const watched = [...permissions, ...summaries];
    try {
      version = 1;
      const reads = watched.map(({ observer }) => observer.refetch());
      version = 2;
      const refresh = invalidateForEvent(qc, "vault-a", event);
      for (const { requests } of permissions) {
        expect(requests.map(({ version }) => version)).toEqual([1, 2]);
        expect(requests[0]?.signal.aborted).toBe(true);
      }
      for (const { requests } of summaries) {
        expect(requests).toHaveLength(1);
        expect(requests[0]?.signal.aborted).toBe(false);
      }
      for (const { requests } of watched) requests[0]?.finish();
      for (const { requests, observer } of permissions) {
        expect(observer.getCurrentResult().data).toBe(0);
        requests[1]?.finish();
      }
      for (const { requests } of summaries) {
        await expect.poll(() => requests.map(({ version }) => version)).toEqual([1, 2]);
        requests[1]?.finish();
      }
      await Promise.all([...reads, refresh]);
      for (const { requests, observer } of watched) {
        expect(requests).toHaveLength(2);
        expect(observer.getCurrentResult().data).toBe(2);
      }
    } finally {
      for (const { stop } of watched) stop();
      qc.clear();
    }
  });

  test.each(["首轮", "后继轮"] as const)("%s请求在途时中止作用域只结束等待", async (phase) => {
    const qc = new QueryClient();
    const scope = new AbortController();
    let version = 0;
    const { requests, observer, stop } = watchVersion(qc, queryKey("vault-a", "tasks.list"), () => version);
    try {
      version = 1;
      const first = invalidateForEvent(qc, "vault-a", fileChanged, scope.signal);
      version = 2;
      const next = invalidateForEvent(qc, "vault-a", fileChanged, scope.signal);
      if (phase === "后继轮") {
        requests[0]?.finish();
        await expect.poll(() => requests).toHaveLength(2);
        version = 3;
      }
      const queued = invalidateForEvent(qc, "vault-a", fileChanged, scope.signal);
      const finished = vi.fn();
      const waited = Promise.all([first, next, queued]).then(finished);
      scope.abort();
      await expect.poll(() => finished.mock.calls.length).toBe(1);
      const running = requests.at(-1);
      expect(running?.signal.aborted).toBe(false);
      expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
      running?.finish();
      await waited;
      await expect.poll(() => observer.getCurrentResult().data).toBe(phase === "首轮" ? 1 : 2);
      expect(requests).toHaveLength(phase === "首轮" ? 1 : 2);
    } finally {
      scope.abort();
      stop();
      qc.clear();
    }
  });

  test("中止一个作用域仍保留另一个作用域请求的补刷", async () => {
    const qc = new QueryClient();
    const stopped = new AbortController();
    const live = new AbortController();
    let version = 0;
    const { requests, observer, stop } = watchVersion(qc, queryKey("vault-a", "tasks.list"), () => version);
    try {
      version = 1;
      const active = invalidateForEvent(qc, "vault-a", fileChanged, stopped.signal);
      version = 2;
      const cancelled = invalidateForEvent(qc, "vault-a", fileChanged, stopped.signal);
      version = 3;
      const kept = invalidateForEvent(qc, "vault-a", fileChanged, live.signal);
      stopped.abort();
      expect(requests[0]?.signal.aborted).toBe(false);
      requests[0]?.finish();
      await expect.poll(() => requests.map(({ version }) => version)).toEqual([1, 3]);
      requests[1]?.finish();
      await Promise.all([active, cancelled, kept]);
      expect(observer.getCurrentResult().data).toBe(3);
    } finally {
      stopped.abort();
      live.abort();
      stop();
      qc.clear();
    }
  });

  test("1,000 个文件事件只触发在途查询和一次后继刷新，返回最后一个版本", async () => {
    const qc = new QueryClient();
    const key = queryKey("vault-a", "tasks.list");
    let version = 0;
    const { requests, observer, stop } = watchVersion(qc, key, () => version);
    try {
      const refreshes = Array.from({ length: 1_000 }, (_, i) => {
        version++;
        return invalidateForEvent(qc, "vault-a", { type: "vault.fileChanged", payload: { path: `Tasks/${i}.md`, change: "modified" } });
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.version).toBe(1);
      expect(requests[0]?.signal.aborted).toBe(false);
      requests[0]?.finish();
      await expect.poll(() => requests.map((request) => request.version)).toEqual([1, 1_000]);
      requests[1]?.finish();
      await Promise.all(refreshes);
      expect(observer.getCurrentResult().data).toBe(1_000);
      expect(requests).toHaveLength(2);
    } finally {
      stop();
      qc.clear();
    }
  });

  test("冷加载期间的文件事件会触发后继刷新", async () => {
    const qc = new QueryClient();
    let version = 1;
    const { requests, observer, stop } = watchVersion(qc, queryKey("vault-a", "tasks.list"), () => version, false);
    try {
      expect(observer.getCurrentResult().data).toBeUndefined();
      expect(requests).toHaveLength(1);
      version = 2;
      const refresh = invalidateForEvent(qc, "vault-a", fileChanged);
      expect(requests).toHaveLength(1);
      requests[0]?.finish();
      await expect.poll(() => requests.map((request) => request.version)).toEqual([1, 2]);
      requests[1]?.finish();
      await refresh;
      expect(observer.getCurrentResult().data).toBe(2);
    } finally {
      stop();
      qc.clear();
    }
  });

  test("观察者停用时保留失效标记，启用后读取最新版本", async () => {
    const qc = new QueryClient();
    const key = queryKey("vault-a", "tasks.list");
    let version = 0;
    const { requests, observer, stop } = watchVersion(qc, key, () => version);
    try {
      version = 1;
      const active = invalidateForEvent(qc, "vault-a", fileChanged);
      observer.setOptions({ ...observer.options, enabled: false });
      version = 2;
      const queued = invalidateForEvent(qc, "vault-a", fileChanged);
      requests[0]?.finish();
      await Promise.all([active, queued]);
      expect(requests).toHaveLength(1);
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
      observer.setOptions({ ...observer.options, enabled: true });
      await expect.poll(() => requests.map((request) => request.version)).toEqual([1, 2]);
      requests[1]?.finish();
      await expect.poll(() => observer.getCurrentResult().data).toBe(2);
    } finally {
      stop();
      qc.clear();
    }
  });

  test("已移除查询的补刷不影响同键的新缓存", async () => {
    const qc = new QueryClient();
    const key = queryKey("vault-a", "tasks.list");
    const previous = watchVersion(qc, key, () => 1);
    try {
      const active = invalidateForEvent(qc, "vault-a", fileChanged);
      const queued = invalidateForEvent(qc, "vault-a", fileChanged);
      qc.removeQueries({ queryKey: key, exact: true });
      const replacement = watchVersion(qc, key, () => 2);
      try {
        await Promise.all([active, queued]);
        expect(previous.requests).toHaveLength(1);
        expect(previous.requests[0]?.signal.aborted).toBe(true);
        expect(replacement.requests).toHaveLength(0);
        expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
        expect(replacement.observer.getCurrentResult().data).toBe(2);
      } finally {
        replacement.stop();
      }
    } finally {
      previous.stop();
      qc.clear();
    }
  });

  test.each(["请求失败", "主动取消"] as const)("%s后补刷，补刷在途时的新事件仍可刷新到最后版本", async (outcome) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queryKey("vault-a", "tasks.list");
    let version = 0;
    const { requests, observer, stop } = watchVersion(qc, key, () => version);
    try {
      version = 1;
      const first = invalidateForEvent(qc, "vault-a", fileChanged);
      version = 2;
      const second = invalidateForEvent(qc, "vault-a", fileChanged);
      if (outcome === "请求失败") requests[0]?.fail();
      else {
        await qc.cancelQueries({ queryKey: key, exact: true });
        expect(requests[0]?.signal.aborted).toBe(true);
      }
      await expect.poll(() => requests.map((request) => request.version)).toEqual([1, 2]);
      version = 3;
      const third = invalidateForEvent(qc, "vault-a", fileChanged);
      expect(requests).toHaveLength(2);
      requests[1]?.finish();
      await expect.poll(() => requests.map((request) => request.version)).toEqual([1, 2, 3]);
      requests[2]?.finish();
      await Promise.all([first, second, third]);
      expect(observer.getCurrentResult().data).toBe(3);
      expect(requests).toHaveLength(3);
    } finally {
      stop();
      qc.clear();
    }
  });

  test("一个在途查询无法阻塞其他查询键或 Vault", async () => {
    const qc = new QueryClient();
    let version = 0;
    const first = watchVersion(qc, queryKey("vault-a", "tasks.list", { group: "a" }), () => version);
    const second = watchVersion(qc, queryKey("vault-a", "tasks.list", { group: "b" }), () => version);
    const otherVault = watchVersion(qc, queryKey("vault-b", "tasks.list", { group: "a" }), () => version);
    try {
      version = 1;
      const active = invalidateForEvent(qc, "vault-a", fileChanged);
      version = 2;
      const queued = invalidateForEvent(qc, "vault-a", fileChanged);
      expect(otherVault.requests).toHaveLength(0);
      const unrelated = invalidateForEvent(qc, "vault-b", fileChanged);
      expect(first.requests).toHaveLength(1);
      expect(second.requests).toHaveLength(1);
      expect(otherVault.requests).toHaveLength(1);
      first.requests[0]?.finish();
      otherVault.requests[0]?.finish();
      await unrelated;
      await expect.poll(() => first.requests.map((request) => request.version)).toEqual([1, 2]);
      expect(otherVault.observer.getCurrentResult().data).toBe(2);
      expect(second.requests).toHaveLength(1);
      first.requests[1]?.finish();
      second.requests[0]?.finish();
      await expect.poll(() => second.requests.map((request) => request.version)).toEqual([1, 2]);
      second.requests[1]?.finish();
      await Promise.all([active, queued]);
      expect(second.observer.getCurrentResult().data).toBe(2);
    } finally {
      first.stop();
      second.stop();
      otherVault.stop();
      qc.clear();
    }
  });

  test.each(["退出", "卸载"] as const)("%s 后撤销请求且清理补刷", async (reason) => {
    const qc = new QueryClient();
    const key = queryKey("vault-a", "tasks.list");
    const scope = new AbortController();
    const { requests, stop } = watchVersion(qc, key, () => 0);
    try {
      const active = invalidateForEvent(qc, "vault-a", fileChanged, scope.signal);
      const queued = invalidateForEvent(qc, "vault-a", fileChanged, scope.signal);
      if (reason === "退出") {
        scope.abort();
        await queued;
        await qc.cancelQueries({ queryKey: key });
      } else {
        stop();
      }
      await Promise.all([active, queued]);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.signal.aborted).toBe(true);
    } finally {
      scope.abort();
      stop();
      qc.clear();
    }
  });

  test("保险箱锁定立即清除敏感查询，已排队的补刷不会恢复缓存", async () => {
    const qc = new QueryClient();
    const key = queryKey("vault-a", "safe.entries.list");
    const otherVaultKey = queryKey("vault-b", "safe.entries.list");
    const scope = new AbortController();
    const { requests, stop } = watchVersion(qc, key, () => 1);
    qc.setQueryData(otherVaultKey, 2);
    try {
      const active = invalidateVaultQueries(qc, "vault-a", scope.signal);
      const queued = invalidateVaultQueries(qc, "vault-a", scope.signal);
      const locked = invalidateForEvent(qc, "vault-a", { type: "safe.locked", payload: {} }, scope.signal);
      expect(qc.getQueryData(key)).toBeUndefined();
      expect(qc.getQueryData(otherVaultKey)).toBe(2);
      await Promise.all([active, queued, locked]);
      expect(qc.getQueryData(key)).toBeUndefined();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.signal.aborted).toBe(true);
    } finally {
      scope.abort();
      stop();
      qc.clear();
    }
  });

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
  test("entity.changed(mail-ai-settings) 让同 Vault 的邮件 AI 设置读取失效，邮件列表不动", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("vault-a", "mail.ai.getSettings"), {});
    qc.setQueryData(queryKey("vault-a", "mail.accounts.list"), {});
    qc.setQueryData(queryKey("vault-b", "mail.ai.getSettings"), {});
    await invalidateForEvent(qc, "vault-a", { type: "entity.changed", payload: { kind: "mail-ai-settings", id: "settings", op: "updated" } });
    expect(qc.getQueryState(queryKey("vault-a", "mail.ai.getSettings"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("vault-a", "mail.accounts.list"))?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKey("vault-b", "mail.ai.getSettings"))?.isInvalidated).toBe(false);
  });
  test("vault.dirChanged（空目录创建 / 删除）让同 Vault 的 vault.list 失效，其它库与任务查询不动", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("vault-a", "vault.list", { dir: "" }), {});
    qc.setQueryData(queryKey("vault-a", "tasks.list"), []);
    qc.setQueryData(queryKey("vault-b", "vault.list", { dir: "" }), {});
    await invalidateForEvent(qc, "vault-a", { type: "vault.dirChanged", payload: { path: "新目录" } });
    expect(qc.getQueryState(queryKey("vault-a", "vault.list", { dir: "" }))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("vault-a", "tasks.list"))?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKey("vault-b", "vault.list", { dir: "" }))?.isInvalidated).toBe(false);
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

describe("插件启停", () => {
  test("plugin.stateChanged 让首页汇总与健康检查失效（停用插件的卡片要隐藏）", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("v", "home.summary"), {});
    qc.setQueryData(queryKey("v", "health.run"), {});
    qc.setQueryData(queryKey("v", "plugins.list"), []);
    await invalidateForEvent(qc, "v", { type: "plugin.stateChanged", payload: { id: "tasks", state: "disabled" } });
    for (const k of ["home.summary", "health.run", "plugins.list"]) expect(qc.getQueryState(queryKey("v", k))?.isInvalidated).toBe(true);
  });
});

describe("同步状态事件", () => {
  test("sync.statusChanged 让 sync.* 与 conflicts.* 失效（后台自动暂停/出现冲突时界面实时更新）", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKey("v", "sync.status"), {});
    qc.setQueryData(queryKey("v", "conflicts.list"), {});
    qc.setQueryData(queryKey("v", "tasks.list"), []);
    await invalidateForEvent(qc, "v", { type: "sync.statusChanged", payload: { status: "conflict", ahead: 0, behind: 0, conflicts: 1 } });
    expect(qc.getQueryState(queryKey("v", "sync.status"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("v", "conflicts.list"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKey("v", "tasks.list"))?.isInvalidated).toBe(false);
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
