import "katex/dist/katex.min.css";
import { Children, isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { MermaidBlock } from "./MermaidBlock.js";
import { parseWikiHref, remarkWikiLinks } from "./wikilink.js";

export interface MarkdownPreviewProps {
  /** 带 frontmatter 的完整源码；frontmatter 不渲染。 */
  source: string;
  onOpenWikiLink?(target: string, heading: string | null): void;
  /** 目标是否存在，用于区分已解析/未解析链接。 */
  resolveWikiLink?(target: string): boolean;
}

export function stripFrontmatter(source: string): string {
  return source.replace(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
}

// 允许 wikilink: 协议，其余沿用 GitHub 风格白名单；图片只允许相对路径与 data:（Vault 资源路由）
const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.["href"] ?? []), "wikilink"] },
  // remark-math 产生的 `language-math math-inline|math-display` 类名要保留，KaTeX 才认得出（KaTeX 在消毒之后运行：它的输出是自己生成的）
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.["code"] ?? []), ["className", "language-math", "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.["div"] ?? []), ["className", "math", "math-display"]],
    span: [...(defaultSchema.attributes?.["span"] ?? []), ["className", "math", "math-inline"]],
  },
};

const textOf = (n: ReactNode): string => (typeof n === "string" ? n : Array.isArray(n) ? n.map(textOf).join("") : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : "");

/** 安全 Markdown 渲染：GFM、双链、消毒；不执行原始 HTML 脚本。 */
export function MarkdownPreview({ source, onOpenWikiLink, resolveWikiLink }: MarkdownPreviewProps) {
  const body = useMemo(() => stripFrontmatter(source), [source]);
  const components: Components = {
    // ```mermaid 代码块渲染成图（其余代码块保持原样）
    pre({ children }) {
      const only = Children.toArray(children)[0];
      if (isValidElement(only)) {
        const cls = String((only.props as { className?: string }).className ?? "");
        if (/\blanguage-mermaid\b/.test(cls)) return <MermaidBlock source={textOf((only.props as { children?: ReactNode }).children).replace(/\n$/, "")} />;
      }
      return <pre>{children}</pre>;
    },
    a({ href, children }: { href?: string | undefined; children?: ReactNode }) {
      const wiki = href ? parseWikiHref(href) : null;
      if (wiki) {
        const exists = resolveWikiLink ? resolveWikiLink(wiki.target) : true;
        return (
          <a
            href="#"
            className={exists ? "hu-wikilink" : "hu-wikilink hu-wikilink-missing"}
            data-target={wiki.target}
            onClick={(e) => {
              e.preventDefault();
              if (exists) onOpenWikiLink?.(wiki.target, wiki.heading);
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {children}
        </a>
      );
    },
  };
  return (
    <div className="hu-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkWikiLinks]} rehypePlugins={[[rehypeSanitize, schema], rehypeKatex]} components={components} urlTransform={(url) => url}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
