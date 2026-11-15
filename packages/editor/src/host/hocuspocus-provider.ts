// LocalDocProvider：在本机取代 HocuspocusProvider（OP-D02）。
// vendor 里所有 `import … from '@hocuspocus/provider'` 经别名落到本文件；`HocuspocusProvider` 是同一个类的别名。
//
// 职责：持有一个 Y.Doc（Y.Text('source') 为真源，Y.XmlFragment('default') 为 ProseMirror 视图），
// 打开时从宿主的文档源读入 → 解析 → 写入两份表示 → 挂上 OK 的 server-observers（本地跨 CRDT 桥）→ 触发 'synced'。
// 没有网络、没有 awareness 远端；`forceSync` 为空操作。保存由宿主 DocumentSession 负责（见 doc-source.ts）。
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { schema, mdManager } from '../vendor/open-knowledge/server-bridge/md-manager.ts'
import { composeAndWriteRawBody } from '../vendor/open-knowledge/server-bridge/bridge-intake.ts'
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
  private disposeObservers: (() => void) | null = null

  constructor(config: LocalDocProviderConfig) {
    this.document = config.document ?? new Y.Doc()
    this.configuration = { name: config.name, ...(config.url !== undefined ? { url: config.url } : {}) }
    this.awareness = new Awareness(this.document)
    void this.hydrate()
  }

  private async hydrate(): Promise<void> {
    try {
      const text = await getDocSource().read(this.configuration.name)
      if (this.destroyed) return
      this.document.transact(() => {
        composeAndWriteRawBody(this.document, text, 'file-watcher')
      }, FILE_LOAD_ORIGIN)
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
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args)
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
