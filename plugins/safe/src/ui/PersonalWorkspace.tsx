import { EVENT_PAYLOADS } from "@huhu/contracts";
import { Badge, Button, EmptyState, Field, IconButton, SearchBox } from "@huhu/ui";
import { CapabilityError, useEngine, useEngineEvents, type EngineClient } from "@huhu/workbench";
import { ArrowLeft, ChevronRight, Eye, EyeOff, KeyRound, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { EntryDetail, EntryIndex, SafeSession } from "../engine/personal.js";
import { EntryEditor, type EditTarget, type SaveReceipt } from "./EntryEditor.js";

export type PersonalEntry = z.output<typeof EntryDetail>;
type Catalog = { revision: number; entries: PersonalEntry[] };
type Selection = { entryId: string; accountId?: string };

function sessionEnded(error: unknown): boolean {
  return error instanceof CapabilityError && ["SAFE_LOCKED", "PLUGIN_DISABLED", "ENGINE_CLOSING", "UNAUTHENTICATED", "PERMISSION_DENIED"].includes(error.code);
}

async function readCatalog(engine: EngineClient, session: SafeSession, signal: AbortSignal): Promise<Catalog> {
  // The index exposes IDs and revisions only. Fetch details for the unlocked list
  // and keep them in this workspace's memory for search and account switching.
  const index = await engine.call<z.output<typeof EntryIndex>>("safe.entries.list", { session }, { signal });
  const entries: PersonalEntry[] = [];
  // Leave room for the workbench's other calls to the same engine.
  for (let start = 0; start < index.entries.length; start += 8) {
    signal.throwIfAborted();
    const batch = index.entries.slice(start, start + 8);
    entries.push(...(await Promise.all(batch.map(({ entryId }) => engine.call<PersonalEntry>("safe.entries.get", { session, entryId }, { signal })))));
  }
  return { revision: index.revision, entries: entries.reverse() };
}

export function PersonalWorkspace({ instanceId, generation, onSessionEnded, onLock }: SafeSession & { onSessionEnded(): void; onLock(): void }) {
  const engine = useEngine();
  const session = { instanceId, generation };
  const lifetime = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<EditTarget | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const search = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<string | null>(null);
  const focusDetail = useRef(false);
  const accountSelectId = useId();

  function endSession() {
    lifetime.current?.abort();
    onSessionEnded();
  }

  useEngineEvents((event) => {
    if (event.vaultId !== engine.vaultId) return;
    if (event.type === "safe.locked") {
      const lock = EVENT_PAYLOADS["safe.locked"].safeParse(event.payload);
      if (lock.success && instanceId === lock.data.instanceId && generation <= lock.data.generation) lifetime.current?.abort();
    }
    if (event.type === "engine.closing") endSession();
    if (event.type === "plugin.stateChanged") {
      const plugin = EVENT_PAYLOADS["plugin.stateChanged"].safeParse(event.payload);
      if (plugin.success && plugin.data.id === "safe" && plugin.data.state !== "active") endSession();
    }
  });

  async function reload(signal: AbortSignal) {
    const current = await readCatalog(engine, session, signal);
    signal.throwIfAborted();
    setCatalog(current);
    setLoadError(false);
    return current;
  }

  function load(signal: AbortSignal) {
    void reload(signal).catch((error: unknown) => {
      if (signal.aborted) return;
      if (sessionEnded(error)) endSession();
      else setLoadError(true);
    });
  }

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setCatalog(null);
    setQuery("");
    setSelection(null);
    setEditor(null);
    setSaved(false);
    setLoadError(false);
    load(controller.signal);
    return () => {
      controller.abort();
      lifetime.current = null;
    };
  }, [engine, instanceId, generation]);

  const entry = catalog?.entries.find((item) => item.entryId === selection?.entryId);
  const account = entry?.accounts.find((item) => item.accountId === selection?.accountId) ?? entry?.accounts[0];

  useLayoutEffect(() => {
    if (focusDetail.current && entry) {
      focusDetail.current = false;
      heading.current?.focus();
    }
    if (returnTo.current !== null) {
      const row = rows.current.get(returnTo.current);
      returnTo.current = null;
      (row ?? search.current?.querySelector("input"))?.focus();
    }
  }, [selection, entry]);

  const term = query.trim().toLowerCase();
  const matches = (value: string) => value.toLowerCase().includes(term);
  const list = (catalog?.entries ?? []).flatMap((item) => {
    const hit = term ? item.accounts.find((candidate) => [candidate.account, candidate.phone, candidate.email, candidate.note].some(matches)) : undefined;
    return matches(item.name) || matches(item.url) || hit ? [{ item, hit }] : [];
  });

  function select(next: Selection) {
    focusDetail.current = true;
    setSelection(next);
  }

  function openEditor(target: EditTarget) {
    setSaved(false);
    setEditor(target);
  }

  function finishSave(receipt: SaveReceipt, accountId?: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    setEditor(null);
    setSaved(true);
    setQuery("");
    setCatalog(null);
    select({ entryId: receipt.entryId, ...(accountId ? { accountId } : {}) });
    load(signal);
  }

  return (
    <>
      <div role="status">{saved ? "已保存到保险箱" : null}</div>
      <div className="safe-grid" data-view={entry ? "detail" : "list"} data-testid="safe-unlocked">
        <section className="hu-card-alt safe-list">
          <div className="shell-card-head">
            <h2>
              个人条目 <Badge>{catalog?.entries.length ?? 0}</Badge>
            </h2>
            <IconButton icon={Plus} label="新建条目" disabled={!catalog} data-testid="safe-new" onClick={() => catalog && openEditor({ kind: "create", revision: catalog.revision })} />
          </div>
          <div ref={search} className="hu-system-pane-search">
            <SearchBox value={query} onChange={setQuery} placeholder="搜索名称、账号或备注…" />
          </div>
          {loadError ? (
            <div className="hu-stack hu-safe-detail-body">
              <p role="alert" className="hu-field-error">
                {saved ? "已保存，暂时无法刷新条目。" : "暂时无法读取保险箱条目。"}
              </p>
              <Button
                onClick={() => {
                  const signal = lifetime.current?.signal;
                  if (!signal || signal.aborted) return;
                  setLoadError(false);
                  load(signal);
                }}
              >
                重新读取
              </Button>
            </div>
          ) : !catalog ? (
            <p role="status" className="hu-safe-detail-body">
              正在读取条目…
            </p>
          ) : null}
          {catalog && !list.length ? <EmptyState icon={KeyRound} title={term ? "没有符合条件的条目" : "还没有个人条目"} /> : null}
          {list.map(({ item, hit }) => (
            <button
              key={item.entryId}
              ref={(node) => {
                if (node) rows.current.set(item.entryId, node);
                else rows.current.delete(item.entryId);
              }}
              type="button"
              className={`safe-secret-row ${item.entryId === entry?.entryId ? "active" : ""}`}
              aria-current={item.entryId === entry?.entryId || undefined}
              data-testid="safe-item"
              onClick={() => select({ entryId: item.entryId, ...(hit ? { accountId: hit.accountId } : {}) })}
            >
              <KeyRound size={18} aria-hidden />
              <span className="grow">
                <strong>{item.name}</strong>
                <small>
                  {item.url || "未填网址"} · {item.accounts.length} 个账号
                </small>
                {hit ? <small>命中账号 · {hit.account}</small> : null}
              </span>
              <ChevronRight size={14} aria-hidden />
            </button>
          ))}
        </section>
        <section className="hu-card-alt hu-safe-detail">
          {entry && account ? (
            <>
              <div className="shell-card-head">
                <Button
                  className="safe-back"
                  variant="ghost"
                  icon={ArrowLeft}
                  onClick={() => {
                    returnTo.current = entry.entryId;
                    setSelection(null);
                  }}
                >
                  返回条目
                </Button>
                <h2 ref={heading} tabIndex={-1}>
                  {entry.name}
                </h2>
                <Button onClick={() => openEditor({ kind: "entry", entry })}>编辑条目</Button>
              </div>
              <div className="hu-stack hu-safe-detail-body">
                <div className="safe-read-value">{entry.url || "未填网址"}</div>
                <div className="hu-field">
                  <label className="hu-field-label" htmlFor={accountSelectId}>
                    账号
                  </label>
                  <select id={accountSelectId} value={account.accountId} onChange={(event) => setSelection({ entryId: entry.entryId, accountId: event.target.value })}>
                    {entry.accounts.map((item, index) => (
                      <option key={item.accountId} value={item.accountId}>
                        {index + 1}. {item.account}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hu-card-alt hu-stack safe-account-card">
                  <div className="safe-account-head">
                    <h3>{account.account}</h3>
                    <Button onClick={() => openEditor({ kind: "account", entry, account })}>编辑账号</Button>
                  </div>
                  <Field label="手机号">
                    <div className="safe-read-value">{account.phone || "未设置"}</div>
                  </Field>
                  <Field label="邮箱">
                    <div className="safe-read-value">{account.email || "未设置"}</div>
                  </Field>
                  <Field label="备注">
                    <div className="safe-read-value">{account.note || "未填写"}</div>
                  </Field>
                  <Field label="密码">
                    <PasswordValue
                      key={`${entry.entryId}:${account.accountId}:${editor !== null}`}
                      hasPassword={account.hasPassword}
                      getSessionSignal={() => lifetime.current?.signal}
                      onSessionEnded={endSession}
                      request={(signal) => engine.call("safe.accounts.reveal", { session, entryId: entry.entryId, accountId: account.accountId }, { signal })}
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={KeyRound} title="选择一个条目查看账号" />
          )}
        </section>
      </div>
      {editor && (
        <EntryEditor
          target={editor}
          session={session}
          getSessionSignal={() => lifetime.current?.signal}
          reload={reload}
          onSaved={finishSave}
          onClose={() => setEditor(null)}
          onLock={onLock}
          onError={(error) => {
            if (!sessionEnded(error)) return false;
            endSession();
            return true;
          }}
        />
      )}
    </>
  );
}

function PasswordValue({ hasPassword, request, getSessionSignal, onSessionEnded }: { hasPassword: boolean; request(signal: AbortSignal): Promise<{ password: string }>; getSessionSignal(): AbortSignal | undefined; onSessionEnded(): void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => active.current?.abort(), []);

  async function toggle() {
    if (password !== null) {
      setPassword(null);
      return;
    }
    const sessionSignal = getSessionSignal();
    if (active.current || !sessionSignal || sessionSignal.aborted) return;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    sessionSignal.addEventListener("abort", cancel, { once: true });
    active.current = controller;
    setError(false);
    setPending(true);
    try {
      const result = await request(controller.signal);
      if (!controller.signal.aborted) setPassword(result.password);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (sessionEnded(cause)) onSessionEnded();
      else setError(true);
    } finally {
      sessionSignal.removeEventListener("abort", cancel);
      active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <>
      <div className="hu-secret-value">
        <code data-testid="secret-value">{hasPassword ? (password === null ? "••••••••" : password || "未设置") : "未设置"}</code>
        <Button icon={password === null ? Eye : EyeOff} disabled={!hasPassword} loading={pending} onClick={() => void toggle()}>
          {pending ? "正在读取" : password === null ? "显示密码" : "隐藏密码"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="hu-field-error">
          无法显示当前账号的密码，请重试。
        </p>
      ) : null}
    </>
  );
}
