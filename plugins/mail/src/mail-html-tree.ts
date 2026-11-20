import type { DefaultTreeAdapterTypes } from "parse5";

const excluded = new Set(["applet", "audio", "canvas", "embed", "form", "iframe", "math", "noscript", "object", "script", "style", "svg", "template", "video"]);
export const mailTextBreaks = new Set(["blockquote", "br", "div", "dd", "dt", "li", "p", "pre", "tr"]);
export type MailHtmlNode = DefaultTreeAdapterTypes.ChildNode;

export function isMailBodyElement(node: MailHtmlNode): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node && node.namespaceURI === "http://www.w3.org/1999/xhtml" && !excluded.has(node.tagName);
}
