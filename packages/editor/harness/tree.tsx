// S5 运行时验证：上游 FileTree 挂在宿主提供者里，数据来自内存文件系统（经 hostFetch 的 files 路由）。
import '../src/ok/ok-globals.css'
import { I18nProvider } from '@lingui/react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider } from '@/components/ui/sidebar'
import { FileTree } from '@/components/FileTree'
import { ExternalHandoffGateProvider } from '@/components/handoff/ExternalHandoffGate'
import { PageListProvider } from '@/components/PageListContext'
import { dynamicActivate } from '@/lib/activate-locale'
import { i18n } from '@/lib/i18n'
import { setHostHiddenPaths } from '@/lib/host-hidden'
import { emitDocumentsChanged } from '@/lib/documents-events'
import { HostConfigProvider } from '../src/host/config-provider'
import { DocumentProvider } from '../src/host/document-context'
import { installHostFetch, registerHostRoutes } from '../src/host/host-fetch'
import { filesRoutes, type FilesRouteDeps, type HostFsEntry } from '../src/host/routes/files'

installHostFetch()
const files = new Map<string, { size: number; dir: boolean }>()
const seed = (p: string, dir = false, size = 5) => files.set(p, { dir, size })
for (const [p, dir] of [['Notes', true], ['Notes/a.md', false], ['Notes/b.md', false], ['Notes/pic.png', false], ['Empty', true], ['Archives', true], ['Archives/x.md', false], ['data.json', false], ['paper.pdf', false], ['readme.md', false]] as const) seed(p, dir)
const hiddenPaths: string[] = []
const state = { showHidden: false }
const log: unknown[] = []
const opened: string[] = []

const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const listDir = (dir: string): HostFsEntry[] =>
  [...files.entries()]
    .filter(([p]) => parentOf(p) === dir && p !== '')
    .map(([p, v]) => ({ name: p.split('/').at(-1)!, path: p, kind: v.dir ? ('dir' as const) : ('file' as const), size: v.size, mtimeMs: 1_700_000_000_000 }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))

const deps: FilesRouteDeps = {
  list: async (dir) => ({ entries: listDir(dir) }),
  listDocumentPaths: async () => [...files.entries()].filter(([, v]) => !v.dir).map(([p]) => ({ name: p.split('/').at(-1)!, path: p, kind: 'file' as const, size: 5 })),
  hiddenPaths: () => hiddenPaths,
  showHidden: () => state.showHidden,
  rename: async (i) => {
    log.push(['rename', i])
    const moved: Record<string, string> = {}
    for (const [p, v] of [...files]) {
      if (p === i.fromPath || p.startsWith(`${i.fromPath}/`)) {
        files.delete(p)
        const to = i.toPath + p.slice(i.fromPath.length)
        files.set(to, v)
        if (!v.dir) moved[p] = to
      }
    }
    return { moved }
  },
  duplicate: async (i) => {
    log.push(['duplicate', i])
    const to = `${i.path} copy`
    files.set(to, files.get(i.path) ?? { dir: false, size: 5 })
    return { path: to, paths: [to] }
  },
  trash: async (i) => {
    log.push(['trash', i])
    const gone = [...files.keys()].filter((p) => p === i.path || p.startsWith(`${i.path}/`))
    gone.forEach((p) => files.delete(p))
    return { paths: gone }
  },
  createPage: async (i) => (seed(i.path), log.push(['createPage', i]), { path: i.path }),
  createFolder: async (i) => (seed(i.path, true, 0), log.push(['createFolder', i]), { path: i.path }),
  workspace: () => ({ root: '/vault', separator: '/' }),
}
registerHostRoutes(filesRoutes(deps))
setHostHiddenPaths({
  hide: (p) => {
    hiddenPaths.push(p)
    emitDocumentsChanged(['files'])
  },
})

declare global {
  interface Window {
    __tree: { seed: typeof seed; files: typeof files; hidden: string[]; state: typeof state; log: unknown[]; opened: string[] }
  }
}
window.__tree = { seed, files, hidden: hiddenPaths, state, log, opened }

void dynamicActivate('en').then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <QueryClientProvider client={new QueryClient()}>
            <TooltipProvider>
              <HostConfigProvider>
                <DocumentProvider host={{ openTarget: (t) => void opened.push(JSON.stringify(t)), openDocument: (d) => void opened.push(d) }}>
                  <PageListProvider>
                    <ExternalHandoffGateProvider><SidebarProvider>
                      <div className="ok-root" style={{ height: '100vh', width: 320, display: 'flex', flexDirection: 'column' }} data-testid="tree-root">
                        <FileTree />
                      </div>
                    </SidebarProvider></ExternalHandoffGateProvider>
                  </PageListProvider>
                </DocumentProvider>
              </HostConfigProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  )
})
