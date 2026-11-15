// OK 渲染根：`.ok-root` 作用域容器 + vendor 编辑器需要的上下文提供者（design §12）。
// 所有 OK 渲染的内容（含 portal）都必须在 `.ok-root` 之内；样式与变量只落在该容器上，不渗入 Huhu 其它界面。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@lingui/react'
import { ThemeProvider } from 'next-themes'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import '../ok/ok-globals.css'
import '../editor.css'
import { PageListProvider } from '@/components/PageListContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { dynamicActivate } from '@/lib/activate-locale'
import { i18n } from '@/lib/i18n'
import { HostConfigProvider, type HostEditorConfig } from '../host/config-provider'
import { installDesktopBridge } from '../host/desktop-bridge'
import { DocumentProvider, type DocumentHostCallbacks } from '../host/document-context'
import { installHostFetch, registerHostRoutes, type HostRoutes } from '../host/host-fetch'
import { DEFAULT_FEATURES, type OkHost } from '../host/ok-host'
import { resetProviderPool } from '../host/provider-pool'

export interface OkRootProps {
  children: ReactNode
  /** Huhu 语言：zh-Hans / en（其它回退 en） */
  locale?: string
  host?: Partial<OkHost>
  /** 宿主路由（页面清单、文档清单等，来自 plugins/notes 的资源能力） */
  routes?: HostRoutes
  config?: HostEditorConfig
  /** 变化（如切换 Vault）时销毁全部编辑表示与 editor-cache */
  poolKey?: string
  /** 打开文档 / 目标的宿主回调（wiki-link、内部链接点击） */
  documentHost?: DocumentHostCallbacks
  className?: string
  style?: React.CSSProperties
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })

/** Huhu 用 html[data-mode="dark|light"] 表示明暗；OK 的 dark 变体是 `.dark *`，这里把两者接起来。 */
function useHuhuDarkClass(): boolean {
  const read = () => document.documentElement.getAttribute('data-mode') === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

export function OkRoot({ children, locale = 'en', host, routes, config, poolKey, documentHost, className, style }: OkRootProps) {
  const dark = useHuhuDarkClass()
  const [ready, setReady] = useState(false)
  const features = useMemo(() => ({ ...DEFAULT_FEATURES, ...host?.features }), [host?.features])
  const openExternal = host?.openExternal
  useEffect(() => {
    const restoreFetch = installHostFetch()
    void restoreFetch
    const off = openExternal ? installDesktopBridge({ features, openExternal }) : () => {}
    return off
  }, [features, openExternal])
  useEffect(() => (routes ? registerHostRoutes(routes) : undefined), [routes])
  useEffect(() => () => resetProviderPool(), [poolKey])
  useEffect(() => {
    let live = true
    const target = locale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
    void dynamicActivate(target).then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [locale])
  if (!ready) return null
  return (
    <div className={`ok-root${dark ? ' dark' : ''}${className ? ` ${className}` : ''}`} style={style} data-ok-root>
      <I18nProvider i18n={i18n}>
        {/* next-themes 只用来给 vendor 的 useTheme() 提供值：不写 html.class / color-scheme，不占用 Huhu 的 localStorage 键 */}
        <ThemeProvider attribute="data-ok-theme" forcedTheme={dark ? 'dark' : 'light'} enableSystem={false} enableColorScheme={false} storageKey="huhu-ok-theme">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <HostConfigProvider config={config ?? {}}>
                <DocumentProvider {...(documentHost ? { host: documentHost } : {})}>
                  <PageListProvider>{children}</PageListProvider>
                </DocumentProvider>
              </HostConfigProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </div>
  )
}
