import { Button, Segmented } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDocumentSession } from "../documents/useDocumentSession.js";
import { FileToolbar } from "./FileChrome.js";
import { TextFileView } from "./TextFileView.js";
import { v } from "./strings.js";

type Mode = "preview" | "source";

/**
 * HTML 的整页隔离预览（F04 / F05，SP-7 定案方案 (a)）：
 * `<iframe sandbox="allow-scripts">`（不给 allow-same-origin / top-navigation / popups / downloads / forms）加载主进程签发的一次一页
 * `huhu-preview://<nonce>/<Vault 相对路径>`；CSP、路径守卫、权限 / 下载 / 导航拦截都在主进程（apps/desktop/src/main/preview-*.ts）。
 * 预览的是会话已确认（已保存）的内容：切到预览前先 flush；保存后重新签发并刷新；迟到的签发结果被丢弃。
 */
export function HtmlView({ path }: { path: string }) {
  const settings = useCapability<{ editor: { autosave: boolean } }>("settings.get", {});
  // 视图生命周期内持有会话引用：预览 / 源码来回切换时未保存的编辑不会因引用归零而被落盘或丢失
  const { session, snap } = useDocumentSession(path, settings.data?.editor.autosave !== false);
  const [mode, setMode] = useState<Mode>("preview");
  const toggle = (
    <Segmented<Mode>
      label="HTML 视图"
      value={mode}
      options={[
        { value: "preview", label: v.htmlPreview },
        { value: "source", label: v.htmlSource },
      ]}
      onChange={(m) => {
        // 切换前先排空编辑并保存：预览永远基于已确认的缓冲
        void (session ? session.flush() : Promise.resolve(true)).finally(() => setMode(m));
      }}
      testId="html-mode"
    />
  );
  if (mode === "source") return <TextFileView path={path} language="text" toolbarLead={toggle} />;
  return <HtmlPreviewPane path={path} toggle={toggle} version={snap.baseVersion} unsaved={snap.hasUnsaved} loaded={snap.loaded} />;
}

function HtmlPreviewPane({ path, toggle, version, unsaved, loaded }: { path: string; toggle: React.ReactNode; version: string; unsaved: boolean; loaded: boolean }) {
  const api = host();
  const [grant, setGrant] = useState<{ url: string; nonce: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const supported = Boolean(api?.previewGrant);

  useEffect(() => {
    if (!api?.previewGrant || !loaded) return;
    let alive = true;
    let mine: string | null = null;
    setError(null);
    void api.previewGrant(path).then((r) => {
      if (!alive) {
        // 迟到的签发结果：不显示，立刻撤销
        if (r.ok) void api.previewRevoke?.(r.nonce);
        return;
      }
      if (!r.ok) return setError(r.reason);
      mine = r.nonce;
      setBlocked(0);
      setGrant({ url: r.url, nonce: r.nonce });
    });
    return () => {
      alive = false;
      if (mine) void api.previewRevoke?.(mine);
      setGrant(null);
    };
    // version / refresh 变化 → 重新签发（保存后预览更新）
  }, [api, path, version, refresh, loaded]);

  useEffect(() => {
    if (!api?.onPreviewBlocked || !grant) return;
    return api.onPreviewBlocked((e) => {
      if (e.nonce === grant.nonce) setBlocked(e.count);
    });
  }, [api, grant]);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  const name = path.split("/").at(-1) ?? path;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-testid="html-preview">
      <FileToolbar path={path}>
        {toggle}
        <Button icon={RefreshCw} data-testid="html-refresh" onClick={reload}>
          {v.htmlRefresh}
        </Button>
        {blocked > 0 ? (
          <span className="small muted" data-testid="html-blocked" role="status">
            <ShieldCheck size={12} aria-hidden /> {v.htmlBlocked(blocked)}
          </span>
        ) : null}
      </FileToolbar>
      {unsaved ? (
        <p className="hu-hint-text" role="status" style={{ margin: "6px 12px" }}>
          {v.htmlSaving}
        </p>
      ) : null}
      {!supported ? (
        <p className="hu-hint-text" style={{ margin: 16 }} data-testid="html-unavailable">
          {v.htmlUnavailable}
        </p>
      ) : error ? (
        <p className="hu-field-error" style={{ margin: 16 }} role="alert" data-testid="html-error">
          {v.htmlPreviewFailed(error)}
        </p>
      ) : grant ? (
        <iframe
          key={grant.nonce}
          className="notes-html-frame"
          data-testid="html-preview-frame"
          title={v.htmlPreviewTitle(name)}
          src={grant.url}
          // 只给脚本：没有 same-origin（opaque origin，无法读工作台）、top-navigation、popups、downloads、forms、modals、pointer-lock
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow=""
          loading="eager"
        />
      ) : (
        <p className="hu-hint-text" style={{ margin: 16 }}>
          {v.reading}
        </p>
      )}
    </div>
  );
}
