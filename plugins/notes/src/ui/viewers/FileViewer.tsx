import { FileIcon } from "@huhu/ui";
import { MermaidBlock } from "@huhu/editor";
import type { ProtectedKind, VaultListOutput } from "@huhu/contracts";
import { host, useEngine } from "@huhu/workbench";
import { FolderSearch } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
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
export function FileViewer({ path, size, mtimeMs, ownsCommands }: { path: string; size: number; mtimeMs: number; ownsCommands: boolean }) {
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
          <PdfViewWithChrome path={path} ownsCommands={ownsCommands} />
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

/** 资源索引可能落后于磁盘。打开已知的非 Markdown 路径时，从真实父目录读取元信息。 */
export function UnindexedFileViewer({ path, ownsCommands }: { path: string; ownsCommands: boolean }) {
  const engine = useEngine();
  const [metadata, setMetadata] = useState<{ size: number; mtimeMs: number; protection: ProtectedKind | undefined; unavailable: string | undefined } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const dir = path.slice(0, Math.max(path.lastIndexOf("/"), 0));
    const read = async () => {
      let cursor: string | undefined;
      do {
        const listing = await engine.call<VaultListOutput>("vault.list", { dir, cursor, includeProtected: true });
        const entry = listing.entries.find((file) => file.path === path && file.kind !== "dir");
        if (entry) {
          if (live) {
            const unavailable = entry.linkTarget?.cycle ? "目录符号链接形成循环" : entry.kind === "symlink" ? "链接目标不在 Vault 内或已失效" : undefined;
            setMetadata({ size: entry.size ?? 0, mtimeMs: entry.mtimeMs ?? 0, protection: entry.protected, unavailable });
          }
          return;
        }
        cursor = listing.nextCursor;
      } while (live && cursor);
      if (live) setMetadata(null);
    };
    void read().catch(() => {
      if (live) setMetadata(null);
    });
    return () => {
      live = false;
    };
  }, [engine, path]);

  if (!metadata) return <p role={metadata === null ? "alert" : "status"}>{metadata === null ? v.missing : v.reading}</p>;
  if (metadata.protection || metadata.unavailable) {
    return (
      <section className="notes-document-area" data-testid="file-card" data-viewer="protected">
        <h3 className="row">
          <FileIcon name={path} />
          {path.split("/").at(-1)}
        </h3>
        <p>{path}</p>
        <p>
          {humanSize(metadata.size)} · {new Date(metadata.mtimeMs).toLocaleString("zh-CN", { hour12: false })}
        </p>
        <p>{metadata.unavailable ?? "受保护的文件仅显示元信息。"}</p>
      </section>
    );
  }
  return <FileViewer path={path} size={metadata.size} mtimeMs={metadata.mtimeMs} ownsCommands={ownsCommands} />;
}

function PdfViewWithChrome({ path, ownsCommands }: { path: string; ownsCommands: boolean }) {
  return (
    <>
      <FileToolbar path={path} />
      <PdfView path={path} ownsCommands={ownsCommands} />
    </>
  );
}
