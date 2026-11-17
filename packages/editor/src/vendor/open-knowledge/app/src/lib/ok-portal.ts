// Huhu 宿主适配（P-S5-05）：Radix 的 Portal 默认挂到 document.body，在 body 上没有 `.ok-root`，
// 作用域化的 Tailwind 工具类与 OK 变量全部失效（菜单宽度为 0、无背景）。统一把所有 OK 浮层挂到一个 `.ok-root` 容器。
export function getOkPortalContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  let el = document.getElementById('ok-portal-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'ok-portal-root'
    el.className = 'ok-root'
    el.style.display = 'contents'
    document.body.appendChild(el)
  }
  return el
}
