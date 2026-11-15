import { IconButton } from "@huhu/ui";
import { FileText, Plus, X } from "lucide-react";
import { folderName, archiveNoteRoute } from "../archives/route.js";

export interface TabStripProps {
  tabs: readonly string[];
  selected: string | null;
  onOpen(path: string): void;
  onClose(path: string): void;
  onNew(): void;
}

/** 打开的文档标签条（从 NotesModule 拆出，行为不变；S6 起改为 DocTab 联合标签）。 */
export function TabStrip({ tabs, selected, onOpen, onClose, onNew }: TabStripProps) {
  return (
    <nav className="hu-knowledge-document-tabs" aria-label="打开的文档" data-testid="document-tabs">
      {tabs.map((p) => {
        const name = archiveNoteRoute(p) ? folderName(p.replace(/\/index\.md$/i, "")) : (p.split("/").at(-1) ?? p).replace(/\.md$/i, "");
        return (
          <div key={p} className={`notes-document-tab${p === selected ? " active" : ""}`}>
            <button type="button" aria-current={p === selected ? "true" : undefined} title={p} data-testid="document-tab" onClick={() => onOpen(p)}>
              <FileText size={14} aria-hidden />
              <span>{name}</span>
            </button>
            <button type="button" title={`关闭 ${name}`} aria-label={`关闭 ${name}`} onClick={() => onClose(p)}>
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
      <IconButton icon={Plus} label="在新标签新建笔记" onClick={onNew} />
    </nav>
  );
}
