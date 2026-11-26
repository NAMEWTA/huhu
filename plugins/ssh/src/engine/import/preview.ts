import { SshHostProfile, type SshHostProfile as Profile } from "../auth-profile.js";
import { defaultVaultPreferences } from "../../shared/preferences.js";
import { MAX_BYTES, type HostImportFormat, type ImportLocation } from "../../shared/host-import.js";
import { badFile, decodeHostInput, MAX_RECORDS, optionalGroup, printable, type ImportIssue, type ParsedHosts, type RawHost } from "./input.js";
import { parseOpenSsh } from "./openssh.js";
import { parseElecterm, parseNetcatty, parseWindTerm } from "./structured-formats.js";
import { parseMobaXterm, parsePutty, parseSecureCRT, parseXshell } from "./text-formats.js";

export type HostImportSource = {
  format: HostImportFormat;
  filename: string;
  content: string | Uint8Array;
  encoding?: "gb18030";
};

type ExistingHost = Pick<Profile, "name" | "host" | "user" | "port"> & { id: string };
type Conflict = { kind: "existing"; hostId: string; field: "endpoint" | "name" } | { kind: "batch"; index: number; field: "endpoint" | "name" };
type HostImportRow = {
  index: number;
  location: ImportLocation;
  issues: ImportIssue[];
  state: "ready" | "conflict" | "skipped";
  profile?: Profile;
  group?: string[];
  conflicts?: Conflict[];
};

const parsers = {
  openssh: parseOpenSsh,
  putty: parsePutty,
  xshell: parseXshell,
  mobaxterm: parseMobaXterm,
  windterm: parseWindTerm,
  electerm: parseElecterm,
  netcatty: parseNetcatty,
  securecrt: parseSecureCRT,
} satisfies Record<HostImportFormat, (text: string, name: string) => ParsedHosts>;

function parse({ content, encoding, format }: HostImportSource, name: string): ParsedHosts {
  if ((typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength) > MAX_BYTES) return badFile("input-limit");
  if (format === "xshell" && typeof content !== "string" && content[0] === 0x50 && content[1] === 0x4b) return badFile("unsupported-variant");
  let text: string;
  try {
    text = decodeHostInput(content, encoding);
  } catch {
    return badFile("invalid-encoding");
  }
  const result = parsers[format](text, name);
  return result.records.length > MAX_RECORDS ? badFile("input-limit") : result;
}

const controlled = /^[^\p{Cc}\p{Cf}\s/\\]+$/u;
function toProfile(row: RawHost): Profile | ImportIssue["code"] {
  if (row.blocked) return row.blocked;
  if (typeof row.host !== "string" || !row.host.trim()) return "missing-host";
  if (typeof row.user !== "string" || !row.user.trim()) return "missing-user";
  const host = row.host.trim();
  const user = row.user.trim();
  if (host.length > 255 || !controlled.test(host) || /^[+-]/.test(host) || /[@%]/.test(host)) return "invalid-host";
  if (user.length > 128 || !controlled.test(user) || user.includes("@")) return "invalid-user";
  const ports = SshHostProfile.shape.port.safeParse(row.port);
  if (!ports.success) return "invalid-port";
  const result = SshHostProfile.safeParse({
    name: printable(row.name, 200) || host,
    host,
    user,
    port: ports.data,
    // Keep the same effective timeout in the preview and saved import across Vaults.
    connectTimeoutSec: row.timeout ?? defaultVaultPreferences.connection.connectTimeoutSec,
    ...(row.interval !== undefined && { keepaliveIntervalSec: row.interval }),
    ...(row.keepaliveCount !== undefined && { keepaliveCountMax: row.keepaliveCount }),
  });
  return result.success ? result.data : "invalid-setting";
}

export function hostEndpoint({ host, port, user }: Pick<Profile, "host" | "port" | "user">): string {
  return JSON.stringify([host.toLowerCase(), port, user]);
}

export const hostName = (name: string) => name.trim().toLowerCase();

type IdentityIndex = Map<string, Conflict[]>;
function addIdentity(index: IdentityIndex, key: string, conflict: Conflict): void {
  const row = index.get(key) ?? [];
  if (row.some(({ kind }) => kind === conflict.kind)) return;
  row.push(conflict);
  index.set(key, row);
}

export function previewHostImport(source: HostImportSource, existing: readonly ExistingHost[] = []) {
  const label = printable(source.filename.split(/[\\/]/).at(-1), 200) || source.format;
  const data = parse(source, label.replace(/\.[^./\\]+$/, "") || label);
  const endpoints: IdentityIndex = new Map();
  const labels: IdentityIndex = new Map();
  for (const host of existing) {
    addIdentity(endpoints, hostEndpoint(host), { kind: "existing", hostId: host.id, field: "endpoint" });
    addIdentity(labels, hostName(host.name), { kind: "existing", hostId: host.id, field: "name" });
  }
  const rows = data.records.map((row, index): HostImportRow => {
    const number = index + 1;
    const base = { index: number, location: row.location, issues: row.issues ?? [] };
    const profile = toProfile(row);
    if (typeof profile === "string") return { ...base, state: "skipped", issues: [...base.issues, { code: profile, location: row.location }] };
    const endpoint = hostEndpoint(profile);
    const name = hostName(profile.name);
    const conflicts = [...(endpoints.get(endpoint) ?? []), ...(labels.get(name) ?? [])];
    addIdentity(endpoints, endpoint, { kind: "batch", index: number, field: "endpoint" });
    addIdentity(labels, name, { kind: "batch", index: number, field: "name" });
    return { ...base, state: conflicts.length ? "conflict" : "ready", profile, group: optionalGroup(row.group), conflicts };
  });
  return { format: source.format, filename: label, rows, issues: data.issues };
}
