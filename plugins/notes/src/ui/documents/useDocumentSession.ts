import { queryKey, registerDirtyDoc, registerFlusher, useEngine, useQueryClient } from "@huhu/workbench";
import { browserNoteDraft } from "./browser-note-draft.js";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { archiveNoteRoute } from "../archives/route.js";
import { DocumentSession, type SessionConnection, type SessionSnapshot } from "./DocumentSession.js";
import { DocumentSessionRegistry, type SessionLease } from "./DocumentSessionRegistry.js";

/** 进程内唯一的会话登记表：会话生命周期长于组件（同一文件的多个标签 / park 的编辑器共用）。 */
export const documentSessions = new DocumentSessionRegistry();

function bindDocument(engine: ReturnType<typeof useEngine>, qc: ReturnType<typeof useQueryClient>, path: string): SessionConnection {
  const archive = archiveNoteRoute(path);
  return {
    engine,
    autosave: () => qc.getQueryData<{ editor: { autosave: boolean } }>(queryKey(engine.vaultId, "settings.get"))?.editor.autosave,
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "notes.backlinks", { path }) });
      if (archive?.kind === "archive") void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "archives.read", { path: archive.path }) });
    },
  };
}

export function documentProviderScope(engine: ReturnType<typeof useEngine>): string {
  return `${engine.vaultId}:${engine.connectionGeneration}`;
}

/** Owns the desktop transport even when the Notes module is hidden. */
export function DocumentSessionConnection() {
  const engine = useEngine();
  const qc = useQueryClient();
  useLayoutEffect(() => {
    const { vaultId, connectionGeneration } = engine;
    const disconnect = documentSessions.bindVault(vaultId, connectionGeneration, (path) => bindDocument(engine, qc, path));
    return () => {
      disconnect();
      void import("@huhu/editor/rich").then(({ releaseDocumentProviders }) => {
        if (!documentSessions.isBound(vaultId, connectionGeneration)) releaseDocumentProviders(documentProviderScope(engine));
      });
    };
  }, [engine, qc]);
  return null;
}

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
  writeUnconfirmed: false,
};
const noopSubscribe = () => () => undefined;

/**
 * 取得 `path` 的会话引用（组件卸载 / path 变化时归还；最后一个引用归还时会话落盘或留草稿）。
 * 返回 `session`（未就绪时为 null）与其快照。
 */
export function useDocumentSession(path: string, autosave: boolean): { session: DocumentSession | null; snap: SessionSnapshot } {
  const engine = useEngine();
  const qc = useQueryClient();
  const [binding, setBinding] = useState<{ engine: typeof engine; session: DocumentSession } | null>(null);
  const session = binding?.engine === engine && binding.session.id.path === path ? binding.session : null;
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  useEffect(() => {
    const archive = archiveNoteRoute(path);
    const browserDraft = browserNoteDraft(engine.endpoint, path);
    const reportReleaseError = (err: unknown) => console.error(`释放文档会话失败：${path}`, err);
    let cancelled = false;
    let lease: SessionLease | null = null;
    void documentSessions
      .acquire(
        engine.vaultId,
        path,
        (id) => {
          const binding = bindDocument(engine, qc, path);
          return new DocumentSession({
            id,
            engine: binding.engine,
            ...(browserDraft && { browserDraft }),
            ...(binding.onSaved && { onSaved: binding.onSaved }),
            autosave: () => binding.autosave?.() ?? autosaveRef.current,
          });
        },
        (s) => {
          // 退出前落盘 / 切换 Vault 前的未保存文档：每个会话只注册一次，随会话销毁注销
          const offFlush = registerFlusher(() => s.flushForExit());
          const offDirty = registerDirtyDoc({
            label: path,
            drain: () => s.drainEditors(),
            isDirty: () => s.getSnapshot().hasUnsaved,
            save: () => s.flush({ untilClean: true }),
            keepDraft: () => s.keepDraft(),
            ...(browserDraft && { checkpoint: () => s.checkpointForBrowser(), subscribe: s.subscribe }),
          });
          return () => (offFlush(), offDirty());
        },
      )
      .then((l) => {
        if (cancelled) {
          void l.release().catch(reportReleaseError);
          return;
        }
        lease = l;
        setBinding({ engine, session: l.session });
        if (!l.session.getSnapshot().loaded)
          void l.session.load().catch((error: unknown) => {
            if (!cancelled) l.session.setError(error instanceof Error ? error.message : String(error));
          });
      });
    return () => {
      cancelled = true;
      void lease?.release({ handoff: archive?.kind === "archive" }).catch(reportReleaseError);
    };
  }, [engine, path, qc]);

  const snap = useSyncExternalStore(session ? session.subscribe : noopSubscribe, session ? session.getSnapshot : () => EMPTY);
  return { session, snap };
}
