// LocalDocProvider 池（取代上游 provider-pool.ts 的 2121 行，design §3.2）。
// 目的：vendor 的 editor-cache 会 park（只摘 DOM）已卸载的编辑器，park 的编辑器绑定着创建它的 Y.Doc——
// 所以 provider 必须活得比组件久，直到 editor-cache 也驱逐它。池大小与 editor-cache 的 MAX_CACHE 对齐。
// 会话（DocumentSession）由宿主按引用计数管理，这里只管编辑表示（Y.Doc）。
import { MAX_CACHE, evictCmEditor, evictTiptapEditor } from "@/editor/editor-cache";
import { registerDocBinding } from "./doc-bindings";
import { LocalDocProvider } from "./hocuspocus-provider";

interface Entry {
  name: string;
  provider: LocalDocProvider;
  refs: number;
  read: () => string;
  unregister: () => void;
}

const entries = new Map<string, Entry>();
/** 引用为 0 的条目，最久未用在前 */
const idle: string[] = [];

function destroy(name: string): void {
  const e = entries.get(name);
  if (!e) return;
  entries.delete(name);
  const i = idle.indexOf(name);
  if (i >= 0) idle.splice(i, 1);
  evictTiptapEditor(name);
  evictCmEditor(name);
  e.provider.destroy();
  e.unregister();
}

export interface PooledDoc {
  provider: LocalDocProvider;
  /** provider 已同步（装载完成）后回调；已同步则下一个微任务回调。返回取消函数。 */
  whenSynced(fn: () => void): () => void;
}

/** 取得（或创建）docName 的 provider；`read` 给出当前会话缓冲，只在首次创建时用于装载。 */
export function acquireProvider(docName: string, read: () => string, opts: { lazyRich?: boolean } = {}): PooledDoc {
  let e = entries.get(docName);
  if (e) {
    e.read = read;
    const i = idle.indexOf(docName);
    if (i >= 0) idle.splice(i, 1);
  } else {
    const entry: Entry = { name: docName, provider: undefined as never, refs: 0, read, unregister: () => {} };
    entry.unregister = registerDocBinding(docName, { read: () => entry.read() });
    entry.provider = new LocalDocProvider({ name: docName, ...(opts.lazyRich ? { lazyRich: true } : {}) });
    entries.set(docName, entry);
    e = entry;
  }
  e.refs++;
  const provider = e.provider;
  return {
    provider,
    whenSynced(fn) {
      let live = true;
      const run = () => live && fn();
      provider.on("synced", run);
      return () => {
        live = false;
        provider.off("synced", run);
      };
    },
  };
}

export function releaseProvider(docName: string): void {
  const e = entries.get(docName);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs > 0) return;
  idle.push(docName);
  while (idle.length > MAX_CACHE) destroy(idle[0] as string);
}

/** 切换 Vault 等：销毁全部（含仍被引用的）provider，同时驱逐 editor-cache 里对应的编辑器。 */
export function resetProviderPool(): void {
  for (const name of entries.keys()) destroy(name); // Map 迭代中删除当前项是安全的
}

/** 文档被改名 / 删除：丢弃它的编辑表示，下次打开重新装载。 */
export function dropProvider(docName: string): void {
  destroy(docName);
}

export function __poolSize(): number {
  return entries.size;
}
