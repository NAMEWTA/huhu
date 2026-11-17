import { commentRoutes, notifyCommentsChanged, type HostRoutes } from "@huhu/editor/rich";
import { useEngine, useEngineEvents } from "@huhu/workbench";
import { useMemo, useRef } from "react";
import { createCommentsPort, docNameOf, pathOfDocName } from "./commentAdapter.js";

/**
 * 批注在渲染进程里的宿主侧：能力端口 + hostFetch 路由 + 事件同步。
 * 只在已加载编辑器闭包的懒加载入口里使用（编辑面 / 批注页），不进首屏。
 */
export function useCommentsBridge(opts: { paths: readonly string[]; flush(): Promise<boolean> }): { commentRoutes: HostRoutes } {
  const engine = useEngine();
  const paths = useRef(opts.paths);
  paths.current = opts.paths;
  const flushRef = useRef(opts.flush);
  flushRef.current = opts.flush;

  const routes = useMemo<HostRoutes>(() => {
    const port = createCommentsPort((capability, input, o) => engine.call(capability, input, o));
    return commentRoutes({
      port,
      pathOf: (docName) => pathOfDocName(docName, paths.current),
      docNameOf,
      // 引擎在“已保存的文本”上解析引用文字：先落盘；落盘失败（如冲突）就不创建，避免批注对应错误的版本（D05）
      flush: async () => {
        if (!(await flushRef.current())) throw new Error("文档还没有保存成功（可能有冲突），先处理后再添加批注");
      },
    });
  }, [engine]);

  // 批注数据变化（本机或其它入口创建 / 回复 / 解决 / 保存后重定位）→ 让 OK 的 store 重新拉取
  useEngineEvents((e) => {
    if (e.type === "entity.changed" && (e.payload as { kind?: string }).kind === "comment") notifyCommentsChanged();
  });
  return { commentRoutes: routes };
}
