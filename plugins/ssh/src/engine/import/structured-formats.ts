import { csvParseRows } from "d3-dsv";
import { badFile, fieldIssues, intValue, MAX_RECORDS, printable, record, sessionHost, sshProtocol, type ImportIssue, type ParsedHosts, type RawHost } from "./input.js";

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function json(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseRows(rows: unknown[], mapping: (row: Record<string, unknown>, index: number) => RawHost): ParsedHosts {
  if (rows.length > MAX_RECORDS) return badFile("input-limit");
  const records = rows.map((value, index): RawHost => {
    const row = objectOf(value);
    return row ? mapping(row, index + 1) : { location: record(index + 1), blocked: "malformed-record" };
  });
  return { records, issues: [] };
}

export function parseWindTerm(text: string): ParsedHosts {
  const data = json(text);
  if (!Array.isArray(data)) return badFile(data === undefined ? "malformed-record" : "unrecognized-format");
  const columns = new Set(["session.label", "session.group", "session.protocol", "session.target", "session.port", "session.user"]);
  return parseRows(data, (row, index) => {
    const location = record(index);
    return {
      location,
      name: row["session.label"],
      group: row["session.group"],
      ...sessionHost(row["session.target"], row["session.user"]),
      port: intValue(row["session.port"]),
      issues: fieldIssues(Object.entries(row), columns, location),
      ...(!sshProtocol(row["session.protocol"]) && { blocked: "unsupported-protocol" }),
    };
  });
}

function bookmarkFolders(input: unknown): { byBookmark: Map<string, string>; parent: Map<string, string>; titles: Map<string, string>; issues: ImportIssue[] } {
  const byBookmark = new Map<string, string>();
  const parent = new Map<string, string>();
  const titles = new Map<string, string>();
  const issues: ImportIssue[] = [];
  if (input === undefined) return { byBookmark, parent, titles, issues };
  if (!Array.isArray(input) || input.length > MAX_RECORDS) return { byBookmark, parent, titles, issues: [{ code: "invalid-group" }] };
  for (const raw of input) {
    const group = objectOf(raw);
    const id = group?.["id"];
    if (typeof id !== "string" || !id || titles.has(id)) {
      issues.push({ code: "invalid-group" });
      continue;
    }
    titles.set(id, id === "default" ? "" : printable(group?.["title"], 200).replace(/[\\/]/g, " "));
    for (const member of Array.isArray(group?.["bookmarkIds"]) ? group["bookmarkIds"] : []) {
      if (typeof member === "string" && (!byBookmark.has(member) || byBookmark.get(member) === "default")) byBookmark.set(member, id);
    }
    for (const child of Array.isArray(group?.["bookmarkGroupIds"]) ? group["bookmarkGroupIds"] : []) {
      if (typeof child === "string" && !parent.has(child)) parent.set(child, id);
    }
  }
  return { byBookmark, parent, titles, issues };
}

export function parseElecterm(text: string): ParsedHosts {
  const data = objectOf(json(text));
  const rows = data?.["bookmarks"];
  if (!Array.isArray(rows)) return badFile("unrecognized-format");
  const folders = bookmarkFolders(data?.["bookmarkGroups"]);
  const columns = new Set(["id", "title", "host", "username", "port", "type", "authtype"]);
  const result = parseRows(rows, (row, index) => {
    const location = record(index);
    const id = row["id"];
    const names: string[] = [];
    const visited = new Set<string>();
    const issues = fieldIssues(Object.entries(row), columns, location);
    let folder = typeof id === "string" ? folders.byBookmark.get(id) : undefined;
    while (folder !== undefined && folder !== "default") {
      const title = folders.titles.get(folder);
      if (!title || visited.has(folder) || visited.size === 32) {
        issues.push({ code: "invalid-group", location });
        break;
      }
      names.unshift(title);
      visited.add(folder);
      folder = folders.parent.get(folder);
    }
    return {
      location,
      name: row["title"],
      group: names.join("/"),
      ...sessionHost(row["host"], row["username"]),
      port: intValue(row["port"]),
      issues,
      ...(!sshProtocol(row["type"]) && { blocked: "unsupported-protocol" }),
    };
  });
  return { ...result, issues: [...result.issues, ...folders.issues] };
}

export function parseNetcatty(text: string): ParsedHosts {
  let beyondLimit = false;
  const parsed = csvParseRows(text, (row, index) => {
    if (index <= MAX_RECORDS) return row;
    beyondLimit = true;
    return null;
  });
  if (beyondLimit) return badFile("input-limit");
  const [header, ...rows] = parsed;
  const headers = header?.map((part) => part.trim().toLowerCase()) ?? [];
  const host = headers.findIndex((column) => ["hostname/ip", "hostname", "host"].includes(column));
  if (host < 0) return badFile("unrecognized-format");
  const at = (...names: string[]) => headers.findIndex((column) => names.includes(column));
  const columns = { host, name: at("label", "name"), port: at("port"), group: at("groups", "group"), user: at("username", "user"), protocol: at("protocol") };
  const mapped = new Set(Object.values(columns).flatMap((index) => headers[index] ?? []));
  return {
    issues: [],
    records: rows.map((row, i) => {
      const location = record(i + 2);
      if (row.length !== headers.length) return { location, blocked: "malformed-record" };
      return {
        location,
        name: row[columns.name],
        port: intValue(row[columns.port]),
        group: row[columns.group],
        ...sessionHost(row[columns.host], row[columns.user]),
        issues: fieldIssues(
          headers.map((column, i) => [column, row[i]]),
          mapped,
          location,
        ),
        ...(!sshProtocol(row[columns.protocol]) && { blocked: "unsupported-protocol" }),
      };
    }),
  };
}
