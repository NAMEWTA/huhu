import { CommentsPanelHost, coreRoutes, type HostRoutes } from "@huhu/editor/rich";
import { host } from "@huhu/workbench";
import { useMemo, useRef } from "react";
import { docNameOf } from "./commentAdapter.js";
import { useCommentsBridge } from "./useCommentsBridge.js";
import { useKnowledgeLocale } from "../useKnowledgeLocale.js";

export interface CommentsPanelSurfaceProps {
  path: string;
  /** 当前 Vault 里已知的笔记路径（docName ↔ path 解析） */
  paths: readonly string[];
  flush(): Promise<boolean>;
  readOnly: boolean;
  readOnlyReason: string;
  labels: { wholeNote: string; wholeNotePlaceholder: string; add: string };
}

/** 详情栏“批注”页（经动态 import 加载，OK 评论 UI 不进首屏）。 */
export default function CommentsPanelSurface(props: CommentsPanelSurfaceProps) {
  const locale = useKnowledgeLocale();
  const { commentRoutes } = useCommentsBridge({ paths: props.paths, flush: props.flush });
  const known = useRef(props.paths);
  known.current = props.paths;
  const routes = useMemo<HostRoutes>(
    () => ({
      ...coreRoutes({
        listPages: () => known.current.map((p) => ({ docName: docNameOf(p), title: p.split("/").at(-1) ?? p, size: 0, modified: new Date(0).toISOString(), docExt: (/\.(\w+)$/.exec(p)?.[1] ?? "md").toLowerCase() })),
        listDocuments: () => known.current.map((p) => ({ kind: "document" as const, path: p, docName: docNameOf(p) })),
      }),
      ...commentRoutes,
    }),
    [commentRoutes],
  );
  const labels = locale === "en" ? { wholeNote: "Whole note", wholeNotePlaceholder: "Write a comment on the whole note…", add: "Add comment" } : props.labels;
  const openExternal = host()?.openExternal;
  return (
    <CommentsPanelHost
      docName={docNameOf(props.path)}
      routes={routes}
      {...(openExternal ? { openExternal } : {})}
      locale={locale}
      readOnly={props.readOnly}
      readOnlyReason={locale === "en" ? "This note is read-only" : props.readOnlyReason}
      labels={labels}
    />
  );
}
