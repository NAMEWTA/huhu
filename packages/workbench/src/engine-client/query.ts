import type { Query, QueryClient, QueryFilters } from "@tanstack/react-query";
import type { HuhuEvent } from "@huhu/contracts";

/** 查询键 `[vaultId, capability, input]`。 */
export const queryKey = (vaultId: string, capability: string, input: unknown = {}): readonly unknown[] => [vaultId, capability, input];

const ENTITY_CAPS: Record<string, string[]> = {
  task: ["tasks."],
  "task-run": ["tasks."],
  "task-follow-up": ["automations.followUps.get"],
  "agent-session": ["agent.sessions.list", "agent.history.list"],
  "agent-workspace": ["agent.workspace.get"],
  note: ["notes.", "vault.", "archives."], // 档案的 index.md 就是笔记：笔记变了，档案视图也要刷新
  archive: ["archives.", "notes.", "vault."],
  capture: ["inbox."],
  comment: ["comments."],
  "ssh-host": ["ssh.hosts.", "ssh.outboundProxies.preview"],
  "ssh-known-hosts": ["ssh.knownHosts."],
  "ssh-outbound-proxy": ["ssh.outboundProxies.", "ssh.hosts.list"],
  "ssh-shortcuts": ["ssh.shortcuts."],
  "home-dashboard": ["home.dashboard.get"],
  "tool-access": ["gateway.get", "capabilities.list"],
  "automation-activation": ["automations.activations"],
  "mail-ai-settings": ["mail.ai.getSettings"],
};

type RefreshScope = AbortSignal | undefined;
type PendingRefresh = { scopes: Set<RefreshScope>; promise: Promise<void> };

// One trailing refresh per cache entry, shared by the scopes that requested it.
const pendingRefreshes = new WeakMap<Query, PendingRefresh>();
const scopedWaits = new WeakMap<Promise<void>, WeakMap<AbortSignal, Promise<void>>>();
const isOpen = (scope: RefreshScope): boolean => !scope?.aborted;

function waitForRefresh(work: Promise<void>, signal: RefreshScope): Promise<void> {
  if (!signal) return work;
  if (signal.aborted) return Promise.resolve();
  let waits = scopedWaits.get(work);
  if (!waits) {
    waits = new WeakMap();
    scopedWaits.set(work, waits);
  }
  const existing = waits.get(signal);
  if (existing) return existing;
  const wait = new Promise<void>((resolve, reject) => {
    const onAbort = () => resolve();
    signal.addEventListener("abort", onAbort, { once: true });
    void work.then(resolve, reject).then(() => signal.removeEventListener("abort", onAbort));
  });
  waits.set(signal, wait);
  return wait;
}

function refreshAfterFetch(qc: QueryClient, query: Query, fetch: Promise<unknown>): PendingRefresh {
  const scopes = new Set<RefreshScope>();
  const refresh = () => {
    pendingRefreshes.delete(query);
    // An evicted entry must not refresh a replacement with the same key.
    if (qc.getQueryCache().get(query.queryHash) === query) return refreshQueries(qc, { predicate: (candidate) => candidate === query }, [...scopes]);
  };
  const pending = { scopes, promise: fetch.then(refresh, refresh) };
  pendingRefreshes.set(query, pending);
  return pending;
}

function refreshQueries(qc: QueryClient, filters: QueryFilters, scopes: readonly RefreshScope[]): Promise<void> {
  if (!scopes.some(isOpen)) return Promise.resolve();
  void qc.invalidateQueries({ ...filters, refetchType: "none" });
  const liveScopes = scopes.filter(isOpen);
  if (liveScopes.length === 0) return Promise.resolve();
  const idle = new Set<Query>();
  const refreshes: Promise<void>[] = [];
  for (const query of qc.getQueryCache().findAll(filters)) {
    if (query.isStatic()) continue;
    const active = query.isActive();
    const fetch = query.state.fetchStatus === "idle" ? undefined : query.promise;
    const pending = pendingRefreshes.get(query) ?? (fetch ? refreshAfterFetch(qc, query, fetch) : undefined);
    if (pending) {
      for (const scope of liveScopes) pending.scopes.add(scope);
      // Inactive queries keep their stale marker without refetching; paused reads may still be offline.
      if (active && query.state.fetchStatus !== "paused") refreshes.push(pending.promise);
    } else if (active) idle.add(query);
  }
  if (idle.size > 0) refreshes.push(qc.refetchQueries({ type: "active", predicate: (query) => idle.has(query) }, { cancelRefetch: false }));
  return refreshes.length > 1 ? Promise.all(refreshes).then(() => {}) : (refreshes[0] ?? Promise.resolve());
}

export function invalidateVaultQueries(qc: QueryClient, vaultId: string, signal: AbortSignal): Promise<void> {
  return waitForRefresh(refreshQueries(qc, { queryKey: [vaultId] }, [signal]), signal);
}

/** 事件到达时让相关查询失效。 */
export function invalidateForEvent(qc: QueryClient, vaultId: string, e: Pick<HuhuEvent, "type" | "payload">, signal?: AbortSignal): Promise<void> {
  if (e.type === "safe.locked") {
    qc.removeQueries({
      predicate: ({ queryKey: [id, capability] }) => id === vaultId && typeof capability === "string" && ["safe.entries.", "safe.accounts.", "safe.tags."].some((prefix) => capability.startsWith(prefix)),
    });
  }
  if (signal?.aborted) return Promise.resolve();
  if (e.type === "safe.locked" || e.type === "safe.unlocked") {
    return waitForRefresh(qc.invalidateQueries({ queryKey: queryKey(vaultId, "safe.status"), exact: true }), signal);
  }
  const prefixes: string[] = [];
  const p = e.payload as Record<string, unknown>;
  const entityKind = e.type === "entity.changed" ? String(p["kind"]) : "";
  if (e.type === "entity.changed") prefixes.push(...(ENTITY_CAPS[entityKind] ?? []));
  else if (e.type === "vault.dirChanged") prefixes.push("vault.", "notes."); // 目录实体：资源目录（vault.list）与文件夹列表
  else if (e.type === "task.statusChanged" || e.type === "task.inputChanged") prefixes.push("tasks.");
  else if (e.type === "vault.fileChanged") prefixes.push("vault.", "notes.", "tasks.", "automations.", "archives."); // 外部直接改 Tasks/、Automations/ 或档案的 index.md 也要刷新界面
  else if (e.type === "plugin.stateChanged") prefixes.push("plugins.", "capabilities.");
  else if (e.type === "sync.statusChanged") prefixes.push("sync.", "conflicts.");
  else if (e.type === "notification.created") prefixes.push("notifications.");
  else if (e.type === "automation.activated" || e.type === "run.stateChanged") prefixes.push("automations.", "tasks.");
  if (prefixes.length === 0) return Promise.resolve();
  // 首页卡片与健康检查汇总了各模块的数据，任何实体/文件变化都可能影响它们
  // 插件启停同样会改变首页卡片（停用插件的卡片隐藏）和健康检查
  const matches = (prefixes: readonly string[]): QueryFilters => ({
    predicate: ({ queryKey: [id, capability] }) => id === vaultId && typeof capability === "string" && prefixes.some((prefix) => capability.startsWith(prefix)),
  });
  const summaries = ["home.", "health."];
  if (e.type === "plugin.stateChanged" || (e.type === "entity.changed" && entityKind === "tool-access")) {
    const permissions = qc.invalidateQueries(matches(prefixes));
    const derived = refreshQueries(qc, matches(summaries), [signal]);
    return waitForRefresh(
      Promise.all([permissions, derived]).then(() => {}),
      signal,
    );
  }
  return waitForRefresh(refreshQueries(qc, matches([...prefixes, ...summaries]), [signal]), signal);
}
