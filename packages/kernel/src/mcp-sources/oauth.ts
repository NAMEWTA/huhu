import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { errors, type McpSource } from "@huhu/contracts";
import { discoverOAuthServerInfo, exchangeAuthorization, registerClient, startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type { CapabilityContext } from "../capabilities/define.js";
import { canonicalJson } from "../idempotency.js";
import { credentialFailure, expiry, type McpCredentials, type OAuthMaterial } from "./credentials.js";
import { oauthFetch, oauthUrl } from "./oauth-network.js";

type LoginState = "waiting" | "exchanging" | "complete" | "cancelled" | "expired" | "failed";
type Sender = Pick<CapabilityContext, "caller" | "subject" | "delegatedBy">;
type Attempt = {
  id: string; sourceId: string; owner: string; state: LoginState; expiresAt: number;
  controller: AbortController; server: Server; timer: NodeJS.Timeout; redirect: URL; proof: string;
  redeem?: (code: string) => Promise<void>;
};
const ownerOf = (context: Sender) => canonicalJson([context.caller, context.subject ?? null, context.delegatedBy ?? null]);
const bindTime = 5 * 60_000;
const retention = 10 * 60_000;

function sameState(expected: string, incoming: string | null) {
  if (!incoming || expected.length !== incoming.length) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(incoming);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class McpOAuth {
  private readonly attempts = new Map<string, Attempt>();
  private closed = false;

  constructor(private readonly credentials: McpCredentials,
    private readonly publish: (source: McpSource, account: string, material: OAuthMaterial, context: CapabilityContext, isCurrent: () => boolean) => Promise<void>) {}

  async begin(source: McpSource, account: string, context: CapabilityContext) {
    if (!this.credentials.available) throw credentialFailure(undefined);
    if (this.closed) throw errors.engineClosing();
    if (source.configuration.transport !== "streamable-http" || source.configuration.authentication.kind !== "oauth") throw errors.invalidInput("请先为 Streamable HTTP 来源选择 OAuth");
    this.cancelSource(source.sourceId);
    const now = Date.now();
    for (const [id, attempt] of this.attempts) if (attempt.expiresAt + retention < now) this.attempts.delete(id);
    if (this.attempts.size >= 64) {
      const previous = [...this.attempts.values()].find(({ state }) => state !== "waiting" && state !== "exchanging");
      if (!previous) throw errors.invalidInput("等待完成的 OAuth 登录已达上限");
      this.attempts.delete(previous.id);
    }
    const sourceUrl = oauthUrl(source.configuration.url, new URL(source.configuration.url));
    let entry: Attempt | undefined;
    const server = createServer((req, res) => {
      if (!entry) return res.writeHead(503).end();
      void this.callback(entry, req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const redirect = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/mcp/callback`);
    const id = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => { if (entry) this.stop(entry, "expired"); }, bindTime);
    timer.unref();
    const attempt: Attempt = { id, sourceId: source.sourceId, owner: ownerOf(context), state: "waiting", expiresAt: now + bindTime,
      controller, server, timer, redirect, proof: randomBytes(32).toString("hex") };
    entry = attempt;
    this.attempts.set(id, attempt);
    const isCurrent = () => {
      try {
        context.assertCapabilityCurrent?.();
        return !this.closed && !controller.signal.aborted && this.credentials.current(source);
      } catch { return false; }
    };
    try {
      const signal = AbortSignal.any([context.signal, controller.signal, AbortSignal.timeout(15_000)]);
      const fetchFn = oauthFetch(sourceUrl, signal);
      const discovery = await discoverOAuthServerInfo(sourceUrl, { fetchFn });
      const issuer = oauthUrl(discovery.authorizationServerUrl, sourceUrl);
      const metadata = discovery.authorizationServerMetadata;
      if (!metadata?.registration_endpoint) throw errors.invalidInput("此 OAuth 服务未提供客户端注册");
      const resource = discovery.resourceMetadata ? oauthUrl(discovery.resourceMetadata.resource, sourceUrl) : sourceUrl;
      if (resource.origin !== sourceUrl.origin || !sourceUrl.pathname.startsWith(resource.pathname.replace(/\/$/, "") + "/") && sourceUrl.pathname !== resource.pathname) {
        throw errors.permissionDenied("OAuth 资源与来源目标不符");
      }
      const client = await registerClient(issuer, { metadata, fetchFn, clientMetadata: {
        client_name: "Huhu", redirect_uris: [redirect.href], grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"], token_endpoint_auth_method: "none",
      } });
      const start = await startAuthorization(issuer, { metadata, clientInformation: client, redirectUrl: redirect, state: attempt.proof, resource });
      const link = oauthUrl(start.authorizationUrl, sourceUrl);
      if (signal.aborted || !isCurrent()) throw errors.versionConflict(String(source.revision));
      attempt.redeem = async (code) => {
        if (!isCurrent()) throw errors.versionConflict(String(source.revision));
        const exchangeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
        const tokens = await exchangeAuthorization(issuer, {
          metadata, clientInformation: client, authorizationCode: code, codeVerifier: start.codeVerifier, redirectUri: redirect, resource,
          fetchFn: oauthFetch(sourceUrl, exchangeSignal),
        });
        if (!isCurrent()) throw errors.versionConflict(String(source.revision));
        await this.publish(source, account, { kind: "oauth", issuer: issuer.href, client, metadata,
          resource: resource.href, tokens, expiresAt: expiry(tokens.expires_in) }, { ...context, signal: exchangeSignal }, isCurrent);
      };
      return { attemptId: id, authorizationUrl: link.href, expiresAt: attempt.expiresAt };
    } catch (error) {
      this.stop(attempt, "failed");
      throw credentialFailure(error);
    }
  }

  private async callback(attempt: Attempt, request: IncomingMessage, response: ServerResponse) {
    const reply = (status: number, message: string) => response.writeHead(status, {
      "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    }).end(message);
    if (request.method !== "GET" || request.headers.host !== attempt.redirect.host) return reply(400, "无效的授权回调");
    const url = URL.parse(request.url ?? "", attempt.redirect.href);
    if (!url || url.origin !== attempt.redirect.origin || url.pathname !== attempt.redirect.pathname ||
        !sameState(attempt.proof, url.searchParams.get("state"))) return reply(400, "无效的授权回调");
    if (Date.now() >= attempt.expiresAt) this.stop(attempt, "expired");
    if (attempt.state !== "waiting" || !attempt.redeem) return reply(410, "授权尝试已失效");
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.getAll("code").length !== 1 || code.length > 8192 || url.searchParams.has("error")) {
      reply(400, "没有完成授权");
      this.stop(attempt, "failed");
      return;
    }
    const redeem = attempt.redeem;
    delete attempt.redeem;
    attempt.state = "exchanging";
    try {
      await redeem(code);
      reply(200, "授权已完成。现在可以关闭此页面。");
      this.stop(attempt, "complete");
    } catch {
      reply(400, "授权失败或来源配置已经变化。");
      this.stop(attempt, "failed");
    }
  }

  private stop(attempt: Attempt, state: LoginState) {
    if (attempt.state !== "waiting" && attempt.state !== "exchanging") return;
    attempt.state = state;
    clearTimeout(attempt.timer);
    delete attempt.redeem;
    attempt.controller.abort();
    attempt.server.close();
  }

  private owned(context: Sender, id: string) {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.owner !== ownerOf(context)) throw errors.notFound("OAuth 登录尝试不存在");
    return attempt;
  }

  status(context: Sender, id: string) {
    const attempt = this.owned(context, id);
    if (Date.now() >= attempt.expiresAt) this.stop(attempt, "expired");
    return { attemptId: id, state: attempt.state, expiresAt: attempt.expiresAt };
  }

  cancel(context: Sender, id: string) {
    this.stop(this.owned(context, id), "cancelled");
    return this.status(context, id);
  }

  cancelSource(sourceId: string) {
    for (const attempt of this.attempts.values()) if (attempt.sourceId === sourceId) this.stop(attempt, "cancelled");
  }

  dispose() {
    this.closed = true;
    for (const attempt of this.attempts.values()) this.stop(attempt, "cancelled");
    this.attempts.clear();
  }
}
