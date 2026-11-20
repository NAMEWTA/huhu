import type { ComponentProps } from "react";
import { useCapability } from "@huhu/workbench";
import { useDocumentSession } from "../documents/useDocumentSession.js";
import { ArchiveView } from "./ArchivesViews.js";
import { a } from "./i18n.js";

type Props = Omit<ComponentProps<typeof ArchiveView>, "session" | "snapshot" | "autosave"> & {
  /** 与 Markdown 视图使用同一个 index.md 会话。 */
  indexPath: string;
};

export function ArchiveRecordView({ indexPath, ...rest }: Props) {
  const settings = useCapability<{ editor: { autosave: boolean } }>("settings.get", {});
  const autosave = settings.data?.editor.autosave !== false;
  const { session, snap } = useDocumentSession(indexPath, autosave);
  if (!session) return <p>{a.loading}</p>;
  return <ArchiveView {...rest} session={session} snapshot={snap} autosave={autosave} />;
}
