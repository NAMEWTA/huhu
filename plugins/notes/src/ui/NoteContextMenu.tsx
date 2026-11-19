import { n } from "./i18n.js";
import type { NoteRef } from "./NoteExplorer.js";
import type { DialogState } from "./NotesModule.js";
import type { ComponentProps } from "react";

export function NoteMenu(props: ComponentProps<"div">) {
  return <div {...props} className="shell-knowledge-file-menu" role="menu" />;
}

export interface NoteMenuAction {
  label: string;
  disabled?: boolean;
  run(): void;
}

export interface NoteContextMenuProps {
  menu: { note: NoteRef; x: number; y: number; actions?: readonly NoteMenuAction[] };
  trash: boolean;
  onOpen(path: string): void;
  onDialog(d: Exclude<DialogState, null>): void;
  onClose(): void;
  onRestore(trashId: string): void;
  onDuplicate(path: string): void;
  onFavorite(note: NoteRef): void;
}

/** 文件右键 / “…”菜单（从 NotesModule 拆出，行为不变；S5 起由 OK 的文件树菜单取代）。 */
export function NoteContextMenu({ menu, trash, onOpen, onDialog, onClose, onRestore, onDuplicate, onFavorite }: NoteContextMenuProps) {
  const note = menu.note;
  const act = (fn: () => void) => () => (fn(), onClose());
  return (
    <NoteMenu aria-label="文件操作菜单" style={{ position: "fixed", left: Math.max(8, menu.x - 200), top: menu.y, maxHeight: `calc(100dvh - ${menu.y}px - 8px)` }} onClick={(e) => e.stopPropagation()}>
      <div className="knowledge-menu-caption">{note.path.split("/").at(-1)}</div>
      {menu.actions?.length ? (
        <>
          {menu.actions.map(({ label, disabled, run }) => (
            <button key={label} type="button" role="menuitem" disabled={disabled} onClick={act(run)}>
              {label}
            </button>
          ))}
          <hr />
        </>
      ) : null}
      {note.folder ? (
        <>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "new", folder: note.path }))}>
            {n.newNote}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "folder", parent: note.path }))}>
            {n.newFolder}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "rename", note }))}>
            {n.menu.rename}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "move", note }))}>
            {n.menu.move}
          </button>
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={act(() => onDialog({ kind: "trash", note }))}>
            {n.menu.trash}
          </button>
        </>
      ) : trash ? (
        <>
          <button type="button" role="menuitem" onClick={act(() => note.trashId && onRestore(note.trashId))}>
            {n.menu.restore}
          </button>
          <button type="button" role="menuitem" className="danger" onClick={act(() => onDialog({ kind: "purge", note }))}>
            {n.menu.purge}
          </button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={act(() => onOpen(note.path))}>
            {n.menu.open}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "rename", note }))}>
            {n.menu.rename}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: "move", note }))}>
            {n.menu.move}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDuplicate(note.path))}>
            {n.menu.duplicate}
          </button>
          <button type="button" role="menuitem" data-testid="menu-save-version" onClick={act(() => onDialog({ kind: "version", note }))}>
            {n.menu.saveVersion}
          </button>
          <button type="button" role="menuitem" onClick={act(() => onFavorite(note))}>
            {note.favorite ? n.menu.unstar : n.menu.star}
          </button>
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={act(() => onDialog({ kind: "trash", note }))}>
            {n.menu.trash}
          </button>
        </>
      )}
    </NoteMenu>
  );
}
