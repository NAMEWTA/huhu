// HUHU STUB（P-S2a-srv）：上游此处是 OTel / 日志 / 影子仓库等服务端基础设施；Huhu 本地宿主不需要，保留同名同签名的空实现。
export interface Logger { debug(...a: unknown[]): void; info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void }
const noop = (): void => {};
export function getLogger(_name: string): Logger { return { debug: noop, info: noop, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) }; }
