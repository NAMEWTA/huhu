import { Button } from "@huhu/ui";
import { CapabilityError, createRequestId, queryKey, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MAX_SHORTCUT_LABEL, MAX_SHORTCUT_TEXT, MAX_SHORTCUTS, SHORTCUTS_CHANGED, Shortcut, type ShortcutLibrary, shortcutNames } from "../shared/shortcuts.js";

function useShortcutLibrary() {
  const engine = useEngine();
  const queries = useQueryClient();
  const library = useCapability<ShortcutLibrary>(shortcutNames.list);
  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === SHORTCUTS_CHANGED) {
      void queries.invalidateQueries({ queryKey: queryKey(engine.vaultId, shortcutNames.list) });
    }
  });
  return library;
}

function ShortcutList({ shortcuts, children }: { shortcuts: Shortcut[]; children: (entry: Shortcut, previous: Shortcut | undefined, next: Shortcut | undefined) => ReactNode }) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const groups = new Map<string, Shortcut[]>();
  for (const entry of shortcuts) {
    const groupKey = (entry.group ?? "").toLowerCase();
    const group = groups.get(groupKey);
    if (group) group.push(entry);
    else groups.set(groupKey, [entry]);
  }
  const filtered = [...groups].flatMap(([key, entries]) => {
    const matches = entries.filter(({ name, text }) => [key, name.toLowerCase(), text.toLowerCase()].some((value) => value.includes(query)));
    return matches.length ? [{ key, entries, matches }] : [];
  });

  return (
    <>
      <search aria-label="筛选快捷文本">
        <label className="hu-field" htmlFor={searchId}>
          搜索快捷文本
          <input id={searchId} type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
        </label>
      </search>
      {filtered.length === 0 && <p>{query ? "没有匹配的快捷文本。" : "快捷文本库为空。"}</p>}
      {filtered.map(({ key, entries, matches }) => (
        <section key={key}>
          <h3>{entries[0]?.group || "未分组"}</h3>
          <ul className="hu-stack">
            {matches.map((entry) => {
              const index = entries.indexOf(entry);
              return <li key={entry.id}>{children(entry, entries[index - 1], entries[index + 1])}</li>;
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function LoadState({ failed, retry }: { failed: boolean; retry: () => void }) {
  if (!failed) return <p>正在读取快捷文本库…</p>;
  return (
    <p>
      无法读取快捷文本库。{" "}
      <Button type="button" onClick={retry}>
        重新读取
      </Button>
    </p>
  );
}

export function ShortcutPicker({ onSelect }: { onSelect: (entry: Shortcut) => void }) {
  const library = useShortcutLibrary();
  if (!library.data) return <LoadState failed={library.isError} retry={() => void library.refetch()} />;
  return (
    <ShortcutList shortcuts={library.data.shortcuts}>
      {(entry) => (
        <Button type="button" onClick={() => onSelect(entry)}>
          选择 {entry.name}
        </Button>
      )}
    </ShortcutList>
  );
}

type Edit = { base: ShortcutLibrary; entry: Shortcut; existing: boolean };

function ShortcutEditor({ edit, busy, update, cancel, save, remove }: { edit: Edit; busy: boolean; update: (entry: Shortcut) => void; cancel: () => void; save: () => void; remove: () => void }) {
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => nameInput.current?.focus(), []);
  const { entry, existing } = edit;
  return (
    <form
      className="hu-card-alt hu-stack"
      aria-labelledby={id}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3 id={id}>{existing ? "编辑快捷文本" : "新增快捷文本"}</h3>
      <label className="hu-field" htmlFor={`${id}-name`}>
        名称
        <input ref={nameInput} id={`${id}-name`} name="name" required maxLength={MAX_SHORTCUT_LABEL} disabled={busy} value={entry.name} onChange={(event) => update({ ...entry, name: event.currentTarget.value })} />
      </label>
      <label className="hu-field" htmlFor={`${id}-group`}>
        分组
        <input id={`${id}-group`} name="group" maxLength={MAX_SHORTCUT_LABEL} disabled={busy} value={entry.group ?? ""} onChange={(event) => update({ ...entry, group: event.currentTarget.value })} />
      </label>
      <label className="hu-field" htmlFor={`${id}-text`}>
        正文
        <textarea
          id={`${id}-text`}
          name="text"
          rows={5}
          required
          maxLength={MAX_SHORTCUT_TEXT}
          spellCheck={false}
          autoCapitalize="none"
          disabled={busy}
          value={entry.text}
          onChange={(event) => update({ ...entry, text: event.currentTarget.value })}
        />
      </label>
      <div className="ssh-workspace-controls">
        <Button type="submit" disabled={busy}>
          保存快捷文本
        </Button>
        <Button type="button" disabled={busy} onClick={cancel}>
          取消编辑
        </Button>
        {existing && !confirmDelete && (
          <Button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>
            删除快捷文本
          </Button>
        )}
        {confirmDelete && (
          <Button type="button" disabled={busy} onClick={remove}>
            确认删除快捷文本
          </Button>
        )}
      </div>
    </form>
  );
}

export function ShortcutPanel() {
  const engine = useEngine();
  const queries = useQueryClient();
  const library = useShortcutLibrary();
  const [edit, setEdit] = useState<Edit>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const snapshot = library.data;
  const heading = useRef<HTMLHeadingElement>(null);

  function editEntry(entry?: Shortcut) {
    if (!snapshot) return;
    setNotice("");
    setError("");
    setEdit({ base: snapshot, entry: entry ?? { id: createRequestId(), name: "", text: "" }, existing: Boolean(entry) });
  }

  function endEdit() {
    setEdit(undefined);
    heading.current?.focus();
  }

  async function save(base: ShortcutLibrary, shortcuts: Shortcut[], closeEdit = false) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await engine.call<ShortcutLibrary>(shortcutNames.save, { expectedRevision: base.revision, shortcuts }, { write: true });
      await queries.invalidateQueries({ queryKey: queryKey(engine.vaultId, shortcutNames.list) });
      if (closeEdit) endEdit();
      setNotice("已保存快捷文本库。");
    } catch (error) {
      const conflict = error instanceof CapabilityError && error.code === "VERSION_CONFLICT";
      setError(conflict ? "快捷文本库已在别处更新，请核对后重新打开条目。" : "无法保存快捷文本库，请核对内容、库容量和写入权限。");
      if (conflict) void library.refetch();
    } finally {
      setBusy(false);
    }
  }

  function saveEdit() {
    if (!edit) return;
    const parsed = Shortcut.safeParse(edit.entry);
    if (!parsed.success) {
      setError("请填写有效的名称和正文，并移除终端控制字符。");
      return;
    }
    const { base, existing } = edit;
    const shortcuts = existing ? base.shortcuts.map((entry) => (entry.id === parsed.data.id ? parsed.data : entry)) : [...base.shortcuts, parsed.data];
    void save(base, shortcuts, true);
  }

  function move(entry: Shortcut, neighbor: Shortcut | undefined) {
    if (!snapshot || !neighbor) return;
    const reordered = snapshot.shortcuts.map((item) => (item.id === entry.id ? neighbor : item.id === neighbor.id ? entry : item));
    void save(snapshot, reordered);
  }

  return (
    <section className="hu-card-alt hu-stack" aria-label="快捷命令库">
      <h2 ref={heading} tabIndex={-1}>
        快捷命令库
      </h2>
      {!snapshot ? (
        <LoadState failed={library.isError} retry={() => void library.refetch()} />
      ) : (
        <>
          <Button type="button" disabled={busy || snapshot.shortcuts.length >= MAX_SHORTCUTS} onClick={() => editEntry()}>
            新增快捷文本
          </Button>
          {edit && (
            <ShortcutEditor
              key={edit.entry.id}
              edit={edit}
              busy={busy}
              update={(entry) => {
                setEdit({ ...edit, entry });
                setError("");
              }}
              cancel={endEdit}
              save={saveEdit}
              remove={() =>
                void save(
                  edit.base,
                  edit.base.shortcuts.filter((entry) => entry.id !== edit.entry.id),
                  true,
                )
              }
            />
          )}
          <ShortcutList shortcuts={snapshot.shortcuts}>
            {(entry, previous, next) => (
              <div className="ssh-workspace-controls">
                <span>{entry.name}</span>
                <Button type="button" disabled={busy} aria-label={`编辑 ${entry.name}`} onClick={() => editEntry(entry)}>
                  编辑
                </Button>
                <Button type="button" disabled={busy || !previous} aria-label={`上移 ${entry.name}`} onClick={() => move(entry, previous)}>
                  上移
                </Button>
                <Button type="button" disabled={busy || !next} aria-label={`下移 ${entry.name}`} onClick={() => move(entry, next)}>
                  下移
                </Button>
              </div>
            )}
          </ShortcutList>
        </>
      )}
      <p role="status">{notice}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
