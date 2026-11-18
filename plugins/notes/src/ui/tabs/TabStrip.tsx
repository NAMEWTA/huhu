import type { DocTab } from "@huhu/contracts";
import { FileIcon, IconButton } from "@huhu/ui";
import { Archive, Folder, Plus, X } from "lucide-react";
import { a } from "../archives/i18n.js";
import { tabFilePath, tabKey } from "./docTabs.js";

export interface TabStripProps {
  tabs: readonly DocTab[];
  activeKey: string | null;
  onFocus(key: string): void;
  onClose(key: string): void;
  onNew(): void;
}

/** 标签的显示名与悬停提示（档案三类标签是真实标签，不再借用文件路径）。 */
export function tabLabel(tab: DocTab): { name: string; title: string } {
  switch (tab.kind) {
    case "file": {
      const name = (tab.path.split("/").at(-1) ?? tab.path).replace(/\.md$/i, "");
      return { name, title: tab.path };
    }
    case "archives-home":
      return { name: a.homeTitle, title: "Archives/" };
    case "archive-type":
      return { name: tab.type, title: `Archives/${tab.type}/` };
    case "archive-record":
      return { name: tab.name, title: tabFilePath(tab) ?? tab.name };
  }
}

/** 打开的文档标签条：渲染 `DocTab` 联合标签（文件 + 档案首页 / 类型 / 记录）。 */
export function TabStrip({ tabs, activeKey, onFocus, onClose, onNew }: TabStripProps) {
  return (
    <nav className="hu-knowledge-document-tabs" aria-label="打开的文档" data-testid="document-tabs">
      {tabs.map((tab) => {
        const key = tabKey(tab);
        const { name, title } = tabLabel(tab);
        const active = key === activeKey;
        return (
          <div key={key} className={`notes-document-tab${active ? " active" : ""}`} data-tab-kind={tab.kind}>
            <button type="button" aria-current={active ? "true" : undefined} title={title} data-testid="document-tab" onClick={() => onFocus(key)}>
              {tab.kind === "file" ? <FileIcon name={tab.path} size={14} /> : tab.kind === "archives-home" ? <Archive size={14} aria-hidden /> : <Folder size={14} aria-hidden />}
              <span>{name}</span>
            </button>
            <button type="button" title={`关闭 ${name}`} aria-label={`关闭 ${name}`} onClick={() => onClose(key)}>
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
      <IconButton icon={Plus} label="在新标签新建笔记" onClick={onNew} />
    </nav>
  );
}
