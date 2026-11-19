import type { DocTab } from "@huhu/contracts";
import { FileIcon, IconButton } from "@huhu/ui";
import { Archive, Folder, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { a } from "../archives/i18n.js";
import { tabFilePath, tabKey } from "./docTabs.js";
import { TabContextMenu, type TabMenuAnchor } from "./TabContextMenu.js";

export interface TabStripProps {
  tabs: readonly DocTab[];
  activeKey: string | null;
  onFocus(key: string): void;
  onClose(key: string): void;
  onCloseMany(keys: readonly string[]): void;
  onCopyPath(path: string): void;
  onRevealPath(path: string): void;
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
export function TabStrip({ tabs, activeKey, onFocus, onClose, onCloseMany, onCopyPath, onRevealPath, onNew }: TabStripProps) {
  const [menu, setMenu] = useState<(TabMenuAnchor & { key: string }) | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const index = tabs.findIndex((tab) => tabKey(tab) === menu?.key);
  const target = tabs[index];
  const targetPath = target && tabLabel(target).title;
  const revealPath = target && tabFilePath(target);
  const other = tabs.filter((tab) => tabKey(tab) !== menu?.key).map(tabKey);
  const right = tabs.slice(index + 1).map(tabKey);
  return (
    <nav className="hu-knowledge-document-tabs" aria-label="打开的文档" data-testid="document-tabs">
      {tabs.map((tab) => {
        const key = tabKey(tab);
        const { name, title } = tabLabel(tab);
        const active = key === activeKey;
        return (
          <div key={key} className={`notes-document-tab${active ? " active" : ""}`} data-tab-kind={tab.kind}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              aria-haspopup="menu"
              aria-expanded={menu?.key === key}
              title={title}
              data-testid="document-tab"
              onClick={() => onFocus(key)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ key, trigger: event.currentTarget, x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                setMenu({ key, trigger: event.currentTarget, x: bounds.left, y: bounds.bottom });
              }}
            >
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
      {menu && target && targetPath ? (
        <TabContextMenu
          anchor={menu}
          title={tabLabel(target).name}
          onClose={closeMenu}
          actions={[
            { label: "关闭", run: () => onCloseMany([menu.key]) },
            { label: "关闭其他", disabled: !other.length, run: () => onCloseMany(other) },
            { label: "关闭右侧", disabled: !right.length, run: () => onCloseMany(right) },
            { label: "复制路径", run: () => onCopyPath(targetPath) },
            { label: "在文件树中显示", disabled: !revealPath, run: () => revealPath && onRevealPath(revealPath) },
          ]}
        />
      ) : null}
    </nav>
  );
}
