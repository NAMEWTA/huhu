import type { ArchiveDto, ArchiveTypeDto } from "@huhu/contracts";
import { EmptyState } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { Archive, ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { archiveIcon } from "./icons.js";
import { a } from "./i18n.js";
import { folderName } from "./route.js";

export interface ArchivesSidebarProps {
  /** 展开的类型：`Archives/<类型>`（无结尾斜杠，与 `ArchivesState.expanded` 同键）。 */
  expanded: readonly string[];
  /** 当前选中：`Archives` / `Archives/<类型>` / `Archives/<类型>/<名称>`。 */
  selected: string | null;
  onToggle(key: string): void;
  onOpenHome(): void;
  onOpenType(typePath: string): void;
  onOpenArchive(archivePath: string): void;
}

/** 某类型下的档案列表（仅在类型展开时查询）。 */
function TypeRecords({ type, selected, onOpenArchive }: { type: ArchiveTypeDto; selected: string | null; onOpenArchive(path: string): void }) {
  const rows = useCapability<ArchiveDto[]>("archives.list", { type: type.path });
  const list = rows.data ?? [];
  if (list.length === 0)
    return (
      <p className="notes-tree-empty" style={{ paddingLeft: 48 }}>
        {rows.isLoading ? a.loading : a.noArchives}
      </p>
    );
  return (
    <div role="group">
      {list.map((r) => {
        const key = r.path.replace(/\/+$/, "");
        return (
          <div key={r.path} className={`hu-knowledge-tree-line${selected === key ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: 2 }}>
            <button type="button" className="notes-tree-item" aria-current={selected === key ? "true" : undefined} data-testid="archives-tree-record" onClick={() => onOpenArchive(r.path)}>
              <FileText size={14} aria-hidden />
              <span className="notes-tree-label">{r.name}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 档案上下文的侧栏树（S6，E02）：档案 → 类型 → 档案记录。
 * 只是 `archives.*` 的另一种投影：点击打开真实标签（首页 / 类型 / 记录），不引入新的存储。
 */
export function ArchivesSidebar(p: ArchivesSidebarProps) {
  const types = useCapability<ArchiveTypeDto[]>("archives.types.list", {});
  const list = types.data ?? [];
  const selectedRoot = p.selected === "Archives";
  return (
    <div data-testid="archives-sidebar">
      <div className={`hu-knowledge-tree-line${selectedRoot ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: 0 }}>
        <button type="button" className="notes-tree-item" aria-current={selectedRoot ? "true" : undefined} data-testid="archives-tree-home" onClick={p.onOpenHome}>
          <Archive size={15} aria-hidden />
          <span className="notes-tree-label">{a.homeTitle}</span>
          <small>{list.length}</small>
        </button>
      </div>
      {list.length === 0 && !types.isLoading ? <EmptyState icon={Folder} title={a.noTypes} /> : null}
      {list.map((t) => {
        const key = t.path.replace(/\/+$/, "");
        const open = p.expanded.includes(key);
        const Icon = archiveIcon(t.icon);
        return (
          <div key={t.path} className="knowledge-tree-folder">
            <div className={`hu-knowledge-tree-line notes-folder-line${p.selected === key ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: 1 }}>
              <button type="button" className="notes-tree-chevron" aria-label={`${open ? "折叠" : "展开"} ${t.name}`} aria-expanded={open} data-testid="archives-tree-toggle" onClick={() => p.onToggle(key)}>
                {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
              </button>
              <button type="button" className="notes-tree-item" aria-current={p.selected === key ? "true" : undefined} data-testid="archives-tree-type" onClick={() => p.onOpenType(t.path)}>
                <Icon size={15} aria-hidden />
                <span className="notes-tree-label">{folderName(t.path)}</span>
                <small>{t.count}</small>
              </button>
            </div>
            {open ? <TypeRecords type={t} selected={p.selected} onOpenArchive={p.onOpenArchive} /> : null}
          </div>
        );
      })}
    </div>
  );
}
