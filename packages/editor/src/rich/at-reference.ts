// `@` 引用补全（宿主侧，不改 vendor）：输入 `@` 弹出 Vault 文件 / 文件夹候选，选中后插入 OK 的 wikiLink 节点
// （序列化为 `[[相对路径]]`，文件写完整相对路径含扩展名，文件夹以 `/` 结尾）。候选与打分由宿主提供（tasks 的 useReferenceIndex）。
// 经 `editor.registerPlugin` 注册，随编辑器销毁 / 组件卸载注销；S5 把候选源换成共享的资源适配层。
import type { Editor } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'

export interface ReferenceCandidate {
  path: string
  kind: 'file' | 'folder'
}

const key = new PluginKey('huhuAtReference')

export function registerAtReference(editor: Editor, search: (query: string) => readonly ReferenceCandidate[]): () => void {
  let menu: HTMLDivElement | null = null
  let items: ReferenceCandidate[] = []
  let index = 0
  let apply: ((c: ReferenceCandidate) => void) | null = null

  const paint = () => {
    if (!menu) return
    menu.replaceChildren()
    items.forEach((c, i) => {
      const row = document.createElement('div')
      row.className = `editor-ref-item${i === index ? ' is-active' : ''}`
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', String(i === index))
      row.textContent = c.path
      const tag = document.createElement('span')
      tag.className = 'editor-ref-kind'
      tag.textContent = c.kind === 'folder' ? '文件夹' : '文件'
      row.append(tag)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        apply?.(c)
      })
      menu?.append(row)
    })
  }
  const place = (rect: DOMRect | null) => {
    if (!menu || !rect) return
    menu.style.left = `${Math.round(rect.left)}px`
    menu.style.top = `${Math.round(rect.bottom + 4)}px`
  }
  const close = () => {
    menu?.remove()
    menu = null
    apply = null
  }

  const plugin = Suggestion<ReferenceCandidate>({
    editor,
    pluginKey: key,
    char: '@',
    allowedPrefixes: [' ', '\n', '，', '。'],
    items: ({ query }) => [...search(query)],
    command: ({ editor: ed, range, props }) => {
      ed.chain().focus().deleteRange(range).insertContent({ type: 'wikiLink', attrs: { target: props.path, alias: null, anchor: null } }).run()
    },
    render: () => ({
      onStart: (p: SuggestionProps<ReferenceCandidate>) => {
        menu = document.createElement('div')
        menu.className = 'editor-ref-menu'
        menu.setAttribute('role', 'listbox')
        menu.setAttribute('data-testid', 'editor-ref-menu')
        // 挂在最近的 .ok-root 里：OK 的样式 / 变量只在那里生效
        ;(editor.view.dom.closest('.ok-root') ?? document.body).append(menu)
        items = p.items
        index = 0
        apply = (c) => p.command(c)
        paint()
        place(p.clientRect?.() ?? null)
      },
      onUpdate: (p: SuggestionProps<ReferenceCandidate>) => {
        items = p.items
        index = Math.min(index, Math.max(0, items.length - 1))
        apply = (c) => p.command(c)
        paint()
        place(p.clientRect?.() ?? null)
      },
      onKeyDown: (p: SuggestionKeyDownProps) => {
        if (!menu || items.length === 0) return false
        if (p.event.key === 'ArrowDown') {
          index = (index + 1) % items.length
          paint()
          return true
        }
        if (p.event.key === 'ArrowUp') {
          index = (index - 1 + items.length) % items.length
          paint()
          return true
        }
        if (p.event.key === 'Enter' || p.event.key === 'Tab') {
          const c = items[index]
          if (c) apply?.(c)
          return true
        }
        if (p.event.key === 'Escape') {
          close()
          return true
        }
        return false
      },
      onExit: close,
    }),
  })
  // 放在最前：Enter / 方向键要先给候选菜单，再轮到 StarterKit 的键位
  editor.registerPlugin(plugin, (added, existing) => [added, ...existing])
  return () => {
    close()
    if (!editor.isDestroyed) editor.unregisterPlugin(key)
  }
}
