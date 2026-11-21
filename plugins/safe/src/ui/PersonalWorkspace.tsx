import { EVENT_PAYLOADS } from "@huhu/contracts";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, SearchBox } from "@huhu/ui";
import { CapabilityError, useEngine, useEngineEvents, type EngineClient } from "@huhu/workbench";
import { ArrowLeft, ChevronRight, Eye, EyeOff, KeyRound, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { EntryDetail, EntryIndex, SafeSession, Tag, TagList } from "../engine/personal.js";
import { EntryEditor, type EditTarget, type SaveReceipt } from "./EntryEditor.js";
import { TagBadge, TagManager } from "./SafeTags.js";

export type PersonalEntry = z.output<typeof EntryDetail>;
type Catalog = { revision: number; entries: PersonalEntry[]; tags: Tag[] };
type Selection = { entryId: string; accountId?: string };
type RemoveTarget = Exclude<EditTarget, { kind: "create" }>;
type TagFilter = string[] | null;

function matchesTags(entry: PersonalEntry, filter: TagFilter): boolean {
  return filter === null ? entry.tagIds.length === 0 : filter.every((id) => entry.tagIds.includes(id));
}

function sessionEnded(error: unknown): boolean {
  return error instanceof CapabilityError && ["SAFE_LOCKED", "PLUGIN_DISABLED", "ENGINE_CLOSING", "UNAUTHENTICATED", "PERMISSION_DENIED"].includes(error.code);
}

async function readCatalog(engine: EngineClient, session: SafeSession, signal: AbortSignal): Promise<Catalog> {
  // The index exposes IDs and revisions only. Fetch details for the unlocked list
  // and keep them in this workspace's memory for search and account switching.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const [index, directory] = await Promise.all([engine.call<z.output<typeof EntryIndex>>("safe.entries.list", { session }, { signal }), engine.call<z.output<typeof TagList>>("safe.tags.list", { session }, { signal })]);
    if (directory.revision !== index.revision) continue;
    const entries: PersonalEntry[] = [];
    // Leave room for the workbench's other calls to the same engine.
    try {
      for (let start = 0; start < index.entries.length; start += 8) {
        signal.throwIfAborted();
        const batch = index.entries.slice(start, start + 8);
        entries.push(...(await Promise.all(batch.map(({ entryId }) => engine.call<PersonalEntry>("safe.entries.get", { session, entryId }, { signal })))));
      }
    } catch (error) {
      if (error instanceof CapabilityError && error.code === "NOT_FOUND") continue;
      throw error;
    }
    if (entries.every((entry, indexPosition) => entry.revision === index.entries[indexPosition]?.revision)) {
      return { revision: index.revision, entries: entries.reverse(), tags: directory.tags };
    }
  }
  throw new Error("Safe changed while reading");
}

export function PersonalWorkspace({ instanceId, generation, onSessionEnded, onLock }: SafeSession & { onSessionEnded(): void; onLock(): void }) {
  const engine = useEngine();
  const session = { instanceId, generation };
  const lifetime = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>([]);
  const [managingTags, setManagingTags] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<EditTarget | null>(null);
  const [removal, setRemoval] = useState<RemoveTarget | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
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

  function handleError(error: unknown) {
    if (!sessionEnded(error)) return false;
    endSession();
    return true;
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
    const available = new Set(current.tags.map((tag) => tag.tagId));
    setTagFilter((filter) => filter?.filter((id) => available.has(id)) ?? null);
    setLoadError(false);
    return current;
  }

  function load(signal: AbortSignal) {
    void reload(signal).catch((error: unknown) => {
      if (signal.aborted) return;
      if (!handleError(error)) setLoadError(true);
    });
  }

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setCatalog(null);
    setQuery("");
    setTagFilter([]);
    setManagingTags(false);
    setSelection(null);
    setEditor(null);
    setRemoval(null);
    setRemoving(false);
    setRemoveError(null);
    setSaved(false);
    setLoadError(false);
    load(controller.signal);
    return () => {
      controller.abort();
      lifetime.current = null;
    };
  }, [engine, instanceId, generation]);

  const entry = catalog?.entries.find((item) => item.entryId === selection?.entryId && matchesTags(item, tagFilter));
  const account = entry?.accounts.find((item) => item.accountId === selection?.accountId) ?? entry?.accounts[0];
  const tags = catalog?.tags ?? [];
  const tagsById = new Map(tags.map((tag) => [tag.tagId, tag]));
  const tagCounts = new Map<string, number>();
  for (const item of catalog?.entries ?? []) {
    for (const id of item.tagIds) tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1);
  }

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
    if (!matchesTags(item, tagFilter)) return [];
    const hitIndex = term ? item.accounts.findIndex((candidate) => [candidate.account, candidate.phone, candidate.email, candidate.note].some(matches)) : -1;
    const hit = item.accounts[hitIndex];
    const tagMatches = item.tagIds.some((id) => matches(tagsById.get(id)?.name ?? ""));
    return matches(item.name) || matches(item.url) || tagMatches || hit ? [{ item, hit, hitIndex }] : [];
  });

  function filterTags(filter: TagFilter) {
    if (entry && !matchesTags(entry, filter)) setSelection(null);
    setTagFilter(filter);
  }

  function renderTags(item: PersonalEntry) {
    return item.tagIds.flatMap((id) => {
      const tag = tagsById.get(id);
      return tag ? [<TagBadge key={id} tag={tag} />] : [];
    });
  }

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
    setTagFilter([]);
    setCatalog(null);
    select({ entryId: receipt.entryId, ...(accountId ? { accountId } : {}) });
    load(signal);
  }

  function confirmRemove(target: RemoveTarget) {
    setSaved(false);
    setRemoveError(null);
    setRemoval(target);
  }

  async function remove() {
    const signal = lifetime.current?.signal;
    if (!removal || removing || !signal || signal.aborted) return;
    const { entry: target } = removal;
    const input = { session, entryId: target.entryId, expectedRevision: target.revision };
    setRemoving(true);
    setRemoveError(null);
    try {
      if (removal.kind === "account") {
        await engine.call("safe.accounts.delete", { ...input, accountId: removal.account.accountId }, { write: true, signal });
      } else {
        await engine.call("safe.entries.delete", { ...input, confirmedAccountCount: target.accounts.length }, { write: true, signal });
      }
      signal.throwIfAborted();
      if (removal.kind === "entry") {
        returnTo.current = target.entryId;
        setSelection(null);
      } else {
        select({ entryId: target.entryId });
      }
      setCatalog(null);
      setRemoval(null);
      load(signal);
    } catch (error) {
      if (signal.aborted || handleError(error)) return;
      if (error instanceof CapabilityError && (error.code === "VERSION_CONFLICT" || error.code === "NOT_FOUND")) {
        setRemoveError("条目已在另一处变化。请重新打开详情后确认删除。");
        load(signal);
      } else setRemoveError(error instanceof Error ? error.message : "删除结果待核实，请重新读取保险箱");
    } finally {
      if (!signal.aborted) setRemoving(false);
    }
  }

  const lastAccount = removal?.kind === "account" && removal.entry.accounts.length === 1;

  return (
    <>
      <div className="safe-workspace-actions">
        <Button disabled={!catalog} onClick={() => setManagingTags(true)}>
          标签管理
        </Button>
        <div role="status">{saved ? "已保存到保险箱" : null}</div>
      </div>
      <div className="safe-grid" data-view={entry ? "detail" : "list"} data-testid="safe-unlocked">
        <section className="hu-card-alt safe-list">
          <div className="shell-card-head">
            <h2>
              个人条目 <Badge>{catalog?.entries.length ?? 0}</Badge>
            </h2>
            <IconButton icon={Plus} label="新建条目" disabled={!catalog} data-testid="safe-new" onClick={() => catalog && openEditor({ kind: "create", revision: catalog.revision })} />
          </div>
          <div ref={search} className="hu-system-pane-search">
            <SearchBox value={query} onChange={setQuery} placeholder="搜索名称、账号、标签或备注…" />
          </div>
          {catalog ? (
            <div className="safe-tag-strip safe-tag-filters" role="group" aria-label="筛选标签">
              <Button aria-pressed={tagFilter?.length === 0} onClick={() => filterTags([])}>
                全部
              </Button>
              <Button aria-pressed={tagFilter === null} onClick={() => filterTags(tagFilter === null ? [] : null)}>
                无标签
              </Button>
              {tags.map((tag) => (
                <Button key={tag.tagId} aria-pressed={tagFilter?.includes(tag.tagId) ?? false} onClick={() => filterTags(tagFilter?.includes(tag.tagId) ? tagFilter.filter((id) => id !== tag.tagId) : [...(tagFilter ?? []), tag.tagId])}>
                  <TagBadge tag={tag} />
                </Button>
              ))}
            </div>
          ) : null}
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
          {catalog && !list.length ? <EmptyState icon={KeyRound} title={catalog.entries.length ? "没有符合条件的条目" : "还没有个人条目"} /> : null}
          {list.map(({ item, hit, hitIndex }) => (
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
              <span className="hu-flex-fill">
                <strong>{item.name}</strong>
                <small>
                  {item.url || "未填网址"} · {item.accounts.length} 个账号
                </small>
                {item.tagIds.length ? <span className="safe-tag-strip safe-row-tags">{renderTags(item)}</span> : null}
                {hit ? (
                  <small>
                    命中账号 · {hitIndex + 1}. {hit.account}
                  </small>
                ) : null}
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
                <div className="row">
                  <Button onClick={() => openEditor({ kind: "entry", entry })}>编辑条目</Button>
                  <Button variant="ghost" onClick={() => confirmRemove({ kind: "entry", entry })}>
                    删除条目
                  </Button>
                </div>
              </div>
              <div className="hu-stack hu-safe-detail-body">
                <div className="safe-read-value">{entry.url || "未填网址"}</div>
                {entry.tagIds.length ? <div className="safe-tag-strip">{renderTags(entry)}</div> : null}
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
                    <div className="row">
                      <Button onClick={() => openEditor({ kind: "account", entry, account })}>编辑账号</Button>
                      <Button variant="ghost" onClick={() => confirmRemove({ kind: "account", entry, account })}>
                        删除账号
                      </Button>
                    </div>
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
                      key={`${entry.entryId}:${account.accountId}:${editor !== null || managingTags || removal !== null}`}
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
      {managingTags && catalog ? (
        <TagManager tags={tags} counts={tagCounts} revision={catalog.revision} session={session} getSignal={() => lifetime.current?.signal} reload={reload} onError={handleError} onClose={() => setManagingTags(false)} />
      ) : null}
      {editor && <EntryEditor target={editor} tags={tags} session={session} getSessionSignal={() => lifetime.current?.signal} reload={reload} onSaved={finishSave} onClose={() => setEditor(null)} onLock={onLock} onError={handleError} />}
      {removal ? (
        <Dialog
          key={removal.kind}
          open
          title={removal.kind === "entry" ? "删除整个条目" : "删除账号"}
          testId="safe-remove-confirmation"
          error={removeError}
          onClose={() => {
            if (!removing) setRemoval(null);
          }}
          actions={
            <>
              <Button autoFocus disabled={removing} onClick={() => setRemoval(null)}>
                取消
              </Button>
              {lastAccount ? (
                <Button onClick={() => confirmRemove({ kind: "entry", entry: removal.entry })}>删除整个条目…</Button>
              ) : (
                <Button variant="danger" loading={removing} onClick={() => void remove()}>
                  {removal.kind === "entry" ? "确认删除条目" : "确认删除账号"}
                </Button>
              )}
            </>
          }
        >
          {removal.kind === "entry" ? (
            <p>
              「{removal.entry.name}」及其 {removal.entry.accounts.length} 个账号将从保险箱移除。
            </p>
          ) : lastAccount ? (
            <p>
              「{removal.account.account}」是「{removal.entry.name}」仅剩的账号。你可以继续确认删除整个条目，或取消。
            </p>
          ) : (
            <p>
              从「{removal.entry.name}」移除账号「{removal.account.account}」。
            </p>
          )}
        </Dialog>
      ) : null}
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
