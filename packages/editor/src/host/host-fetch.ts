// hostFetch：vendor 里所有 `fetch('/api/…')` 的统一替身（design §4）。
// 安装方式：installHostFetch() 包住 window.fetch，只拦截同源相对路径 `/api/`；其它请求原样放行。
// 路由按切片分文件（core：S2a；comments：S4；files：S5），本文件只负责组合与兜底。
// 没有对应 Huhu 能力的端点返回 404 + { code: 'NOT_AVAILABLE' }，由 OkHost.features 关闭对应入口。
export type HostRouteHandler = (req: { url: URL; method: string; body: unknown }) => Promise<unknown> | unknown
export type HostRoutes = Record<string, HostRouteHandler>

const routeTables: HostRoutes[] = []

export function registerHostRoutes(routes: HostRoutes): () => void {
  routeTables.push(routes)
  return () => {
    const i = routeTables.indexOf(routes)
    if (i >= 0) routeTables.splice(i, 1)
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export async function hostFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw, 'http://huhu.local')
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
  const key = `${method} ${url.pathname}`
  for (const table of routeTables) {
    const handler = table[key] ?? table[url.pathname]
    if (!handler) continue
    let body: unknown
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    try {
      return jsonResponse(200, await handler({ url, method, body }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // title / detail：vendor 的 ProblemDetailsSchema（RFC 9457）读这两个字段给用户看
      return jsonResponse(500, { code: 'HOST_ERROR', message, type: 'urn:ok:error:invalid-request', title: message, status: 500, detail: message })
    }
  }
  return jsonResponse(404, { code: 'NOT_AVAILABLE', message: `Huhu 宿主未实现 ${key}` })
}

let restore: (() => void) | null = null

export function installHostFetch(): () => void {
  if (restore) return restore
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (raw.startsWith('/api/') || raw === '/api') return hostFetch(input, init)
    return original(input, init)
  }
  restore = () => {
    window.fetch = original
    restore = null
  }
  return restore
}
