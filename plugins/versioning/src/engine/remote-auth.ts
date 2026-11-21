import { HuhuError, errors } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CredentialAction, type CredentialOwner, type CredentialSummary } from "@huhu/kernel";
import { z } from "zod";
import { canSendAuthentication } from "../shared/git-auth.js";

const Definition = z.strictObject({ target: z.string().min(1) });
type Definition = z.infer<typeof Definition>;
export type GitCredentialHost = Pick<CredentialOwner<Definition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;

const credential = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("keep") }),
  z.strictObject({ action: z.literal("clear") }),
  z.strictObject({
    action: z.literal("replace"),
    username: z.string().regex(/^[A-Za-z0-9._+@-]{1,128}$/),
    token: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !s.includes("\r") && !s.includes("\n") && !s.includes("\0")),
    reconfigure: z.literal(true).optional(),
  }),
]);
export const ConfigureGitAuth = z.strictObject({ remote: z.string(), expectedRevision: z.uuidv4().nullable(), credential });
export type ConfigureGitAuth = z.infer<typeof ConfigureGitAuth>;
export const GitAuthSummary = z.object({ revision: z.uuidv4().nullable(), state: z.enum(["unconfigured", "configured", "needs-reconfiguration", "temporarily-unavailable", "corrupt"]) });
export type GitAuthSummary = z.infer<typeof GitAuthSummary>;
export type GitLogin = { username: string; token: string };

export type VersioningAuth = { source: "versioning"; target: string; revision: string | null };

export const isSyncAuthError = (code: string): boolean => code === "GIT_AUTH_FAILED";

export class SyncAuthFailure extends HuhuError {
  readonly reason: string;

  constructor(
    error: HuhuError,
    readonly scope: VersioningAuth,
  ) {
    const { retryable, details, recovery } = error;
    super(error.code, error.message, { retryable, ...(details && { details }), ...(recovery && { recovery }) });
    const reason = error.details?.reason;
    this.reason = typeof reason === "string" ? reason : "remote-rejected";
  }
}

const ID = "sync";
const PURPOSES = ["username", "token"] as const;

export function hasUrlCredentials(remote: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(remote) || /^https?:\/\/[^/]*@/i.test(remote);
}

export function isPlainSyncRemote(remote: string): boolean {
  try {
    if (hasUrlCredentials(remote)) return false;
    httpTarget(remote);
    return true;
  } catch {
    return false;
  }
}

/** External actions may address the supported network transports only. */
export function toolRemote(remote: string): string {
  if (!remote) return "";
  const http = httpTarget(remote);
  if (http && canSendAuthentication(http)) return http;
  if (/^(?:ssh:\/\/(?:[\w.-]+@)?[a-z0-9][\w.-]*(?::\d+)?\/|(?:[\w.-]+@)?[a-z0-9][\w.-]*:)[\w.~/+-]+$/i.test(remote) && !remote.startsWith("-")) return remote;
  throw errors.invalidInput("Git 工具仅接受 HTTPS 或 SSH 远端");
}

/** Use the same canonical URL for the binding and the Git invocation. */
export function httpTarget(remote: string): string | null {
  if (!/^https?:\/\//i.test(remote)) return null;
  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    throw errors.invalidInput("Git HTTP 远端地址无效");
  }
  if (url.username || url.password || url.search || url.hash || /[?#\\]/.test(remote)) throw errors.invalidInput("Git HTTP 远端不能包含凭据、查询或片段");
  const repository = url.pathname.replace(/\/+$/, "").replace(/%[0-9a-f]{2}/gi, (escape) => {
    const code = Number.parseInt(escape.slice(1), 16);
    const char = String.fromCharCode(code);
    return /^[A-Za-z0-9._~-]$/.test(char) ? char : escape.toUpperCase();
  });
  if (!repository || /%2f|%5c/i.test(repository) || !/^\/[A-Za-z0-9._~%/-]+$/.test(repository)) throw errors.invalidInput("Git HTTP 仓库路径无效");
  return `${url.origin}${repository}`;
}

export function authenticationFailed(reason: string): HuhuError {
  const message = reason === "needs-reconfiguration" ? "请在同步设置中重新配置此 Git 远端的认证" : "Git 远端认证不可用，请检查同步凭据";
  return new HuhuError("GIT_AUTH_FAILED", message, { details: { reason } });
}

function mapCredentialError(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  if (error.code === "conflict") throw new HuhuError("VERSION_CONFLICT", "Git 认证配置已更新");
  if (error.code === "invalid-input") throw errors.invalidInput("Git 认证配置无效");
  if (error.code === "storage-failed") throw new HuhuError("INTERNAL", "Git 认证配置保存失败");
  if (error.code === "cancelled") throw new HuhuError("INTERNAL", "Git 操作已取消", { retryable: false, details: { reason: "cancelled" } });
  throw authenticationFailed(error.code);
}

function summarize(entry: CredentialSummary & { definition: Definition }, target: string | null): GitAuthSummary {
  const states = PURPOSES.map((purpose) => entry.authState[purpose]);
  const revision = entry.revision;
  if (states.every((state) => state === "unconfigured")) return { revision, state: "unconfigured" };
  if (target !== entry.definition.target) return { revision, state: "needs-reconfiguration" };
  if (states.includes("corrupt")) return { revision, state: "corrupt" };
  if (states.includes("temporarily-unavailable")) return { revision, state: "temporarily-unavailable" };
  return { revision, state: states.every((state) => state === "configured") ? "configured" : "needs-reconfiguration" };
}

export class GitRemoteCredentials {
  private readonly owner?: ModuleCredentials<Definition>;

  constructor(host?: GitCredentialHost) {
    if (host) this.owner = new ModuleCredentials({ ...host, pluginId: "versioning", definition: Definition, targets: ({ target }) => ({ username: target, token: target }) });
  }

  private async entry() {
    return (await this.owner?.list().catch(mapCredentialError))?.find((entry) => entry.entityId === ID);
  }

  async status(target: string | null): Promise<GitAuthSummary> {
    const entry = await this.entry();
    return entry ? summarize(entry, target) : { revision: null, state: this.owner ? "unconfigured" : "temporarily-unavailable" };
  }

  async configure(target: string, { expectedRevision, credential }: ConfigureGitAuth, signal: AbortSignal, check?: () => void): Promise<GitAuthSummary> {
    if (!this.owner) throw authenticationFailed("local-protection-unavailable");
    const existing = await this.entry();
    if ((existing?.revision ?? null) !== expectedRevision) throw errors.versionConflict(existing?.revision ?? "");
    const actions: CredentialAction[] = PURPOSES.map((purpose) => {
      if (credential.action !== "replace") return { purpose, action: credential.action };
      return { purpose, action: "replace", value: credential[purpose], ...(credential.reconfigure ? { reconfigure: true as const } : {}) };
    });
    const definition = { target };
    const entry = await this.owner
      .save({
        entityId: ID,
        expectedRevision,
        definition,
        actions,
        signal,
        ...(check && {
          isCurrent: () => {
            check();
            return true;
          },
        }),
      })
      .catch(mapCredentialError);
    return summarize({ ...entry, definition }, target);
  }

  async use<T>(target: string, operation: (login: GitLogin) => Promise<T>): Promise<T> {
    if (!this.owner) throw authenticationFailed("local-protection-unavailable");
    const outcome = await this.owner
      .use(ID, PURPOSES, async (definition, values) => {
        try {
          if (definition.target !== target) throw authenticationFailed("needs-reconfiguration");
          return { ok: true as const, value: await operation({ username: values.get("username")!, token: values.get("token")! }) };
        } catch (error) {
          return { ok: false as const, error };
        }
      })
      .catch(mapCredentialError);
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
