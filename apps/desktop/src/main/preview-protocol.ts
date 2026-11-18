import { randomBytes } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * HTML 预览的隔离（SP-7 定案：渲染进程 `<iframe sandbox="allow-scripts">` + `huhu-preview` 协议，见 evidence/spikes/sp-7.md）。
 * 本模块只含与 Electron 无关的纯逻辑（路径守卫、授权表、响应构造），便于单测；Electron 侧的接线在 `preview-session.ts`。
 *
 * 路径模型：`huhu-preview://<nonce>/<Vault 相对路径>`。URL 根 = Vault 根，所以页面里的相对引用（含 `../`）自然落在 Vault 内，
 * 且 URL 规范化不会让它越过根；之后仍逐请求做 realpath / 受保护目录 / 符号链接校验。
 */
export const PREVIEW_SCHEME = "huhu-preview";
/** 受保护目录：任何路径段（含符号链接解析后）命中都拒绝，大小写不敏感（macOS / Windows 文件系统不分大小写）。 */
export const PROTECTED_SEGMENTS: ReadonlySet<string> = new Set([".huhu", ".git", ".agents", "node_modules"]);
export const MAX_PREVIEW_FILE_BYTES = 64 * 1024 * 1024;
const MAX_GRANTS = 200;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

export const mimeFor = (file: string): string => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** 响应头里的 CSP（design §11.3）。`frameAncestors` 是工作台的来源：生产 `huhu-app://workbench`，开发为开发服务器来源。 */
export function previewCsp(frameAncestors: string): string {
  return [
    "default-src 'none'",
    `img-src ${PREVIEW_SCHEME}: data:`,
    `style-src ${PREVIEW_SCHEME}: 'unsafe-inline'`,
    `script-src ${PREVIEW_SCHEME}: 'unsafe-inline'`,
    `font-src ${PREVIEW_SCHEME}: data:`,
    `media-src ${PREVIEW_SCHEME}:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

export type PreviewResolution = { ok: true; abs: string; rel: string } | { ok: false; status: 400 | 403 | 404; reason: string };

const hasProtectedSegment = (segments: readonly string[]): boolean => segments.some((s) => PROTECTED_SEGMENTS.has(s.toLowerCase()));

/** 把 URL 路径解析为 Vault 内的真实文件；越界 / 符号链接逃逸 / 受保护目录 / 非文件都拒绝。 */
export function resolvePreviewPath(vaultRoot: string, urlPathname: string): PreviewResolution {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return { ok: false, status: 400, reason: "路径编码无效" };
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return { ok: false, status: 400, reason: "路径含非法字符" };
  const segments = decoded.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return { ok: false, status: 404, reason: "没有指定文件" };
  if (segments.some((s) => s === ".." || s === ".")) return { ok: false, status: 403, reason: "路径越界" };
  if (hasProtectedSegment(segments)) return { ok: false, status: 403, reason: "受保护目录" };
  let root: string;
  try {
    root = realpathSync(vaultRoot);
  } catch {
    return { ok: false, status: 404, reason: "Vault 不可用" };
  }
  const candidate = path.join(root, ...segments);
  if (!existsSync(candidate)) return { ok: false, status: 404, reason: "文件不存在" };
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return { ok: false, status: 404, reason: "文件不存在" };
  }
  const rel = path.relative(root, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, status: 403, reason: "符号链接指向 Vault 之外" };
  if (hasProtectedSegment(rel.split(path.sep))) return { ok: false, status: 403, reason: "符号链接指向受保护目录" };
  let st;
  try {
    st = statSync(real);
  } catch {
    return { ok: false, status: 404, reason: "文件不存在" };
  }
  if (!st.isFile()) return { ok: false, status: 404, reason: "不是文件" };
  if (st.size > MAX_PREVIEW_FILE_BYTES) return { ok: false, status: 403, reason: "文件过大" };
  return { ok: true, abs: real, rel: rel.split(path.sep).join("/") };
}

interface Grant {
  root: string;
  rel: string;
}

/** 一次一页的授权表：nonce 绑定 Vault 根与入口文件，随标签关闭 / 切 Vault 失效。 */
export class PreviewGrants {
  private readonly grants = new Map<string, Grant>();

  /** 为 `rel`（Vault 相对）签发预览 URL；入口文件本身必须通过路径守卫。 */
  grant(vaultRoot: string, rel: string): { ok: true; url: string; nonce: string } | { ok: false; reason: string } {
    const encoded = rel.split("/").map(encodeURIComponent).join("/");
    const check = resolvePreviewPath(vaultRoot, `/${encoded}`);
    if (!check.ok) return { ok: false, reason: check.reason };
    const nonce = randomBytes(16).toString("hex");
    this.grants.set(nonce, { root: vaultRoot, rel: check.rel });
    while (this.grants.size > MAX_GRANTS) {
      const oldest = this.grants.keys().next();
      if (oldest.done) break;
      this.grants.delete(oldest.value);
    }
    return { ok: true, url: `${PREVIEW_SCHEME}://${nonce}/${encoded}`, nonce };
  }
  revoke(nonce: string): void {
    this.grants.delete(nonce);
  }
  revokeAll(): void {
    this.grants.clear();
  }
  get(nonce: string): Grant | undefined {
    return this.grants.get(nonce);
  }
  get size(): number {
    return this.grants.size;
  }
}

/** URL 的 host 部分就是 nonce（标准 scheme 会把它小写化）。 */
export function nonceOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === `${PREVIEW_SCHEME}:` ? u.host : null;
  } catch {
    return null;
  }
}

export const isPreviewUrl = (url: string | undefined | null): boolean => typeof url === "string" && url.startsWith(`${PREVIEW_SCHEME}:`);

function deny(status: number, reason: string, csp: string): Response {
  return new Response(reason, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
}

/**
 * `protocol.handle("huhu-preview")` 的处理函数。只读 GET / HEAD；未知 nonce → 404（不泄露是否存在）。
 * 不同源（opaque origin）的沙箱 iframe 加载模块脚本 / 字体需要 CORS 头，所以放行 `*`——这些响应只对持有 nonce 的页面可达。
 */
export async function handlePreviewRequest(request: { url: string; method: string }, grants: PreviewGrants, frameAncestors: string): Promise<Response> {
  const csp = previewCsp(frameAncestors);
  if (request.method !== "GET" && request.method !== "HEAD") return deny(405, "method not allowed", csp);
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return deny(400, "bad url", csp);
  }
  const grant = grants.get(url.host);
  if (!grant) return deny(404, "not found", csp);
  const r = resolvePreviewPath(grant.root, url.pathname);
  if (!r.ok) return deny(r.status, r.reason, csp);
  let body: Buffer;
  try {
    body = await readFile(r.abs);
  } catch {
    return deny(404, "not found", csp);
  }
  return new Response(request.method === "HEAD" ? null : new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": mimeFor(r.abs),
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Length": String(body.length),
    },
  });
}

/** 笔记里的图片 / 音视频 / PDF 引用（`<img src="docs/attachments/a.png">`）：只允许由这些“子资源”请求触发读取 Vault，直接导航一律不读。 */
// Electron 的 protocol.handle 里没有 Sec-Fetch-Dest / Request.destination，只能看 Chromium 发出的头：
// <img> 的 Accept 以 image/ 开头；<video> / <audio> 带 Range；导航（text/html）、脚本与 fetch / XHR（Accept: */*，无 Range）都不匹配。
export const isMediaRequest = (accept: string | null | undefined, range: string | null | undefined): boolean => /(^|,)\s*image\//i.test(accept ?? "") || (range ?? "").trim() !== "";

/**
 * 工作台协议在渲染器资源里找不到文件时的兜底：把 URL 路径当作 Vault 相对路径读取（编辑器里的图片 / 附件）。
 * 返回 null = 不处理（交回原有行为）。路径守卫复用预览的 `resolvePreviewPath`（越界 / 符号链接逃逸 / 受保护目录 / 超大文件都拒绝）。
 */
export async function handleVaultMediaRequest(request: { url: string; method: string; accept: string | null; range: string | null }, vaultRoot: string | null): Promise<Response | null> {
  if (!vaultRoot || (request.method !== "GET" && request.method !== "HEAD")) return null;
  if (!isMediaRequest(request.accept, request.range)) return null;
  const base = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "no-store" };
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  const r = resolvePreviewPath(vaultRoot, pathname);
  if (!r.ok) return new Response(r.reason, { status: r.status, headers: { ...base, "Content-Type": "text/plain; charset=utf-8" } });
  let body: Buffer;
  try {
    body = await readFile(r.abs);
  } catch {
    return new Response("not found", { status: 404, headers: { ...base, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(request.method === "HEAD" ? null : new Uint8Array(body), { status: 200, headers: { ...base, "Content-Type": mimeFor(r.abs), "Content-Length": String(body.length) } });
}
