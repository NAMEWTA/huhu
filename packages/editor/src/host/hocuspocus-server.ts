// 类型替身：vendor 的 observers / server-bridge 只用到 Hocuspocus 的 LocalTransactionOrigin 类型。
// 本地宿主没有 Hocuspocus 服务端，这里按上游形状声明（tsconfig / vite 别名 `@hocuspocus/server` → 本文件）。
export interface LocalTransactionOrigin {
  readonly source: 'local'
  readonly skipStoreHooks?: boolean
  readonly context?: Record<string, unknown>
}
