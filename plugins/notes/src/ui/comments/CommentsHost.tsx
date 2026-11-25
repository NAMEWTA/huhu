import { Suspense, lazy } from "react";
import { n } from "../i18n.js";
import type { CommentsPanelSurfaceProps } from "./CommentsPanelSurface.js";

const CommentsPanelSurface = lazy(() => import("./CommentsPanelSurface.js"));

/** 详情栏批注页入口：编辑器的批注卡片、编辑及重新选择位置经懒加载接入；整篇笔记批注在面板底部。 */
export function CommentsHost(props: Omit<CommentsPanelSurfaceProps, "labels" | "readOnlyReason">) {
  return (
    <Suspense fallback={<p className="small muted">{n.loadingComments}</p>}>
      <CommentsPanelSurface {...props} readOnlyReason={n.commentsReadOnly} labels={{ wholeNote: n.fileCommentLabel, wholeNotePlaceholder: n.fileCommentPlaceholder, add: n.addCommentButton }} />
    </Suspense>
  );
}
