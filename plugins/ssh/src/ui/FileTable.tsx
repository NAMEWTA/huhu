import { useId, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type { FileEntry } from "../shared/files.js";
import type { FileBatchSelection } from "./FileBatch.js";
import { fileColumnDefaults, saveDevicePreferences, saveFileColumnWidth, useDevicePreferences, type FileColumn } from "./device-preferences.js";
import { FileColumnResize } from "./FileColumnResize.js";
import { t } from "./i18n.js";

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const columns = [
  { key: "name", label: t.files.name },
  { key: "size", label: t.files.size },
  { key: "mtime", label: t.files.modified },
  { key: "mode", label: t.files.mode },
] as const;
const utilityWidths = { selection: 72, actions: 220 };

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
  selection?: FileBatchSelection | undefined;
}) {
  const captionId = useId();
  const { fileSort, hiddenFileColumns, fileColumnWidths } = useDevicePreferences();
  const shown = columns.filter(({ key }) => key === "name" || !hiddenFileColumns.includes(key));
  const [override, setSort] = useState<{ key: FileColumn; desc: boolean }>();
  const [preview, setPreview] = useState<{ key: FileColumn; width: number }>();
  const [error, setError] = useState("");
  const widthFor = (key: FileColumn) => (preview?.key === key ? preview.width : undefined) ?? fileColumnWidths[key] ?? fileColumnDefaults[key];
  const tableWidth = shown.reduce((total, { key }) => total + widthFor(key), 0)
    + (selection ? utilityWidths.selection : 0) + (actions ? utilityWidths.actions : 0);
  function persist(update: () => void) {
    try {
      update();
      setError("");
    } catch {
      setError("无法保存文件表列宽。");
    }
  }
  const sort = override ?? { key: fileSort === "modified" ? "mtime" : fileSort, desc: fileSort !== "name" };
  const sorted = [...entries].sort((left, right) => {
    const { key, desc } = sort;
    const result = key === "name" || key === "mode" ? left[key].localeCompare(right[key]) : left[key] - right[key];
    return Number(right.type === "dir") - Number(left.type === "dir") || (desc ? -result : result) || left.name.localeCompare(right.name);
  });
  return (
    <>
    {Object.keys(fileColumnWidths).length > 0 &&
      <button type="button" className="hu-btn hu-btn-ghost" onClick={() => persist(() => saveDevicePreferences({ fileColumnWidths: {} }))}>恢复默认列宽</button>}
    {error && <p role="alert">{error}</p>}
    <div className="ssh-file-table" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table style={{ inlineSize: tableWidth }}>
        <caption id={captionId}>{caption}</caption>
        <colgroup>
          {selection && <col style={{ inlineSize: utilityWidths.selection }} />}
          {shown.map(({ key }) => <col key={key} style={{ inlineSize: widthFor(key) }} />)}
          {actions && <col style={{ inlineSize: utilityWidths.actions }} />}
        </colgroup>
        <thead>
          <tr>
            {selection && <th scope="col">选择</th>}
            {shown.map(({ key, label }) => (
              <th className="ssh-file-value-header" key={key} scope="col" aria-label={label} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
                <button type="button" className="hu-btn hu-btn-ghost" onClick={() => setSort({ key, desc: sort.key === key && !sort.desc })}>
                  {label} {sort.key === key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
                </button>
                <FileColumnResize label={label} width={widthFor(key)}
                  preview={(width) => setPreview(width === undefined ? undefined : { key, width })}
                  save={(width) => persist(() => saveFileColumnWidth(key, width))} />
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
                          data-drag-enabled={selection.canDrag}
                          {...selection.handle(entry.name)}
                        >
                          <GripVertical size={14} />
                        </span>
                      </div>
                    )}
                  </td>
                )}
                <td className="ssh-file-value">
                  {entry.type === "dir" || actions ? (
                    <button type="button" className="hu-nav-item" disabled={disabled} aria-current={current === entry.name ? "location" : undefined} onClick={() => onOpen(entry)} data-testid="files-open">
                      {entry.type === "dir" ? `📁 ${entry.name}` : entry.name}
                    </button>
                  ) : (
                    entry.name
                  )}
                </td>
                {!hiddenFileColumns.includes("size") && <td className="ssh-file-value">{entry.type === "dir" ? "—" : fmtSize(entry.size)}</td>}
                {!hiddenFileColumns.includes("mtime") && <td className="ssh-file-value">{entry.mtime ? new Date(entry.mtime).toLocaleString() : ""}</td>}
                {!hiddenFileColumns.includes("mode") && <td className="ssh-file-value">
                  <code>{entry.mode}</code>
                </td>}
                {actions && <td>{actions(entry)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
