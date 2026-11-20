// LocalDocProvider 池（取代上游 provider-pool.ts 的 2121 行，design §3.2）。
// 后台标签可停放编辑器及绑定的 Y.Doc。最后一个文件标签关闭时，由宿主请求释放；
// editor-cache 的容量驱逐只释放编辑视图，由本池单独负责 provider 与 Y.Doc。
import { MAX_CACHE, evictCmEditor, evictTiptapEditor } from "@/editor/editor-cache";
import { registerDocBinding } from "./doc-bindings";
import { LocalDocProvider } from "./hocuspocus-provider";

interface Entry {
  name: string;
  provider: LocalDocProvider;
  refs: number;
  closing: boolean;
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
  try {
    e.provider.destroy();
  } finally {
    e.unregister();
  }
}

export interface PooledDoc {
  provider: LocalDocProvider;
  release(): void;
  /** provider 已同步（装载完成）后回调；已同步则下一个微任务回调。返回取消函数。 */
  whenSynced(fn: () => void): () => void;
}

/** 取得（或创建）docName 的 provider；`read` 给出当前会话缓冲，只在首次创建时用于装载。 */
export function acquireProvider(docName: string, read: () => string, opts: { lazyRich?: boolean; park?: boolean } = {}): PooledDoc {
  let e = entries.get(docName);
  if (e) {
    e.read = read;
    e.closing = false;
    const i = idle.indexOf(docName);
    if (i >= 0) idle.splice(i, 1);
  } else {
    const entry: Entry = { name: docName, provider: undefined as never, refs: 0, closing: false, read, unregister: () => {} };
    entry.unregister = registerDocBinding(docName, { read: () => entry.read() });
    entry.provider = new LocalDocProvider({ name: docName, ...(opts.lazyRich ? { lazyRich: true } : {}) });
    entries.set(docName, entry);
    e = entry;
  }
  e.refs++;
  const entry = e;
  const provider = entry.provider;
  let released = false;
  return {
    provider,
    release() {
      if (released) return;
      released = true;
      if (entries.get(docName) !== entry) return;
      entry.refs--;
      if (entry.refs > 0) return;
      if (entry.closing || opts.park === false) {
        // 同一轮 React 卸载中，子编辑器仍需先归还其视图。
        queueMicrotask(() => {
          if (entries.get(docName) === entry && entry.refs === 0) destroy(docName);
        });
        return;
      }
      idle.push(docName);
      while (idle.length > MAX_CACHE) destroy(idle[0]!);
    },
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

/** 切换 Vault 等：销毁全部（含仍被引用的）provider，同时驱逐 editor-cache 里对应的编辑器。 */
export function resetProviderPool(): void {
  for (const name of entries.keys()) destroy(name); // Map 迭代中删除当前项是安全的
}

/** 最后一个文件标签离开后释放编辑表示，让尚在卸载的视图先结算编辑。 */
export function dropProvider(docName: string): void {
  const entry = entries.get(docName);
  if (!entry) return;
  if (entry.refs === 0) destroy(docName);
  else entry.closing = true;
}

export function __poolSize(): number {
  return entries.size;
}
