/**
 * 跨模块“打开某个路径”的请求：任务里点击 `[[路径]]` 时，请求笔记模块打开文件或定位文件夹。
 * 请求先存起来（笔记模块可能还没挂载），笔记模块挂载或收到通知后取走。
 */
export interface OpenRequest {
  path: string;
  /** 文件夹（以 / 结尾的双链）。 */
  folder: boolean;
}

let pending: OpenRequest | null = null;
const listeners = new Set<() => void>();

export function requestOpenPath(target: string): void {
  const folder = target.endsWith("/");
  pending = { path: folder ? target.slice(0, -1) : target.replace(/#.*$/, ""), folder };
  for (const l of listeners) l();
}

export function takeOpenRequest(): OpenRequest | null {
  const p = pending;
  pending = null;
  return p;
}

export function onOpenRequest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
