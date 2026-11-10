import { z } from "zod";

/** 全部错误码；新增时同步 interfaces.md §3。 */
export const ERROR_CODES = [
  "INVALID_INPUT", "NOT_FOUND", "VERSION_CONFLICT", "NAME_CONFLICT", "PATH_OUTSIDE_VAULT", "READ_ONLY_VAULT",
  "PLUGIN_DISABLED", "CAPABILITY_NOT_FOUND", "CAPABILITY_NOT_EXPOSED", "PERMISSION_DENIED", "IDEMPOTENCY_MISMATCH",
  "ENGINE_CLOSING", "SAFE_LOCKED", "SAFE_BAD_PASSWORD", "SECRET_REF_INVALID", "PROVIDER_NOT_FOUND",
  "PROVIDER_UNAUTHENTICATED", "SPACE_INVALID", "HERDR_UNAVAILABLE", "RUN_UNKNOWN", "SSH_HOST_KEY_MISMATCH",
  "SSH_AUTH_FAILED", "SSH_TIMEOUT", "SSH_DISCONNECTED", "GIT_NOT_REPOSITORY", "GIT_AUTH_FAILED", "GIT_CONFLICT",
  "GIT_OFFLINE", "WRITE_PARTIAL", "INTERNAL",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const RETRYABLE = new Set<ErrorCode>(["ENGINE_CLOSING", "HERDR_UNAVAILABLE", "SSH_AUTH_FAILED", "SSH_TIMEOUT", "SSH_DISCONNECTED", "GIT_OFFLINE", "INTERNAL"]);

export const HuhuErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
  recovery: z.array(z.object({ action: z.string(), label: z.string() })).optional(),
});
export type HuhuErrorData = z.infer<typeof HuhuErrorSchema>;

/** 业务错误：Dispatcher 原样返回给调用者。 */
export class HuhuError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  readonly recovery: { action: string; label: string }[] | undefined;

  constructor(code: ErrorCode, message: string, opts: { details?: Record<string, unknown>; recovery?: { action: string; label: string }[]; retryable?: boolean } = {}) {
    super(message);
    this.name = "HuhuError";
    this.code = code;
    this.retryable = opts.retryable ?? RETRYABLE.has(code);
    this.details = opts.details;
    this.recovery = opts.recovery;
  }

  toJSON(): HuhuErrorData {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
      ...(this.recovery ? { recovery: this.recovery } : {}),
    };
  }
}

export function isHuhuError(e: unknown): e is HuhuError {
  return e instanceof HuhuError;
}

export const errors = {
  invalidInput: (message: string, issues?: unknown) => new HuhuError("INVALID_INPUT", message, issues === undefined ? {} : { details: { issues } }),
  notFound: (message: string) => new HuhuError("NOT_FOUND", message),
  versionConflict: (currentVersion: string) => new HuhuError("VERSION_CONFLICT", "文件已被修改", { details: { currentVersion } }),
  nameConflict: (path: string) => new HuhuError("NAME_CONFLICT", `目标已存在：${path}`, { details: { path } }),
  pathOutsideVault: (path: string) => new HuhuError("PATH_OUTSIDE_VAULT", `路径越界：${path}`, { details: { path } }),
  readOnlyVault: () => new HuhuError("READ_ONLY_VAULT", "Vault 以只读方式打开"),
  pluginDisabled: (plugin: string) => new HuhuError("PLUGIN_DISABLED", `插件 ${plugin} 未启用`, { details: { plugin }, recovery: [{ action: "open-plugin-center", label: "前往插件中心" }] }),
  capabilityNotFound: (name: string) => new HuhuError("CAPABILITY_NOT_FOUND", `能力不存在：${name}`),
  capabilityNotExposed: (name: string) => new HuhuError("CAPABILITY_NOT_EXPOSED", `能力未对外开放：${name}`),
  permissionDenied: (name: string) => new HuhuError("PERMISSION_DENIED", `没有权限调用：${name}`),
  idempotencyMismatch: () => new HuhuError("IDEMPOTENCY_MISMATCH", "同一幂等键对应了不同的输入"),
  engineClosing: () => new HuhuError("ENGINE_CLOSING", "Vault 正在关闭"),
  internal: (correlationId: string) => new HuhuError("INTERNAL", "发生未预期错误", { details: { correlationId } }),
};
