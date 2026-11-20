import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

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

for (const directory of [host, join(host, "routes")]) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = join(directory, entry.name);
    for (const [line, source] of readFileSync(file, "utf8").split("\n").entries()) {
      const route = /"((?:GET|POST|DELETE|PUT|PATCH) (\/api\/[\w./-]+))"\s*:/.exec(source);
      if (route) record(routes, route[2], `${route[1]} → ${normalized(file)}:${line + 1}`);
    }
  }
}

function memberChain(node) {
  return ts.isPropertyAccessExpression(node) ? [...memberChain(node.expression), node.name.text] : ts.isIdentifier(node) ? [node.text] : [];
}

for (const entry of readdirSync(assets)) {
  if (!entry.endsWith(".js")) continue;
  const file = join(assets, entry);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  function inspect(node, parent) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || node.kind === ts.SyntaxKind.TemplateHead) {
      const path = /^\/api\/[\w./-]+/.exec(node.text)?.[0];
      if (path) record(api, path, { chunk: entry, offset: node.getStart(source), kind: ts.isCallExpression(parent) ? "call-argument" : "literal" });
    }
    if (ts.isPropertyAccessExpression(node) && !(ts.isPropertyAccessExpression(parent) && parent.expression === node)) {
      const chain = memberChain(node).join(".");
      if (chain.startsWith("window.okDesktop.")) record(desktop, chain.slice("window.okDesktop.".length), { chunk: entry, offset: node.getStart(source) });
    }
    ts.forEachChild(node, (child) => inspect(child, node));
  }
  ts.forEachChild(source, (node) => inspect(node, source));
}

const excludedApi = new Map([
  ["/api/v1/call", "Engine HTTP transport, outside OK hostFetch"],
  ["/api/agent-integrations/apply", "Q2 上游 Agent 集成"],
  ["/api/config", "上游协作和单文件配置入口（Q2/Q10）。Huhu 提供 HostConfigProvider，工作台未挂上游 SingleFileModeProvider"],
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
const rows = [];
for (const [path, calls] of [...api].sort(([a], [b]) => a.localeCompare(b))) {
  const matches = path === "/api/local-emoji" ? [...routes].filter(([key]) => key.startsWith(`${path}/`)).flatMap(([, values]) => values) : routes.get(path);
  const reason = excludedApi.get(path);
  rows.push({ kind: "api", path, state: matches ? "handler-path" : reason ? "excluded" : "unresolved", evidence: matches ?? reason ?? null, calls });
}
for (const [path, calls] of [...desktop].sort(([a], [b]) => a.localeCompare(b))) {
  const reason = bridge.get(path);
  rows.push({ kind: "desktop", path, state: reason ? "documented" : "unresolved", evidence: reason ?? null, calls });
}
if (!api.size || !desktop.size) throw new Error("桌面产物未包含 OK 宿主调用");
const evidence = join(root, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/desktop-host-endpoints.json");
writeFileSync(evidence, JSON.stringify({ renderer: "Electron production", rows }, null, 2) + "\n");
const unresolved = rows.filter(({ state }) => state === "unresolved").map(({ path }) => path);
console.log(`${rows.length} 个宿主签名，${unresolved.length} 个待处理：${unresolved.join(", ")}`);
if (process.argv.includes("--assert") && unresolved.length) process.exitCode = 1;
