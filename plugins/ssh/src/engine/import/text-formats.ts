import { badFile, fieldIssues, intValue, line, MAX_RECORDS, sessionHost, sshProtocol, type ImportIssue, type ParsedHosts, type RawHost } from "./input.js";

type Section = { name: string; at: number; fields: Map<string, { key: string; value: string; at: number }> };

function ini(text: string): Section[] {
  const sections: Section[] = [{ name: "", at: 1, fields: new Map() }];
  let current = sections[0]!;
  for (const [offset, source] of text.split("\n").entries()) {
    const at = offset + 1;
    const row = source.trim();
    if (!row || row.startsWith(";") || row.startsWith("#")) continue;
    const heading = /^\[([^\]]+)\]$/.exec(row);
    if (heading) {
      current = { name: heading[1]!, at, fields: new Map() };
      sections.push(current);
      continue;
    }
    const equal = row.indexOf("=");
    if (equal < 1) continue;
    const key = row.slice(0, equal).trim();
    current.fields.set(key.toLowerCase(), { key, value: row.slice(equal + 1).trim(), at });
  }
  return sections;
}

function values(section: Section | undefined): Map<string, string> {
  return new Map(Array.from(section?.fields ?? [], ([key, { value }]) => [key, value]));
}

function single(row: RawHost): ParsedHosts {
  return { records: [row], issues: [] };
}

function puttySession(settings: Map<string, string>, name: string, at: number): RawHost {
  const location = line(at);
  return {
    name,
    location,
    ...sessionHost(settings.get("hostname"), settings.get("username")),
    port: intValue(settings.get("portnumber")),
    issues: fieldIssues(settings, new Set(["hostname", "username", "portnumber", "protocol"]), location),
    ...(!sshProtocol(settings.get("protocol")) && { blocked: "unsupported-protocol" }),
  };
}

function registryText(value: string): string {
  return value.replace(/\\([\\"])/g, "$1");
}

export function parsePutty(text: string, name: string): ParsedHosts {
  if (!/^(?:Windows Registry Editor Version|REGEDIT4)\b/i.test(text)) {
    const settings = values(ini(text)[0]);
    if (!settings.has("hostname") && !settings.has("protocol")) return badFile("unrecognized-format");
    return single(puttySession(settings, name, 1));
  }
  const records: RawHost[] = [];
  let current: { settings: Map<string, string>; name: string; at: number } | undefined;
  const flush = () => {
    if (current) records.push(puttySession(current.settings, current.name, current.at));
    current = undefined;
  };
  for (const [offset, source] of text.split("\n").entries()) {
    const row = source.trim();
    if (row.startsWith("[")) {
      flush();
      if (records.length > MAX_RECORDS) break;
      const match = /^\[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\([^\\\]]+)\]$/i.exec(row);
      if (!match) continue;
      let label = match[1]!;
      try {
        label = decodeURIComponent(label);
      } catch {
        // Retain the exported label when it contains literal percent signs.
      }
      current = { settings: new Map(), at: offset + 1, name: label };
      continue;
    }
    const field = /^"([^"]+)"\s*=\s*(?:"((?:\\.|[^"\\])*)"|dword:([0-9a-f]{8}))$/i.exec(row);
    if (field && current) current.settings.set(field[1]!.toLowerCase(), field[2] === undefined ? String(Number.parseInt(field[3]!, 16)) : registryText(field[2]));
  }
  flush();
  return records.length ? { records, issues: [] } : badFile("unrecognized-format");
}

export function parseXshell(text: string, name: string): ParsedHosts {
  const sections = ini(text);
  const settings = values(sections.find((section) => section.name.toLowerCase() === "connection"));
  const auth = values(sections.find((section) => section.name.toLowerCase() === "connection:authentication"));
  if (!settings.has("host") && !settings.has("protocol")) return badFile("unrecognized-format");
  const location = line(1);
  return single({
    name,
    location,
    ...sessionHost(settings.get("host"), auth.get("username")),
    port: intValue(settings.get("port")),
    issues: [...fieldIssues(settings, new Set(["host", "port", "protocol"]), location), ...fieldIssues(auth, new Set(["username"]), location)],
    ...(!sshProtocol(settings.get("protocol")) && { blocked: "unsupported-protocol" }),
  });
}

export function parseMobaXterm(text: string): ParsedHosts {
  const sections = ini(text).filter((section) => /^Bookmarks(?:[_-]?\d+)?$/i.test(section.name));
  if (!sections.length) return badFile("unrecognized-format");
  const records: RawHost[] = [];
  for (const { fields } of sections) {
    for (const [key, { key: name, value, at }] of fields) {
      if (key === "subrep" || key === "imgnum") continue;
      const location = line(at);
      const match = /^#[^#]*#(.*)$/.exec(value);
      const parts = match?.[1]?.split("%");
      if (!parts || parts.length < 4) records.push({ name, location, blocked: "malformed-record" });
      else {
        const [protocol, host, port, user] = parts;
        records.push({ location, name, group: fields.get("subrep")?.value, host, user, port: intValue(port), ...(protocol !== "0" && { blocked: "unsupported-protocol" }) });
      }
      if (records.length > MAX_RECORDS) return { records, issues: [] };
    }
  }
  return { records, issues: [] };
}

export function parseSecureCRT(text: string, name: string): ParsedHosts {
  const settings = new Map<string, string>();
  const numeric = new Set<string>();
  for (const source of text.split("\n")) {
    const match = /^([SDB]):"([^"]+)"=(.*)$/.exec(source.trim());
    if (!match) continue;
    const key = match[2]!.toLowerCase();
    let value = match[3]!.trim();
    if (value.startsWith('"') && value.endsWith('"')) value = registryText(value.slice(1, -1));
    settings.set(key, value);
    if (match[1] === "D") numeric.add(key);
  }
  if (!settings.has("hostname") && !settings.has("protocol name")) return badFile("unrecognized-format");
  const location = line(1);
  const portKey = ["[ssh2] port", "port"].find((key) => settings.has(key));
  const port = portKey && settings.get(portKey);
  const mapped = new Set(["hostname", "username", "session name", "protocol name", "port", "[ssh2] port"]);
  const issues = fieldIssues(settings, mapped, location).map((issue): ImportIssue => (issue.field?.includes("password") ? { ...issue, code: "encrypted-credential" } : issue));
  return single({
    location,
    name: settings.get("session name") || name,
    ...sessionHost(settings.get("hostname"), settings.get("username")),
    port: portKey && port && numeric.has(portKey) && /^[0-9a-f]{8}$/i.test(port) ? Number.parseInt(port, 16) : intValue(port),
    issues,
    ...(!sshProtocol(settings.get("protocol name")) && { blocked: "unsupported-protocol" }),
  });
}
