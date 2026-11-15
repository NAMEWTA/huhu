// hostFetch 的 core 路由（S2a）：编辑器自身需要的页面 / 文档清单 / 身份 / 配置。
// 数据由宿主（plugins/notes，S1/S2b 起）通过 CoreRouteDeps 注入；本包不依赖业务模块。
import type { HostRoutes } from '../host-fetch'

export interface HostPageSummary {
  docName: string
  title: string
  size: number
  modified: string
  /** 必填：上游 PageEntrySchema 要求，例如 'md' */
  docExt: string
  icon?: string
}

export interface HostDocumentEntry {
  kind: 'document' | 'asset' | 'folder' | 'file'
  path?: string
  docName?: string
}

export interface CoreRouteDeps {
  listPages(): Promise<HostPageSummary[]> | HostPageSummary[]
  listDocuments(): Promise<HostDocumentEntry[]> | HostDocumentEntry[]
}

export function coreRoutes(deps: CoreRouteDeps): HostRoutes {
  return {
    'GET /api/pages': async () => ({ pages: await deps.listPages() }),
    'GET /api/documents': async () => ({ documents: await deps.listDocuments() }),
    'GET /api/principal': () => ({ principal: { id: 'local', name: 'Huhu', kind: 'human' } }),
  }
}
