import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourceTemplatesRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { type CapabilityResult } from "@huhu/contracts";
import { mcpToolName } from "./capabilities/define.js";
import { canonicalJson } from "./idempotency.js";

export interface McpBackend {
  /** 对当前调用者可见（已对外开放）的能力。 */
  list(): Promise<McpCapability[]> | McpCapability[];
  /** 解析协议工具名并交给 Dispatcher 复核，包括客户端缓存的旧工具。 */
  callTool(name: string, input: unknown): Promise<CapabilityResult<unknown>>;
  /** 资源依赖的 canonical 能力同样经 Dispatcher 授权。 */
  call(capability: string, input: unknown): Promise<CapabilityResult<unknown>>;
}

type McpCapability = { name: string; plugin: string; scope: string; input: unknown; output: unknown };

function structuredOutput(schema: unknown) {
  const record = typeof schema === "object" && schema !== null ? (schema as Record<string, unknown>) : {};
  const { $schema: _, ...output } = record;
  // Rebase Zod's fragment pointers inside the object envelope required by MCP v1 clients.
  const data: unknown = JSON.parse(JSON.stringify(output, (key, value: unknown) => (key === "$ref" && typeof value === "string" && (value === "#" || value.startsWith("#/")) ? "#/properties/data" + value.slice(1) : value)));
  return {
    type: "object" as const,
    properties: { data, opId: { type: "string" } },
    required: ["data"],
    additionalProperties: false,
  };
}

const SUMMARY = "huhu://vault/summary";
const RECENT = "huhu://notes/recent";
async function need<T>(p: Promise<CapabilityResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
export function resolveMcpToolName(known: readonly string[], name: string): string | undefined {
  const matches = known.filter((cap) => mcpToolName(cap) === name);
  return matches.length === 1 ? matches[0] : undefined;
}

/** 把对外开放的能力映射为 MCP 工具，并提供资源（概览、最近笔记）、模板（`huhu://notes/{id}`）与提示词（daily-review、knowledge-synthesis）。stdio 与 HTTP 共用。 */
export function createMcpServer(
  backend: McpBackend,
  version: string,
  opts: { /** 有长连接（stdio）时按这个间隔检查对外开放的工具表，变了就发 notifications/tools/list_changed；HTTP 是无状态的，不开启。 */ watchToolsMs?: number } = {},
): Server {
  const server = new Server({ name: "huhu", version }, { capabilities: { tools: { listChanged: opts.watchToolsMs !== undefined }, resources: {}, prompts: {} } });
  if (opts.watchToolsMs !== undefined) {
    let timer: ReturnType<typeof setInterval> | null = null;
    let last: string | null = null;
    const signature = async () => (await backend.list()).map(canonicalJson).sort().join("\n");
    server.oninitialized = () => {
      void signature().then(
        (s) => (last = s),
        () => undefined,
      );
      timer = setInterval(() => {
        void signature().then(
          (s) => {
            if (last !== null && s !== last) void server.sendToolListChanged().catch(() => undefined);
            last = s;
          },
          () => undefined, // Engine 暂时连不上：下一轮再看
        );
      }, opts.watchToolsMs);
      timer.unref();
    };
    server.onclose = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
  }
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await backend.list()).map((c) => ({
      name: mcpToolName(c.name),
      description: `${c.name}（${c.plugin} · ${c.scope}）`,
      inputSchema: (c.input && typeof c.input === "object" ? c.input : { type: "object" }) as { type: "object" },
      outputSchema: structuredOutput(c.output),
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const r = await backend.callTool(req.params.name, req.params.arguments ?? {});
    if (!r.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] };
    const data = r.data ?? null;
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { data, ...(r.opId && { opId: r.opId }) } };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const visible = new Set((await backend.list()).map((c) => c.name));
    const resources = [
      { capability: "vault.info", uri: SUMMARY, name: "Vault 概览", mimeType: "application/json" },
      { capability: "vault.indexEntries", uri: RECENT, name: "最近修改的笔记", mimeType: "application/json" },
    ];
    return { resources: resources.filter(({ capability }) => visible.has(capability)).map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) };
  });
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    const visible = new Set((await backend.list()).map((c) => c.name));
    return {
      resourceTemplates: visible.has("notes.list") && visible.has("notes.read") ? [{ uriTemplate: "huhu://notes/{id}", name: "笔记正文", description: "按笔记 ID（或相对路径）读取 Markdown 正文", mimeType: "text/markdown" }] : [],
    };
  });
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const json = (data: unknown) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }] });
    if (uri === SUMMARY) return json(await need(backend.call("vault.info", {})));
    if (uri === RECENT) {
      const tree = (await need(backend.call("vault.indexEntries", { prefix: "" }))) as { path: string; type: string; mtimeMs: number }[];
      return json(
        tree
          .filter((e) => e.type === "file" && e.path.endsWith(".md") && !e.path.split("/").some((p) => p.startsWith(".")))
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
          .slice(0, 20)
          .map((e) => ({ path: e.path, modifiedAt: new Date(e.mtimeMs).toISOString() })),
      );
    }
    const m = /^huhu:\/\/notes\/(.+)$/.exec(uri);
    if (!m) throw new Error(`未知资源：${uri}`);
    const key = decodeURIComponent(m[1] as string);
    const all = (await need(backend.call("notes.list", { filter: "all" }))) as { id: string | null; path: string }[];
    const hit = all.find((n) => n.id === key || n.path === key);
    if (!hit) throw new Error(`笔记不存在：${key}`);
    const note = (await need(backend.call("notes.read", { path: hit.path }))) as { text: string };
    return { contents: [{ uri, mimeType: "text/markdown", text: note.text }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      { name: "daily-review", description: "回顾今天的笔记与任务，整理成每日复盘", arguments: [{ name: "date", description: "YYYY-MM-DD，默认今天", required: false }] },
      { name: "knowledge-synthesis", description: "围绕一个主题综合相关笔记，输出带来源链接的整理稿", arguments: [{ name: "topic", description: "主题或关键词", required: true }] },
    ],
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const args = req.params.arguments ?? {};
    const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });
    if (req.params.name === "daily-review") {
      const date = typeof args["date"] === "string" && args["date"] ? args["date"] : new Date().toISOString().slice(0, 10);
      return {
        description: `每日复盘 ${date}`,
        ...user(`请回顾 ${date} 的工作：先读取资源 huhu://notes/recent 与当天的日记，再用 tasks 相关工具列出当天完成与未完成的任务，最后给出：完成了什么、卡在哪里、明天的三件事。只引用 HUHU 里真实存在的内容。`),
      };
    }
    if (req.params.name === "knowledge-synthesis") {
      const topic = typeof args["topic"] === "string" ? args["topic"].trim() : "";
      if (!topic) throw new Error("缺少参数 topic");
      return {
        description: `主题综合：${topic}`,
        ...user(`请围绕「${topic}」综合我的笔记：用 vault_search 找到相关笔记，读取正文后整理成结构化的要点，每条结论后用 [[笔记名]] 标注来源，并指出笔记之间的矛盾或空白。不要编造笔记里没有的内容。`),
      };
    }
    throw new Error(`未知提示词：${req.params.name}`);
  });
  return server;
}
