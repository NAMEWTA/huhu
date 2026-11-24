import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { offlineEmojiAssetPaths } from "./offline-emoji.mjs";
import { createOkParityRun } from "../../../scripts/ok-parity-paths.mjs";

const root = resolve(import.meta.dirname, "../../..");
const assets = join(root, "apps/desktop/out/renderer/assets");
const host = join(root, "packages/editor/src/host");
const normalized = (path) => relative(root, path).replaceAll("\\", "/");
const api = new Map();
const desktop = new Map();
const routes = new Map();

function record(map, key, entry) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(entry);
}

// A shared OK component can be mounted by different roots. Record candidates
// with their actual route-table owner instead of treating them as global routes.
const scopeByFile = new Map([
  ["packages/editor/src/host/host-fetch.ts", "host baseline"],
  ["packages/editor/src/host/routes/core.ts", "note editor"],
  ["packages/editor/src/host/routes/files.ts", "file explorer"],
  ["packages/editor/src/host/routes/upload.ts", "note editor"],
  ["packages/editor/src/host/routes/comments.ts", "note editor and comments panel"],
  ["packages/editor/src/host/config-provider.tsx", "link-preview-enabled editor"],
  ["plugins/notes/src/ui/documents/NoteEditorSurface.tsx", "note editor"],
]);
const hostRouteFiles = [host, join(host, "routes")].flatMap((directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(directory, entry.name)),
);
hostRouteFiles.push(join(root, "plugins/notes/src/ui/documents/NoteEditorSurface.tsx"));
for (const file of hostRouteFiles) {
  for (const [line, source] of readFileSync(file, "utf8").split("\n").entries()) {
    const route = /"(([A-Z]+) (\/api\/[\w./-]+))"\s*:/.exec(source);
    if (route) {
      const path = normalized(file);
      const scope = scopeByFile.get(path);
      if (!scope) throw new Error(`宿主路由缺少作用域：${path}:${line + 1}`);
      record(routes, route[1], { file: path, line: line + 1, scope });
    }
  }
}

function memberChain(node) {
  return ts.isPropertyAccessExpression(node) ? [...memberChain(node.expression), node.name.text] : ts.isIdentifier(node) ? [node.text] : [];
}

const chunks = readdirSync(assets)
  .filter((entry) => entry.endsWith(".js"))
  .map((entry) => join(assets, entry));
const program = ts.createProgram(chunks, { allowJs: true, noResolve: true, noLib: true, types: [] });
const checker = program.getTypeChecker();
const apiPath = (node) => /^\/api\/[\w./-]+/.exec(node.text)?.[0];

function initializer(node) {
  if (!ts.isIdentifier(node)) return undefined;
  const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.parent.flags & ts.NodeFlags.Const ? declaration.initializer : undefined;
}

function urlParts(node, resolved = new Set()) {
  if (resolved.has(node)) return [];
  resolved.add(node);
  if (ts.isStringLiteralLike(node) || node.kind === ts.SyntaxKind.TemplateHead) return apiPath(node) ? [node] : [];
  if (ts.isTemplateExpression(node)) return urlParts(node.head, resolved);
  if (ts.isConditionalExpression(node)) return [...urlParts(node.whenTrue, resolved), ...urlParts(node.whenFalse, resolved)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return urlParts(node.left, resolved);
  const value = initializer(node);
  return value ? urlParts(value, resolved) : [];
}

function requestMethod(init) {
  if (!init || (ts.isIdentifier(init) && init.text === "undefined") || ts.isVoidExpression(init)) return "GET";
  const object = ts.isObjectLiteralExpression(init) ? init : initializer(init);
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  for (const prop of object.properties.toReversed()) {
    if (ts.isSpreadAssignment(prop)) return null;
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && prop.name.text === "method") {
      return ts.isStringLiteral(prop.initializer) ? prop.initializer.text.toUpperCase() : null;
    }
  }
  return "GET";
}

for (const file of chunks) {
  const entry = relative(assets, file);
  const source = program.getSourceFile(file);
  const literalNodes = new Set();
  const usedLiterals = new Set();
  function inspect(node) {
    if ((ts.isStringLiteralLike(node) || node.kind === ts.SyntaxKind.TemplateHead) && apiPath(node)) literalNodes.add(node);
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const parts = urlParts(node.arguments[0]);
      const method = requestMethod(node.arguments[1]);
      const callee = node.expression.getText(source);
      const paths = new Set();
      for (const part of parts) {
        usedLiterals.add(part);
        paths.add(apiPath(part));
      }
      for (const path of paths) record(api, path, { chunk: entry, offset: node.getStart(source), kind: "call", callee, method });
    }
    if (ts.isPropertyAccessExpression(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)) {
      const chain = memberChain(node).join(".");
      if (chain.startsWith("window.okDesktop.")) record(desktop, chain.slice("window.okDesktop.".length), { chunk: entry, offset: node.getStart(source) });
    }
    ts.forEachChild(node, inspect);
  }
  ts.forEachChild(source, inspect);
  for (const literal of literalNodes) {
    if (!usedLiterals.has(literal)) record(api, apiPath(literal), { chunk: entry, offset: literal.getStart(source), kind: "literal" });
  }
}

const excludedApi = new Map([
  ["/api/v1/call", "Engine HTTP transport, outside OK hostFetch"],
  ["/api/agent-integrations/apply", "Q2 上游 Agent 集成"],
  ["/api/audit", "Q2 服务端审计"],
  ["/api/handoff", "Q2 上游 Agent handoff"],
  ["/api/install-skill", "Q2 上游 Agent 安装"],
  ["/api/installed-agents", "Q2 OpenWithAi 路由"],
  ["/api/lint/config", "Q2 上游 lint"],
  ["/api/share/construct-url", "Q2 上游分享"],
  ["/api/skill/install-state", "Q2 上游 Agent 安装"],
  ["/api/skills", "Q2 上游 Agent skill"],
  ["/api/skills/resolve-ref", "Q2 上游 Agent skill"],
  ["/api/sync/status", "Q2 云同步"],
]);
const bridge = new Map([
  ["platform", "desktop-bridge.ts 根据宿主 navigator.platform 映射"],
  ["cliCommandName", "desktop-bridge.ts，Q2 不提供上游 CLI 命令"],
  ["mcpServerName", "desktop-bridge.ts，Q2 不提供上游 MCP 服务名"],
  ["appVersion", "上游 cowork 安装记录（Q2），读取失败回退 unknown"],
  ["clipboard", "app/src/lib/copy-image.ts 使用 navigator.clipboard.write 回退"],
  ["config.mode", "Q10 不启用 OK 独立笔记窗口，undefined 与默认工作台模式对齐"],
  ["noteWindow.dispatchToMain", "Q2/Q10 不启用 OK 独立笔记窗口"],
  ["skill", "Q2 上游 Agent skill"],
]);
const desktopRoot = join(root, "apps/desktop/out");
const externalIpc = "huhu:openExternal";
if (["preload/index.cjs", "main/index.js"].every((entry) => readFileSync(join(desktopRoot, entry), "utf8").includes(externalIpc))) {
  bridge.set("shell.openExternal", "desktop-bridge.ts → window.huhuHost.openExternal → 构建中已接线的主进程 HTTP(S) 确认");
}
const rows = [];
for (const [path, calls] of [...api].sort(([a], [b]) => a.localeCompare(b))) {
  if (path === "/api/local-emoji" && offlineEmojiAssetPaths.every((asset) => existsSync(join(assets, "..", asset.slice(1))))) {
    rows.push({ kind: "api", path, state: "static-assets", evidence: offlineEmojiAssetPaths, calls });
    continue;
  }
  const reason = excludedApi.get(path);
  const resolved = calls.map((call) => {
    if (call.kind !== "call") return call;
    const signature = call.method ? `${call.method} ${path}` : null;
    const handlers = signature ? (routes.get(signature) ?? []) : [];
    return { ...call, signature, handlers };
  });
  const executable = resolved.filter((call) => call.kind === "call");
  const methods = [...new Set(executable.flatMap((call) => (call.method ? [call.method] : [])))].sort();
  const unknown = executable.filter((call) => !call.handlers.length);
  const state = reason ? "excluded" : unknown.length ? "unresolved" : methods.length ? "handler-method" : "literal-only";
  rows.push({ kind: "api", path, methods, state, ...(reason ? { evidence: reason } : {}), calls: resolved });
}
for (const [path, calls] of [...desktop].sort(([a], [b]) => a.localeCompare(b))) {
  const reason = bridge.get(path);
  rows.push({ kind: "desktop", path, state: reason ? "documented" : "unresolved", evidence: reason ?? null, calls });
}
if (!api.size || !desktop.size) throw new Error("桌面产物未包含 OK 宿主调用");
const evidence = join(createOkParityRun("host-endpoints"), "desktop-host-endpoints.json");
writeFileSync(evidence, JSON.stringify({ renderer: "Electron production", rows }, null, 2) + "\n");
const unresolved = rows.filter(({ state }) => state === "unresolved").map(({ path }) => path);
console.log(`${rows.length} 个宿主签名，${unresolved.length} 个待处理：${unresolved.join(", ")}`);
if (process.argv.includes("--assert") && unresolved.length) process.exitCode = 1;
