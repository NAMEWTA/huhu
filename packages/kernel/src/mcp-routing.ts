import type { CallToolResult, GetPromptResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  HuhuError,
  MCP_ROUTING_ERRORS,
  type CapabilityResult,
  type McpEntryKind,
  type McpExternalRoute,
  type McpPublishPolicy,
  type McpRoute,
  type McpRoutingReason,
  type McpSessionPrincipal,
  type McpSourceCatalog,
} from "@huhu/contracts";

export interface McpRoutingSnapshot {
  readonly vaultInstance: string;
  readonly serviceGeneration: string;
  readonly available: boolean;
  readonly routes: readonly McpRoute[];
  readonly policy: McpPublishPolicy;
  readonly catalogRevision: number;
  readonly sources: ReadonlyMap<string, McpSourceCatalog>;
}

export type McpRouteRequest = {
  readonly kind: McpEntryKind;
  readonly publicKey: string;
  readonly input: unknown;
};

export type McpUpstreamResult = CallToolResult | ReadResourceResult | GetPromptResult;
export type McpRoutedResult =
  | { readonly origin: "builtin"; readonly result: CapabilityResult<unknown> }
  | { readonly origin: "external"; readonly result: McpUpstreamResult };

/**
 * Pass the current immutable Engine projection on every read. Authorization covers the
 * real session and task delegation against that projection. For external sources it
 * includes verified local approval and connection binding. Prepare may await a ready
 * connection. The returned function hands off the request synchronously before awaiting a response.
 */
export interface McpRoutingBackend {
  readSnapshot(): McpRoutingSnapshot;
  authorize(route: McpRoute, principal: McpSessionPrincipal): boolean;
  invokeBuiltin(route: Extract<McpRoute, { origin: "builtin" }>, input: unknown, principal: McpSessionPrincipal): Promise<CapabilityResult<unknown>>;
  prepareExternal(route: McpExternalRoute, signal: AbortSignal): Promise<(input: unknown) => Promise<McpUpstreamResult>>;
}

const messages: Record<McpRoutingReason, string> = {
  "unknown-entry": "目录条目不存在",
  "ambiguous-entry": "公开标识对应多个目录条目",
  "invalid-arguments": "调用参数无效",
  "not-exposed": "目录条目未开放",
  "service-unavailable": "MCP 服务当前不可用",
  "source-disabled": "来源已停用",
  "source-offline": "来源当前离线",
  "protocol-incompatible": "来源协议版本不兼容",
  "authentication-required": "来源需要完成认证",
  "approval-required": "来源需要本机执行许可",
  "permission-denied": "当前会话无权访问此条目",
  "recovered-session": "请建立不携带恢复凭据的新会话再调用外部工具",
  "stale-session": "MCP 会话不属于当前 Vault 或服务代次",
  "stale-route": "目录已过期，请重新列出目录",
  "cancelled-before-send": "请求在发送前已取消",
  "upstream-result-unknown": "无法确认已发送的上游调用结果",
};

export function mcpRouteError(reason: McpRoutingReason, context?: { sourceId: string; correlationId?: string }): HuhuError {
  return new HuhuError(MCP_ROUTING_ERRORS[reason], messages[reason], { details: { reason, ...context }, retryable: false });
}

function checkSession(snapshot: McpRoutingSnapshot, principal: McpSessionPrincipal): void {
  const { identity } = principal;
  if (principal.signal.aborted) throw mcpRouteError("cancelled-before-send");
  if (!snapshot.available) throw mcpRouteError("service-unavailable");
  if (snapshot.vaultInstance !== identity.vaultInstance || snapshot.serviceGeneration !== identity.serviceGeneration) throw mcpRouteError("stale-session");
}

function sourceStatus(route: McpExternalRoute, snapshot: McpRoutingSnapshot): McpRoutingReason | undefined {
  const source = snapshot.sources.get(route.sourceId);
  if (!source || source.configRevision !== route.configRevision || source.authenticationRevision !== route.authenticationRevision ||
    source.catalogRevision !== route.catalogRevision) return "stale-route";
  switch (source.state) {
    case "ready": return source.complete ? undefined : "stale-route";
    case "disabled": return "source-disabled";
    case "offline": return "source-offline";
    case "stale": return "stale-route";
    case "auth-required": return "authentication-required";
    case "approval-required": return "approval-required";
    case "incompatible": return "protocol-incompatible";
  }
}

function confirmRoute(route: McpRoute, snapshot: McpRoutingSnapshot, principal: McpSessionPrincipal, backend: McpRoutingBackend, calling: boolean): void {
  if (principal.taskActive && !principal.taskActive()) throw mcpRouteError("permission-denied");
  if (principal.taskTools && (route.kind !== "tool" || !principal.taskTools.some((tool) =>
    route.origin === "builtin"
      ? tool.sourceId === "builtin" && tool.upstreamIdentity === route.capability
      : tool.sourceId === route.sourceId && tool.upstreamIdentity === route.upstreamIdentity && tool.sourceRevision === route.configRevision
  ))) throw mcpRouteError("permission-denied");
  if (route.origin === "external") {
    if (!snapshot.policy.selected.some(({ sourceId, kind, upstreamIdentity }) =>
      sourceId === route.sourceId && kind === route.kind && upstreamIdentity === route.upstreamIdentity)) {
      throw mcpRouteError("not-exposed");
    }
    if (!backend.authorize(route, principal)) throw mcpRouteError("permission-denied");
    const status = sourceStatus(route, snapshot);
    if (status) throw mcpRouteError(status, { sourceId: route.sourceId });
    if (calling && route.kind === "tool" && principal.recovered) throw mcpRouteError("recovered-session");
  } else if (!backend.authorize(route, principal)) {
    throw mcpRouteError("permission-denied");
  }
}

/** Exact published identities cross the protocol boundary. Template matching supplies an exact template key. */
export function createMcpRouting(backend: McpRoutingBackend) {
  function resolve(principal: McpSessionPrincipal, { kind, publicKey }: McpRouteRequest): McpRoute {
    const snapshot = backend.readSnapshot();
    checkSession(snapshot, principal);
    const matches = snapshot.routes.filter((route) => route.kind === kind && route.publicKey === publicKey);
    if (matches.length > 1) throw mcpRouteError("ambiguous-entry");
    const route = matches[0];
    if (!route) throw mcpRouteError("unknown-entry");
    confirmRoute(route, snapshot, principal, backend, true);
    return route;
  }

  return {
    list(principal: McpSessionPrincipal, kind: McpEntryKind): McpRoute[] {
      const snapshot = backend.readSnapshot();
      checkSession(snapshot, principal);
      const entries = snapshot.routes.filter((route) => route.kind === kind);
      const counts = new Map<string, number>();
      for (const { publicKey } of entries) counts.set(publicKey, (counts.get(publicKey) ?? 0) + 1);
      return entries.filter((route) => {
        if (counts.get(route.publicKey) !== 1) return false;
        try {
          confirmRoute(route, snapshot, principal, backend, false);
          return true;
        } catch (error) {
          if (error instanceof HuhuError && error.details?.reason) return false;
          throw error;
        }
      });
    },

    async call(principal: McpSessionPrincipal, request: McpRouteRequest): Promise<McpRoutedResult> {
      const route = resolve(principal, request);
      if (route.origin === "builtin") {
        return { origin: "builtin", result: await backend.invokeBuiltin(route, request.input, principal) };
      }

      const send = await backend.prepareExternal(route, principal.signal);
      const current = resolve(principal, request);
      if (current.origin !== "external" || current.sourceId !== route.sourceId || current.upstreamIdentity !== route.upstreamIdentity ||
        current.configRevision !== route.configRevision || current.authenticationRevision !== route.authenticationRevision ||
        current.catalogRevision !== route.catalogRevision) {
        throw mcpRouteError("stale-route");
      }
      return { origin: "external", result: await send(request.input) };
    },
  };
}
