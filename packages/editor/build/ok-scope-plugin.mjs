// PostCSS 插件：把 OK（Tailwind v4）产出的样式限定到 `.ok-root`，并放进 Huhu 的 vendor.ok-* 子层。
// 只处理 ok-globals.css 一个文件；对其它 CSS 零影响（decisions OP-D05 / design §12）。
//  - `:root` / `:host` / `html` / `body` → `.ok-root`（OK 的变量、字体、背景只落在 .ok-root 上）
//  - 裸 `*` / `*::before` 选择器 → `.ok-root *`（不做全局 preflight）
//  - 顶层非 @layer 的规则（OK 手写样式，上游是无层的、因此压过 Tailwind 的 layer）→ 包进 `@layer vendor.ok-rules`
//  - `html.dark` 之类的 `html.xxx` → `.ok-root.xxx`
const TARGET = /ok-globals\.css$/

function scopeSelector(sel) {
  const s = sel.trim()
  if (s === ':root' || s === ':host' || s === 'html' || s === 'body' || s === ':root, :host') return '.ok-root'
  if (s === '::backdrop') return s // 伪元素无法按祖先限定；只声明 --tw-* 初值，对非 OK 的 top-layer 无可见影响
  if (s === '*' || /^\*?::?(before|after)$/.test(s)) return `.ok-root ${s.startsWith('*') ? s : '*' + (s.startsWith('::') ? s : ':' + s)}`
  if (/^html\s/.test(s)) return s.replace(/^html/, '.ok-root')
  if (/^html[.:[]/.test(s)) return s.replace(/^html/, '.ok-root')
  if (/^body[.:[\s]/.test(s)) return s.replace(/^body/, '.ok-root')
  return s
}

export default function okScopePlugin() {
  return {
    postcssPlugin: 'huhu-ok-scope',
    Once(root, { AtRule }) {
      const file = root.source?.input?.file ?? ''
      if (!TARGET.test(file)) return
      root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith("keyframes")) return
        rule.selectors = rule.selectors.map(scopeSelector)
      })
      const wrap = new AtRule({ name: 'layer', params: 'vendor.ok-rules' })
      const movable = []
      for (const node of root.nodes) {
        if (node.type === 'rule') movable.push(node)
        else if (node.type === 'atrule' && ['media', 'supports', 'container'].includes(node.name)) movable.push(node)
      }
      for (const node of movable) wrap.append(node)
      root.append(wrap)
    },
  }
}
okScopePlugin.postcss = true
