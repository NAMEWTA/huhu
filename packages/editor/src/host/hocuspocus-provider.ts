// LocalDocProvider：在本机取代 HocuspocusProvider（OP-D02）。
// vendor 里所有 `import … from '@hocuspocus/provider'` 经别名落到本文件；`HocuspocusProvider` 是同一个类的别名。
//
// 职责：持有一个 Y.Doc（Y.Text('source') 为真源，Y.XmlFragment('default') 为 ProseMirror 视图），
// 打开时从宿主的文档源读入 → 解析 → 写入两份表示 → 挂上 OK 的 server-observers（本地跨 CRDT 桥）→ 触发 'synced'。
// 没有网络、没有 awareness 远端；`forceSync` 为空操作。保存由宿主 DocumentSession 负责（见 doc-source.ts）。
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { schema, mdManager } from '../vendor/open-knowledge/server-bridge/md-manager.ts'
import { composeAndWriteRawBody, deriveFragmentFromYtext } from '../vendor/open-knowledge/server-bridge/bridge-intake.ts'
import { setupServerObservers } from '../vendor/open-knowledge/server-bridge/server-observers.ts'
import { getDocSource, FILE_LOAD_ORIGIN } from './doc-source'

export interface onCloseParameters {
  event: { code?: number; reason?: string }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void

export interface LocalDocProviderConfig {
  name: string
  /** 兼容上游构造参数，本地忽略 */
  url?: string
  document?: Y.Doc
  token?: unknown
  /** P-S3：以源码模式打开时只装载 Y.Text('source')，富文本表示（解析 + Y.XmlFragment + 桥观察者）延后到 ensureRich()。 */
  lazyRich?: boolean
}

export class LocalDocProvider {
  readonly document: Y.Doc
  readonly configuration: { name: string; url?: string }
  readonly awareness: Awareness
  synced = false
  unsyncedChanges = 0
  isSynced = false
  status: 'connected' | 'disconnected' = 'connected'
  private readonly listeners = new Map<string, Set<Listener>>()
  private destroyed = false
  private disposeObservers: ((() => void) & { settleNow(): void }) | null = null
  private rich: boolean
  private richPromise: Promise<void> | null = null

  constructor(config: LocalDocProviderConfig) {
    this.document = config.document ?? new Y.Doc()
    this.configuration = { name: config.name, ...(config.url !== undefined ? { url: config.url } : {}) }
    this.awareness = new Awareness(this.document)
    this.rich = !config.lazyRich
    void this.hydrate()
  }

  /** 立即结算被推迟的桥（P-S3-02）：所有读取 Y.Text 的出口（flush / 切模式 / 卸载）先调用 */
  settleNow(): void {
    this.disposeObservers?.settleNow()
  }

  /** 富文本表示是否已就绪（源码优先打开的文档在 ensureRich() 之前为 false） */
  get richReady(): boolean {
    return this.rich
  }

  private installObservers(): void {
    this.disposeObservers = setupServerObservers({
      doc: this.document,
      xmlFragment: this.document.getXmlFragment('default'),
      ytext: this.document.getText('source'),
      mdManager,
      schema,
      docName: this.configuration.name,
      deferGuardEnabled: false,
      lossDetectorEnabled: false,
      fixedPointBackstopEnabled: false,
      preDrainEnabled: false,
    })
  }

  /**
   * 构建富文本表示：从当前 Y.Text 推导 Y.XmlFragment 并挂上桥观察者。
   * 先让出一次事件循环，使“加载中”状态能先绘制；幂等，并发调用共享同一个 Promise。
   */
  ensureRich(): Promise<void> {
    if (this.rich) return Promise.resolve()
    this.richPromise ??= new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        try {
          if (this.destroyed) return resolve()
          this.document.transact(() => deriveFragmentFromYtext(this.document), FILE_LOAD_ORIGIN)
          this.installObservers()
          this.rich = true
          resolve()
        } catch (err) {
          this.richPromise = null
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }, 0)
    })
    return this.richPromise
  }

  private async hydrate(): Promise<void> {
    try {
      const text = await getDocSource().read(this.configuration.name)
      if (this.destroyed) return
      if (this.rich) {
        this.document.transact(() => {
          composeAndWriteRawBody(this.document, text, 'file-watcher')
        }, FILE_LOAD_ORIGIN)
        this.installObservers()
      } else {
        // 源码优先：只写真源 Y.Text（O(n) 字符串插入），不解析
        this.document.transact(() => {
          const yt = this.document.getText('source')
          if (yt.length > 0) yt.delete(0, yt.length)
          yt.insert(0, text)
        }, FILE_LOAD_ORIGIN)
      }
      this.synced = true
      this.isSynced = true
      this.emit('synced', { state: true })
    } catch (err) {
      this.emit('authenticationFailed', { reason: err instanceof Error ? err.message : String(err) })
    }
  }

  on(event: string, fn: Listener): this {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(fn)
    // 订阅 'synced' 时若已同步则补发一次，行为与 Hocuspocus 的 once-synced 使用习惯一致
    if (event === 'synced' && this.synced) queueMicrotask(() => fn({ state: true }))
    return this
  }

  off(event: string, fn: Listener): this {
    this.listeners.get(event)?.delete(fn)
    return this
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const fn of Array.from(this.listeners.get(event) ?? [])) fn(...args)
  }

  forceSync(): void {}
  connect(): Promise<void> {
    this.status = 'connected'
    return Promise.resolve()
  }
  disconnect(): void {
    this.status = 'disconnected'
    this.emit('disconnect', { event: { code: 1000 } })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.disposeObservers?.()
    this.disposeObservers = null
    this.awareness.destroy()
    this.emit('destroy')
    this.listeners.clear()
  }
}

export { LocalDocProvider as HocuspocusProvider }
