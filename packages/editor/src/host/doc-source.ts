// 文档源：LocalDocProvider 打开文档时向宿主要原始文本（Markdown 含 frontmatter）。
// 宿主（plugins/notes 的 DocumentSession，S1/S2b）通过 setDocSource 注入；本包不依赖任何业务模块。
export interface DocSource {
  /** 返回 docName 对应文件的当前缓冲全文 */
  read(docName: string): Promise<string>
}

/** 装载写入使用的事务来源：对象引用（OK 约定，按引用判断），不进撤销栈。 */
export const FILE_LOAD_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'file-watcher' },
} as const

let source: DocSource | null = null

export function setDocSource(next: DocSource | null): void {
  source = next
}

export function getDocSource(): DocSource {
  if (!source) throw new Error('DocSource 未注册：宿主必须先调用 setDocSource()')
  return source
}
