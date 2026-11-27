import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
  type GetPromptResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { CapabilityIntentKeySchema, CapabilityOperationLookupSchema, errors, isHuhuError, type CapabilityOperationLookup, type CapabilityResult, type McpEntryKind, type McpSessionPrincipal } from "@huhu/contracts";
import { mcpToolName } from "./capabilities/define.js";
import { externalUriScheme, type DirectoryEntry } from "./mcp-sources/catalog.js";

export interface McpBackend {
  toolsOnly?: boolean;
  /** 对当前调用者可见（已对外开放）的能力。 */
  list(): Promise<McpCapability[]> | McpCapability[];
  /** 解析协议工具名并交给 Dispatcher 复核，包括客户端缓存的旧工具。 */
  callTool(name: string, input: unknown, intentKey?: string): Promise<CapabilityResult<unknown>>;
  /** 资源依赖的 canonical 能力同样经 Dispatcher 授权。 */
  call(capability: string, input: unknown): Promise<CapabilityResult<unknown>>;
  operation?(lookup: CapabilityOperationLookup): CapabilityResult<unknown> | Promise<CapabilityResult<unknown>>;
  external?: {
    list(kind: McpEntryKind): Promise<DirectoryEntry[]>;
    read(uri: string): Promise<ReadResourceResult | undefined>;
    get(name: string, input: Record<string, string>): Promise<GetPromptResult | undefined>;
    call(name: string, input: unknown): Promise<CallToolResult | undefined>;
    ownsName(name: string): boolean;
  };
}

export interface ExternalMcpTools {
  list(principal: McpSessionPrincipal, kind: McpEntryKind): Promise<DirectoryEntry[]>;
  read(principal: McpSessionPrincipal, uri: string): Promise<ReadResourceResult>;
  get(principal: McpSessionPrincipal, name: string, input: Record<string, string>): Promise<GetPromptResult>;
  call(principal: McpSessionPrincipal, name: string, input: unknown): Promise<CallToolResult>;
  ownsName(name: string): boolean;
  subscribe(listener: (kinds: readonly McpEntryKind[]) => void): () => void;
}

type McpCapability = { name: string; plugin: string; scope: string; input: unknown; output: unknown; durableIntent?: true | undefined; intentRequired?: true | undefined };
const intentField = "huhu.dev/intent-key";

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
const builtinPrompts = [
  { name: "daily-review", description: "回顾今天的笔记与任务，整理成每日复盘", arguments: [{ name: "date", description: "YYYY-MM-DD，默认今天", required: false }] },
  { name: "knowledge-synthesis", description: "围绕一个主题综合相关笔记，输出带来源链接的整理稿", arguments: [{ name: "topic", description: "主题或关键词", required: true }] },
];

export function builtinMcpDirectory(tools: readonly { name: string; durableIntent?: boolean | undefined }[], withOperation: boolean): DirectoryEntry[] {
  const visible = new Set(tools.map((tool) => tool.name));
  const entries: DirectoryEntry[] = builtinPrompts.map((definition) => ({ kind: "prompt", identity: definition.name, definition }));
  if (visible.has("vault.info")) entries.push({ kind: "resource", identity: SUMMARY, definition: { uri: SUMMARY, name: "Vault 概览", mimeType: "application/json" } });
  if (visible.has("vault.indexEntries")) entries.push({ kind: "resource", identity: RECENT, definition: { uri: RECENT, name: "最近修改的笔记", mimeType: "application/json" } });
  if (visible.has("notes.list") && visible.has("notes.read"))
    entries.push({
      kind: "resource-template",
      identity: "huhu://notes/{id}",
      definition: { uriTemplate: "huhu://notes/{id}", name: "笔记正文", description: "按笔记 ID（或相对路径）读取 Markdown 正文", mimeType: "text/markdown" },
    });
  if (withOperation && tools.some((tool) => tool.durableIntent))
    entries.push({
      kind: "resource-template",
      identity: "huhu://operations/{operationId}",
      definition: { uriTemplate: "huhu://operations/{operationId}", name: "操作回执", description: "查询本入口提交的持久操作", mimeType: "application/json" },
    });
  return entries;
}

async function externalCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isHuhuError(error)) throw error;
    const invalid = error.code === "INVALID_INPUT" || error.code === "CAPABILITY_NOT_FOUND";
    throw new McpError(invalid ? ErrorCode.InvalidParams : -32000, error.message, error.toJSON());
  }
}

async function need<T>(p: Promise<CapabilityResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
export function resolveMcpToolName(known: readonly string[], name: string): string | undefined {
  const matches = known.filter((cap) => mcpToolName(cap) === name);
  return matches.length === 1 ? matches[0] : undefined;
}

/** 把对外开放的能力映射为 MCP 工具，并提供资源（概览、最近笔记）、模板（`huhu://notes/{id}`）与提示词（daily-review、knowledge-synthesis）。 */
export function createMcpServer(backend: McpBackend, version: string): Server {
  const dynamic = backend.external ? { listChanged: true } : {};
  const server = new Server({ name: "huhu", version }, { capabilities: { tools: backend.toolsOnly ? {} : dynamic, ...(!backend.toolsOnly && { resources: dynamic, prompts: dynamic }) } });
  const externalList = (kind: McpEntryKind) =>
    backend.external?.list(kind).catch((error: unknown) => {
      if (isHuhuError(error) && error.code === "INVALID_INPUT") return [];
      throw error;
    }) ?? Promise.resolve([]);
  const directory = async (kind: McpEntryKind) => [...(await externalList(kind)), ...builtinMcpDirectory(await backend.list(), !!backend.operation)];
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const external = (await externalList("tool")).flatMap((entry) => (entry.kind === "tool" ? [entry.definition] : []));
    const builtins = (await backend.list()).filter((cap) => !backend.external?.ownsName(mcpToolName(cap.name)));
    return {
      tools: [
        ...builtins.map((c) => ({
          name: mcpToolName(c.name),
          description: `${c.name}（${c.plugin} · ${c.scope}）`,
          inputSchema: (c.input && typeof c.input === "object" ? c.input : { type: "object" }) as { type: "object" },
          outputSchema: structuredOutput(c.output),
          ...(c.durableIntent && { _meta: { [intentField]: c.intentRequired ? "required" : "optional" } }),
        })),
        ...external,
      ],
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (backend.external) {
      const external = await externalCall(() => backend.external!.call(req.params.name, req.params.arguments ?? {}));
      if (external) return external;
    }
    const key = CapabilityIntentKeySchema.optional().safeParse(req.params._meta?.[intentField]);
    const r = key.success ? await backend.callTool(req.params.name, req.params.arguments ?? {}, key.data) : { ok: false as const, error: errors.invalidInput("MCP 执行意图不符合要求", key.error.issues).toJSON() };
    if (!r.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] };
    const data = r.data ?? null;
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { data, ...(r.opId && { opId: r.opId }) } };
  });
  if (backend.toolsOnly) return server;
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: (await directory("resource")).flatMap((entry) => (entry.kind === "resource" ? [entry.definition] : [])),
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: (await directory("resource-template")).flatMap((entry) => (entry.kind === "resource-template" ? [entry.definition] : [])),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    if (uri.startsWith(externalUriScheme) && backend.external) {
      const external = await externalCall(() => backend.external!.read(uri));
      if (external) return external;
    }
    const json = (data: unknown) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }] });
    if (uri === SUMMARY) return json(await need(backend.call("vault.info", {})));
    if (uri.startsWith("huhu://operations/") && backend.operation) {
      const lookup = CapabilityOperationLookupSchema.safeParse({ operationId: uri.slice("huhu://operations/".length) });
      if (!lookup.success) throw new Error("无效的操作标识");
      return json(await backend.operation(lookup.data));
    }
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
    prompts: (await directory("prompt")).flatMap((entry) => (entry.kind === "prompt" ? [entry.definition] : [])),
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
    if (backend.external) {
      const external = await externalCall(() => backend.external!.get(req.params.name, args));
      if (external) return external;
    }
    throw new Error(`未知提示词：${req.params.name}`);
  });
  return server;
}
