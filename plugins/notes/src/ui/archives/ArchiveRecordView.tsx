import type { ComponentProps } from "react";
import { useCallback } from "react";
import { useDocumentSession } from "../documents/useDocumentSession.js";
import { ArchiveView } from "./ArchivesViews.js";
import { a } from "./i18n.js";

type Props = Omit<ComponentProps<typeof ArchiveView>, "beforeWrite"> & {
  /** `Archives/<类型>/<名称>/index.md`：与 Markdown 视图是同一个文件。 */
  indexPath: string;
};

/**
 * 档案记录标签的内容（E04）：档案视图与同一 `index.md` 的 Markdown 视图共用 **同一个 `DocumentSession`**
 * （会话登记表按 `(vaultId, path)` 引用计数）。
 * - 持有会话的一个引用，所以 Markdown 标签里的未保存编辑不会因另一个视图而丢失或被磁盘版本覆盖；
 * - 档案视图改字段（`archives.update`）之前先 `flush()`，写盘后的外部变更事件让会话接受磁盘版本；
 * - 删除 / 改名后两边一致由路径事件（`vault.fileChanged`）与标签 `prune` / 替换完成，没有第二份记录。
 */
export function ArchiveRecordView({ indexPath, ...rest }: Props) {
  const { session } = useDocumentSession(indexPath, true);
  const beforeWrite = useCallback(async () => (session ? session.flush() : false), [session]);
  if (!session) return <p>{a.loading}</p>;
  return <ArchiveView {...rest} beforeWrite={beforeWrite} />;
}
