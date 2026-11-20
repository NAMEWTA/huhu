// OkExplorer：上游 FileTree（OK 文件树 + 右键菜单）的 Huhu 宿主封装（S5，design §8）。
// 数据与写操作由宿主经 FilesRouteDeps 注入；本组件只负责提供者栈与 hostFetch / 隐藏钩子的生命周期。
// 经 `@huhu/editor/ok-explorer` 懒加载，notes 模块入口不静态引用 vendor（design §12）。
import "../rich/token-map.css";
import "../ok/ok-globals.css";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalHandoffGateProvider } from "@/components/handoff/ExternalHandoffGate";
import { FileTree } from "@/components/FileTree";
import { PageListProvider } from "@/components/PageListContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dynamicActivate } from "@/lib/activate-locale";
import { emitDocumentsChanged } from "@/lib/documents-events";
import { setHostHiddenPaths, setHostMenuExtras } from "@/lib/host-hidden";
import { i18n } from "@/lib/i18n";
import { FILE_TREE_REVEAL_EVENT } from "./file-tree-reveal";
import { HostConfigProvider } from "./config-provider";
import { DocumentProvider } from "./document-context";
import { installHostFetch, registerHostRoutes } from "./host-fetch";
import { filesRoutes, type FilesRouteDeps } from "./routes/files";

export type { FilesRouteDeps } from "./routes/files";

export interface OkExplorerProps {
  deps: FilesRouteDeps;
  /** 用户在树里点开一个条目（文件 / 目录 / 非 Markdown 资源）。path 为 Vault 相对路径。 */
  onOpen(target: { kind: "file" | "folder" | "asset"; path: string }): void;
  /** “隐藏”菜单：写 hiddenPaths 偏好（仅树视图）。 */
  onHide(path: string, kind: "file" | "folder"): void | Promise<void>;
  locale?: "en" | "zh-Hans";
  /** 宿主数据变化（外部 / 内部写入、隐藏规则变化）后递增，树据此重新列举。 */
  refreshToken?: number;
  /** 外观：跟随 Huhu 主题。 */
  mode?: "light" | "dark";
  /** 宿主追加的右键菜单项（Huhu 既有能力：移动到… / 星标 / 保存版本…）。 */
  menuItems?: (path: string, kind: "file" | "folder") => readonly { id: string; label: string; onSelect: () => void }[];
  /** 当前打开的文件（Vault 相对路径），树据此高亮。 */
  activePath?: string | null;
  children?: ReactNode;
}

/** 上游把 .txt 等文本文件也当作“文档”（docName 保留扩展名）；按已列举过的真实路径还原成 Vault 路径。 */
function resolveDocPath(docName: string, known: ReadonlySet<string>): string {
  for (const c of [`${docName}.md`, `${docName}.mdx`, docName]) if (known.has(c)) return c;
  return `${docName}.md`;
}

let sharedClient: QueryClient | null = null;
const queryClient = () => (sharedClient ??= new QueryClient());

/** 通知树重新列举（外部变更监听 / 其他入口写入后调用）。 */
export function notifyExplorerChanged(): void {
  emitDocumentsChanged(["files"]);
}

export function OkExplorer({ deps, onOpen, onHide, locale = "en", refreshToken = 0, mode = "light", activePath = null, menuItems }: OkExplorerProps) {
  const [ready, setReady] = useState(false);
  const known = useRef(new Set<string>());
  const [reveal, setReveal] = useState<{ requested: string; active: string | null } | null>(null);
  useEffect(() => {
    setReveal(null);
    const show = (event: Event) => setReveal({ requested: (event as CustomEvent<string>).detail, active: activePath });
    window.addEventListener(FILE_TREE_REVEAL_EVENT, show);
    return () => window.removeEventListener(FILE_TREE_REVEAL_EVENT, show);
  }, [activePath]);
  const treePath = reveal?.active === activePath ? reveal.requested : activePath;
  useEffect(() => {
    let live = true;
    void dynamicActivate(locale).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [locale]);
  useEffect(installHostFetch, []);
  useEffect(() => {
    const tracked: FilesRouteDeps = {
      ...deps,
      list: async (dir) => {
        const r = await deps.list(dir);
        for (const e of r.entries) known.current.add(e.path);
        return r;
      },
    };
    // 菜单回调变化时，子树的首次列举仍须命中已注册的文件路由。
    return registerHostRoutes(filesRoutes(tracked));
  }, [deps]);
  useEffect(() => {
    setHostHiddenPaths({ hide: (p, k) => onHide(p, k) });
    setHostMenuExtras(menuItems ? { items: menuItems } : null);
    return () => {
      setHostHiddenPaths(null);
      setHostMenuExtras(null);
    };
  }, [onHide, menuItems]);
  useEffect(() => {
    if (refreshToken > 0) notifyExplorerChanged();
  }, [refreshToken]);
  const host = useMemo(
    () => ({
      // 选中高亮：树按 activeTarget / activeDocName 标出当前打开的文件
      activeDocName: treePath && /\.(md|mdx)$/i.test(treePath) ? treePath.replace(/\.(md|mdx)$/i, "") : null,
      activeTarget: !treePath
        ? null
        : /\.(md|mdx)$/i.test(treePath)
          ? { kind: "doc", target: treePath.replace(/\.(md|mdx)$/i, ""), docName: treePath.replace(/\.(md|mdx)$/i, "") }
          : { kind: "asset", target: treePath, assetPath: treePath, mediaKind: null },
      openTarget: (t: { kind: string; docName?: string; folderPath?: string; assetPath?: string }) => {
        // 'large-file'：OK 对超过 512 KiB 的文档不进编辑器；Huhu 由查看器分派（viewers/dispatch.ts）决定上限，源码优先打开大笔记（P-S3-01）
        if (t.kind === "doc" || t.kind === "folder-index" || t.kind === "large-file") onOpen({ kind: "file", path: resolveDocPath(t.docName ?? "", known.current) });
        else if (t.kind === "folder") onOpen({ kind: "folder", path: t.folderPath ?? "" });
        else if (t.kind === "asset") onOpen({ kind: "asset", path: t.assetPath ?? "" });
      },
      openDocument: (docName: string) => onOpen({ kind: "file", path: resolveDocPath(docName, known.current) }),
    }),
    [onOpen, treePath],
  );
  if (!ready) return null;
  return (
    <I18nProvider i18n={i18n}>
      <ThemeProvider attribute="class" forcedTheme={mode}>
        <QueryClientProvider client={queryClient()}>
          <TooltipProvider>
            <HostConfigProvider>
              <DocumentProvider host={host as never}>
                <PageListProvider>
                  <ExternalHandoffGateProvider>
                    <SidebarProvider style={{ minHeight: 0, height: "100%", flex: 1 }}>
                      <div className="ok-root ok-explorer-root" lang={locale} data-testid="ok-explorer" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
                        <FileTree />
                      </div>
                    </SidebarProvider>
                  </ExternalHandoffGateProvider>
                </PageListProvider>
              </DocumentProvider>
            </HostConfigProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
