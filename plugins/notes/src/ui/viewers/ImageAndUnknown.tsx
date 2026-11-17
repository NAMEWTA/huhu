import { FileIcon } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { IMAGE_MIME, humanSize, limitLabel, type UnknownReason } from "./dispatch.js";
import { FileToolbar } from "./FileChrome.js";
import { v } from "./strings.js";

/** 图片（含 SVG：作为 <img> 显示，里面的脚本不会执行）。 */
export function ImageView({ path, ext }: { path: string; ext: string }) {
  const engine = useEngine();
  const name = path.split("/").at(-1) ?? path;
  const [state, setState] = useState<{ src: string } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    engine
      .call<{ base64: string }>("vault.readBinary", { path })
      .then((r) => alive && setState({ src: `data:${IMAGE_MIME[ext] ?? "application/octet-stream"};base64,${r.base64}` }))
      .catch((e: unknown) => alive && setState({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [engine, path, ext]);
  return (
    <>
      <FileToolbar path={path} />
      {state && "src" in state ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 16 }}>
          <img src={state.src} alt={name} data-testid="file-image" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      ) : (
        <div className="hu-empty-state" style={{ margin: "auto" }}>
          {state ? <p className="hu-field-error">{state.error}</p> : <p className="hu-hint-text">{v.reading}</p>}
        </div>
      )}
    </>
  );
}

/** 未知 / 超限 / 二进制：只有元信息与适用操作，不伪装成功渲染。 */
export function UnknownView({ path, size, mtimeMs, reason, ext }: { path: string; size: number; mtimeMs: number; reason: UnknownReason; ext: string }) {
  const name = path.split("/").at(-1) ?? path;
  return (
    <>
      <FileToolbar path={path} />
      <div className="hu-empty-state" style={{ margin: "auto" }} data-testid="file-unknown">
        <FileIcon name={name} size={36} />
        <h3>{name}</h3>
        <dl className="notes-property-grid" style={{ textAlign: "left" }}>
          <div>
            <dt>{v.type}</dt>
            <dd>{ext ? v.fileKind(ext) : v.noExt}</dd>
          </div>
          <div>
            <dt>{v.size}</dt>
            <dd data-testid="file-size">{humanSize(size)}</dd>
          </div>
          <div>
            <dt>{v.modified}</dt>
            <dd>{new Date(mtimeMs).toLocaleString("zh-CN", { hour12: false })}</dd>
          </div>
        </dl>
        <p className="hu-hint-text">{reason === "too-large" ? v.tooLarge(limitLabel(ext)) : v.noPreview}</p>
      </div>
    </>
  );
}
