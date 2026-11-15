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
