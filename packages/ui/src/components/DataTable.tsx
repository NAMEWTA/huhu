import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell(row: T): ReactNode;
  /** 初始列宽（px）；缺省按内容自适应，拖动表头右缘可调整。 */
  width?: number;
  className?: string;
}

export interface DataTableProps<T> {
  label: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey(row: T): string;
  /** Enter / 双击打开一行。 */
  onOpen?(row: T): void;
  selectedKey?: string | null;
  onSelect?(row: T): void;
  rowTestId?: string;
  /** 没有数据时显示的内容。 */
  empty?: ReactNode;
  /** 超过这个行数才虚拟化（design-system.md：200 行）。 */
  virtualizeAfter?: number;
  /** 虚拟化时可视区高度（px）。 */
  height?: number;
}

const ROW_H = 41;

/** 数据表（design-system.md DataTable）：TanStack Table 管列与列宽，行数超过 200 用 react-virtual 只渲染可见行；吸顶表头、hover / 选中、↑↓ 移动、Enter 打开。仍然是语义化的 <table>。 */
export function DataTable<T>({ label, columns, rows, rowKey, onOpen, selectedKey = null, onSelect, rowTestId, empty, virtualizeAfter = 200, height = 480 }: DataTableProps<T>) {
  const defs = useMemo<ColumnDef<T>[]>(() => columns.map((c) => ({ id: c.id, header: c.header, size: c.width ?? 160, minSize: 60, cell: (ctx) => c.cell(ctx.row.original), meta: { className: c.className } })), [columns]);
  const table = useReactTable<T>({ data: rows as T[], columns: defs, getCoreRowModel: getCoreRowModel(), getRowId: (r) => rowKey(r), columnResizeMode: "onChange", enableColumnResizing: true });
  const scroller = useRef<HTMLDivElement>(null);
  const body = table.getRowModel().rows;
  const virtual = body.length > virtualizeAfter;
  const virt = useVirtualizer({ count: virtual ? body.length : 0, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 12 });
  const items = virtual ? virt.getVirtualItems() : [];
  const first = items[0];
  const last = items[items.length - 1];
  const padTop = first ? first.start : 0;
  const padBottom = last ? virt.getTotalSize() - last.end : 0;
  const shown = virtual ? items.map((v) => body[v.index]!) : body;

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    const move = (to: number) => {
      e.preventDefault();
      const next = Math.max(0, Math.min(body.length - 1, to));
      if (virtual) virt.scrollToIndex(next);
      // 虚拟化时目标行可能还没渲染：下一帧再取
      let tries = 0;
      const focusRow = () => {
        const row = scroller.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`);
        if (row) row.focus();
        else if (tries++ < 5) requestAnimationFrame(focusRow);
      };
      requestAnimationFrame(focusRow);
    };
    if (e.key === "ArrowDown") move(index + 1);
    else if (e.key === "ArrowUp") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(body.length - 1);
    else if (e.key === "Enter" && onOpen) {
      e.preventDefault();
      onOpen(body[index]!.original);
    } else if (e.key === " " && onSelect) {
      e.preventDefault();
      onSelect(body[index]!.original);
    }
  };

  return (
    <div ref={scroller} className="hu-data-table-scroll" style={virtual ? { maxHeight: height } : undefined} data-virtual={virtual || undefined}>
      <table className="table hu-data-table" aria-label={label} aria-rowcount={body.length + 1} style={{ width: table.getTotalSize(), minWidth: "100%" }}>
        <colgroup>
          {table.getFlatHeaders().map((h) => (
            <col key={h.id} style={{ width: h.getSize() }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id} scope="col" style={{ position: "sticky", top: 0 }}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  <span className="hu-col-resizer" role="separator" aria-orientation="vertical" aria-label={`调整“${h.column.columnDef.header as string}”列宽`} onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden style={{ height: padTop }}>
              <td colSpan={columns.length} style={{ padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {shown.map((r) => {
            const index = r.index;
            const selected = selectedKey === r.id;
            return (
              <tr
                key={r.id}
                data-row-index={index}
                data-testid={rowTestId}
                data-selected={selected || undefined}
                aria-selected={onSelect ? selected : undefined}
                aria-rowindex={index + 2}
                tabIndex={r.id === shown[0]?.id ? 0 : -1}
                style={virtual ? { height: ROW_H } : undefined}
                onKeyDown={(e) => onKey(e, index)}
                onClick={() => onSelect?.(r.original)}
                onDoubleClick={() => onOpen?.(r.original)}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className={(c.column.columnDef.meta as { className?: string } | undefined)?.className}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 ? (
            <tr aria-hidden style={{ height: padBottom }}>
              <td colSpan={columns.length} style={{ padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
      {body.length === 0 ? empty : null}
    </div>
  );
}
