import { createHash } from "node:crypto";
import { errors, type McpEntryKind } from "@huhu/contracts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import { ListPromptsResultSchema, ListResourcesResultSchema, ListResourceTemplatesResultSchema, ListToolsResultSchema, type Prompt, type Resource, type ResourceTemplate, type Tool } from "@modelcontextprotocol/sdk/types.js";

export type Directory = { tool: Tool; resource: Resource; "resource-template": ResourceTemplate; prompt: Prompt };
export type DirectoryEntry = { [K in McpEntryKind]: { kind: K; identity: string; definition: Directory[K] } }[McpEntryKind];

export function publicToolName(namespace: string, raw: string, reserved: (name: string) => boolean): string {
  const natural = `${namespace}__${raw}`;
  if (natural.length <= 128 && /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/.test(raw) && !reserved(natural)) return natural;
  return `${namespace}__-${createHash("sha256").update(raw).digest("hex")}`;
}

export const externalUriScheme = "mcp-source://";
export const resourcePrefix = (namespace: string) => `${externalUriScheme}${namespace}/`;
export const projectUri = (namespace: string, uri: string) => resourcePrefix(namespace) + uri;

const maxPages = 24;
const maxEntries = 2048;
const maxBytes = 2 * 1024 * 1024;
const maxEntryBytes = 128 * 1024;
const maxUriLength = 4096;

type Page<T> = { entries: T[]; nextCursor?: string | undefined };
export async function discoverCatalog(client: Pick<Client, "getServerCapabilities" | "request">, signal: AbortSignal): Promise<DirectoryEntry[]> {
  const capabilities = client.getServerCapabilities();
  const entries: DirectoryEntry[] = [];
  let bytes = 0;
  const collect = async <T>(pageFor: (cursor?: string) => Promise<Page<T>>, map: (row: T) => DirectoryEntry) => {
    const seen = new Set<string>();
    const identities = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      signal.throwIfAborted();
      const response = await pageFor(cursor);
      for (const row of response.entries) {
        const entry = map(row);
        const size = Buffer.byteLength(JSON.stringify(row));
        bytes += size;
        if (size > maxEntryBytes || bytes > maxBytes || entries.length >= maxEntries || !entry.identity || identities.has(entry.identity)) {
          throw errors.invalidInput("上游目录过大或含重复条目");
        }
        identities.add(entry.identity);
        if (entry.kind === "resource-template") validateTemplate(entry.identity);
        if (entry.kind !== "tool" || entry.definition.execution?.taskSupport !== "required") entries.push(entry);
      }
      cursor = response.nextCursor;
      if (cursor === undefined) return;
      if (seen.has(cursor)) throw errors.invalidInput("上游目录返回重复游标");
      seen.add(cursor);
    }
    throw errors.invalidInput("上游目录分页超出限制");
  };
  const params = (cursor?: string) => (cursor === undefined ? {} : { params: { cursor } });
  if (capabilities?.tools)
    await collect(
      async (cursor) => {
        const result = await client.request({ method: "tools/list", ...params(cursor) }, ListToolsResultSchema, { signal });
        return { entries: result.tools, nextCursor: result.nextCursor };
      },
      (definition) => ({ kind: "tool", identity: definition.name, definition }),
    );
  if (capabilities?.resources) {
    await collect(
      async (cursor) => {
        const result = await client.request({ method: "resources/list", ...params(cursor) }, ListResourcesResultSchema, { signal });
        return { entries: result.resources, nextCursor: result.nextCursor };
      },
      (definition) => ({ kind: "resource", identity: definition.uri, definition }),
    );
    await collect(
      async (cursor) => {
        const result = await client.request({ method: "resources/templates/list", ...params(cursor) }, ListResourceTemplatesResultSchema, { signal });
        return { entries: result.resourceTemplates, nextCursor: result.nextCursor };
      },
      (definition) => ({ kind: "resource-template", identity: definition.uriTemplate, definition }),
    );
  }
  if (capabilities?.prompts)
    await collect(
      async (cursor) => {
        const result = await client.request({ method: "prompts/list", ...params(cursor) }, ListPromptsResultSchema, { signal });
        return { entries: result.prompts, nextCursor: result.nextCursor };
      },
      (definition) => ({ kind: "prompt", identity: definition.name, definition }),
    );
  return entries.sort((a, b) => a.kind.localeCompare(b.kind) || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
}

function validateTemplate(template: string) {
  try {
    if (template.length > maxUriLength || !UriTemplate.isTemplate(template) || (template.match(/\{/g)?.length ?? 0) > 8) throw Error();
    new UriTemplate(template);
  } catch {
    throw errors.invalidInput("上游资源模板无效或超出限制");
  }
}

/** Match only. The original URI bytes are forwarded unchanged once this route is authorized. */
export function matchesTemplate(template: string, uri: string): boolean {
  if (uri.length > maxUriLength) return false;
  const expandedVariables = template.replace(/\{([\w.-]+(?:,[\w.-]+)+)\}/g, (_, names: string) =>
    names
      .split(",")
      .map((name) => "{" + name + "}")
      .join(","),
  );
  try {
    // SDK matching requires every query variable in declaration order. RFC 6570 allows omitted variables.
    const query = /((?:\{[?&][\w.,-]+\})+)$/.exec(expandedVariables);
    if (!query) {
      if (uri.includes("?") && !expandedVariables.includes("?") && !expandedVariables.includes("{+")) return false;
      if (uri.includes("#") && !expandedVariables.includes("#") && !expandedVariables.includes("{+")) return false;
      return new UriTemplate(expandedVariables).match(uri) !== null;
    }
    const base = expandedVariables.slice(0, -query[0].length);
    const separator = base.includes("?") ? "&" : "?";
    const index = uri.indexOf(separator, base.includes("?") ? base.indexOf("?") : 0);
    const rawBase = index < 0 ? uri : uri.slice(0, index);
    if (!new UriTemplate(base).match(rawBase)) return false;
    if (index < 0) return true;
    const allowed = new Set(
      query[0]
        .replace(/[{}?&]/g, ",")
        .split(",")
        .filter(Boolean),
    );
    const used = new Set<string>();
    return uri
      .slice(index + 1)
      .split("&")
      .every((pair) => {
        const equal = pair.indexOf("=");
        const key = pair.slice(0, equal);
        if (equal < 1 || !allowed.has(key) || used.has(key)) return false;
        used.add(key);
        return true;
      });
  } catch {
    return false;
  }
}

export function projectTool(tool: Tool, name: string): Tool {
  const { _meta, execution: _execution, ...definition } = tool;
  return {
    ...definition,
    name,
    ...(_meta && { _meta: Object.fromEntries(Object.entries(_meta).filter(([key]) => !key.startsWith("huhu.dev/"))) }),
  };
}
