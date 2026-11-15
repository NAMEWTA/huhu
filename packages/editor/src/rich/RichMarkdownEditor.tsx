// RichMarkdownEditor：封装 vendor 的 TiptapEditor / SourceEditor（design §3.2 / §3.3 / §3.4）。
// 数据流：宿主传入 `value`（DocumentSession 的缓冲）→ LocalDocProvider 装载 Y.Doc（Y.Text('source') 为真源）；
// 编辑 → Y.Text 变化 → 防抖 300 ms → `onChange(全文)` 交给会话；会话把外部版本（载入 / 合并 / 恢复草稿）经 `value` 带回，
// 只有与“最近交给会话的文本”不同的 `value` 才会被当作外部变化，用 replaceRawBody 写回（不进撤销栈）。
// 无编辑 = Y.Text 不变 = 不触发 onChange = 不写盘（B10）。
import type { EditorPort } from '@huhu/contracts'
import { Component, type ErrorInfo, type ReactNode, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type * as Y from 'yjs'
import { getEditorForDoc, subscribeEditorRegistry } from '@/editor/active-editor'
import { getMarkdownSourceViewForDoc } from '@/editor/full-page-cm-views'
import { SourceEditor } from '@/editor/SourceEditor'
import { TiptapEditor } from '@/editor/TiptapEditor'
import { replaceRawBody } from '../vendor/open-knowledge/server-bridge/bridge-intake'
import { acquireProvider, releaseProvider } from '../host/provider-pool'
import { registerAtReference, type ReferenceCandidate } from './at-reference'
import { FILE_LOAD_ORIGIN } from '../host/doc-source'
import type { LocalDocProvider } from '../host/hocuspocus-provider'

export type EditorViewMode = 'rich' | 'source' | 'read'
export type EditorVariant = 'document' | 'compact'

/** EditorPort + 迁移期（S4 评论重做前）需要的源码偏移访问。偏移是源码字符位置，不得持久化。 */
export interface RichEditorPort extends EditorPort {
  /** 当前选区的源码偏移（源码模式精确；富文本模式按选中文本在源码里唯一匹配，找不到为 null） */
  getSourceSelection(): { from: number; to: number; text: string } | null
  setSourceSelection(from: number, to?: number): void
  /** 把源码偏移所在行设为光标（大纲跳转） */
  gotoLine(line: number): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}

export interface RichMarkdownEditorProps {
  /** 会话内唯一名（建议 `${vaultId}:${path}`） */
  docName: string
  value: string
  onChange(text: string): void
  mode?: EditorViewMode
  variant?: EditorVariant
  readOnly?: boolean
  placeholder?: string
  /** 字号（px）与正文可读宽度（px，null = 不限制）：来自笔记设置 */
  fontSize?: number
  contentWidth?: number | null
  /** `@` 引用候选（提供则启用 `@` 补全，插入 wikiLink 节点） */
  referenceSearch?: (query: string) => readonly ReferenceCandidate[]
  onPort?(port: RichEditorPort | null): void
  onError?(error: Error): void
  className?: string
}


class Boundary extends Component<{ onError?(e: Error): void; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error)
  }
  override render() {
    return this.state.error ? (
      <div role="alert" className="ok-editor-error">
        {this.state.error.message}
      </div>
    ) : (
      this.props.children
    )
  }
}

export function RichMarkdownEditor(props: RichMarkdownEditorProps) {
  const { docName, value, onChange, mode = 'rich', variant = 'document', readOnly = false, placeholder, onPort, className, fontSize, contentWidth, referenceSearch } = props
  const [provider, setProvider] = useState<LocalDocProvider | null>(null)
  // 滚动容器 / 内容挂载点：命令式创建（不归 React 管），由 TiptapEditor 的 chrome 搬进自己的 slot
  const [portal] = useState(() => {
    const el = document.createElement('div')
    el.style.display = 'contents' // OK 的栅格布局要求 portal 容器与 slot 两层都是 display:contents（globals.css .tiptap-editor-portal-content 注释）
    return el
  })
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastEmitted = useRef<string>(value)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queued = useRef(false)
  const ytextRef = useRef<Y.Text | null>(null)

  const emitNow = useCallback(() => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    const yt = ytextRef.current
    if (!yt) return
    const text = yt.toString()
    if (text === lastEmitted.current) return
    lastEmitted.current = text
    onChangeRef.current(text)
  }, [])

  // 创建 / 销毁 provider（每个 docName 一个；park 的编辑器 DOM 由 vendor 的 editor-cache 管）
  useEffect(() => {
    const pooled = acquireProvider(docName, () => valueRef.current)
    const p = pooled.provider
    let disposeObserve: (() => void) | null = null
    const onSynced = () => {
      if (disposeObserve) return
      const yt = p.document.getText('source')
      ytextRef.current = yt
      // 复用 park 住的 provider 时，Y.Doc 里可能是旧文本：以 Y.Doc 为准，随后由 value 副作用决定是否 replaceRawBody
      lastEmitted.current = yt.toString()
      const observer = (_e: Y.YTextEvent, tr: Y.Transaction) => {
        if (tr.origin === FILE_LOAD_ORIGIN) return
        // 同一事务批内合并为一次交付（微任务）：会话的文本始终与编辑器保持同步，退出前 flush 不依赖定时器
        if (queued.current) return
        queued.current = true
        queueMicrotask(() => {
          queued.current = false
          emitNow()
        })
      }
      yt.observe(observer)
      disposeObserve = () => yt.unobserve(observer)
      setProvider(p)
    }
    const cancelSync = pooled.whenSynced(onSynced)
    return () => {
      // 卸载前把还在防抖里的编辑交给会话（防止“输入后立刻关闭丢最后字符”）
      emitNow()
      cancelSync()
      disposeObserve?.()
      ytextRef.current = null
      setProvider(null)
      releaseProvider(docName) // provider 留在池里，直到 editor-cache 一起驱逐
    }
  }, [docName, emitNow])

  // layout 阶段先于宿主 passive 清理执行：保证 flush 先于会话释放
  useLayoutEffect(() => () => emitNow(), [emitNow])

  // 外部变化：value 与最近交给会话的文本不同 → replaceRawBody 写回（FILE_LOAD_ORIGIN：不进撤销栈、不触发 onChange）
  useEffect(() => {
    const yt = ytextRef.current
    if (!provider || !yt) return
    if (value === lastEmitted.current || value === yt.toString()) return
    provider.document.transact(() => {
      replaceRawBody(provider.document, value)
    }, FILE_LOAD_ORIGIN)
    lastEmitted.current = value
  }, [value, provider])

  // `@` 引用补全：编辑器出现（含 park 后重新出现）时注册，消失时注销
  const searchRef = useRef(referenceSearch)
  searchRef.current = referenceSearch
  const wantsReference = referenceSearch !== undefined
  useEffect(() => {
    if (!wantsReference) return
    let off: (() => void) | null = null
    let bound: Editor | null = null
    const sync = () => {
      const ed = getEditorForDoc(docName)
      if (ed === bound) return
      off?.()
      off = null
      bound = ed && !ed.isDestroyed ? ed : null
      if (bound) off = registerAtReference(bound, (q) => searchRef.current?.(q) ?? [])
    }
    sync()
    const unsub = subscribeEditorRegistry(sync)
    return () => {
      unsub()
      off?.()
    }
  }, [docName, wantsReference, provider])

  // 只读 / 阅读模式
  useEffect(() => {
    const apply = () => {
      const ed = getEditorForDoc(docName)
      if (ed && !ed.isDestroyed) {
        const editable = !(readOnly || mode === 'read')
        if (ed.isEditable !== editable) ed.setEditable(editable, false)
      }
    }
    apply()
    return subscribeEditorRegistry(apply)
  }, [docName, readOnly, mode, provider])

  // EditorPort
  useEffect(() => {
    if (!onPort) return
    if (!provider) {
      onPort(null)
      return
    }
    const tip = (): Editor | null => {
      const ed = getEditorForDoc(docName)
      return ed && !ed.isDestroyed ? ed : null
    }
    const cm = () => getMarkdownSourceViewForDoc(docName)
    const text = () => provider.document.getText('source').toString()
    const isRead = () => readOnly || mode === 'read'
    const port: RichEditorPort = {
      get readOnly() {
        return isRead()
      },
      focus() {
        if (mode === 'source') cm()?.focus()
        else tip()?.commands.focus()
      },
      getSelection() {
        if (mode === 'source') {
          const v = cm()
          if (!v) return null
          const r = v.state.selection.main
          return { text: v.state.sliceDoc(r.from, r.to), from: r.from, to: r.to }
        }
        const ed = tip()
        if (!ed) return null
        const { from, to } = ed.state.selection
        return { text: ed.state.doc.textBetween(from, to, '\n'), from, to }
      },
      getSourceSelection() {
        if (mode === 'source') {
          const v = cm()
          if (!v) return null
          const r = v.state.selection.main
          return { from: r.from, to: r.to, text: v.state.sliceDoc(r.from, r.to) }
        }
        const ed = tip()
        if (!ed) return null
        const { from, to } = ed.state.selection
        if (from === to) return null
        const quote = ed.state.doc.textBetween(from, to, '\n')
        const src = text()
        const i = quote ? src.indexOf(quote) : -1
        if (i < 0 || src.indexOf(quote, i + 1) >= 0) return null // 找不到或不唯一：不猜（S4 用 quote/prefix/suffix 重做）
        return { from: i, to: i + quote.length, text: quote }
      },
      setSourceSelection(from, to = from) {
        if (mode === 'source') {
          cm()?.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
          return
        }
        const ed = tip()
        if (!ed) return
        // 富文本里没有源码偏移：用选中文本反查（只用于迁移期的批注跳转）
        const q = text().slice(from, to)
        if (!q) return
        let hit: { from: number; to: number } | null = null
        ed.state.doc.descendants((node, pos) => {
          if (hit || !node.isText || !node.text) return
          const i = node.text.indexOf(q)
          if (i >= 0) hit = { from: pos + i, to: pos + i + q.length }
        })
        const h = hit as { from: number; to: number } | null
        if (h) ed.chain().focus().setTextSelection(h).scrollIntoView().run()
      },
      gotoLine(line) {
        const v = cm()
        if (mode === 'source' && v) {
          const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)))
          v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true })
          v.focus()
          return
        }
        const ed = tip()
        if (!ed) return
        const src = text().split('\n')
        const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(src[Math.max(0, line - 1)] ?? '')?.[1]
        if (!heading) return
        let pos: number | null = null
        ed.state.doc.descendants((node, p) => {
          if (pos === null && node.type.name === 'heading' && node.textContent.trim() === heading.trim()) pos = p
        })
        const target = pos as number | null
        if (target !== null) ed.chain().focus().setTextSelection(target + 1).scrollIntoView().run()
      },
      execute(command, args) {
        const ed = tip()
        if (!ed || isRead()) return false
        const fn = (ed.commands as unknown as Record<string, ((a?: unknown) => boolean) | undefined>)[command]
        return fn ? fn(args) : false
      },
      canExecute(command) {
        const ed = tip()
        if (!ed || isRead()) return false
        const fn = (ed.can() as unknown as Record<string, ((a?: unknown) => boolean) | undefined>)[command]
        return fn ? fn() : false
      },
      reveal(target) {
        if (target.line !== undefined) port.gotoLine(target.line)
        else if (target.heading) {
          const ed = tip()
          let pos: number | null = null
          ed?.state.doc.descendants((node, p) => {
            if (pos === null && node.type.name === 'heading' && node.textContent.trim() === target.heading) pos = p
          })
          const t = pos as number | null
          if (ed && t !== null) ed.chain().focus().setTextSelection(t + 1).scrollIntoView().run()
        }
      },
      getDraft: text,
      async flush() {
        emitNow()
      },
      undo() {
        if (mode === 'source') return void cm()?.focus()
        tip()?.commands.undo()
      },
      redo() {
        tip()?.commands.redo()
      },
      canUndo: () => tip()?.can().undo() ?? false,
      canRedo: () => tip()?.can().redo() ?? false,
    }
    onPort(port)
    return () => onPort(null)
  }, [provider, docName, mode, readOnly, onPort, emitNow])

  const showSource = mode === 'source'
  return (
    <div className={`editor-ok-surface editor-ok-${variant}${className ? ` ${className}` : ''}`} data-ok-editor data-mode={mode} style={{ height: '100%', minHeight: 0, position: 'relative', ...(fontSize ? { ['--editor-ok-font-size' as string]: `${fontSize}px` } : {}), ...(contentWidth === undefined ? {} : { ['--editor-ok-measure' as string]: contentWidth === null ? '100%' : `${contentWidth}px` }) }}>
      <Boundary {...(props.onError ? { onError: props.onError } : {})}>
        <Suspense fallback={null}>
          {provider ? (
            <>
              {/* 富文本 / 阅读：Tiptap（其 chrome 是 h-full，内容挂在滚动容器 portal 里）；源码模式整块隐藏 */}
              <div hidden={showSource} data-testid="editor-scroll-container" style={{ height: '100%', overflow: 'auto' }}>
                <TiptapEditor key={`t-${docName}`} provider={provider as never} isSourceMode={showSource} portalTarget={portal} {...(placeholder ? { placeholder } : {})} />
              </div>
              {showSource ? (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  <SourceEditor key={`s-${docName}`} docName={docName} ytext={provider.document.getText('source')} provider={provider as never} isSourceModeActive />
                </div>
              ) : null}
            </>
          ) : null}
        </Suspense>
      </Boundary>
    </div>
  )
}
