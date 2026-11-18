import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PreviewGrants, handlePreviewRequest, nonceOf, previewCsp, resolvePreviewPath } from "../src/main/preview-protocol";

/**
 * F05 路径与协议层安全用例（主进程纯逻辑）：恶意页面能构造的任何 URL 都不能读到 Vault 之外、受保护目录或符号链接目标。
 * 渲染层（iframe sandbox / CSP 实际拦截 fetch / XHR / window.open 等）由 tests/e2e/workflows/html-preview.spec.ts 真实验证。
 */
let base: string;
let vault: string;
let outside: string;
const ANCESTORS = "huhu-app://workbench";

beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), "huhu-preview-"));
  vault = path.join(base, "vault");
  outside = path.join(base, "outside");
  mkdirSync(path.join(vault, "页面"), { recursive: true });
  mkdirSync(path.join(vault, ".huhu"), { recursive: true });
  mkdirSync(path.join(vault, ".git"), { recursive: true });
  mkdirSync(path.join(vault, ".agents"), { recursive: true });
  mkdirSync(path.join(vault, "node_modules", "x"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(vault, "页面", "index.html"), "<h1>你好</h1>");
  writeFileSync(path.join(vault, "页面", "a b.css"), "body{}");
  writeFileSync(path.join(vault, "top.js"), "export const x = 1");
  writeFileSync(path.join(vault, ".huhu", "secret.json"), '{"token":"t"}');
  writeFileSync(path.join(vault, ".git", "config"), "[core]");
  writeFileSync(path.join(vault, ".agents", "a.md"), "agent");
  writeFileSync(path.join(vault, "node_modules", "x", "i.js"), "1");
  writeFileSync(path.join(outside, "pw.txt"), "outside-secret");
  symlinkSync(outside, path.join(vault, "逃逸"));
  symlinkSync(path.join(outside, "pw.txt"), path.join(vault, "pw-link.txt"));
  symlinkSync(path.join(vault, ".huhu"), path.join(vault, "指向内部"));
  symlinkSync(path.join(vault, "页面", "index.html"), path.join(vault, "内部链接.html")); // Vault 内的合法链接
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("resolvePreviewPath", () => {
  test("正常文件（含中文与空格）可解析", () => {
    const r = resolvePreviewPath(vault, "/%E9%A1%B5%E9%9D%A2/a%20b.css");
    expect(r.ok && r.rel).toBe("页面/a b.css");
  });
  test("路径穿越：.. / 编码的 .. / 反斜杠 / NUL 全拦", () => {
    for (const p of ["/../outside/pw.txt", "/页面/../../outside/pw.txt", "/%2e%2e/outside/pw.txt", "/页面/%2e%2e/%2e%2e/outside/pw.txt", "/页面%5C..%5Cx", "/a%00b"]) {
      const r = resolvePreviewPath(vault, p);
      expect(r.ok, p).toBe(false);
    }
  });
  test("畸形百分号编码 → 400", () => {
    const r = resolvePreviewPath(vault, "/%E0%A4%A");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
  test("受保护目录（含大小写变体）→ 403", () => {
    for (const p of ["/.huhu/secret.json", "/.HUHU/secret.json", "/.git/config", "/.Git/config", "/.agents/a.md", "/node_modules/x/i.js", "/页面/../.huhu/secret.json"]) {
      const r = resolvePreviewPath(vault, p);
      expect(r.ok, p).toBe(false);
    }
  });
  test("符号链接：指向 Vault 外的目录 / 文件、指向受保护目录 → 拒绝；Vault 内的合法链接放行", () => {
    expect(resolvePreviewPath(vault, "/%E9%80%83%E9%80%B8/pw.txt").ok).toBe(false);
    expect(resolvePreviewPath(vault, "/pw-link.txt").ok).toBe(false);
    expect(resolvePreviewPath(vault, "/%E6%8C%87%E5%90%91%E5%86%85%E9%83%A8/secret.json").ok).toBe(false);
    expect(resolvePreviewPath(vault, "/%E5%86%85%E9%83%A8%E9%93%BE%E6%8E%A5.html").ok).toBe(true);
  });
  test("目录 / 不存在 / 空路径 → 404", () => {
    for (const p of ["/页面", "/页面/nope.html", "/"]) {
      const r = resolvePreviewPath(vault, p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(404);
    }
  });
});

describe("PreviewGrants 与 handlePreviewRequest", () => {
  test("签发的 URL 能读到入口页；响应头带 CSP / nosniff / no-store / CORS", async () => {
    const g = new PreviewGrants();
    const r = g.grant(vault, "页面/index.html");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nonceOf(r.url)).toBe(r.nonce);
    const res = await handlePreviewRequest({ url: r.url, method: "GET" }, g, ANCESTORS);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>你好</h1>");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toBe(previewCsp(ANCESTORS));
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain(`frame-ancestors ${ANCESTORS}`);
  });
  test("dev 来源（http://localhost:*）只改变 frame-ancestors，其余指令不变", () => {
    const prod = previewCsp("huhu-app://workbench");
    const dev = previewCsp("http://localhost:5173");
    expect(dev).toContain("frame-ancestors http://localhost:5173");
    expect(dev.replace("http://localhost:5173", "huhu-app://workbench")).toBe(prod);
  });
  test("同一 nonce 下的相对资源解析在 Vault 内；越界与受保护目录被拒", async () => {
    const g = new PreviewGrants();
    const r = g.grant(vault, "页面/index.html");
    if (!r.ok) throw new Error("grant");
    const at = (p: string) => handlePreviewRequest({ url: `huhu-preview://${r.nonce}${p}`, method: "GET" }, g, ANCESTORS);
    expect((await at("/top.js")).status).toBe(200); // ../top.js 的结果
    expect((await at("/.huhu/secret.json")).status).toBe(403);
    expect((await at("/%E9%80%83%E9%80%B8/pw.txt")).status).toBe(403);
    expect((await at("/pw-link.txt")).status).toBe(403);
    expect((await at("/%2e%2e/outside/pw.txt")).status).not.toBe(200); // URL 规范化可能已折叠成 /outside/…（404）或被守卫拒绝（403），都不能读到
  });
  test("未知 / 已撤销 nonce → 404；非 GET → 405", async () => {
    const g = new PreviewGrants();
    const r = g.grant(vault, "页面/index.html");
    if (!r.ok) throw new Error("grant");
    expect((await handlePreviewRequest({ url: "huhu-preview://deadbeef/页面/index.html", method: "GET" }, g, ANCESTORS)).status).toBe(404);
    expect((await handlePreviewRequest({ url: r.url, method: "POST" }, g, ANCESTORS)).status).toBe(405);
    g.revoke(r.nonce);
    expect((await handlePreviewRequest({ url: r.url, method: "GET" }, g, ANCESTORS)).status).toBe(404);
    g.grant(vault, "页面/index.html");
    g.revokeAll();
    expect(g.size).toBe(0);
  });
  test("不能为受保护目录 / 越界 / 符号链接入口签发预览", () => {
    const g = new PreviewGrants();
    expect(g.grant(vault, ".huhu/secret.json").ok).toBe(false);
    expect(g.grant(vault, "../outside/pw.txt").ok).toBe(false);
    expect(g.grant(vault, "pw-link.txt").ok).toBe(false);
    expect(g.grant(vault, "不存在.html").ok).toBe(false);
  });
  test("授权表有上限（防止无限增长）", () => {
    const g = new PreviewGrants();
    for (let i = 0; i < 260; i++) g.grant(vault, "页面/index.html");
    expect(g.size).toBeLessThanOrEqual(200);
  });
});
