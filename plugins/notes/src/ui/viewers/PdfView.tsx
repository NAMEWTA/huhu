import { matchesEditorFind } from "@huhu/editor/editor-find-shortcut";
import { Button, IconButton } from "@huhu/ui";
import { useEngine, useEngineEvents } from "@huhu/workbench";
import { FileWarning, RotateCcw, Search, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type { EventBus, PDFViewer as PdfJsViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./pdf.css";
import { createPdfDocumentLoader, type PdfDocumentLoader } from "../../vendor/orca/pdf/pdf-document-loader.js";
import { applyPdfScalePreference, stepPdfScalePreference, type PdfScalePreference } from "../../vendor/orca/pdf/pdf-scale-preference.js";
import { buildPdfScalePreferenceKey, readPdfScalePreference, writePdfScalePreference } from "../../vendor/orca/pdf/pdf-scale-preference-storage.js";
import { createPdfViewerSession } from "../../vendor/orca/pdf/pdf-viewer-session.js";
import type { PdfRangeReader } from "../../vendor/orca/pdf/pdf-range-transport.js";
import { usePdfViewerFindShortcut } from "../../vendor/orca/pdf/use-pdf-viewer-find-shortcut.js";
import { PdfFind } from "./PdfFind.js";
import { v } from "./strings.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const SCALE_STEP = 1.25;
const SCALE_BOUNDS = { min: MIN_SCALE, max: MAX_SCALE, step: SCALE_STEP };
/** 超过这个大小不尝试预览（PDF.js 仍要在内存里建页树）；仍可“用系统应用打开”。 */
export const PDF_MAX_BYTES = 512 * 1024 * 1024;

type RangeResult = { version: string; size: number; base64: string; length: number; eof: boolean };

const decodeBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * PDF 查看器（F03）：ORCA 的 PDF.js 会话（vendor/orca/pdf）+ Huhu 自己的外壳。
 * 字节经 `vault.readRange` 分段读取（不整文件进内存）；状态以 (vaultId, path) 为键隔离；卸载 / 换文件 / 外部修改时销毁 worker、observer 与监听。
 */
export function PdfView({ path, ownsCommands }: { path: string; ownsCommands: boolean }) {
  const engine = useEngine();
  const [generation, setGeneration] = useState(0);
  const [externalChange, setExternalChange] = useState(false);
  useEngineEvents((e) => {
    if (e.type !== "vault.fileChanged") return;
    const p = e.payload as { path?: string };
    if (p.path === path) setExternalChange(true);
  });
  return (
    <PdfDocumentView
      // path / 重新载入都会换实例：旧实例的 loader、session、range transport 全部在卸载时释放，迟到结果因 disposed 被丢弃
      key={`${engine.vaultId}\u0000${path}\u0000${generation}`}
      vaultId={engine.vaultId}
      path={path}
      externalChange={externalChange}
      ownsCommands={ownsCommands}
      onReload={() => (setExternalChange(false), setGeneration((g) => g + 1))}
    />
  );
}

function PdfDocumentView({ vaultId, path, externalChange, ownsCommands, onReload }: { vaultId: string; path: string; externalChange: boolean; ownsCommands: boolean; onReload: () => void }) {
  const engine = useEngine();
  const rootRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerDivRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<PdfDocumentLoader | null>(null);
  const pdfViewerRef = useRef<InstanceType<typeof PdfJsViewer> | null>(null);
  const [eventBus, setEventBus] = useState<EventBus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const preferenceKey = useMemo(() => buildPdfScalePreferenceKey({ vaultId, filePath: path }), [vaultId, path]);
  const scalePreferenceRef = useRef<PdfScalePreference>("page-width");
  const name = path.split("/").at(-1) ?? path;

  const recordScalePreference = useCallback(
    (p: PdfScalePreference) => {
      scalePreferenceRef.current = p;
      writePdfScalePreference(preferenceKey, p);
    },
    [preferenceKey],
  );

  useEffect(() => {
    const container = containerRef.current;
    const viewerDiv = viewerDivRef.current;
    if (!container || !viewerDiv) return;
    let alive = true;
    setError(null);
    scalePreferenceRef.current = readPdfScalePreference(preferenceKey) ?? "page-width";
    const loader = createPdfDocumentLoader({
      onError: (m) => alive && setError(m),
      display: (doc) => {
        const session = createPdfViewerSession({
          container,
          viewerDiv,
          doc,
          scrollCacheKey: preferenceKey,
          getScalePreference: () => scalePreferenceRef.current,
          scaleBounds: SCALE_BOUNDS,
          onScaleChanging: setScale,
          onWheelZoom: recordScalePreference,
        });
        setEventBus(session.eventBus);
        pdfViewerRef.current = session.viewer;
        return () => {
          try {
            session.dispose();
          } finally {
            setEventBus(null);
            pdfViewerRef.current = null;
            setFindOpen(false);
            rootRef.current?.focus({ preventScroll: true });
          }
        };
      },
    });
    loaderRef.current = loader;
    // 先取一字节拿到真实大小（目录里的 size 可能已过期），再按范围读取
    void engine
      .call<RangeResult>("vault.readRange", { path, offset: 0, length: 1 })
      .then((head) => {
        if (!alive) return;
        if (head.size > PDF_MAX_BYTES) return setError(v.pdfTooLarge);
        if (head.size === 0) return setError(v.pdfEmpty);
        const read: PdfRangeReader = async (offset, length) => {
          const chunk = await engine.call<RangeResult>("vault.readRange", { path, offset, length, expectedVersion: head.version });
          return decodeBase64(chunk.base64);
        };
        loader.load({ read, length: head.size });
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      loaderRef.current = null;
      loader.dispose();
    };
  }, [engine, path, preferenceKey, recordScalePreference]);

  const stepZoom = useCallback(
    (direction: "in" | "out") => {
      const viewer = pdfViewerRef.current;
      if (!viewer) return;
      const next = stepPdfScalePreference(viewer.currentScale, direction, SCALE_BOUNDS);
      viewer.currentScale = next.scale;
      recordScalePreference(next.preference);
    },
    [recordScalePreference],
  );
  const zoomReset = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    applyPdfScalePreference(viewer, "page-width", SCALE_BOUNDS);
    recordScalePreference("page-width");
  }, [recordScalePreference]);
  const openFind = useCallback(() => {
    setFindOpen(true);
    findInputRef.current?.focus();
  }, []);
  usePdfViewerFindShortcut({ rootRef, ownsCommands, matchesFind: matchesEditorFind, openFind });
  const closeFind = useCallback(() => {
    setFindOpen(false);
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // 快捷键只在本查看器内生效（焦点在它里面时），不抢全局输入框的按键
  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const act = e.key === "+" || e.key === "=" ? () => stepZoom("in") : e.key === "-" || e.key === "_" ? () => stepZoom("out") : e.key === "0" ? zoomReset : null;
    if (!act) return;
    e.preventDefault();
    act();
  };

  return (
    <div className="notes-pdf" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} data-testid="pdf-view" data-pdf-state={error ? "error" : "ok"}>
      {externalChange ? (
        <div className="notes-pdf-banner" role="status" data-testid="pdf-external-change">
          <span>{v.pdfChanged}</span>
          <Button onClick={onReload} data-testid="pdf-reload">
            {v.reload}
          </Button>
        </div>
      ) : null}
      <div className="notes-pdf-stage">
        <PdfFind open={findOpen} eventBus={eventBus} inputRef={findInputRef} onClose={closeFind} />
        <div ref={containerRef} className="notes-pdf-container">
          <div ref={viewerDivRef} className="pdfViewer" />
        </div>
        {error ? (
          <div role="alert" className="notes-pdf-error" data-testid="pdf-error">
            <FileWarning size={36} aria-hidden />
            <div>{error}</div>
            <div className="notes-pdf-error-name">{name}</div>
          </div>
        ) : null}
      </div>
      <div className="notes-pdf-bar">
        <IconButton icon={ZoomOut} label={v.zoomOut} disabled={scale <= MIN_SCALE} onClick={() => stepZoom("out")} />
        <IconButton icon={RotateCcw} label={v.fitWidth} onClick={zoomReset} />
        <IconButton icon={ZoomIn} label={v.zoomIn} disabled={scale >= MAX_SCALE} onClick={() => stepZoom("in")} />
        <span className="notes-pdf-zoom" data-testid="pdf-zoom">
          {Math.round(scale * 100)}%
        </span>
        <IconButton icon={Search} label={v.find} onClick={openFind} />
        <span className="notes-pdf-name" title={name}>
          {name}
        </span>
      </div>
    </div>
  );
}
