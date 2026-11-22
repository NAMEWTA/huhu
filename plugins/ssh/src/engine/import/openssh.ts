import { badFile, fieldIssues, intValue, line, MAX_RECORDS, type ImportIssue, type ParsedHosts, type RawHost } from "./input.js";

type HostBlock = { patterns: string[]; settings: Map<string, string> };
const directives = new Set(["hostname", "user", "port", "connecttimeout", "serveraliveinterval", "serveralivecountmax", "proxycommand", "proxyjump"]);

export function argumentsOf(text: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: string | undefined;
  let active = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "\\" && i + 1 < text.length) {
      token += text[++i];
      active = true;
    } else if (quote) {
      if (quote === char) quote = undefined;
      else token += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      active = true;
    } else if (char === "#") {
      break;
    } else if (/\s/.test(char)) {
      if (active) tokens.push(token);
      token = "";
      active = false;
    } else {
      token += char;
      active = true;
    }
  }
  if (quote) return [];
  if (active) tokens.push(token);
  return tokens;
}

function matches(alias: string, pattern: string): boolean {
  let i = 0;
  let p = 0;
  let star = -1;
  let next = 0;
  while (i < alias.length) {
    const char = pattern[p];
    if (char === "?" || char === alias[i]) {
      p++;
      i++;
    } else if (char === "*") {
      star = p++;
      next = i;
    } else if (star !== -1) {
      p = star + 1;
      i = ++next;
    } else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}

export function matchesBlock(alias: string, patterns: string[]): boolean {
  let included = false;
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      if (matches(alias, pattern.slice(1))) return false;
    } else if (matches(alias, pattern)) included = true;
  }
  return included;
}

export function parseOpenSsh(text: string): ParsedHosts {
  const globals = new Map<string, string>();
  const blocks: HostBlock[] = [];
  const aliases = new Map<string, { label: string; at: number }>();
  const issues: ImportIssue[] = [];
  let settings: Map<string, string> | undefined = globals;
  let patternCount = 0;
  for (const [offset, source] of text.split("\n").entries()) {
    const at = offset + 1;
    const parsed = /^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:=\s*|\s+)(.*)$/.exec(source);
    if (!parsed) continue;
    const key = parsed[1]!.toLowerCase();
    const args = argumentsOf(parsed[2]!);
    if (!args.length) {
      issues.push({ code: "malformed-record", field: key, location: line(at) });
      continue;
    }
    if (key === "host") {
      if (args.some((pattern) => pattern.length > 255)) return badFile("input-limit");
      settings = new Map();
      blocks.push({ patterns: args.map((pattern) => pattern.toLowerCase()), settings });
      patternCount += args.length;
      if (patternCount > MAX_RECORDS) return badFile("input-limit");
      for (const label of args) {
        if (label && !/[!*?]/.test(label) && !aliases.has(label.toLowerCase())) aliases.set(label.toLowerCase(), { label, at });
      }
    } else if (key === "match" || key === "include") {
      issues.push({ code: "unresolved-directive", field: key, location: line(at) });
      if (key === "match") settings = undefined;
    } else if (settings && !settings.has(key)) {
      settings.set(key, args.join(" "));
    }
  }
  if (!blocks.length) return issues.length ? { records: [], issues } : badFile("unrecognized-format");
  const records: RawHost[] = [];
  for (const [alias, { label, at }] of aliases) {
    const resolved = new Map(globals);
    for (const block of blocks) {
      if (!matchesBlock(alias, block.patterns)) continue;
      for (const [key, value] of block.settings) {
        if (!resolved.has(key)) resolved.set(key, value);
      }
    }
    const location = line(at);
    const hostname = resolved.get("hostname")?.replaceAll("%h", label) ?? label;
    const unsupportedRoute = ["proxycommand", "proxyjump"].some((key) => resolved.has(key) && resolved.get(key)?.toLowerCase() !== "none");
    records.push({
      name: label,
      location,
      host: hostname,
      user: resolved.get("user"),
      port: intValue(resolved.get("port")),
      timeout: intValue(resolved.get("connecttimeout")),
      interval: intValue(resolved.get("serveraliveinterval")),
      keepaliveCount: intValue(resolved.get("serveralivecountmax")),
      issues: fieldIssues(resolved, directives, location),
      ...(unsupportedRoute && { blocked: "unresolved-route" }),
      ...(!unsupportedRoute && hostname.includes("%") && { blocked: "unresolved-directive" }),
    });
  }
  return { records, issues };
}
