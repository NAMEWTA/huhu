import type { Root, Text, PhrasingContent, Parent } from "mdast";

/** remark 插件：把 `[[目标|别名]]` 转为 `wikilink:` 协议的链接节点（代码内的文本不是 text 节点，天然不解析）。 */
export function remarkWikiLinks() {
  return (tree: Root) => {
    const visit = (node: Parent) => {
      node.children = node.children.flatMap((child): typeof node.children => {
        if (child.type === "text") return splitText(child);
        if ("children" in child && child.type !== "link") visit(child as Parent);
        return [child];
      }) as typeof node.children;
    };
    visit(tree);
  };
}

function splitText(node: Text): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of node.value.matchAll(/\[\[([^[\]\n]+?)\]\]/g)) {
    const idx = m.index as number;
    if (idx > last) out.push({ type: "text", value: node.value.slice(last, idx) });
    const inner = m[1] ?? "";
    const [left = "", alias] = inner.split("|", 2) as [string, string | undefined];
    const [target = "", heading] = left.split("#", 2) as [string, string | undefined];
    out.push({ type: "link", url: `wikilink:${encodeURIComponent(target.trim())}${heading ? `#${encodeURIComponent(heading.trim())}` : ""}`, children: [{ type: "text", value: (alias ?? left).trim() }] });
    last = idx + m[0].length;
  }
  if (last === 0) return [node];
  if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
  return out;
}

export function parseWikiHref(href: string): { target: string; heading: string | null } | null {
  if (!href.startsWith("wikilink:")) return null;
  const [t = "", h] = href.slice("wikilink:".length).split("#", 2) as [string, string | undefined];
  return { target: decodeURIComponent(t), heading: h ? decodeURIComponent(h) : null };
}
