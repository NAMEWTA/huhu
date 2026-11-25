import { Button } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { FileEntry, FileSession } from "../shared/files.js";
import type { TransferBatchRequest } from "../shared/transfers.js";

type Side = "local" | "remote";
type DragSelection = { side: Side; directory: string; names: string[] };
const MIME = "application/x-huhu-directory-selection";
const opposite = (from: Side) => (from === "local" ? "remote" : "local");
const Context = createContext<{
  locations: Partial<Record<Side, string>>;
  showDirectory: (side: Side, directory: string) => void;
  drag: { current: DragSelection | undefined };
  submit: (from: DragSelection) => void;
  report: (message: string) => void;
  busy: boolean;
} | null>(null);

export function FileBatchProvider({ session, children }: { session: FileSession; children: ReactNode }) {
  const engine = useEngine();
  const [locations, setLocations] = useState<Partial<Record<Side, string>>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const drag = useRef<DragSelection>(undefined);
  const showDirectory = useCallback((side: Side, directory: string) => {
    setLocations((current) => (current[side] === directory ? current : { ...current, [side]: directory }));
  }, []);
  function submit(from: DragSelection) {
    const destination = locations[opposite(from.side)];
    if (!destination || !from.names.length || locations[from.side] !== from.directory || busy || session.state !== "ready") return;
    const endpoint = (side: Side, path: string): TransferBatchRequest["source"] => (side === "local" ? { kind: side, path } : { kind: side, path, fileSessionId: session.fileSessionId });
    setBusy(true);
    setNote("");
    setError("");
    void engine
      .call(
        "ssh.transfers.startBatch",
        {
          source: endpoint(from.side, from.directory),
          target: endpoint(opposite(from.side), destination),
          names: from.names,
          localFileSessionId: session.fileSessionId,
        } satisfies TransferBatchRequest,
        { write: true },
      )
      .then(
        () => setNote("已加入传输中心，目录和文件分别核对"),
        (error: unknown) => setError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  }
  return (
    <Context.Provider value={{ locations, showDirectory, drag, submit, report: setError, busy }}>
      {note && <p role="status">{note}</p>}
      {error && <p role="alert">{error}</p>}
      {children}
    </Context.Provider>
  );
}

export function useFileBatch(side: Side, directory: string, entries: FileEntry[], disabled: boolean) {
  const batch = useContext(Context);
  const update = batch?.showDirectory;
  const [selection, setSelection] = useState<{ directory: string; names: string[] }>({ directory, names: [] });
  useEffect(() => {
    update?.(side, directory);
  }, [side, directory, update]);
  if (!batch) return {};
  const visible = new Set(entries.filter(({ type }) => type === "dir" || type === "file").map(({ name }) => name));
  const names = selection.directory === directory ? selection.names.filter((name) => visible.has(name)) : [];
  const blocked = disabled || !directory || !batch.locations[opposite(side)] || batch.busy;
  const start = (file: string, event: DragEvent) => {
    if (blocked || !visible.has(file)) return;
    batch.drag.current = { side, directory, names: names.includes(file) ? names : [file] };
    event.dataTransfer.setData(MIME, "selection");
    event.dataTransfer.effectAllowed = "copy";
  };
  return {
    controls: (
      <Button disabled={blocked || !names.length} onClick={() => batch.submit({ side, directory, names })}>
        {side === "local" ? "上传所选项目" : "下载所选项目"}
      </Button>
    ),
    selection: {
      names,
      disabled: disabled || batch.busy,
      canDrag: !blocked,
      toggle: (name: string) => setSelection({ directory, names: names.includes(name) ? names.filter((entry) => entry !== name) : [...names, name] }),
      start,
      end: () => {
        batch.drag.current = undefined;
      },
    },
    drop: {
      onDragOver(event: DragEvent) {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
        } else if (!blocked && batch.drag.current?.side === opposite(side) && event.dataTransfer.types.includes(MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      },
      onDrop(event: DragEvent) {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          batch.report("系统拖入无法提供可绑定的本机路径，请先选择本机目录，再勾选或拖动表格项目");
          return;
        }
        const from = batch.drag.current;
        if (blocked || !from || from.side !== opposite(side) || !event.dataTransfer.types.includes(MIME)) return;
        event.preventDefault();
        batch.drag.current = undefined;
        batch.submit(from);
      },
    },
  };
}
