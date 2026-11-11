/** 退出前需要落盘的东西（编辑器里防抖中的内容等）：模块注册，Main 请求时统一执行。 */
const flushers = new Set<() => Promise<void>>();

export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export async function runFlushers(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()));
}
