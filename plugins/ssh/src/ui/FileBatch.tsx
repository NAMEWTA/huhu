import { Button } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import type { FileEntry, FileSession } from "../shared/files.js";
import type { TransferBatchRequest } from "../shared/transfers.js";

type Side = "local" | "remote";
type DragSelection = { side: Side; directory: string; names: string[] };
type HandleEvent = PointerEvent<HTMLSpanElement>;
type FileDrag = {
  handle: HTMLSpanElement;
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
  from: DragSelection;
  listeners: AbortController;
};
export type FileBatchSelection = {
  names: string[];
  disabled: boolean;
  canDrag: boolean;
  toggle: (name: string) => void;
  handle: (name: string) => {
    onPointerDown: (event: HandleEvent) => void;
    onPointerMove: (event: HandleEvent) => void;
    onPointerUp: (event: HandleEvent) => void;
  };
};
const dragThreshold = 4;
const opposite = (from: Side) => (from === "local" ? "remote" : "local");
const Context = createContext<{
  locations: Partial<Record<Side, string>>;
  showDirectory: (side: Side, directory: string) => void;
  over: Side | undefined;
  press: (from: DragSelection, event: HandleEvent) => void;
  move: (event: HandleEvent) => void;
  release: (event: HandleEvent) => void;
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
  const columns = useRef<HTMLDivElement>(null);
  const drag = useRef<FileDrag>(undefined);
  const [over, setOver] = useState<Side>();
  useEffect(() => () => drag.current?.listeners.abort(), []);
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

  function clearDrag() {
    const current = drag.current;
    drag.current = undefined;
    current?.listeners.abort();
    if (current?.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setOver(undefined);
  }

  function press(from: DragSelection, event: HandleEvent) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    const { currentTarget: handle, pointerId } = event;
    const doc = handle.ownerDocument;
    handle.setPointerCapture(pointerId);
    const listeners = new AbortController();
    drag.current = { handle, pointerId, x: event.clientX, y: event.clientY, active: false, from, listeners };
    const options = { capture: true, signal: listeners.signal };
    // A removed handle can lose capture at the document instead of the handle.
    function cancelPointer(event: globalThis.PointerEvent) {
      if (event.pointerId === pointerId && (event.target === handle || event.target === doc)) clearDrag();
    }
    doc.addEventListener("lostpointercapture", cancelPointer, options);
    doc.addEventListener("pointercancel", cancelPointer, options);
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") clearDrag();
    }, options);
  }

  function matchingDrag(event: HandleEvent) {
    const current = drag.current;
    return current?.pointerId === event.pointerId && current.handle === event.currentTarget ? current : undefined;
  }

  function dropSide(event: HandleEvent, from: Side) {
    const target = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-file-batch-side]");
    const side = opposite(from);
    if (target && target.parentElement === columns.current && target.dataset.fileBatchSide === side && target.dataset.fileBatchReady === "true") return side;
  }

  function move(event: HandleEvent) {
    const current = matchingDrag(event);
    if (!current) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < dragThreshold) return;
    current.active = true;
    setOver(dropSide(event, current.from.side));
  }

  function release(event: HandleEvent) {
    const current = matchingDrag(event);
    if (!current) return;
    const accepted = event.button === 0 && current.active && dropSide(event, current.from.side);
    clearDrag();
    if (accepted) submit(current.from);
  }

  return (
    <Context.Provider value={{ locations, showDirectory, over, press, move, release, submit, report: setError, busy }}>
      {note && <p role="status">{note}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="ssh-file-columns" ref={columns}>{children}</div>
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
      handle: (file: string) => ({
        onPointerDown: (event: HandleEvent) => {
          if (blocked || !visible.has(file)) return;
          batch.press({ side, directory, names: names.includes(file) ? names : [file] }, event);
        },
        onPointerMove: batch.move,
        onPointerUp: batch.release,
      }),
    } satisfies FileBatchSelection,
    drop: {
      "data-file-batch-side": side,
      "data-file-batch-ready": !blocked,
      "data-file-batch-over": batch.over === side,
      onDragOver(event: DragEvent) {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      },
      onDrop(event: DragEvent) {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        batch.report("系统拖入无法提供可绑定的本机路径，请先选择本机目录，再勾选或拖动表格项目");
      },
    },
  };
}
