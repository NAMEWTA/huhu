import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

type KnownHostKeyFields = { scope: string; keyType: string; key: Buffer | undefined };
export type KnownHostRule = KnownHostKeyFields & { marker: "@cert-authority" | "@revoked" };

const maxKeyText = 64 * 1024;
const DnsHostname = z.hostname();

export function knownHostToken(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}

/** Encode an already selected SSH endpoint without interpreting a host pattern or a user-supplied port. */
export function literalKnownHostToken(host: string, port: number): string | undefined {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || host.includes("%") || (!isIP(host) && !DnsHostname.safeParse(host).success)) return;
  return knownHostToken(host.toLowerCase(), port);
}

function decode(text: string | undefined): Buffer | undefined {
  if (!text || text.length > maxKeyText || !/^[A-Za-z0-9+/]+={0,2}$/u.test(text)) return;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64").replace(/=+$/, "") === text.replace(/=+$/, "") ? bytes : undefined;
}

export function knownHostRule(line: string): KnownHostRule | undefined {
  const [marker, scope, keyType, keyText] = line.trim().split(/\s+/, 4);
  if ((marker !== "@cert-authority" && marker !== "@revoked") || !scope) return;
  return { marker, scope, keyType: keyType ?? "", key: decode(keyText) };
}

export function matchingKnownHostPin(line: string, token: string): KnownHostKeyFields | undefined {
  const [scope, keyType, keyText] = line.trim().split(/\s+/, 3);
  if (!scope || !keyType || !keyText || scope.startsWith("#") || scope.startsWith("@")) return;
  if (!matchesKnownHostScope(scope, token)) return;
  return { scope, keyType, key: decode(keyText) };
}

function wildcard(pattern: string, text: string): boolean {
  let part = 0;
  let offset = 0;
  let star = -1;
  let retry = 0;
  while (offset < text.length) {
    const current = pattern[part];
    if (current === "?") {
      part++;
      offset++;
    } else if (current === "*") {
      star = part++;
      retry = offset;
    } else if (current === text[offset]) {
      part++;
      offset++;
    } else if (star >= 0) {
      part = star + 1;
      offset = ++retry;
    } else {
      return false;
    }
  }
  while (pattern[part] === "*") part++;
  return part === pattern.length;
}

/** OpenSSH matches a host token (with port when non-default), never a socket peer. */
export function matchesKnownHostScope(scope: string, token: string): boolean {
  const host = token.toLowerCase();
  if (scope.startsWith("|")) {
    const [, version, saltText, hashText, extra] = scope.split("|", 5);
    if (version !== "1" || extra !== undefined) return false;
    const salt = decode(saltText);
    const hash = decode(hashText);
    if (salt?.length !== 20 || hash?.length !== 20) return false;
    return timingSafeEqual(createHmac("sha1", salt).update(host).digest(), hash);
  }

  let matched = false;
  for (const term of scope.toLowerCase().split(",")) {
    const excluded = term.startsWith("!");
    if (!wildcard(excluded ? term.slice(1) : term, host)) continue;
    if (excluded) return false;
    matched = true;
  }
  return matched;
}
