// 文档绑定登记表：LocalDocProvider 打开 docName 时向这里要原始文本（design §3.2）。
// 宿主组件（RichMarkdownEditor）在创建 provider 之前登记，卸载时注销；本包不依赖任何业务模块。
import { setDocSource } from './doc-source'

export interface DocBinding {
  /** 当前缓冲全文（Markdown 含 frontmatter） */
  read(): string
}

const bindings = new Map<string, DocBinding>()
let installed = false

function ensureInstalled(): void {
  if (installed) return
  installed = true
  setDocSource({
    read: async (docName) => {
      const b = bindings.get(docName)
      if (!b) throw new Error(`文档未登记：${docName}`)
      return b.read()
    },
  })
}

export function registerDocBinding(docName: string, binding: DocBinding): () => void {
  ensureInstalled()
  bindings.set(docName, binding)
  return () => {
    if (bindings.get(docName) === binding) bindings.delete(docName)
  }
}
