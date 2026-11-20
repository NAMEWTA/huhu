// hostFetch 的 core 路由（S2a）：编辑器自身需要的页面 / 文档清单 / 身份 / 配置。
// 数据由宿主（plugins/notes，S1/S2b 起）通过 CoreRouteDeps 注入；本包不依赖业务模块。
import { visit } from "unist-util-visit";
import { getSharedMarkdownManager } from "@/editor/utils/md-singleton";
import { stripFrontmatter } from "../../vendor/open-knowledge/core/src/extensions/frontmatter";
import { createCodeFenceTracker } from "../../vendor/open-knowledge/core/src/utils/code-fence-tracker";
import { scanHeadingLine } from "../../vendor/open-knowledge/core/src/utils/heading-scan";
import { resolveWikiLinkTargetDocName } from "../../vendor/open-knowledge/core/src/utils/wiki-link-resolve";
import { PASS_HOST_ROUTE, type HostRoutes } from "../host-fetch";

export interface HostPageSummary {
  docName: string;
  title: string;
  size: number;
  modified: string;
  /** 必填：上游 PageEntrySchema 要求，例如 'md' */
  docExt: string;
  icon?: string;
  tags?: readonly string[];
}

export interface HostDocumentEntry {
  kind: "document" | "asset" | "folder" | "file";
  path?: string;
  docName?: string;
}

export interface CoreRouteDeps {
  listPages(): Promise<HostPageSummary[]> | HostPageSummary[];
  listDocuments(): Promise<HostDocumentEntry[]> | HostDocumentEntry[];
  suggestions?: {
    listTags(): Promise<{ tag: string; count: number }[]>;
    readDocument(docName: string): Promise<string | null>;
    listBacklinks(docName: string): Promise<{ source: string; title: string }[]>;
  };
}

function suggestionRoutes(deps: CoreRouteDeps, suggestions: NonNullable<CoreRouteDeps["suggestions"]>): HostRoutes {
  return {
    "GET /api/tags": async () => {
      const tags = await suggestions.listTags();
      const parentTags = new Set<string>();
      for (const { tag } of tags) {
        for (let end = tag.lastIndexOf("/"); end > 0; end = tag.lastIndexOf("/", end - 1)) parentTags.add(tag.slice(0, end));
      }
      return { tags: tags.map(({ tag, count }) => ({ name: tag, count, isLeaf: !parentTags.has(tag) })) };
    },
    "GET /api/tag-documents": async ({ url }) => {
      const tag = url.searchParams.get("tag")?.toLowerCase();
      if (!tag) return { docs: [] };
      const currentDoc = url.searchParams.get("docName");
      const docs = (await deps.listPages()).flatMap(({ docName, title, tags }) => {
        if (docName === currentDoc) return [];
        const matchingTags = tags?.filter((candidate) => {
          const normalized = candidate.toLowerCase();
          return normalized === tag || normalized.startsWith(`${tag}/`);
        });
        return matchingTags?.length ? [{ docName, title, matchingTags }] : [];
      });
      return { docs };
    },
    "GET /api/page-headings": async ({ url }) => {
      const docName = url.searchParams.get("docName") ?? "";
      const { body } = stripFrontmatter((await suggestions.readDocument(docName)) ?? "");
      const isInCodeFence = createCodeFenceTracker();
      const slugCounts = new Map<string, number>();
      const headings = body.split("\n").flatMap((line) => {
        if (isInCodeFence(line)) return [];
        const heading = scanHeadingLine(line, slugCounts);
        return heading ? [heading] : [];
      });
      return { docName, headings };
    },
    "GET /api/forward-links": async ({ url }) => {
      const docName = url.searchParams.get("docName") ?? "";
      const text = await suggestions.readDocument(docName);
      if (!text) return { docName, forwardLinks: [] };
      const pages = await deps.listPages();
      const titles = new Map(pages.map((page) => [page.docName, page.title]));
      const names = new Set(titles.keys());
      const forwardLinks: { kind: "doc"; docName: string; anchor: string | null; title: string; snippet: null }[] = [];
      visit(getSharedMarkdownManager().parseToMdast(text), "wikiLink", ({ data }) => {
        const resolved = resolveWikiLinkTargetDocName(data.target, names);
        if (resolved) forwardLinks.push({ kind: "doc", docName: resolved, anchor: data.anchor, title: titles.get(resolved) ?? resolved, snippet: null });
      });
      return { docName, forwardLinks };
    },
    "GET /api/document": async ({ url }) => {
      const docName = url.searchParams.get("docName");
      if (!docName) return PASS_HOST_ROUTE;
      const content = await suggestions.readDocument(docName);
      return content === null ? PASS_HOST_ROUTE : { docName, content, lifecycle: null };
    },
    "GET /api/backlink-counts": async ({ url }) => {
      const names = new Set(
        (url.searchParams.get("docNames") ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      );
      const counts = await Promise.all([...names].map(async (name) => [name, (await suggestions.listBacklinks(name)).length] as const));
      return { counts: Object.fromEntries(counts) };
    },
    "GET /api/backlinks": async ({ url }) => {
      const docName = url.searchParams.get("docName") ?? "";
      return { docName, backlinks: (await suggestions.listBacklinks(docName)).map((link) => ({ ...link, anchor: null, snippet: null })) };
    },
  };
}

export function coreRoutes(deps: CoreRouteDeps): HostRoutes {
  return {
    ...(deps.suggestions ? suggestionRoutes(deps, deps.suggestions) : {}),
    "GET /api/pages": async () => ({ pages: await deps.listPages() }),
    // 分级目录列表由 Explorer 的 filesRoutes 提供，编辑器只提供引用候选。
    "GET /api/documents": async ({ url }) => (url.searchParams.get("showAll") === "true" ? PASS_HOST_ROUTE : { documents: await deps.listDocuments() }),
    "GET /api/principal": () => ({ principal: { id: "local", name: "Huhu", kind: "human" } }),
  };
}
