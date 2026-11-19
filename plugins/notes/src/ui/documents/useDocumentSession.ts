import { queryKey, registerDirtyDoc, registerFlusher, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { archiveNoteRoute } from "../archives/route.js";
import { DocumentSession, type SessionSnapshot } from "./DocumentSession.js";
import { DocumentSessionRegistry, type SessionLease } from "./DocumentSessionRegistry.js";

/** 进程内唯一的会话登记表：会话生命周期长于组件（同一文件的多个标签 / park 的编辑器共用）。 */
export const documentSessions = new DocumentSessionRegistry();

const EMPTY: SessionSnapshot = {
  loaded: false,
  text: "",
  state: "saved",
  baseVersion: "",
  dirtyRevision: 0,
  flushError: null,
  draft: null,
  format: { bom: false, eol: "none", finalNewline: false },
  hasUnsaved: false,
};
const noopSubscribe = () => () => undefined;

/**
 * 取得 `path` 的会话引用（组件卸载 / path 变化时归还；最后一个引用归还时会话落盘或留草稿）。
 * 返回 `session`（未就绪时为 null）与其快照。
 */
export function useDocumentSession(path: string, autosave: boolean): { session: DocumentSession | null; snap: SessionSnapshot } {
  const engine = useEngine();
  const qc = useQueryClient();
  const [session, setSession] = useState<DocumentSession | null>(null);
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  useEffect(() => {
    const archive = archiveNoteRoute(path);
    const reportReleaseError = (err: unknown) => console.error(`释放文档会话失败：${path}`, err);
    let cancelled = false;
    let lease: SessionLease | null = null;
    setSession(null);
    void documentSessions
      .acquire(
        engine.vaultId,
        path,
        (id) =>
          new DocumentSession({
            id,
            engine: { call: (cap, input, opts) => engine.call(cap, input, opts) },
            // 同一会话可以移交到另一个视图。读共享设置缓存，使旧视图卸载后仍能读取最新偏好。
            autosave: () => qc.getQueryData<{ editor: { autosave: boolean } }>(queryKey(engine.vaultId, "settings.get"))?.editor.autosave ?? autosaveRef.current,
            onSaved: () => {
              void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "notes.backlinks", { path }) });
              if (archive?.kind === "archive") void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "archives.read", { path: archive.path }) });
            },
          }),
        (s) => {
          // 退出前落盘 / 切换 Vault 前的未保存文档：每个会话只注册一次，随会话销毁注销
          const offFlush = registerFlusher(() => s.flushForExit());
          const offDirty = registerDirtyDoc({ label: path, drain: () => s.drainEditors(), isDirty: () => s.getSnapshot().hasUnsaved, save: () => s.flush(), keepDraft: () => s.keepDraft() });
          return () => (offFlush(), offDirty());
        },
      )
      .then((l) => {
        if (cancelled) {
          void l.release().catch(reportReleaseError);
          return;
        }
        lease = l;
        setSession(l.session);
        if (!l.session.getSnapshot().loaded) void l.session.load().catch(() => undefined);
      });
    return () => {
      cancelled = true;
      setSession(null);
      void lease?.release({ handoff: archive?.kind === "archive" }).catch(reportReleaseError);
    };
  }, [engine, path, qc]);

  // 外部（同步、其他工具）改了当前文件
  useEngineEvents((e) => {
    if (e.type !== "vault.fileChanged") return;
    const p = e.payload as { path?: string; change?: string };
    if (p.path !== path || p.change === "deleted") return;
    session?.notifyExternalChange();
  });

  const snap = useSyncExternalStore(session ? session.subscribe : noopSubscribe, session ? session.getSnapshot : () => EMPTY);
  return { session, snap };
}
