import type { Query, QueryClient, QueryFilters } from "@tanstack/react-query";
import { NoteIndexDeltaSchema, type HuhuEvent, type NoteIndexDelta, type VaultIndexSnapshot } from "@huhu/contracts";

/** 查询键 `[vaultId, capability, input]`。 */
export const queryKey = (vaultId: string, capability: string, input: unknown = {}): readonly unknown[] => [vaultId, capability, input];

const ENTITY_CAPS: Record<string, string[]> = {
  task: ["tasks.", "automations.plans."],
  "task-run": ["tasks.", "automations.plans."],
  "task-follow-up": ["automations.followUps.get", "automations.plans."],
  "automation-rule": ["automations.list", "automations.read", "automations.plans."],
  "agent-catalog": ["agent.catalog.detect", "agent.settings.get", "automations.plans.list", "automations.plans.read", "automations.plans.summary"],
  "agent-session": ["agent.sessions.list", "agent.history.list"],
  "agent-workspace": ["agent.workspace.get"],
  note: ["notes.", "vault.", "archives.", "ledger.references."], // 档案的 index.md 就是笔记：笔记变了，档案视图也要刷新
  archive: ["archives.", "notes.", "vault.", "ledger.references."],
  capture: ["inbox."],
  comment: ["comments."],
  "ssh-host": ["ssh.hosts.", "ssh.outboundProxies.preview"],
  "ssh-known-hosts": ["ssh.knownHosts."],
  "ssh-outbound-proxy": ["ssh.outboundProxies.", "ssh.hosts.list"],
  "ssh-shortcuts": ["ssh.shortcuts."],
  "home-dashboard": ["home.dashboard.get"],
  "home-focus": ["home.focus.get", "automations.plans."],
  "tool-access": ["gateway.get", "capabilities.list", "mcp.catalog."],
  "mcp-source": ["mcp.sources.", "mcp.catalog.", "mcp.diagnostics."],
  ledger: ["ledger."],
  gateway: ["gateway.get"],
  "automation-activation": ["automations.activations", "automations.plans."],
  "periodic-plan": ["automations.plans."],
  "periodic-occurrence": ["automations.plans."],
  "mail-ai-settings": ["mail.ai.getSettings"],
};
const PERIODIC_SOURCE_CAPS: Record<string, string[]> = {
  ledger: ["ledger.recurring.", "ledger.overview.activity"],
  mail: ["mail.sync.settings"],
  versioning: ["sync.get"],
  ssh: ["ssh.monitor.panels.list", "ssh.monitor.panels.run"],
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

function patchIndexSnapshot(qc: QueryClient, vaultId: string, delta: NoteIndexDelta): boolean {
  const key = queryKey(vaultId, "vault.indexSnapshot");
  const state = qc.getQueryState<VaultIndexSnapshot>(key);
  const current = state?.data;
  if (!state || !current || state.isInvalidated || state.fetchStatus !== "idle") return false;
  if (current.revision >= delta.revision) return true;
  if (current.revision !== delta.before || delta.revision !== delta.before + 1) return false;
  const index = current.entries.findIndex(({ path, type }) => path === delta.entry.path && type === delta.entry.type);
  if (index < 0) return false;
  qc.setQueryData<VaultIndexSnapshot>(key, { revision: delta.revision, entries: current.entries.with(index, delta.entry) });
  return true;
}

function refreshNoteCommit(qc: QueryClient, vaultId: string, delta: NoteIndexDelta, signal: RefreshScope): Promise<void> {
  const patched = patchIndexSnapshot(qc, vaultId, delta);
  const { path } = delta.entry;
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return waitForRefresh(
    refreshQueries(
      qc,
      {
        predicate: ({ queryKey: [id, capability, input] }) => {
          if (id !== vaultId || typeof capability !== "string") return false;
          const parameters = input as { path?: string; dir?: string; prefix?: string } | undefined;
          if (capability === "vault.indexSnapshot") return !patched;
          if (capability === "vault.indexEntries") {
            const prefix = parameters?.prefix ?? "";
            return !prefix || path === prefix || path.startsWith(`${prefix}/`);
          }
          if (capability === "vault.list") return (parameters?.dir ?? "") === parent;
          if (capability === "notes.list" || capability === "notes.tags") return delta.tagsChanged;
          if (["notes.read", "notes.textEncoding", "notes.previewEncoding", "vault.readFile", "vault.readRange"].includes(capability)) return parameters?.path === path;
          if (capability.startsWith("tasks.")) return path.startsWith("Tasks/");
          if (capability.startsWith("automations.")) return path.startsWith("Automations/");
          // A note outside Archives can add or remove a backlink to a record or attachment.
          if (capability === "archives.read" && /\.md$/i.test(path)) return true;
          if (capability.startsWith("archives.")) return path.startsWith("Archives/");
          return ["notes.backlinks", "vault.search", "home.notes.recent", "home.summary", "health.run"].includes(capability);
        },
      },
      [signal],
    ),
    signal,
  );
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
  if (e.type === "vault.fileChanged" && p["change"] === "modified") {
    const parsed = NoteIndexDeltaSchema.safeParse(p["noteIndex"]);
    if (parsed.success && parsed.data.entry.path === p["path"] && parsed.data.entry.type === "file") return refreshNoteCommit(qc, vaultId, parsed.data, signal);
  }
  const entityKind = e.type === "entity.changed" ? String(p["kind"]) : "";
  const periodic = entityKind === "periodic-plan" || entityKind === "periodic-occurrence";
  if (e.type === "entity.changed") {
    prefixes.push(...(ENTITY_CAPS[entityKind] ?? []));
    if (periodic && typeof p["sourcePlugin"] === "string" && Object.hasOwn(PERIODIC_SOURCE_CAPS, p["sourcePlugin"])) {
      prefixes.push(...PERIODIC_SOURCE_CAPS[p["sourcePlugin"]]!);
    }
  } else if (e.type === "vault.dirChanged") prefixes.push("vault.", "notes.", "ledger.references.");
  else if (e.type === "task.statusChanged" || e.type === "task.inputChanged") prefixes.push("tasks.");
  else if (e.type === "vault.fileChanged") prefixes.push("vault.", "notes.", "tasks.", "automations.", "archives.", "ledger.references.");
  else if (e.type === "plugin.stateChanged") {
    prefixes.push("plugins.", "capabilities.");
    if (p["id"] === "tasks") prefixes.push("tasks.", "automations.plans.", "automations.followUps.");
    if (p["id"] === "agent-cli") prefixes.push("automations.plans.");
    if (p["id"] === "notes") prefixes.push("ledger.references.");
    if (p["id"] === "ssh") prefixes.push("ssh.hosts.");
    if (p["id"] === "mcp") prefixes.push("mcp.", "gateway.get");
    if (p["id"] === "automations") prefixes.push("automations.plans.", ...Object.values(PERIODIC_SOURCE_CAPS).flat());
    else if (typeof p["id"] === "string" && Object.hasOwn(PERIODIC_SOURCE_CAPS, p["id"])) {
      prefixes.push("automations.plans.", ...PERIODIC_SOURCE_CAPS[p["id"]]!);
    }
  } else if (e.type === "sync.statusChanged") prefixes.push("sync.", "conflicts.");
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
  return waitForRefresh(refreshQueries(qc, matches(periodic ? prefixes : [...prefixes, ...summaries]), [signal]), signal);
}
