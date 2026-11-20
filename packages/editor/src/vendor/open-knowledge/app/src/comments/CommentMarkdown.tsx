import type { Root, RootContent } from 'hast';
import { toHast } from 'mdast-util-to-hast';
import { createContext, Fragment, type MouseEvent, type ReactNode, useContext, useMemo } from 'react';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { isSafeNavigationUrl } from '@/editor/safe-navigation-url';
import { openExternalUrl } from '@/lib/external-link';

const parser = unified().use(remarkParse).freeze();

export const CommentExternalLinkContext = createContext<((url: string) => Promise<void>) | undefined>(undefined);

function renderNodes(nodes: readonly RootContent[], openLink: (url: string) => void): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node, openLink)}</Fragment>);
}

function renderNode(node: RootContent, openLink: (url: string) => void): ReactNode {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return null;
  const children = renderNodes(node.children, openLink);

  // Only emit inert Markdown elements. Never forward tree properties to the DOM.
  switch (node.tagName) {
    case 'p':
    case 'em':
    case 'strong':
    case 'li':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const Tag = node.tagName;
      return <Tag>{children}</Tag>;
    }
    case 'br':
      return <br />;
    case 'hr':
      return <hr />;
    case 'code':
      return <code className="font-mono">{children}</code>;
    case 'pre':
      return <pre className="overflow-x-auto rounded bg-muted p-2">{children}</pre>;
    case 'blockquote':
      return <blockquote className="border-l-2 pl-2 text-muted-foreground">{children}</blockquote>;
    case 'ol': {
      const start = typeof node.properties.start === 'number' ? node.properties.start : undefined;
      return <ol start={start} className="list-decimal pl-5">{children}</ol>;
    }
    case 'ul':
      return <ul className="list-disc pl-5">{children}</ul>;
    case 'img':
      return typeof node.properties.alt === 'string' ? node.properties.alt : null;
    case 'a': {
      const { href, title } = node.properties;
      if (typeof href !== 'string' || !isSafeNavigationUrl(href)) return children;
      const activate = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.type === 'auxclick' && event.button !== 1) return;
        event.preventDefault();
        openLink(href);
      };
      return (
        <a
          className="text-primary underline"
          href={href}
          title={typeof title === 'string' ? title : undefined}
          onClick={activate}
          onAuxClick={activate}
        >
          {children}
        </a>
      );
    }
    default:
      return null;
  }
}

export function CommentMarkdown({ text }: { text: string }) {
  const openExternal = useContext(CommentExternalLinkContext);
  const content = useMemo(() => {
    const deps = openExternal ? { okDesktop: { shell: { openExternal } } } : undefined;
    // remark-parse produces a root, which toHast converts to an HTML tree root.
    const tree = toHast(parser.parse(text), { allowDangerousHtml: false }) as Root;
    return renderNodes(tree.children, (url) => openExternalUrl(url, deps));
  }, [text, openExternal]);
  return <div className="space-y-2 [overflow-wrap:anywhere]">{content}</div>;
}
