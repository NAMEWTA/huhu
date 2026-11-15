// HUHU STUB（P-S2a-srv）
export function withSpanSync<T>(_name: string, _opts: unknown, fn: (span: { setAttributes(a: Record<string, unknown>): void; setAttribute(k: string, v: unknown): void }) => T): T {
  return fn({ setAttributes() {}, setAttribute() {} });
}
export function setActiveSpanAttributes(_attrs: Record<string, unknown>): void {}
