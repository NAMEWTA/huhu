// 运行时验证页（SP-2 / SP-3 / SP-6）：LocalDocProvider + 上游 TiptapEditor / SourceEditor，宿主只提供内存文档源。
import '../src/ok/ok-globals.css'
import { I18nProvider } from '@lingui/react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TiptapEditor } from '@/editor/TiptapEditor'
import { SourceEditor } from '@/editor/SourceEditor'
import { dynamicActivate } from '@/lib/activate-locale'
import { i18n } from '@/lib/i18n'
import { HostConfigProvider } from '../src/host/config-provider'
import { DocumentProvider } from '../src/host/document-context'
import { installHostFetch } from '../src/host/host-fetch'
import { LocalDocProvider } from '../src/host/hocuspocus-provider'
import { setDocSource } from '../src/host/doc-source'

installHostFetch()
const docs = new Map<string, string>()
const writes: Array<{ name: string; text: string }> = []
setDocSource({ read: async (name) => docs.get(name) ?? '' })
const providers = new Map<string, LocalDocProvider>()

declare global {
  interface Window {
    __harness: {
      seed(name: string, text: string): void
      open(name: string): void
      setSourceMode(on: boolean): void
      ytext(name: string): string
      docs: Map<string, string>
      writes: typeof writes
      providers: Map<string, LocalDocProvider>
    }
  }
}

function App() {
  const [active, setActive] = useState<string | null>(null)
  const [source, setSource] = useState(false)
  const [ready, setReady] = useState(0)
  const portalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.__harness = {
      seed: (n, t) => void docs.set(n, t),
      open: (n) => {
        if (!providers.has(n)) {
          const p = new LocalDocProvider({ name: n })
          providers.set(n, p)
          p.on('synced', () => setReady((x) => x + 1))
        }
        setActive(n)
      },
      setSourceMode: setSource,
      ytext: (n) => providers.get(n)?.document.getText('source').toString() ?? '',
      docs,
      writes,
      providers,
    }
  }, [])
  const provider = active ? providers.get(active) : undefined
  void ready
  return (
    <div className="ok-root" style={{ height: '100vh' }}>
      <div ref={portalRef} id="portal" style={{ height: '100%', overflow: 'auto' }}>
        {provider?.synced && portalRef.current ? (
          <>
            <TiptapEditor key={`t-${active}`} provider={provider as never} isSourceMode={source} portalTarget={portalRef.current} />
            <SourceEditor key={`s-${active}`} docName={active!} ytext={provider.document.getText('source')} provider={provider as never} isSourceModeActive={source} />
          </>
        ) : null}
      </div>
    </div>
  )
}

void dynamicActivate('en').then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <QueryClientProvider client={new QueryClient()}>
            <TooltipProvider>
              <HostConfigProvider>
                <DocumentProvider>
                  <App />
                </DocumentProvider>
              </HostConfigProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  )
})
