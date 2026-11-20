import { DocumentSession, type SessionOptions } from "./DocumentSession.js";

export interface SessionLease {
  readonly session: DocumentSession;
  /** 归还引用；最后一个引用归还时销毁会话（离开时落盘 / 留草稿）。重复调用无效。 */
  release(options?: { handoff: boolean }): Promise<void>;
}

interface Entry {
  session: DocumentSession;
  refs: number;
  parkedRefs: number;
  /** 离开编辑面时先结算，后续打开等待同一路径的结算完成。 */
  settling: Promise<void> | null;
  teardown: () => void;
}

/**
 * 按 `(vaultId, path)` 登记并引用计数，生命周期长于组件：同一文件的多个标签 / park 中的编辑器共用一个会话（OP-D03）。
 * `epoch` 每次新建递增（切 Vault / 重新打开），迟到结果据此丢弃。
 */
export class DocumentSessionRegistry {
  private readonly map = new Map<string, Entry>();
  private epoch = 0;

  private static key(vaultId: string, path: string): string {
    return `${vaultId}\u0000${path}`;
  }

  private settle(key: string, entry: Entry): Promise<void> {
    const dispose = entry.refs === 0;
    entry.settling = (async () => {
      try {
        if (dispose) {
          await entry.session.dispose();
          if (this.map.get(key) === entry) this.map.delete(key);
          entry.teardown();
        } else {
          await entry.session.flushForExit();
          await entry.session.reopenDraft();
        }
      } finally {
        entry.settling = null;
      }
    })();
    return entry.settling;
  }

  private async release(key: string, entry: Entry): Promise<void> {
    if (--entry.refs > entry.parkedRefs) return;
    if (entry.settling) await entry.settling;
    if (this.map.get(key) === entry && entry.refs <= entry.parkedRefs) {
      await (entry.settling ?? this.settle(key, entry));
    }
  }

  /** 编辑表示停放时持有自己的引用，直到 provider 被驱逐。 */
  retainForPark(session: DocumentSession): () => Promise<void> {
    const key = DocumentSessionRegistry.key(session.id.vaultId, session.id.path);
    const entry = this.map.get(key);
    if (!entry || entry.session !== session || entry.settling) throw new Error("无法停放未挂载的文档会话");
    entry.refs++;
    entry.parkedRefs++;
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      entry.parkedRefs--;
      await this.release(key, entry);
    };
  }

  /**
   * 取得会话的一个引用；不存在则用 `make` 创建。
   * `bind` 在会话创建时调用一次，返回会话销毁时的清理函数（注册退出 flush / 未保存文档等）。
   */
  async acquire(vaultId: string, path: string, make: (id: SessionOptions["id"]) => DocumentSession, bind?: (s: DocumentSession) => () => void): Promise<SessionLease> {
    const key = DocumentSessionRegistry.key(vaultId, path);
    for (let pending = this.map.get(key)?.settling; pending; pending = this.map.get(key)?.settling) {
      await pending.catch(() => undefined); // 失败时重开同一个可重试的会话
    }
    let e = this.map.get(key);
    if (!e) {
      const session = make({ vaultId, path, epoch: ++this.epoch });
      e = { session, refs: 0, parkedRefs: 0, settling: null, teardown: bind?.(session) ?? (() => undefined) };
      this.map.set(key, e);
    }
    e.refs++;
    const entry = e;
    let released = false;
    return {
      session: entry.session,
      release: async (options) => {
        if (released) return;
        released = true;
        // 同一次 React 提交中卸载旧视图、挂载同一文件的新视图时保留会话。
        if (options?.handoff) await Promise.resolve();
        await this.release(key, entry);
      },
    };
  }

  /** Resolve all live buffers covered by a file operation before it changes their paths. */
  async flushPaths(vaultId: string, paths: readonly string[]): Promise<boolean> {
    const targets = [...this.map.entries()].filter(([, { session }]) => session.id.vaultId === vaultId && paths.some((path) => session.id.path === path || session.id.path.startsWith(`${path}/`)));
    const results = await Promise.allSettled(
      targets.map(async ([key, entry]) => {
        await entry.settling?.catch(() => undefined);
        if (this.map.get(key) !== entry) return true;
        if (!(await entry.session.flush())) return false;
        if (entry.refs === 0) await (entry.settling ?? this.settle(key, entry));
        return true;
      }),
    );
    return results.every((result) => result.status === "fulfilled" && result.value);
  }

  /** 当前活动会话数（测试 / 诊断）。 */
  get size(): number {
    return this.map.size;
  }

  get(vaultId: string, path: string): DocumentSession | undefined {
    return this.map.get(DocumentSessionRegistry.key(vaultId, path))?.session;
  }

  /** 引用计数（测试 / 诊断）。 */
  refs(vaultId: string, path: string): number {
    return this.map.get(DocumentSessionRegistry.key(vaultId, path))?.refs ?? 0;
  }
}
