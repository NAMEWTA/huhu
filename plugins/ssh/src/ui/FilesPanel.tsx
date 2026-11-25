import { Button, EmptyState } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { DirectoryFollowState, FileDirectory, FileDocument, FileEntry, FileSearch, FileSession, PreparedFileDirectory } from "../shared/files.js";
import type { TransferRequest } from "../shared/transfers.js";
import { FileTable } from "./FileTable.js";
import { RemoteTextEditor } from "./RemoteTextEditor.js";
import { RemoteCopyDialog } from "./RemoteCopyDialog.js";
import { FilePropertiesDialog } from "./FilePropertiesDialog.js";
import { CreateFileEntryDialog } from "./CreateFileEntryDialog.js";
import { useFileBatch } from "./FileBatch.js";
import { ArchiveTools } from "./ArchiveTools.js";
import { t } from "./i18n.js";
import { saveDevicePreferences, useDevicePreferences } from "./device-preferences.js";
import { shownFileEntries } from "./file-preferences.js";
import { recordDirectoryMove, type DirectoryHistory, type DirectoryMove } from "./file-history.js";

type Pending = { kind: "overwrite"; what: string; retry: () => Promise<void> } | { kind: "delete"; name: string; path: string } | { kind: "download"; name: string; remote: string } | { kind: "rename"; name: string; from: string };

interface HostBridge {
  pickOpenPath?(kind: "file"): Promise<string | null>;
  pickSavePath?(name: string): Promise<string | null>;
}
const bridge = (): HostBridge => (globalThis as { huhuHost?: HostBridge }).huhuHost ?? {};

const join = (dir: string, name: string) => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`);

/** SSH → 文件（SFTP）：浏览、文本预览、上传、下载、新建文件夹、重命名、删除；覆盖与删除都要先确认。 */
const followStatus = { unsupported: "此 Shell 没有可用的目录集成", busy: "Shell 正忙或输入状态不明确", fullscreen: "Shell 处于全屏应用", ready: "Shell 已确认空闲", ended: "原 Shell 已关闭" };

export function FilesPanel({
  session,
  toolbar,
  title = t.files.title,
  search = false,
  focus,
  followDirectory = false,
}: {
  session: FileSession;
  toolbar?: ReactNode;
  title?: string | undefined;
  search?: boolean;
  focus?: { path: string } | undefined;
  followDirectory?: boolean;
}) {
  const engine = useEngine();
  const preferences = useDevicePreferences();
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [document, setDocument] = useState<FileDocument>();
  const [copyEntry, setCopyEntry] = useState<{ name: string; path: string }>();
  const [propertyPath, setPropertyPath] = useState<string>();
  const [creating, setCreating] = useState<{ kind: "file" | "link"; directory: string }>();
  const [folder, setFolder] = useState("");
  const [upFrom, setUpFrom] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<DirectoryHistory<string>>({ back: [], forward: [] });
  const [pathDraft, setPathDraft] = useState<string>();
  const pathId = useId();
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<FileSearch>();
  const [located, setLocated] = useState<string>();
  const [sftpUnavailable, setSftpUnavailable] = useState(false);
  const [shellDirectory, setShellDirectory] = useState<DirectoryFollowState>();
  const [followNotice, setFollowNotice] = useState("");
  const lastShellCwd = useRef<string>(undefined);
  const mayFollowFile = useRef(false);
  const request = useRef<AbortController>(null);
  const connected = session.state === "ready";
  const ready = connected && !sftpUnavailable;
  const canFollow = followDirectory && !!session.shellId && !!(globalThis as { huhuHost?: HostBridge }).huhuHost;
  useLayoutEffect(() => {
    mayFollowFile.current = canFollow && ready && preferences.followFileDirectory;
    return () => {
      mayFollowFile.current = false;
    };
  }, [canFollow, ready, preferences.followFileDirectory]);
  const shown = shownFileEntries(entries ?? [], filter, preferences);
  const hits = matches?.hits.filter(({ entry, folder }) => preferences.showDotFiles || (!entry.name.startsWith(".") && !folder.split("/").some((part) => part.startsWith(".") && part !== "." && part !== ".."))) ?? [];
  const batch = useFileBatch("remote", cwd, shown, !ready);
  const { fileSessionId } = session;

  const call = useCallback(<T,>(cap: string, input: Record<string, unknown>) => engine.call<T>(cap, { fileSessionId, ...input }, { write: true }), [engine, fileSessionId]);
  const queuedTransfers = !!bridge().pickOpenPath || !!bridge().pickSavePath;
  const load = useCallback(
    async (dir: string, reverse?: DirectoryFollowState) => {
      if (!connected) return undefined;
      request.current?.abort();
      const active = new AbortController();
      request.current = active;
      setError(null);
      try {
        const opts = { write: true, signal: active.signal };
        const prepared = reverse?.state === "ready" ? await engine.call<PreparedFileDirectory>("ssh.fileSessions.prepareDirectory", { fileSessionId, path: dir, revision: reverse.revision }, opts) : undefined;
        const r = prepared ?? (await engine.call<FileDirectory>("ssh.sftp.list", { fileSessionId, path: dir }, opts));
        if (active.signal.aborted) return undefined;
        let followResult: "applied" | "skipped" | "unknown" = prepared && !prepared.skipped ? "applied" : "skipped";
        if (reverse) {
          if (prepared?.follow && mayFollowFile.current) {
            try {
              const result = await engine.call<{ applied: boolean }>("ssh.fileSessions.commitDirectory", { fileSessionId, follow: prepared.follow }, opts);
              followResult = result.applied ? "applied" : "skipped";
            } catch {
              followResult = "unknown";
            }
          } else if (prepared?.follow) followResult = "skipped";
        }
        if (active.signal.aborted) return undefined;
        setSftpUnavailable(false);
        setCwd(r.path);
        setEntries(r.entries);
        if (reverse) {
          setFollowNotice({
            applied: "",
            skipped: "文件夹已打开。本次已跳过 Shell 同步。",
            unknown: "文件夹已打开。无法确认 Shell 是否已同步。",
          }[followResult]);
        }
        return r.path;
      } catch (e) {
        if (!active.signal.aborted) {
          if (e instanceof CapabilityError && e.details?.reason === "sftp-unavailable") setSftpUnavailable(true);
          setError(e instanceof Error ? e.message : String(e));
        }
        return undefined;
      } finally {
        if (request.current === active) request.current = null;
      }
    },
    [engine, fileSessionId, connected],
  );
  useLayoutEffect(() => () => request.current?.abort(), [fileSessionId]);
  useEffect(() => {
    void load("");
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!focus) return;
    const index = focus.path.lastIndexOf("/");
    void load(focus.path.slice(0, index) || "/").then((dir) => {
      if (dir !== undefined) {
        setFilter("");
        setLocated(focus.path.slice(index + 1));
      }
    });
  }, [load, focus]);

  useEffect(() => {
    if (!canFollow || !ready || (!preferences.followShellDirectory && !preferences.followFileDirectory)) return;
    const active = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function readDirectory() {
      try {
        const next = await engine.call<DirectoryFollowState>("ssh.fileSessions.directory", { fileSessionId }, { signal: active.signal });
        if (!active.signal.aborted) setShellDirectory(next);
      } catch {
        if (!active.signal.aborted) setShellDirectory(undefined);
      } finally {
        if (!active.signal.aborted) timer = setTimeout(() => void readDirectory(), 500);
      }
    }
    void readDirectory();
    return () => {
      active.abort();
      clearTimeout(timer);
    };
  }, [canFollow, ready, preferences.followShellDirectory, preferences.followFileDirectory, fileSessionId, engine]);

  useEffect(() => {
    if (!canFollow || !ready || !preferences.followShellDirectory) {
      lastShellCwd.current = undefined;
      return;
    }
    const dir = shellDirectory?.cwd;
    if (!dir || lastShellCwd.current === dir || request.current || busy || searching || pending || document || preview || propertyPath || creating || copyEntry) return;
    lastShellCwd.current = dir;
    if (dir !== cwd) void load(dir);
  }, [canFollow, ready, preferences.followShellDirectory, shellDirectory, cwd, load, busy, searching, pending, document, preview, propertyPath, creating, copyEntry]);

  const reverseNavigation = () => (canFollow && preferences.followFileDirectory ? (shellDirectory ?? { state: "unsupported" as const, revision: 0 }) : undefined);

  async function navigate(dir: string, name?: string, direction: DirectoryMove = "open") {
    setFollowNotice("");
    setPreview(null);
    const next = await load(dir, reverseNavigation());
    if (next === undefined) return;
    if (cwd && (next !== cwd || direction !== "open")) setHistory((current) => recordDirectoryMove(current, cwd, direction));
    setPathDraft((current) => current === pathDraft ? undefined : current);
    setFilter("");
    setLocated(name);
  }

  async function find() {
    if (!ready || searching || !query.trim()) return;
    setSearching(true);
    setMatches(undefined);
    setError(null);
    try {
      setMatches(await engine.call<FileSearch>("ssh.fileSessions.search", { fileSessionId, path: cwd, query: query.trim() }, { write: true }));
    } catch (error) {
      if (error instanceof Error && !error.message.includes("已取消")) setError(error.message);
    } finally {
      setSearching(false);
    }
  }

  /** 执行一个可能因“已存在”而需要确认覆盖的操作。 */
  async function attempt(what: string, run: (overwrite: boolean) => Promise<unknown>, after?: () => void) {
    setError(null);
    setNote(null);
    setBusy(true);
    const go = async (overwrite: boolean): Promise<void> => {
      setBusy(true);
      try {
        const r = await run(overwrite);
        setPending(null);
        setNote(r && typeof r === "object" && "size" in r ? t.files.transferred((r as { size: number }).size) : t.files.done);
        after?.();
        await load(cwd);
      } catch (e) {
        if (e instanceof CapabilityError && e.code === "NAME_CONFLICT" && !overwrite) setPending({ kind: "overwrite", what, retry: () => go(true) });
        else setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    await go(false);
  }

  async function enqueue(input: TransferRequest, after?: () => void): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await engine.call("ssh.transfers.start", input, { write: true });
      setNote("已加入传输中心");
      after?.();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openEntry = async (e: FileEntry) => {
    if (e.type === "dir") return void navigate(join(cwd, e.name));
    setError(null);
    setPreview(null);
    try {
      const r = await call<{ text: string }>("ssh.sftp.read", { path: join(cwd, e.name) });
      setPreview({ name: e.name, text: r.text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  async function editEntry(e: FileEntry) {
    setError(null);
    try {
      setDocument(await engine.call<FileDocument>("ssh.fileSessions.document.open", { fileSessionId, path: join(cwd, e.name) }));
    } catch (error) {
      if (error instanceof Error) setError(error.message);
    }
  }
  const up = cwd.split("/").slice(0, -1).join("/") || "/";

  return (
    <section data-testid="files-panel" aria-label={title} {...batch.drop}>
      <h2>{title}</h2>
      {batch.controls}
      {queuedTransfers ? <ArchiveTools side="remote" directory={cwd} entries={entries ?? []} id={fileSessionId} ready={ready} refresh={() => void load(cwd)} /> : <p>ZIP 归档和本机路径选取可在支持的桌面应用中使用。</p>}
      <div className="ssh-workspace-controls">
        <Button disabled={!ready} onClick={() => void navigate("")}>
          {t.files.home}
        </Button>
        <Button
          disabled={!ready || history.back.length === 0}
          onClick={() => void navigate(history.back.at(-1)!, undefined, "back")}
        >
          返回目录
        </Button>
        <Button disabled={!ready || history.forward.length === 0} onClick={() => void navigate(history.forward.at(-1)!, undefined, "forward")}>
          前进目录
        </Button>
        <Button disabled={!ready || cwd === "/" || !cwd} onClick={() => void navigate(up)} data-testid="files-up">
          {t.files.up}
        </Button>
        <Button disabled={!connected} onClick={() => void load(cwd)}>
          {t.files.refresh}
        </Button>
        <Button disabled={!ready || !cwd} onClick={() => setCreating({ kind: "file", directory: cwd })}>
          新建文件
        </Button>
        <Button disabled={!ready || !cwd} onClick={() => setCreating({ kind: "link", directory: cwd })}>
          新建符号链接
        </Button>
        <Button disabled={!ready || !cwd || bookmarks.includes(cwd)} onClick={() => setBookmarks([...bookmarks, cwd])}>
          收藏远端目录
        </Button>
        {toolbar}
        <code className="ssh-file-path" data-testid="files-path" aria-label={t.files.path}>
          {cwd || "…"}
        </code>
      </div>
      <form className="ssh-workspace-controls ssh-file-address" onSubmit={(event) => {
        event.preventDefault();
        if (ready && pathDraft !== undefined) void navigate(pathDraft);
      }}>
        <label htmlFor={pathId}>远端路径</label>
        <input id={pathId} value={pathDraft ?? cwd} maxLength={4096} disabled={!ready} onChange={(event) => setPathDraft(event.target.value)} />
        <Button type="submit" disabled={!ready || pathDraft === undefined || !pathDraft.trim()}>转到路径</Button>
      </form>
      {session.state === "disconnected" && <p role="status">原连接已断开</p>}
      {canFollow && (
        <div className="ssh-workspace-controls" aria-label="目录跟随">
          <label>
            <input type="checkbox" checked={preferences.followShellDirectory} onChange={(event) => saveDevicePreferences({ followShellDirectory: event.target.checked })} /> 文件面板跟随 Shell
          </label>
          <label>
            <input type="checkbox" checked={preferences.followFileDirectory} onChange={(event) => saveDevicePreferences({ followFileDirectory: event.target.checked })} /> Shell 跟随文件面板
          </label>
          <span>{!ready ? "文件会话不可用" : !preferences.followShellDirectory && !preferences.followFileDirectory ? "跟随已关闭" : followStatus[shellDirectory?.state ?? "unsupported"]}</span>
          {followNotice && <span role="status">{followNotice}</span>}
        </div>
      )}
      <details>
        <summary>文件后端</summary>
        <p>文件操作使用当前 SSH 账户的 SFTP 权限。SCP 回退和独立的文件 sudo 后端当前不可用。</p>
      </details>
      {propertyPath && <FilePropertiesDialog session={session} path={propertyPath} onClose={() => setPropertyPath(undefined)} onSaved={() => void load(cwd)} />}
      {creating && (
        <CreateFileEntryDialog
          session={session}
          {...creating}
          onClose={() => setCreating(undefined)}
          onSaved={() => {
            setCreating(undefined);
            void load(cwd);
          }}
        />
      )}
      {bookmarks.length > 0 && (
        <div className="ssh-workspace-controls" aria-label="远端书签">
          {bookmarks.map((dir) => (
            <Button disabled={!ready} key={dir} onClick={() => void navigate(dir)}>
              {dir}
            </Button>
          ))}
        </div>
      )}
      {search ? (
        <>
          <form
            className="hu-form"
            onSubmit={(event) => {
              event.preventDefault();
              void find();
            }}
          >
            <label>
              递归搜索文件名 <input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <Button type="submit" disabled={!ready || !query.trim() || searching}>
              搜索
            </Button>
            {searching && <Button onClick={() => void engine.call("ssh.fileSessions.cancelSearch", { fileSessionId }, { write: true }).catch(() => undefined)}>取消搜索</Button>}
          </form>
          {matches && (
            <section aria-label="文件名搜索结果">
              <p role="status">
                {hits.length} 项{matches.limited ? "，已达到搜索上限" : ""}
                {matches.skipped ? `，跳过 ${matches.skipped} 个目录` : ""}
              </p>
              <ul>
                {hits.map(({ folder, entry }) => (
                  <li key={join(folder, entry.name)}>
                    <Button disabled={!ready} onClick={() => void navigate(folder, entry.name)}>
                      {join(folder, entry.name)}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <label>
          筛选远端目录 <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      )}
      {busy ? (
        <div className="hu-row" role="status">
          <span>{t.files.working}</span>
          <Button onClick={() => void call("ssh.sftp.cancel", {}).catch(() => undefined)} data-testid="files-cancel">
            {t.files.cancelTransfer}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="hu-overdue" data-testid="files-error">
          {error}
        </div>
      ) : null}
      {note ? (
        <div role="status" data-testid="files-note">
          {note}
        </div>
      ) : null}

      {ready && pending?.kind === "overwrite" ? (
        <div role="alertdialog" aria-label={t.files.overwrite(pending.what)} data-testid="files-overwrite">
          <p>{t.files.overwrite(pending.what)}</p>
          <Button variant="danger" onClick={() => void pending.retry()} data-testid="files-overwrite-yes">
            {t.files.overwriteYes}
          </Button>
          <Button onClick={() => setPending(null)} data-testid="files-overwrite-no">
            {t.files.cancel}
          </Button>
        </div>
      ) : null}
      {ready && pending?.kind === "delete" ? (
        <div role="alertdialog" aria-label={t.files.confirmDelete(pending.name)} data-testid="files-delete-dialog">
          <p>{t.files.confirmDelete(pending.name)}</p>
          <Button variant="danger" onClick={() => void attempt(pending.name, () => call("ssh.sftp.delete", { path: pending.path }))} data-testid="files-delete-yes">
            {t.files.delete}
          </Button>
          <Button onClick={() => setPending(null)}>{t.files.cancel}</Button>
        </div>
      ) : null}
      {ready && pending?.kind === "download" ? (
        <form
          className="hu-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            const p = pending;
            if (queuedTransfers) {
              void enqueue({ source: { kind: "remote", path: p.remote, fileSessionId }, target: { kind: "local", path: field.trim() } }, () => setPending(null));
              return;
            }
            void attempt(
              p.name,
              (o) => call("ssh.sftp.download", { remotePath: p.remote, localPath: field.trim(), overwrite: o }),
              () => setPending(null),
            );
          }}
        >
          <input className="hu-input" aria-label={t.files.saveTo} data-testid="files-save-to" value={field} onChange={(ev) => setField(ev.target.value)} placeholder="/…/" />
          {bridge().pickSavePath ? (
            <Button
              type="button"
              onClick={() =>
                void bridge()
                  .pickSavePath?.(pending.name)
                  .then((p) => {
                    if (p) setField(p);
                  })
              }
            >
              {t.files.choose}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={!field.trim() || busy} data-testid="files-download-go">
            {t.files.download}
          </Button>
          <Button type="button" onClick={() => setPending(null)}>
            {t.files.cancel}
          </Button>
        </form>
      ) : null}
      {ready && pending?.kind === "rename" ? (
        <form
          className="hu-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            const p = pending;
            void attempt(
              field.trim(),
              (o) => call("ssh.sftp.rename", { from: p.from, to: join(cwd, field.trim()), overwrite: o }),
              () => setPending(null),
            );
          }}
        >
          <input className="hu-input" aria-label={t.files.newName} data-testid="files-rename-to" value={field} onChange={(ev) => setField(ev.target.value)} />
          <Button type="submit" variant="primary" disabled={!field.trim() || field.includes("/") || busy} data-testid="files-rename-go">
            {t.files.rename}
          </Button>
          <Button type="button" onClick={() => setPending(null)}>
            {t.files.cancel}
          </Button>
        </form>
      ) : null}

      {sftpUnavailable ? null : entries === null ? (
        <p>…</p>
      ) : shown.length === 0 ? (
        <EmptyState title={t.files.empty} />
      ) : (
        <FileTable
          caption="远端目录项目"
          selection={batch.selection}
          entries={shown}
          disabled={!ready}
          current={located ?? null}
          onOpen={(entry) => void openEntry(entry)}
          actions={(e) => (
            <>
              <Button disabled={!ready} aria-label={`属性 ${e.name}`} onClick={() => setPropertyPath(join(cwd, e.name))}>
                属性
              </Button>
              {queuedTransfers && e.type === "file" && (
                <Button
                  disabled={!ready}
                  aria-label={`跨 SSH 复制 ${e.name}`}
                  onClick={() => {
                    setError(null);
                    setCopyEntry({ name: e.name, path: join(cwd, e.name) });
                  }}
                >
                  跨 SSH 复制
                </Button>
              )}
              {e.type === "file" && (
                <Button disabled={!ready} aria-label={`编辑 ${e.name}`} onClick={() => void editEntry(e)}>
                  编辑
                </Button>
              )}
              {e.type === "file" ? (
                <Button
                  aria-label={`${t.files.download} ${e.name}`}
                  disabled={!ready}
                  onClick={() => {
                    setField("");
                    setPending({ kind: "download", name: e.name, remote: join(cwd, e.name) });
                  }}
                >
                  {t.files.download}
                </Button>
              ) : null}
              <Button
                aria-label={`${t.files.rename} ${e.name}`}
                disabled={!ready}
                onClick={() => {
                  setField(e.name);
                  setPending({ kind: "rename", name: e.name, from: join(cwd, e.name) });
                }}
              >
                {t.files.rename}
              </Button>
              <Button variant="danger" disabled={!ready} aria-label={`${t.files.delete} ${e.name}`} onClick={() => setPending({ kind: "delete", name: e.name, path: join(cwd, e.name) })}>
                {t.files.delete}
              </Button>
            </>
          )}
        />
      )}
      {preview ? (
        <>
          <h3>
            {t.files.preview}：{preview.name}
          </h3>
          <pre data-testid="files-preview" style={{ maxHeight: "30vh", overflow: "auto" }}>
            {preview.text}
          </pre>
        </>
      ) : null}
      {document && <RemoteTextEditor key={document.path} initial={document} session={session} onClose={() => setDocument(undefined)} />}
      {copyEntry && (
        <RemoteCopyDialog
          source={session}
          name={copyEntry.name}
          error={error}
          onClose={() => setCopyEntry(undefined)}
          onCopy={(to, path) =>
            enqueue({
              source: { kind: "remote", fileSessionId, path: copyEntry.path },
              target: { kind: "remote", fileSessionId: to, path },
            })
          }
        />
      )}

      <form
        className="hu-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void attempt(
            folder.trim(),
            () => call("ssh.sftp.mkdir", { path: join(cwd, folder.trim()) }),
            () => setFolder(""),
          );
        }}
      >
        <input className="hu-input" aria-label={t.files.folderName} data-testid="files-folder" placeholder={t.files.folderName} value={folder} onChange={(ev) => setFolder(ev.target.value)} />
        <Button type="submit" disabled={!ready || !folder.trim() || folder.includes("/") || busy}>
          {t.files.newFolder}
        </Button>
      </form>
      <form
        className="hu-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          const name = upFrom.split(/[\\/]/).pop() ?? "";
          if (queuedTransfers) {
            void enqueue({ source: { kind: "local", path: upFrom.trim() }, target: { kind: "remote", path: join(cwd, name), fileSessionId } }, () => setUpFrom(""));
            return;
          }
          void attempt(
            name,
            (o) => call("ssh.sftp.upload", { localPath: upFrom.trim(), remotePath: join(cwd, name), overwrite: o }),
            () => setUpFrom(""),
          );
        }}
      >
        <input className="hu-input" aria-label={t.files.uploadFrom} data-testid="files-upload-from" placeholder={t.files.uploadFrom} value={upFrom} onChange={(ev) => setUpFrom(ev.target.value)} />
        {bridge().pickOpenPath ? (
          <Button
            type="button"
            onClick={() =>
              void bridge()
                .pickOpenPath?.("file")
                .then((p) => {
                  if (p) setUpFrom(p);
                })
            }
          >
            {t.files.choose}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={!ready || !upFrom.trim() || busy} data-testid="files-upload-go">
          {t.files.uploadTo}
        </Button>
      </form>
    </section>
  );
}
