import { createHash } from "node:crypto";
import { parseFragment } from "parse5";
import { isMailBodyElement, mailTextBreaks, type MailHtmlNode } from "../mail-html-tree.js";
import { parseMessageBody } from "./message-body.js";

export const searchWords = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

function searchableHtml(html: string) {
  const text: string[] = [];
  let count = 0;
  function visit(node: MailHtmlNode, depth: number) {
    if (++count > 12_000 || depth > 64) return;
    if ("value" in node) text.push(node.value);
    else if (isMailBodyElement(node)) {
      for (const child of node.childNodes) visit(child, depth + 1);
      if (mailTextBreaks.has(node.tagName)) text.push(" ");
    }
  }
  for (const node of parseFragment(html).childNodes) visit(node, 0);
  return text.join("");
}

export function makeMailSearchText() {
  const cache = new Map<string, string>();
  const maxChars = 6 * 1024 * 1024;
  let chars = 0;
  return async (source: string): Promise<string> => {
    const key = createHash("sha256").update(source).digest("hex");
    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const body = await parseMessageBody(Buffer.from(source, "base64")).catch(() => null);
    const variants = [body?.text, body?.untrustedHtml ? searchableHtml(body.untrustedHtml) : null];
    const text = [...new Set(variants.flatMap((variant) => (variant ? [variant.replace(/\s+/g, " ").trim()] : [])))].filter(Boolean).join(" ");
    if (cache.has(key) || text.length > maxChars) return text;
    while (cache.size && (cache.size >= 512 || chars + text.length > maxChars)) {
      const oldest = cache.keys().next().value!;
      chars -= cache.get(oldest)!.length;
      cache.delete(oldest);
    }
    cache.set(key, text);
    chars += text.length;
    return text;
  };
}
