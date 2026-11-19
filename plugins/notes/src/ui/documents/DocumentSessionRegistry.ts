import { DocumentSession, type SessionOptions } from "./DocumentSession.js";

export interface SessionLease {
  readonly session: DocumentSession;
  /** 归还引用；最后一个引用归还时销毁会话（离开时落盘 / 留草稿）。重复调用无效。 */
  release(options?: { handoff: boolean }): Promise<void>;
}

interface Entry {
  session: DocumentSession;
  refs: number;
  /** 销毁中的会话在完成前不可被复用，避免新旧会话同时写同一文件。 */
  disposing: Promise<void> | null;
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

  /**
   * 取得会话的一个引用；不存在则用 `make` 创建。
   * `bind` 在会话创建时调用一次，返回会话销毁时的清理函数（注册退出 flush / 未保存文档等）。
   */
  async acquire(vaultId: string, path: string, make: (id: SessionOptions["id"]) => DocumentSession, bind?: (s: DocumentSession) => () => void): Promise<SessionLease> {
    const key = DocumentSessionRegistry.key(vaultId, path);
    const pending = this.map.get(key)?.disposing;
    if (pending) await pending.catch(() => undefined); // 等旧会话把未保存内容写完
    let e = this.map.get(key);
    if (!e) {
      const session = make({ vaultId, path, epoch: ++this.epoch });
      e = { session, refs: 0, disposing: null, teardown: bind?.(session) ?? (() => undefined) };
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
        if (--entry.refs > 0) return;
        entry.disposing = (async () => {
          try {
            await entry.session.dispose();
          } finally {
            entry.teardown();
            if (this.map.get(key) === entry) this.map.delete(key);
          }
        })();
        await entry.disposing;
      },
    };
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
