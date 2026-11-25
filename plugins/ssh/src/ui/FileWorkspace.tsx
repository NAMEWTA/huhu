import { Button, EmptyState, PageHead } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useEffect, useState } from "react";
import type { FileDirectory, FileSession } from "../shared/files.js";
import { FilesPanel } from "./FilesPanel.js";
import { FileTable } from "./FileTable.js";
import { TransferCenter } from "./TransferCenter.js";
import { FileBatchProvider, useFileBatch } from "./FileBatch.js";
import { ArchiveTools } from "./ArchiveTools.js";
import { useDevicePreferences } from "./device-preferences.js";
import { shownFileEntries } from "./file-preferences.js";
import { recordDirectoryMove, type DirectoryHistory, type DirectoryMove } from "./file-history.js";
import "./files.css";

interface LocalBridge {
  pickOpenPath?(kind: "directory"): Promise<string | null>;
}

function localPicker() {
  return (globalThis as { huhuHost?: LocalBridge }).huhuHost?.pickOpenPath;
}

function source(session: FileSession) {
  return `${session.user}@${session.host.includes(":") ? `[${session.host}]` : session.host}:${session.port}`;
}

export function AttachedFiles({ hostId, shellId, onOpen, title, followDirectory = false }: { hostId: string; shellId?: string | null; onOpen: (session: FileSession) => void; title?: string; followDirectory?: boolean }) {
  const engine = useEngine();
  const [session, setSession] = useState<FileSession>();
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let closed = false;
    let id: string | undefined;
    const close = (fileSessionId: string) => void engine.call("ssh.fileSessions.close", { fileSessionId, attached: true }, { write: true }).catch(() => undefined);
    void engine.call<FileSession>("ssh.fileSessions.open", { hostId, ...(shellId ? { shellId } : {}), attached: true }, { write: true }).then(
      (value) => {
        if (closed) close(value.fileSessionId);
        else {
          id = value.fileSessionId;
          setSession(value);
        }
      },
      (error: unknown) => {
        if (!closed && error instanceof Error) setError(error.message);
      },
    );
    return () => {
      closed = true;
      if (id) close(id);
    };
  }, [engine, hostId, shellId]);

  useEngineEvents((event) => {
    if (event.type === "ssh.connectionChanged" && "hostId" in event.payload && event.payload.hostId === hostId && "state" in event.payload && event.payload.state === "disconnected") {
      setSession((current) => current && { ...current, state: "disconnected" });
    }
  });

  async function openIndependent() {
    if (!session || opening) return;
    setOpening(true);
    setError("");
    try {
      onOpen(await engine.call<FileSession>("ssh.fileSessions.open", { fromFileSessionId: session.fileSessionId }, { write: true }));
    } catch (error) {
      if (error instanceof Error) setError(error.message);
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {session ? (
        <FilesPanel
          key={session.fileSessionId}
          session={session}
          title={title}
          search
          followDirectory={followDirectory}
          toolbar={
            <Button loading={opening} disabled={session.state !== "ready"} onClick={() => void openIndependent()}>
              打开独立双栏
            </Button>
          }
        />
      ) : (
        !error && <p role="status">正在绑定文件会话…</p>
      )}
    </>
  );
}

function LocalFiles({ id }: { id: string }) {
  const engine = useEngine();
  const preferences = useDevicePreferences();
  const [parts, setParts] = useState<string[]>([]);
  const [where, setWhere] = useState<FileDirectory>();
  const [history, setHistory] = useState<DirectoryHistory<string[]>>({ back: [], forward: [] });
  const [bookmarks, setBookmarks] = useState<{ path: string; parts: string[] }[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const picker = localPicker();
  const shown = shownFileEntries(where?.entries ?? [], filter, preferences);
  const batch = useFileBatch("local", where?.path ?? "", shown, loading);
  async function navigate(next: string[], root?: string, direction: DirectoryMove = "open") {
    setLoading(true);
    setError("");
    try {
      const directory = await engine.call<FileDirectory>("ssh.fileSessions.localList", { fileSessionId: id, parts: next, ...(root ? { root } : {}) });
      setWhere(directory);
      setParts(next);
      setFilter("");
      if (root) {
        setBookmarks([]);
        setHistory({ back: [], forward: [] });
      } else if (where && (where.path !== directory.path || direction !== "open")) {
        setHistory((current) => recordDirectoryMove(current, parts, direction));
      }
    } catch (error) {
      if (error instanceof Error) setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section aria-label="本机文件" {...batch.drop}>
      <h2>本机文件</h2>
      {batch.controls}
      {picker && <ArchiveTools side="local" directory={where?.path ?? ""} entries={where?.entries ?? []} id={id} ready refresh={() => void navigate(parts)} />}
      {picker ? (
        <>
          <div className="ssh-workspace-controls">
            <Button
              disabled={loading}
              onClick={() =>
                void picker("directory")
                  .then((root) => {
                    if (root) return navigate([], root);
                  })
                  .catch(() => setError("无法打开本机目录选择器"))
              }
            >
              选择本机目录
            </Button>
            <Button disabled={loading || history.back.length === 0} onClick={() => void navigate(history.back.at(-1)!, undefined, "back")}>
              返回目录
            </Button>
            <Button disabled={loading || history.forward.length === 0} onClick={() => void navigate(history.forward.at(-1)!, undefined, "forward")}>
              前进目录
            </Button>
            <Button disabled={loading || parts.length === 0} onClick={() => void navigate(parts.slice(0, -1))}>
              返回上级
            </Button>
            {where && (
              <Button disabled={loading || bookmarks.some(({ path }) => path === where.path)} onClick={() => setBookmarks([...bookmarks, { path: where.path, parts }])}>
                收藏本机目录
              </Button>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          {where && (
            <>
              <p>
                <code>{where.path}</code>
              </p>
              <label>
                筛选本机目录 <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
              </label>
              {bookmarks.length > 0 && (
                <div className="ssh-workspace-controls" aria-label="本机书签">
                  {bookmarks.map(({ path, parts }) => (
                    <Button disabled={loading} key={path} onClick={() => void navigate(parts)}>
                      {path}
                    </Button>
                  ))}
                </div>
              )}
              <FileTable
                caption="本机目录项目"
                entries={shown}
                selection={batch.selection}
                disabled={loading}
                onOpen={(entry) => {
                  if (entry.type === "dir") void navigate([...parts, entry.name]);
                }}
              />
            </>
          )}
        </>
      ) : (
        <p>系统目录选取可在桌面应用中使用。</p>
      )}
    </section>
  );
}

export function FileWorkspace({ active, selectedId, seed, select, onBack }: { active: boolean; selectedId: string; seed: FileSession | null; select: (id: string) => void; onBack: () => void }) {
  const engine = useEngine();
  const { remoteOnLeft } = useDevicePreferences();
  const qc = useQueryClient();
  const sessions = useCapability<FileSession[]>("ssh.fileSessions.list", {});
  const [error, setError] = useState("");
  const [reversed, setReversed] = useState<Record<string, boolean>>({});
  const [transfers, showTransfers] = useState(false);
  useEffect(() => {
    if (seed) showTransfers(false);
  }, [seed]);
  const [fileFocus, setFileFocus] = useState<{ id: string; path: string }>();
  const current = sessions.data?.find(({ fileSessionId }) => fileSessionId === selectedId) ?? (sessions.isFetching && seed?.fileSessionId === selectedId ? seed : undefined);
  useEffect(() => {
    if (active) void qc.invalidateQueries({ queryKey: [engine.vaultId, "ssh.fileSessions.list"] });
  }, [active, selectedId, qc, engine.vaultId, seed]);
  useEngineEvents((event) => {
    if (event.type === "ssh.connectionChanged" || (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-external-file-session")) {
      void qc.invalidateQueries({ queryKey: [engine.vaultId, "ssh.fileSessions.list"] });
    }
  });

  async function close(id: string) {
    setError("");
    try {
      await engine.call("ssh.fileSessions.close", { fileSessionId: id }, { write: true });
      select("");
      await sessions.refetch();
    } catch (error) {
      if (error instanceof Error) setError(error.message);
    }
  }
  return (
    <div className="ssh-file-view" hidden={!active}>
      <div className="hu-module-layout hu-execution-module" data-testid="ssh-file-workspace">
        <aside className="hu-resource-pane" aria-label="独立文件会话">
          <div className="hu-resource-head">
            <Button variant="ghost" onClick={onBack}>
              返回 SSH
            </Button>
            {localPicker() && (
              <Button variant="ghost" aria-pressed={transfers} onClick={() => showTransfers(true)}>
                传输中心
              </Button>
            )}
          </div>
          <div className="hu-resource-list">
            {sessions.data?.map((session) => (
              <button
                key={session.fileSessionId}
                className="ssh-resource-row"
                type="button"
                aria-current={!transfers && session.fileSessionId === selectedId}
                onClick={() => {
                  select(session.fileSessionId);
                  showTransfers(false);
                }}
              >
                <strong>{session.name}</strong>
                <span>{session.source === "external" ? "外部工具会话" : session.state === "ready" ? "原连接在线" : "原连接已断开"}</span>
              </button>
            ))}
          </div>
        </aside>
        <main className="hu-view-content">
          <PageHead title="独立文件会话" />
          <div className="hu-scroll ssh-pad">
            {(error || sessions.error) && <p role="alert">{error || sessions.error?.message}</p>}
            {active && transfers && (
              <TransferCenter
                onOrigin={(session) => {
                  setFileFocus({ id: session.fileSessionId, path: session.transferPath });
                  select(session.fileSessionId);
                  showTransfers(false);
                  void sessions.refetch();
                }}
              />
            )}
            {!transfers && !current && <EmptyState title="从已连接的主机或分栏打开独立双栏" />}
            {!transfers && current?.source === "external" && (
              <section>
                <h2>外部工具文件会话 · {current.name}</h2>
                <p>
                  <code>{source(current)}</code>
                </p>
                <Button onClick={() => void close(current.fileSessionId)}>关闭外部文件会话</Button>
              </section>
            )}
            {sessions.data?.map((session) => {
              if (session.source === "external") return null;
              const panes = [<LocalFiles key="local" id={session.fileSessionId} />, <FilesPanel key="remote" session={session} focus={fileFocus?.id === session.fileSessionId ? fileFocus : undefined} />];
              const remoteFirst = reversed[session.fileSessionId] ?? remoteOnLeft;
              if (remoteFirst) panes.reverse();
              return (
                <section
                  key={session.fileSessionId}
                  hidden={transfers || session.fileSessionId !== selectedId}
                  data-file-session-id={session.fileSessionId}
                  data-connection-id={session.connectionId}
                  data-testid="ssh-independent-files"
                  aria-label={session.name}
                >
                  <h2>
                    {session.name} · <code>{source(session)}</code>
                  </h2>
                  <p role="status">{session.state === "ready" ? "原连接在线" : "原连接已断开，远端操作已停用"}</p>
                  {session.shellId && (
                    <p>
                      来源 Shell <code>{session.shellId}</code>
                    </p>
                  )}
                  <div className="ssh-workspace-controls">
                    <Button onClick={() => setReversed((current) => ({ ...current, [session.fileSessionId]: !remoteFirst }))}>交换左右位置</Button>
                    <Button onClick={() => void close(session.fileSessionId)}>关闭独立文件视图</Button>
                  </div>
                  {localPicker() ? (
                    <FileBatchProvider session={session}>
                      {panes}
                    </FileBatchProvider>
                  ) : (
                    <div className="ssh-file-columns">{panes}</div>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
