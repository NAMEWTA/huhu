// OK 渲染根：`.ok-root` 作用域容器 + vendor 编辑器需要的上下文提供者（design §12）。
// 所有 OK 渲染的内容（含 portal）都必须在 `.ok-root` 之内；样式与变量只落在该容器上，不渗入 Huhu 其它界面。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@lingui/react";
import { t } from "@lingui/core/macro";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../ok/ok-globals.css";
import "../editor.css";
import { CommentScopeProvider } from "@/comments/store";
import { PageListProvider } from "@/components/PageListContext";
import { PropertyProvider } from "@/components/PropertyContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocalReferenceContext, type LocalReferenceHost } from "@/editor/components/live-doc-pool";
import { resetInternalDocPreviewCache } from "@/editor/link-preview/internal-doc-preview";
import { linkLabel } from "@/editor/registry/block-labels";
import { dynamicActivate, getRequestedLocale } from "@/lib/activate-locale";
import { assetPathFromHash, clearHashWithoutNavigation, docNameFromHash } from "@/lib/doc-hash";
import { setHostLintAvailable } from "@/lib/host-features";
import { i18n } from "@/lib/i18n";
import { OkFetchContext } from "@/lib/ok-fetch";
import { hasSidebarDragType, navigationForSidebarDragPayload, parseSidebarDragPayload } from "@/lib/sidebar-drag";
import { HostConfigProvider, linkPreviewRoutes, type HostEditorConfig } from "../host/config-provider";
import { installDesktopBridge } from "../host/desktop-bridge";
import { DocumentProvider, type DocumentHostCallbacks } from "../host/document-context";
import { createHostFetch, type HostRoutes } from "../host/host-fetch";
import { DEFAULT_FEATURES, type OkHost } from "../host/ok-host";
import { resetProviderPool } from "../host/provider-pool";

export interface OkRootProps {
  children: ReactNode;
  /** Huhu 语言：zh-Hans / en（其它回退 en） */
  locale?: string;
  host?: Partial<OkHost>;
  /** 宿主路由（页面清单、文档清单等，来自 plugins/notes 的资源能力） */
  routes?: HostRoutes;
  config?: HostEditorConfig;
  /** 变化（如切换 Vault）时销毁全部编辑表示与 editor-cache */
  poolKey?: string;
  commentScope?: string;
  /** 打开文档 / 目标的宿主回调（wiki-link、内部链接点击） */
  documentHost?: DocumentHostCallbacks;
  localReferences?: LocalReferenceHost;
  acceptSidebarDrop?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function desktopOpenExternal(): OkHost["openExternal"] | undefined {
  const host = (globalThis as { huhuHost?: { openExternal?(url: string): Promise<boolean> } }).huhuHost;
  return host?.openExternal ? openDesktopExternal : undefined;
}

async function openDesktopExternal(url: string): Promise<void> {
  const host = (globalThis as { huhuHost?: { openExternal?(url: string): Promise<boolean> } }).huhuHost;
  await host?.openExternal?.(url);
}

let lastPoolKey: string | undefined;

/** Huhu 用 html[data-mode="dark|light"] 表示明暗；OK 的 dark 变体是 `.dark *`，这里把两者接起来。 */
function useHuhuDarkClass(): boolean {
  const read = () => document.documentElement.getAttribute("data-mode") === "dark";
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** Class names for an OK root, including portals outside its DOM subtree. */
export function okRootClassName(dark: boolean, className?: string): string {
  return `ok-root${dark ? " dark" : ""}${className ? ` ${className}` : ""}`;
}

export function OkRoot({ children, locale, host, routes, config, poolKey, commentScope, documentHost, localReferences, acceptSidebarDrop, className, style }: OkRootProps) {
  const dark = useHuhuDarkClass();
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const features = useMemo(() => ({ ...DEFAULT_FEATURES, ...host?.features }), [host?.features]);
  const openExternal = host?.openExternal ?? desktopOpenExternal();
  useEffect(() => {
    setHostLintAvailable(features.lint);
    const off = openExternal ? installDesktopBridge({ features, openExternal }) : () => {};
    return off;
  }, [features, openExternal]);
  const requestLinkPreview = config?.linkPreviewsEnabled ? config.requestLinkPreview : undefined;
  const request = useMemo(() => createHostFetch(routes ?? {}, requestLinkPreview ? linkPreviewRoutes(requestLinkPreview) : {}), [routes, requestLinkPreview]);
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } }), [poolKey]);
  // OK 的内部链接用 URL hash 表示导航（window.location.assign(#…)）；Huhu 没有 OK 的路由，这里把 hash 翻译成宿主回调后清掉它
  useEffect(() => {
    if (!documentHost) return;
    const onHash = () => {
      const hash = window.location.hash;
      if (!hash || hash === "#") return;
      const doc = docNameFromHash(hash);
      const asset = doc === null ? assetPathFromHash(hash) : null;
      if (doc === null && asset === null) return;
      clearHashWithoutNavigation();
      if (doc !== null) documentHost.openDocument?.(doc);
      else if (asset !== null) documentHost.openTarget?.({ kind: "asset", target: asset, assetPath: asset, mediaKind: null });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [documentHost]);
  // 池跨 OkRoot 实例存活（每篇笔记一个 OkRoot）：只有 poolKey（Vault）变了才销毁
  useLayoutEffect(() => {
    // 没有 poolKey 的 OkRoot（如详情栏的批注页）不参与池的所有权：否则它挂载就会把另一处正在编辑的编辑器销毁
    if (poolKey === undefined) return;
    if (lastPoolKey !== undefined && lastPoolKey !== poolKey) {
      resetInternalDocPreviewCache();
      resetProviderPool();
    }
    lastPoolKey = poolKey;
  }, [poolKey]);
  useEffect(() => {
    let live = true;
    const target = locale ? (locale.toLowerCase().startsWith("zh") ? "zh-Hans" : "en") : getRequestedLocale();
    void dynamicActivate(target).then(() => {
      if (!live) return;
      for (const link of root.current?.querySelectorAll(".footnote-backref") ?? []) link.setAttribute("aria-label", t`Back to reference`);
      for (const link of root.current?.querySelectorAll("[data-link]") ?? []) link.setAttribute("aria-label", linkLabel(link.getAttribute("href") ?? ""));
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [locale]);
  if (!ready) return null;
  return (
    <div
      ref={root}
      className={okRootClassName(dark, className)}
      style={style}
      data-ok-root
      lang={locale ?? getRequestedLocale()}
      onDragOverCapture={(event) => {
        if (!acceptSidebarDrop || !hasSidebarDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDropCapture={(event) => {
        if (!acceptSidebarDrop || !hasSidebarDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const payload = parseSidebarDragPayload(event.dataTransfer);
        if (payload) documentHost?.openTarget?.(navigationForSidebarDragPayload(payload).target);
      }}
    >
      <I18nProvider i18n={i18n}>
        {/* 'next-themes' 在 vendor 里是别名到 host/next-themes-shim 的替身：只给 useTheme() 提供值，不往 DOM 注入 <script> */}
        <ThemeProvider forcedTheme={dark ? "dark" : "light"}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <HostConfigProvider config={config ?? {}}>
                <DocumentProvider {...(documentHost ? { host: documentHost } : {})}>
                  <OkFetchContext value={request}>
                    <PageListProvider>
                      <PropertyProvider>
                        <CommentScopeProvider scope={commentScope}>
                          <LocalReferenceContext value={localReferences ?? null}>{children}</LocalReferenceContext>
                        </CommentScopeProvider>
                      </PropertyProvider>
                    </PageListProvider>
                  </OkFetchContext>
                </DocumentProvider>
              </HostConfigProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </div>
  );
}
