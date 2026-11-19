/** 退出前需要落盘的东西（编辑器里防抖中的内容等）：模块注册，Main 请求时统一执行。 */
const flushers = new Set<() => Promise<void>>();

export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export async function runFlushers(): Promise<void> {
  const results = await Promise.allSettled([...flushers].map(async (flush) => flush()));
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
  if (failures.length) {
    const error = new AggregateError(failures, "退出前保存失败");
    // 回执将失败传回桌面端，让用户保留窗口并重试。
    console.error(error);
    throw error;
  }
}

/** 有未保存修改的文档（切换 / 关闭 Vault 前列给用户选择：保存，或保留为草稿）。 */
export interface DirtyDoc {
  label: string;
  drain(): Promise<void>;
  isDirty(): boolean;
  /** 写入文件；返回是否成功。 */
  save(): Promise<boolean>;
  /** 只保留为草稿，不改文件。 */
  keepDraft(): Promise<void>;
}
const dirtyDocs = new Set<DirtyDoc>();

export function registerDirtyDoc(doc: DirtyDoc): () => void {
  dirtyDocs.add(doc);
  return () => dirtyDocs.delete(doc);
}

export async function collectDirtyDocs(): Promise<DirtyDoc[]> {
  await Promise.all([...dirtyDocs].map((doc) => doc.drain()));
  return [...dirtyDocs].filter((doc) => doc.isDirty());
}

/** 按用户选择处理全部未保存文档；保存失败的改存草稿。返回仍然没能保住内容的文档名（保存与草稿都失败）。 */
export async function settleDirtyDocs(mode: "save" | "draft"): Promise<string[]> {
  const lost: string[] = [];
  await Promise.all(
    (await collectDirtyDocs()).map(async (d) => {
      if (mode === "save" && (await d.save().catch(() => false))) return;
      await d.keepDraft().catch(() => lost.push(d.label));
    }),
  );
  return lost;
}
