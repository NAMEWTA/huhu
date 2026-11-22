import { createElement, Fragment, type ReactNode } from "react";
import { parseFragment } from "parse5";
import { isMailBodyElement, mailTextBreaks, remoteImageUrl, type MailHtmlNode } from "../mail-html-tree.js";

const containers = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tfoot",
  "tr",
  "u",
  "ul",
]);
function externalLink(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function prepareMailHtml(html: string, link: (href: string, children: ReactNode) => ReactNode, images?: ReadonlyMap<string, string>) {
  // This parser builds a data tree without a browser document or any resource loading.
  const fragment = parseFragment(html);
  const text: string[] = [];
  let blockedImages = false;
  let canLoadImages = false;
  let count = 0;
  function render(node: MailHtmlNode, key: number, depth: number): ReactNode {
    if (++count > 12_000 || depth > 64) return null;
    if ("value" in node) {
      text.push(node.value);
      return node.value;
    }
    if (!isMailBodyElement(node)) return null;
    if (node.tagName === "img") {
      blockedImages ||= node.attrs.some(({ name }) => name === "src" || name === "srcset");
      const url = remoteImageUrl(node);
      canLoadImages ||= !!url;
      const alt = node.attrs.find(({ name }) => name === "alt")?.value;
      if (alt) text.push(alt);
      const image = url && images?.get(url);
      if (image) return <img key={key} src={image} alt={alt ?? ""} />;
      return alt ?? null;
    }
    const children = node.childNodes.map((child, index) => render(child, index, depth + 1));
    if (mailTextBreaks.has(node.tagName)) text.push("\n");
    if (node.tagName === "a") {
      const href = externalLink(node.attrs.find(({ name }) => name === "href")?.value);
      return createElement(Fragment, { key }, href ? link(href, children) : children);
    }
    if (node.tagName === "blockquote") {
      return (
        <details key={key}>
          <summary>展开引用</summary>
          <blockquote>{children}</blockquote>
        </details>
      );
    }
    if (node.tagName === "br" || node.tagName === "hr") return createElement(node.tagName, { key });
    // No attributes from the source reach the DOM. Unknown wrappers contribute text and safe children.
    return createElement(containers.has(node.tagName) ? node.tagName : Fragment, { key }, children);
  }
  const content = fragment.childNodes.map((node, index) => render(node, index, 0));
  return { content, text: text.join("").trim(), blockedImages, canLoadImages };
}
