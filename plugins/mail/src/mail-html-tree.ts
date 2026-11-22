import type { DefaultTreeAdapterTypes } from "parse5";

const excluded = new Set(["applet", "audio", "canvas", "embed", "form", "iframe", "math", "noscript", "object", "script", "style", "svg", "template", "video"]);
export const mailTextBreaks = new Set(["blockquote", "br", "div", "dd", "dt", "li", "p", "pre", "tr"]);
export type MailHtmlNode = DefaultTreeAdapterTypes.ChildNode;

export function isMailBodyElement(node: MailHtmlNode): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node && node.namespaceURI === "http://www.w3.org/1999/xhtml" && !excluded.has(node.tagName);
}

export function remoteImageUrl(node: DefaultTreeAdapterTypes.Element): string | undefined {
  if (node.tagName !== "img") return;
  const src = node.attrs.find(({ name }) => name === "src")?.value;
  if (!src || src.length > 4096) return;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}
