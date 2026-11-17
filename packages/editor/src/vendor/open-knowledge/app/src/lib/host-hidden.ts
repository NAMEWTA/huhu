// Huhu 宿主适配（P-S5-01）：上游“隐藏”写 .okignore，Huhu 要的是“仅文件树隐藏”（hiddenPaths 偏好，design §5.2）。
// 宿主在挂载树之前注册实现；未注册时树里的“隐藏”入口被禁用，不静默写 .okignore。
export interface HostHiddenPaths {
  /** 隐藏一个文件 / 目录（vault 相对路径，目录不带尾斜杠）。 */
  hide(path: string, kind: 'file' | 'folder'): void | Promise<void>
}

let impl: HostHiddenPaths | null = null

export function setHostHiddenPaths(next: HostHiddenPaths | null): void {
  impl = next
}

export function getHostHiddenPaths(): HostHiddenPaths | null {
  return impl
}

/** P-S5-04：宿主追加的菜单项（Huhu 的“移动到…”“星标”“保存版本…”等既有能力，design §8）。 */
export interface HostMenuItem {
  id: string
  label: string
  onSelect(): void
}

export interface HostMenuExtras {
  items(path: string, kind: 'file' | 'folder'): readonly HostMenuItem[]
}

let extras: HostMenuExtras | null = null

export function setHostMenuExtras(next: HostMenuExtras | null): void {
  extras = next
}

export function getHostMenuExtras(): HostMenuExtras | null {
  return extras
}
