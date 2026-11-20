import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { z } from "zod";
import { mailPreset, type MailEndpoint } from "./presets.js";

export const oauthProvider = z.enum(["gmail", "outlook"]);
export type OAuthProvider = z.infer<typeof oauthProvider>;
export type OAuthIssue =
  | "not-configured"
  | "browser-unavailable"
  | "cancelled"
  | "expired"
  | "denied"
  | "exchange-failed"
  | "identity-invalid"
  | "address-mismatch"
  | "permission-missing"
  | "graph-metadata-only"
  | "wrong-resource"
  | "protocol-unavailable"
  | "reauthorize"
  | "account-changed";

export class MailOAuthError extends Error {
  constructor(readonly reason: OAuthIssue) {
    super(reason);
  }
}

type Client = { clientId: string; clientSecret?: string };
export type MailOAuthClients = { google?: Client; microsoft?: { clientId: string } };
export type MailOAuthIssuer = Client & {
  authorize: string;
  token: string;
  jwks: string;
  issuer: string;
  callbackHost: "127.0.0.1" | "localhost";
  scopes: readonly string[];
  /** Trusted, in-process protocol endpoints for an isolated issuer fixture. */
  protocol?: { imap: MailEndpoint; smtp: MailEndpoint };
};
export type MailOAuthRuntime = {
  issuers: Partial<Record<OAuthProvider, MailOAuthIssuer>>;
  openBrowser: (url: string) => Promise<void>;
  hostLabel: string;
  now?: () => number;
  ttlMs?: number;
};

const googleMail = "https://mail.google.com/";
const exchange = "https://outlook.office.com/";
const personalMicrosoftTenant = "9188040d-6c67-4c5b-b112-36a304b66dad";
export function oauthMailEndpoints(provider: OAuthProvider, email: string, personal: boolean) {
  const { imap, smtp } = mailPreset(provider, email);
  return { imap, smtp: provider === "outlook" && personal ? { ...smtp, host: "smtp-mail.outlook.com" } : smtp };
}
export function createMailOAuth(clients: MailOAuthClients, host: Pick<MailOAuthRuntime, "openBrowser" | "hostLabel">): MailOAuthRuntime {
  const issuers: MailOAuthRuntime["issuers"] = {};
  if (clients.google?.clientId.trim())
    issuers.gmail = {
      ...clients.google,
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      jwks: "https://www.googleapis.com/oauth2/v3/certs",
      issuer: "https://accounts.google.com",
      callbackHost: "127.0.0.1",
      scopes: ["openid", "email", googleMail],
    };
  if (clients.microsoft?.clientId.trim())
    issuers.outlook = {
      clientId: clients.microsoft.clientId,
      authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      jwks: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
      callbackHost: "localhost",
      scopes: ["openid", "email", "profile", "offline_access", `${exchange}IMAP.AccessAsUser.All`, `${exchange}SMTP.Send`],
    };
  return { ...host, issuers };
}

const secret = z
  .string()
  .min(1)
  .max(65_536)
  .regex(/^[\x21-\x7e]+$/);
const tokenReply = z.object({
  access_token: secret,
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  refresh_token: secret.optional(),
  expires_in: z.int().min(1).max(86400),
  scope: z.string().max(8192).optional(),
  id_token: secret.optional(),
});
export const sealedOAuthToken = z.strictObject({ access: secret, refresh: secret, until: z.int().positive(), scopes: z.string().max(8192), smtp: z.boolean() });
export type SealedOAuthToken = z.infer<typeof sealedOAuthToken>;

/** Scope receipt from the provider's token endpoint. Exchange tokens may be opaque. */
export function mailPermission(provider: OAuthProvider, receipt: string): { imap: boolean; smtp: boolean; problem?: OAuthIssue } {
  const scopes = new Set(receipt.toLowerCase().split(/\s+/));
  if (provider === "gmail") return scopes.has(googleMail) ? { imap: true, smtp: true } : { imap: false, smtp: false, problem: "permission-missing" };
  const graph = [...scopes].filter((scope) => scope.startsWith("https://graph.microsoft.com/") || /^mail\.(read|send)/.test(scope));
  if (graph.length) {
    const basic = graph.some((scope) => scope.endsWith("mail.readbasic")) && !graph.some((scope) => /mail\.(read|readwrite)$/.test(scope));
    return { imap: false, smtp: false, problem: basic ? "graph-metadata-only" : "wrong-resource" };
  }
  const imap = scopes.has(`${exchange}imap.accessasuser.all`) || scopes.has("imap.accessasuser.all");
  const smtp = scopes.has(`${exchange}smtp.send`) || scopes.has("smtp.send");
  return { imap, smtp, ...(!imap && { problem: "permission-missing" as const }) };
}

async function responseJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new MailOAuthError("exchange-failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      size += value.byteLength;
      if (size > 256 * 1024) throw new MailOAuthError("exchange-failed");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function requestOAuthToken(issuer: MailOAuthIssuer, provider: OAuthProvider, grant: Record<string, string>, signal: AbortSignal, now: number, previous?: SealedOAuthToken) {
  const body = new URLSearchParams({ client_id: issuer.clientId, ...grant });
  if (issuer.clientSecret) body.set("client_secret", issuer.clientSecret);
  if (previous && provider === "outlook") body.set("scope", issuer.scopes.filter((scope) => scope.startsWith(exchange) && (previous.smtp || !scope.endsWith("/SMTP.Send"))).join(" "));
  const response = await fetch(issuer.token, { method: "POST", body, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }).catch(() => {
    throw new MailOAuthError("exchange-failed");
  });
  const json = await responseJson(response).catch(() => {
    throw new MailOAuthError("exchange-failed");
  });
  if (!response.ok) throw new MailOAuthError(previous && z.object({ error: z.literal("invalid_grant") }).safeParse(json).success ? "reauthorize" : "exchange-failed");
  const parsed = tokenReply.safeParse(json);
  if (!parsed.success) throw new MailOAuthError("exchange-failed");
  const { access_token, refresh_token, expires_in, scope, id_token } = parsed.data;
  if (provider === "outlook" && !scope && !previous) throw new MailOAuthError("permission-missing");
  const scopes = scope ?? previous?.scopes ?? issuer.scopes.join(" ");
  const permission = mailPermission(provider, scopes);
  if (!permission.imap) throw new MailOAuthError(permission.problem ?? "permission-missing");
  const refresh = refresh_token ?? previous?.refresh;
  if (!refresh) throw new MailOAuthError("reauthorize");
  return { bundle: { access: access_token, refresh, until: now + expires_in * 1000, scopes, smtp: permission.smtp }, idToken: id_token };
}

const headerSchema = z.object({ alg: z.literal("RS256"), kid: z.string().min(1).max(512) });
const claimsSchema = z.object({
  iss: z.string(),
  sub: z.string().min(1).max(255),
  aud: z.string(),
  azp: z.string().optional(),
  nonce: z.string(),
  exp: z.number(),
  iat: z.number(),
  nbf: z.number().optional(),
  tid: z.uuid().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  preferred_username: z.string().optional(),
});
const keysSchema = z.object({ keys: z.array(z.looseObject({ kid: z.string(), kty: z.literal("RSA"), n: z.string(), e: z.string(), use: z.string().optional(), issuer: z.string().optional() })).max(100) });

export async function verifyOAuthIdentity(issuer: MailOAuthIssuer, provider: OAuthProvider, token: string | undefined, nonce: string, email: string, signal: AbortSignal, now: number) {
  let claims: z.infer<typeof claimsSchema>;
  try {
    const parts = token?.split(".");
    if (!parts || parts.length !== 3 || parts.some((part) => !/^[\w-]+$/.test(part))) throw new Error();
    const [header, payload, signature] = parts as [string, string, string];
    const decode = (value: string): unknown => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const { kid } = headerSchema.parse(decode(header));
    claims = claimsSchema.parse(decode(payload));
    const expectedIssuer = issuer.issuer.replace("{tenantid}", claims.tid ?? "");
    const issuerMatches = claims.iss === expectedIssuer || (provider === "gmail" && expectedIssuer === "https://accounts.google.com" && claims.iss === "accounts.google.com");
    const seconds = now / 1000;
    if (
      (issuer.issuer.includes("{tenantid}") && !claims.tid) ||
      !issuerMatches ||
      claims.aud !== issuer.clientId ||
      (claims.azp && claims.azp !== issuer.clientId) ||
      claims.nonce !== nonce ||
      claims.exp <= seconds ||
      claims.iat > seconds + 60 ||
      (claims.nbf ?? 0) > seconds + 60
    )
      throw new Error();
    const response = await fetch(issuer.jwks, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error();
    const matching = keysSchema.parse(await responseJson(response)).keys.filter((key) => key.kid === kid && (!key.use || key.use === "sig") && (!key.issuer || key.issuer.replace("{tenantid}", claims.tid ?? "") === expectedIssuer));
    if (!matching.some(({ kty, n, e }) => verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPublicKey({ key: { kty, n, e } satisfies JsonWebKey, format: "jwk" }), Buffer.from(signature, "base64url")))) throw new Error();
  } catch {
    throw new MailOAuthError("identity-invalid");
  }
  const actual = provider === "gmail" ? (claims.email_verified ? claims.email : undefined) : (claims.email ?? claims.preferred_username);
  if (!actual || actual.trim().toLowerCase() !== email.toLowerCase()) throw new MailOAuthError("address-mismatch");
  return { subject: `${issuer.issuer.replace("{tenantid}", claims.tid ?? "")}/${claims.sub}`, personal: provider === "outlook" && claims.tid?.toLowerCase() === personalMicrosoftTenant };
}
