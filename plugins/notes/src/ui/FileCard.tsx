import { MarkdownEditor, MermaidBlock } from "@huhu/editor";
import { Button } from "@huhu/ui";
import { host, useEngine } from "@huhu/workbench";
import { ExternalLink, FileQuestion, FolderSearch } from "lucide-react";
import { useEffect, useState } from "react";

const humanSize = (b: number): string => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GiB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB` : `${b} B`);

const TEXT_EXT = new Set([
  "mmd",
  "mermaid",
  "txt",
  "log",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "env",
  "gitignore",
  "lock",
]);
const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml" };
const TEXT_LIMIT = 1024 * 1024; // 文本预览上限 1 MiB：更大的只显示元信息（ACC-KN-10：不把大文件当文本加载）
const IMAGE_LIMIT = 10 * 1024 * 1024;

type Preview = { kind: "text"; text: string; note?: string } | { kind: "image"; src: string } | { kind: "none" } | { kind: "error"; message: string };

/** 非 Markdown 文件：文本 / 代码只读查看，图片（含 SVG，作为图片显示、不执行脚本）直接显示，其余只有元信息；都可以“用系统应用打开”。 */
export function FileCard({ path, size, mtimeMs }: { path: string; size: number; mtimeMs: number }) {
  const engine = useEngine();
  const name = path.split("/").at(-1) ?? path;
  const dotted = name.includes(".");
  const ext = dotted ? name.split(".").at(-1)!.toLowerCase() : "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    const done = (p: Preview) => alive && setPreview(p);
    if (ext in IMAGE_MIME && size <= IMAGE_LIMIT) {
      engine
        .call<{ base64: string }>("vault.readBinary", { path })
        .then((r) => done({ kind: "image", src: `data:${IMAGE_MIME[ext]};base64,${r.base64}` }))
        .catch((e: unknown) => done({ kind: "error", message: e instanceof Error ? e.message : String(e) }));
    } else if ((TEXT_EXT.has(ext) || (!dotted && size <= 64 * 1024)) && size <= TEXT_LIMIT) {
      engine
        .call<{ text: string }>("vault.readFile", { path })
        .then((r) => {
          if (r.text.includes("\u0000")) return done({ kind: "none" }); // 含 NUL：二进制文件
          let note: string | undefined;
          if (ext === "json") {
            try {
              JSON.parse(r.text);
              note = "JSON 语法正确";
            } catch (e) {
              note = `JSON 语法错误：${e instanceof Error ? e.message : String(e)}`;
            }
          }
          done({ kind: "text", text: r.text, ...(note ? { note } : {}) });
        })
        .catch((e: unknown) => done({ kind: "error", message: e instanceof Error ? e.message : String(e) }));
    } else done({ kind: "none" });
    return () => {
      alive = false;
    };
  }, [engine, path, ext, size, dotted]);

  const openExternally = async () => {
    const r = await host()?.openVaultFile?.(path);
    setOpened(r === "opened" ? "已交给系统应用打开" : r === "revealed" ? "这种文件不会被直接运行，已在文件夹中显示" : r === "missing" ? "文件已不存在" : "无法打开");
  };

  return (
    <section className="notes-document-area" data-testid="file-card">
      <div className="hu-knowledge-document-toolbar">
        <div className="row grow">
          <span className="notes-breadcrumb">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "根目录"}</span>
          <span className="notes-filename">{name}</span>
        </div>
        {host()?.openVaultFile ? (
          <Button icon={ExternalLink} data-testid="file-open-external" onClick={() => void openExternally()}>
            用系统应用打开
          </Button>
        ) : null}
      </div>
      {preview?.kind === "text" ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-testid="file-text-view">
          {preview.note ? (
            <p className="hu-hint-text" role="status" data-testid="file-diagnostic" style={{ margin: "6px 12px" }}>
              {preview.note}
            </p>
          ) : null}
          {ext === "mmd" || ext === "mermaid" ? (
            <div style={{ overflow: "auto", maxHeight: "45%", padding: "0 12px" }} data-testid="file-mermaid">
              <MermaidBlock source={preview.text} />
            </div>
          ) : null}
          <div style={{ flex: 1, minHeight: 0 }}>
            <MarkdownEditor documentId={`file:${path}`} value={preview.text} mode="source" readOnly lineNumbers onChange={() => undefined} ariaLabel={`${name} 内容（只读）`} />
          </div>
        </div>
      ) : preview?.kind === "image" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 16 }}>
          <img src={preview.src} alt={name} data-testid="file-image" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      ) : (
        <div className="hu-empty-state" style={{ margin: "auto" }}>
          <FileQuestion size={36} aria-hidden />
          <h3>{name}</h3>
          <dl className="notes-property-grid" style={{ textAlign: "left" }}>
            <div>
              <dt>类型</dt>
              <dd>{ext ? `${ext.toUpperCase()} 文件` : "无扩展名"}</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd data-testid="file-size">{humanSize(size)}</dd>
            </div>
            <div>
              <dt>修改</dt>
              <dd>{new Date(mtimeMs).toLocaleString("zh-CN", { hour12: false })}</dd>
            </div>
          </dl>
          {preview?.kind === "error" ? <p className="hu-field-error">{preview.message}</p> : <p className="hu-hint-text">{preview === null ? "正在读取…" : "这个文件没有文本预览；请用对应的应用打开。HUHU 不会把它当作文本加载。"}</p>}
        </div>
      )}
      <div className="row small muted" style={{ padding: "6px 12px", gap: 12 }}>
        <span data-testid="file-size-footer">{humanSize(size)}</span>
        <span>{new Date(mtimeMs).toLocaleString("zh-CN", { hour12: false })}</span>
        {opened ? <span role="status">{opened}</span> : null}
        {host()?.revealVault ? (
          <button type="button" className="shell-link-button" onClick={() => void host()?.revealVault()}>
            <FolderSearch size={12} aria-hidden /> 在文件夹中显示 Vault
          </button>
        ) : null}
      </div>
    </section>
  );
}
