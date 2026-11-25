import { isIP } from "node:net";
import { errors, type McpSource } from "@huhu/contracts";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { mcpRouteError } from "../mcp-routing.js";
import type { McpCredentialMaterial } from "./credentials.js";

const reservedHeader = /^(?:host|origin|connection|upgrade|transfer-encoding|content-length|content-type|accept|proxy-.+|mcp-.+|x-forwarded-.+)$/i;

function environmentValue(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw mcpRouteError("authentication-required");
  return value;
}

export function validateRemoteHeaders(configuration: McpSource["configuration"]): void {
  if (configuration.transport === "stdio") return;
  const { headers, authentication } = configuration;
  const names = Object.keys(headers).map((name) => name.toLowerCase());
  if (authentication.kind !== "none" && authentication.kind !== "oauth") names.push(authentication.header.toLowerCase());
  if (new Set(names).size !== names.length || names.some((name) => reservedHeader.test(name))) {
    throw errors.invalidInput("MCP header 重复或由协议保留");
  }
}

/** P2 persists environment references and rebind markers; only the credential owner may publish a live reference. */
export function validateSourceConfiguration(configuration: McpSource["configuration"]): void {
  validateRemoteHeaders(configuration);
  if (configuration.transport === "stdio") {
    if (configuration.credentialEnvironment?.reference) throw errors.invalidInput("请通过认证管理绑定凭据");
    return;
  }
  const auth = configuration.authentication;
  if (auth.kind === "credential" || (auth.kind === "oauth" && auth.reference !== undefined)) {
    throw errors.invalidInput("请使用认证管理绑定模块凭据");
  }
}

export function validateCredentialHeaders(headers: Record<string, string>) {
  const names = Object.keys(headers).map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length || names.some((name) => reservedHeader.test(name))) throw errors.invalidInput("认证 header 重复或由协议保留");
  try { new Headers(headers); }
  catch { throw errors.invalidInput("认证 header 无效"); }
}

function localHost(host: string): boolean {
  return host === "localhost" || host === "localhost." || host === "[::1]" || host.startsWith("[::ffff:7f") || (isIP(host) === 4 && host.startsWith("127."));
}

function assertDifferentTarget(url: URL, ownEndpoint: string | null | undefined): void {
  if (!ownEndpoint) return;
  const own = new URL(ownEndpoint);
  const path = (value: URL) => value.pathname.replace(/\/+$/, "");
  if (url.port === own.port && path(url) === path(own) && (url.origin === own.origin || localHost(url.hostname))) {
    throw errors.invalidInput("MCP 来源不能指回当前 Engine 入口");
  }
}

export function sourceTransport(source: McpSource, endpoint: () => string | null | undefined, material: () => McpCredentialMaterial | undefined): Transport {
  const configuration = source.configuration;
  if (configuration.transport === "stdio") {
    const sealed = material();
    if (configuration.credentialEnvironment && sealed?.kind !== "stdio") throw mcpRouteError("authentication-required", { sourceId: source.sourceId });
    const transport = new StdioClientTransport({
      command: configuration.command,
      args: configuration.args,
      ...(configuration.cwd !== undefined && { cwd: configuration.cwd }),
      env: {
        ...Object.fromEntries(Object.entries(configuration.environment).map(([name, reference]) => [name, environmentValue(reference)])),
        ...(sealed?.kind === "stdio" && sealed.environment),
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", () => undefined);
    return transport;
  }

  validateRemoteHeaders(configuration);
  const url = new URL(configuration.url);
  assertDifferentTarget(url, endpoint());
  const headers = new Headers(configuration.headers);
  const authentication = configuration.authentication;
  const sealed = material();
  if (authentication.kind === "environment") headers.set(authentication.header, environmentValue(authentication.name));
  else if (authentication.kind === "credential" && sealed?.kind === "remote") {
    validateCredentialHeaders(sealed.headers);
    for (const [name, value] of Object.entries(sealed.headers)) headers.set(name, value);
    url.search = sealed.query;
  } else if (authentication.kind !== "none" && !(authentication.kind === "oauth" && sealed?.kind === "oauth")) {
    throw mcpRouteError("authentication-required", { sourceId: source.sourceId });
  }

  const boundFetch: typeof fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : input);
    if (target.origin !== url.origin) throw errors.permissionDenied("MCP 来源请求跨越了认证目标");
    assertDifferentTarget(target, endpoint());
    const ready = material();
    const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (ready?.kind === "oauth") requestHeaders.set("Authorization", "Bearer " + ready.tokens.access_token);
    return fetch(input, { ...init, headers: requestHeaders, redirect: "manual" });
  };
  const options = { requestInit: { headers }, fetch: boundFetch };
  return configuration.transport === "streamable-http"
    ? new StreamableHTTPClientTransport(url, options)
    : new SSEClientTransport(url, options);
}

export function remoteAuthFailure(error: unknown): boolean {
  return error instanceof UnauthorizedError || ((error instanceof StreamableHTTPError || error instanceof SseError) && (error.code === 401 || error.code === 403));
}
