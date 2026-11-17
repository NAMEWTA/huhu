import { CommentsPanelHost, coreRoutes, type HostRoutes } from "@huhu/editor/rich";
import { useMemo, useRef } from "react";
import { docNameOf } from "./commentAdapter.js";
import { useCommentsBridge } from "./useCommentsBridge.js";

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
  return <CommentsPanelHost docName={docNameOf(props.path)} routes={routes} locale="zh-Hans" readOnly={props.readOnly} readOnlyReason={props.readOnlyReason} labels={props.labels} />;
}
