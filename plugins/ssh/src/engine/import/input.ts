import type { ImportLocation } from "../../shared/host-import.js";

export const importIssueCodes = [
  "unrecognized-format",
  "unsupported-variant",
  "invalid-encoding",
  "input-limit",
  "malformed-record",
  "unsupported-protocol",
  "missing-host",
  "missing-user",
  "invalid-host",
  "invalid-user",
  "invalid-port",
  "invalid-setting",
  "command-ignored",
  "credential-reconfigure",
  "encrypted-credential",
  "unsupported-field",
  "unresolved-route",
  "unresolved-directive",
  "invalid-group",
] as const;
export type ImportIssue = { code: (typeof importIssueCodes)[number]; field?: string; location?: ImportLocation };
export type RawHost = {
  location: ImportLocation;
  name?: unknown;
  host?: unknown;
  user?: unknown;
  port?: unknown;
  group?: unknown;
  timeout?: unknown;
  interval?: unknown;
  keepaliveCount?: unknown;
  issues?: ImportIssue[];
  blocked?: ImportIssue["code"];
};
export type ParsedHosts = { records: RawHost[]; issues: ImportIssue[] };
export const MAX_RECORDS = 5_000;
export const line = (index: number): ImportLocation => ({ kind: "line", index });
export const record = (index: number): ImportLocation => ({ kind: "record", index });
export const badFile = (code: ImportIssue["code"]): ParsedHosts => ({ records: [], issues: [{ code }] });

export function decodeHostInput(content: string | Uint8Array, encoding?: "gb18030"): string {
  if (typeof content === "string") return content.replace(/^\uFEFF/, "");
  if (content[0] === 0xff && content[1] === 0xfe) return new TextDecoder("utf-16le", { fatal: true }).decode(content);
  if (content[0] === 0xfe && content[1] === 0xff) return new TextDecoder("utf-16be", { fatal: true }).decode(content);
  if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) return new TextDecoder("utf-8", { fatal: true }).decode(content);
  return new TextDecoder(encoding ?? "utf-8", { fatal: true }).decode(content);
}

export function fieldIssues(fields: Iterable<[string, unknown]>, mapped: Set<string>, path: ImportLocation): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (const [field, value] of fields) {
    if (mapped.has(field.toLowerCase()) || value === "" || value === null || value === undefined) continue;
    const key = field.toLowerCase();
    let code: ImportIssue["code"] = "unsupported-field";
    if (/command|script|localshell|logon action/.test(key)) code = "command-ignored";
    else if (/password|passphrase|autologin|privatekey|userkey|keypath|publickeyfile|identity.?file/.test(key)) code = "credential-reconfigure";
    issues.push({ code, field, location: path });
  }
  return issues;
}

export function optionalGroup(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[\\/]/)
    .map((segment) => printable(segment, 200))
    .filter(Boolean)
    .slice(0, 32);
}

export function printable(value: unknown, limit: number): string {
  return typeof value === "string"
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, "")
        .trim()
        .slice(0, limit)
    : "";
}

export function intValue(value: unknown): unknown {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && /^[0-9]+$/.test(value.trim()) ? Number(value) : value;
}

export function sshProtocol(value: unknown, ssh1 = false): boolean {
  return value === undefined || (typeof value === "string" && (ssh1 ? /^(?:ssh(?:-?[12])?)?$/i : /^(?:ssh(?:-?2)?)?$/i).test(value.trim()));
}

export function sessionHost(host: unknown, user: unknown): { host: unknown; user: unknown } {
  if (typeof host !== "string") return { host, user };
  const at = host.lastIndexOf("@");
  return at > 0 && (user === undefined || user === "") ? { host: host.slice(at + 1), user: host.slice(0, at) } : { host, user };
}
