import { useId, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type { FileEntry } from "../shared/files.js";
import { useDevicePreferences } from "./device-preferences.js";
import { t } from "./i18n.js";

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const columns = [
  { key: "name", label: t.files.name },
  { key: "size", label: t.files.size },
  { key: "mtime", label: t.files.modified },
  { key: "mode", label: t.files.mode },
] as const;
type Column = (typeof columns)[number]["key"];

export function FileTable({
  caption,
  entries,
  onOpen,
  actions,
  current,
  disabled,
  selection,
}: {
  caption: string;
  entries: FileEntry[];
  onOpen: (entry: FileEntry) => void;
  actions?: (entry: FileEntry) => ReactNode;
  current?: string | null;
  disabled?: boolean;
  selection?: { names: string[]; disabled: boolean; canDrag: boolean; toggle: (name: string) => void; start: (name: string, event: DragEvent) => void; end: () => void } | undefined;
}) {
  const captionId = useId();
  const { fileSort } = useDevicePreferences();
  const [override, setSort] = useState<{ key: Column; desc: boolean }>();
  const sort = override ?? { key: fileSort === "modified" ? "mtime" : fileSort, desc: fileSort !== "name" };
  const sorted = [...entries].sort((left, right) => {
    const { key, desc } = sort;
    const result = key === "name" || key === "mode" ? left[key].localeCompare(right[key]) : left[key] - right[key];
    return Number(right.type === "dir") - Number(left.type === "dir") || (desc ? -result : result) || left.name.localeCompare(right.name);
  });
  return (
    <div className="ssh-file-table" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table>
        <caption id={captionId}>{caption}</caption>
        <thead>
          <tr>
            {selection && <th scope="col">选择</th>}
            {columns.map(({ key, label }) => (
              <th key={key} scope="col" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
                <button type="button" className="hu-btn hu-btn-ghost" onClick={() => setSort({ key, desc: sort.key === key && !sort.desc })}>
                  {label} {sort.key === key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
            {actions && <th scope="col">操作</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => {
            const selectable = entry.type === "file" || entry.type === "dir";
            return (
              <tr key={entry.name} data-testid="files-row">
                {selection && (
                  <td>
                    {selectable && (
                      <div className="ssh-file-selection">
                        <input type="checkbox" aria-label={`选择 ${entry.name}`} checked={selection.names.includes(entry.name)} disabled={selection.disabled} onChange={() => selection.toggle(entry.name)} />
                        <span
                          aria-hidden="true"
                          className="ssh-file-drag-handle"
                          data-testid="ssh-file-drag-handle"
                          draggable={selection.canDrag}
                          onDragStart={(event) => selection.start(entry.name, event)}
                          onDragEnd={selection.end}
                        >
                          <GripVertical size={14} />
                        </span>
                      </div>
                    )}
                  </td>
                )}
                <td>
                  {entry.type === "dir" || actions ? (
                    <button type="button" className="hu-nav-item" disabled={disabled} aria-current={current === entry.name ? "location" : undefined} onClick={() => onOpen(entry)} data-testid="files-open">
                      {entry.type === "dir" ? `📁 ${entry.name}` : entry.name}
                    </button>
                  ) : (
                    entry.name
                  )}
                </td>
                <td>{entry.type === "dir" ? "—" : fmtSize(entry.size)}</td>
                <td>{entry.mtime ? new Date(entry.mtime).toLocaleString() : ""}</td>
                <td>
                  <code>{entry.mode}</code>
                </td>
                {actions && <td>{actions(entry)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
