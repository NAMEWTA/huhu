// hostFetch：vendor 里所有 `fetch('/api/…')` 的统一替身（design §4）。
// vendor 的局部入口只拦截相对路径 `/api/`。
// 路由按切片分文件（core：S2a；comments：S4；files：S5），本文件只负责组合与兜底。
// 没有对应 Huhu 能力的端点返回 404 + { code: 'NOT_AVAILABLE' }，由 OkHost.features 关闭对应入口。
import { attachOkFetch } from "../vendor/open-knowledge/app/src/lib/ok-fetch";

export type HostRouteHandler = (req: { url: URL; method: string; body: unknown }) => Promise<unknown> | unknown;
export type HostRoutes = Record<string, HostRouteHandler>;
export const PASS_HOST_ROUTE = Symbol("pass host route");

// 兜底路由表（最低优先级，永远在表里）：页面 / 文档清单没有宿主注入时返回空清单而不是 404，
// 例如详情栏的批注页（OkRoot 只带评论路由）挂载时比编辑面更早发出 /api/pages。有数据的宿主路由仍然优先。
const baselineRoutes: HostRoutes = {
  "GET /api/pages": () => ({ pages: [] }),
  "GET /api/documents": () => ({ documents: [] }),
};
const routeTables: HostRoutes[] = [baselineRoutes];

export function registerHostRoutes(routes: HostRoutes): () => void {
  routeTables.push(routes);
  return () => {
    const i = routeTables.indexOf(routes);
    if (i >= 0) routeTables.splice(i, 1);
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function dispatch(tables: readonly HostRoutes[], input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://huhu.local");
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const key = `${method} ${url.pathname}`;
  // 后注册的路由表优先（files / comments 切片可以覆盖 core 的兜底实现）。
  for (const table of tables) {
    const handler = Object.hasOwn(table, key) ? table[key] : undefined;
    if (!handler) continue;
    let body: unknown;
    if (typeof FormData !== "undefined" && init?.body instanceof FormData) {
      body = init.body;
    } else if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    try {
      const result = await handler({ url, method, body });
      if (result === PASS_HOST_ROUTE) continue;
      return jsonResponse(200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // title / detail：vendor 的 ProblemDetailsSchema（RFC 9457）读这两个字段给用户看
      return jsonResponse(500, { code: "HOST_ERROR", message, type: "urn:ok:error:invalid-request", title: message, status: 500, detail: message });
    }
  }
  return jsonResponse(404, { code: "NOT_AVAILABLE", message: `Huhu 宿主未实现 ${key}` });
}

export const hostFetch: typeof fetch = (input, init) => dispatch([...routeTables].reverse(), input, init);

export function createHostFetch(...tables: HostRoutes[]): typeof fetch {
  const scoped = [...tables, baselineRoutes];
  return adapt((input, init) => dispatch(scoped, input, init));
}

function adapt(request: typeof fetch): typeof fetch {
  return (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (raw.startsWith("/api/") || raw === "/api") return request(input, init);
    return globalThis.fetch(input, init);
  };
}

export function installHostFetch(): () => void {
  return attachOkFetch(adapt(hostFetch));
}
