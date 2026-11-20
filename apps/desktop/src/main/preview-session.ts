/// <reference types="vite/client" />

import { BrowserWindow, ipcMain, Menu, protocol, session as electronSession, type Session, type WebContents } from "electron";
import editorPreviewFrame from "../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/preview-frame.html?raw";
import { EDITOR_PREVIEW_CSP, EDITOR_PREVIEW_URL } from "../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/preview-frame-policy.js";
import { confirmExternalLink, externalHttpUrl } from "./external-link.js";
import { PREVIEW_SCHEME, PreviewGrants, handlePreviewRequest, isPreviewUrl, nonceOf } from "./preview-protocol.js";

/** Electron 侧的 HTML 预览接线：协议、IPC、会话级硬化（design §11.3）。纯逻辑在 preview-protocol.ts。 */

export const previewSchemePrivileges = { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, corsEnabled: true } } as const;

export interface PreviewDeps {
  /** 当前打开的 Vault 根（没有则 null）。 */
  vaultRoot: () => string | null;
  /** 工作台来源：生产 `huhu-app://workbench`，开发为开发服务器来源。 */
  frameAncestors: () => string;
  /** 与其他 IPC 同一套来源校验。 */
  assertTrusted: (url: string | undefined) => void;
}

export interface PreviewController {
  grants: PreviewGrants;
  /** 记录一次被拦截的越权尝试（按 nonce 计数）。 */
  blocked: (nonce: string | null) => void;
  /** 切换 / 关闭 Vault 时使全部预览授权失效。 */
  revokeAll: () => void;
}

/** 已拦截的越权尝试：按 nonce 计数并通知渲染进程（工具条显示“已拦截 N 次”）。 */
function createBlockedCounter(notify: (nonce: string, count: number) => void): (nonce: string | null) => void {
  const counts = new Map<string, number>();
  return (nonce) => {
    if (!nonce) return;
    const next = (counts.get(nonce) ?? 0) + 1;
    counts.set(nonce, next);
    if (counts.size > 500) {
      const first = counts.keys().next();
      if (!first.done) counts.delete(first.value);
    }
    notify(nonce, next);
  };
}

function isEditorPreviewUrl(url: string | undefined): boolean {
  return url?.split("#", 1)[0] === EDITOR_PREVIEW_URL;
}

function serveEditorPreview(method: string, parentOrigin: string): Response {
  if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const originAttribute = parentOrigin.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const html = editorPreviewFrame.replace('data-parent-origin=""', `data-parent-origin="${originAttribute}"`);
  return new Response(method === "HEAD" ? null : html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `${EDITOR_PREVIEW_CSP} sandbox allow-scripts; frame-ancestors ${parentOrigin};`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function registerPreviewHandlers(deps: PreviewDeps, ses: Session = electronSession.defaultSession): PreviewController {
  const grants = new PreviewGrants();
  const notifyAll = (nonce: string, count: number): void => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("huhu:previewBlocked", { nonce, count });
  };
  const blocked = createBlockedCounter(notifyAll);

  protocol.handle(PREVIEW_SCHEME, (request) => (request.url === EDITOR_PREVIEW_URL ? serveEditorPreview(request.method, deps.frameAncestors()) : handlePreviewRequest(request, grants, deps.frameAncestors())));

  ipcMain.handle("huhu:previewGrant", (event, rel: unknown): { ok: true; url: string; nonce: string } | { ok: false; reason: string } => {
    deps.assertTrusted(event.senderFrame?.url);
    const root = deps.vaultRoot();
    if (!root) return { ok: false, reason: "尚未打开 Vault" };
    if (typeof rel !== "string" || rel.length === 0 || rel.length > 1000) return { ok: false, reason: "路径无效" };
    return grants.grant(root, rel);
  });
  ipcMain.handle("huhu:previewRevoke", (event, nonce: unknown): void => {
    deps.assertTrusted(event.senderFrame?.url);
    if (typeof nonce === "string") grants.revoke(nonce);
  });

  // 预览页面发出的任何非 huhu-preview: 请求都拦（img / script / font 等被 CSP 拦掉之前的第二层）
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (isEditorPreviewUrl(details.frame?.url) && !details.url.startsWith("data:") && !details.url.startsWith("blob:")) {
      callback({ cancel: true });
      return;
    }
    const fromPreview = isPreviewUrl(details.frame?.url) || isPreviewUrl(details.referrer);
    if (fromPreview && !isPreviewUrl(details.url) && !details.url.startsWith("data:") && !details.url.startsWith("blob:")) {
      blocked(nonceOf(details.frame?.url ?? details.referrer));
      callback({ cancel: true });
      return;
    }
    callback({});
  });
  // 预览页面的权限请求 / 检查一律拒绝；其他页面保持 Electron 默认行为
  ses.setPermissionRequestHandler((_wc: WebContents, _permission, callback, details) => {
    if (isPreviewUrl(details.requestingUrl)) {
      blocked(nonceOf(details.requestingUrl));
      callback(false);
      return;
    }
    callback(true);
  });
  ses.setPermissionCheckHandler((_wc, _permission, requestingOrigin) => !isPreviewUrl(requestingOrigin));
  ses.on("will-download", (event, item) => {
    if (isPreviewUrl(item.getURL()) || isPreviewUrl(item.getURLChain()[0])) {
      event.preventDefault();
      blocked(nonceOf(item.getURL()));
    }
  });

  return { grants, blocked, revokeAll: () => grants.revokeAll() };
}

/** 窗口级硬化：iframe 自导航到外部 URL、window.open、WebRTC 探测。 */
export function hardenWindowForPreview(wc: WebContents, blocked?: (nonce: string | null) => void, isGranted?: (nonce: string) => boolean): void {
  // Electron reports the same navigation event for an anchor and for script navigation.
  // Its native link menu supplies the hit-tested URL from an explicit user action.
  wc.on("context-menu", (_event, params) => {
    const frame = params.frame;
    const from = frame?.url;
    const nonce = nonceOf(from ?? "");
    const win = BrowserWindow.fromWebContents(wc);
    const url = externalHttpUrl(params.linkURL);
    if (!win || !frame || !nonce || !url) return;
    const isCurrent = () => !frame.isDestroyed() && frame.url === from && isGranted?.(nonce) === true;
    if (!isCurrent()) return;
    Menu.buildFromTemplate([{ label: "在系统浏览器中打开链接", click: () => void confirmExternalLink(win, url, isCurrent) }]).popup({ window: win });
  });
  // WebRTC 不得通过 STUN 泄露地址（沙箱 iframe 里的 RTCPeerConnection 不受 connect-src 约束）
  wc.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  // will-frame-navigate 覆盖子框架导航（will-navigate 只管主框架）：预览框架只能停在 huhu-preview: 内；其发起的导航不得去往别处
  wc.on("will-frame-navigate", (event) => {
    if (isEditorPreviewUrl(event.frame?.url) || isEditorPreviewUrl(event.initiator?.url)) {
      event.preventDefault();
      return;
    }
    const fromPreview = isPreviewUrl(event.frame?.url) || isPreviewUrl(event.initiator?.url);
    if (!fromPreview) return;
    if (!isPreviewUrl(event.url)) {
      event.preventDefault();
      blocked?.(nonceOf(event.frame?.url ?? event.initiator?.url ?? ""));
    }
  });
}
