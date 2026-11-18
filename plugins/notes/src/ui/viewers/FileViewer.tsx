import { MermaidBlock } from "@huhu/editor";
import { host } from "@huhu/workbench";
import { FolderSearch } from "lucide-react";
import { Suspense, lazy } from "react";
import "./viewers.css";
import { chooseViewer, humanSize } from "./dispatch.js";
import { FileToolbar } from "./FileChrome.js";
import { HtmlView } from "./HtmlPreview.js";
import { ImageView, UnknownView } from "./ImageAndUnknown.js";
import { TextFileView } from "./TextFileView.js";
import { v } from "./strings.js";

// PDF.js 与其 worker 只在打开 PDF 时加载（冷启动不付代价）
const PdfView = lazy(() => import("./PdfView.js").then((m) => ({ default: m.PdfView })));

/** 非 Markdown 文件的查看器入口（取代 FileCard）：按 `chooseViewer` 分派到编辑 / PDF / HTML / 图片 / 元信息视图。 */
export function FileViewer({ path, size, mtimeMs }: { path: string; size: number; mtimeMs: number }) {
  const choice = chooseViewer(path, size);
  const isMermaid = choice.ext === "mmd" || choice.ext === "mermaid";
  return (
    <section className="notes-document-area" data-testid="file-card" data-viewer={choice.kind}>
      {choice.kind === "text" || choice.kind === "json" ? (
        <TextFileView
          key={path}
          path={path}
          language={choice.kind}
          {...(isMermaid
            ? {
                sidecar: (text: string) => (
                  <div style={{ overflow: "auto", maxHeight: "45%", padding: "0 12px" }} data-testid="file-mermaid">
                    <MermaidBlock source={text} />
                  </div>
                ),
              }
            : {})}
        />
      ) : choice.kind === "html" ? (
        <HtmlView key={path} path={path} />
      ) : choice.kind === "pdf" ? (
        <Suspense
          fallback={
            <p className="hu-hint-text" style={{ margin: 16 }}>
              {v.reading}
            </p>
          }
        >
          <PdfViewWithChrome path={path} />
        </Suspense>
      ) : choice.kind === "image" ? (
        <ImageView key={path} path={path} ext={choice.ext} />
      ) : (
        <UnknownView path={path} size={size} mtimeMs={mtimeMs} reason={choice.reason ?? "unsupported"} ext={choice.ext} />
      )}
      <div className="row small muted" style={{ padding: "6px 12px", gap: 12 }}>
        <span data-testid="file-size-footer">{humanSize(size)}</span>
        <span>{new Date(mtimeMs).toLocaleString("zh-CN", { hour12: false })}</span>
        {host()?.revealVault ? (
          <button type="button" className="shell-link-button" onClick={() => void host()?.revealVault()}>
            <FolderSearch size={12} aria-hidden /> {v.showVault}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PdfViewWithChrome({ path }: { path: string }) {
  return (
    <>
      <FileToolbar path={path} />
      <PdfView path={path} />
    </>
  );
}
