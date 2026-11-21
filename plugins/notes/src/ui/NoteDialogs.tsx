import { Button, Dialog, Field } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { FileText } from "lucide-react";
import { useState } from "react";
import { n } from "./i18n.js";
import type { NoteRef } from "./NoteExplorer.js";

// 从 NotesModule 拆出的叶子组件（对话框 / 回收站列表 / 批注输入）；NotesModule 只做组合（S1 任务 1.5）。

export function TrashList({ notes, onRestore, onPurge }: { notes: NoteRef[]; onRestore(n: NoteRef): void; onPurge(n: NoteRef): void }) {
  if (notes.length === 0) return null;
  return (
    <div className="hu-knowledge-trash-banner" role="list" aria-label="已删除的笔记" data-testid="trash-list">
      {notes.map((x) => (
        <div key={x.trashId ?? x.path} role="listitem" className="row">
          <span className="hu-flex-fill">
            {x.path} · {n.trashBanner(x.deletedAt ? new Date(x.deletedAt).toLocaleString("zh-CN") : "")}
          </span>
          <Button onClick={() => onRestore(x)}>{n.menu.restore}</Button>
          <Button variant="danger" onClick={() => onPurge(x)}>
            {n.menu.purge}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function NameDialog({
  title,
  description,
  label,
  initial = "",
  submit,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  label: string;
  initial?: string;
  submit: string;
  error: string | null;
  onClose(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open
      title={title}
      {...(description ? { description } : {})}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void onSubmit(name.trim())} data-testid="name-dialog-submit">
            {submit}
          </Button>
        </>
      }
    >
      <form
        className="hu-form-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void onSubmit(name.trim());
        }}
      >
        <Field label={label}>
          <input autoFocus aria-label={label} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

export function NewNoteDialog({ folder, folders, error, onClose, onCreate }: { folder: string; folders: string[]; error: string | null; onClose(): void; onCreate(v: { name: string; folder: string; template: string }): Promise<void> }) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState(folder);
  const [template, setTemplate] = useState("blank");
  const templates = useCapability<string[]>("notes.templates.list");
  return (
    <Dialog
      open
      title={n.newTitle}
      description={n.newDesc}
      error={error}
      onClose={onClose}
      testId="new-note-dialog"
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" icon={FileText} disabled={!name.trim()} onClick={() => void onCreate({ name: name.trim(), folder: dir, template })} data-testid="new-note-submit">
            {n.create}
          </Button>
        </>
      }
    >
      <form
        className="hu-form-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void onCreate({ name: name.trim(), folder: dir, template });
        }}
      >
        <Field label={n.fileName} description={n.fileNameHint}>
          <input autoFocus aria-label={n.fileName} placeholder={n.fileNameHint} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={n.folderLabel}>
          <select aria-label={n.folderLabel} value={dir} onChange={(e) => setDir(e.target.value)}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f || n.folderHint}
              </option>
            ))}
          </select>
        </Field>
        <Field label={n.template}>
          <select aria-label={n.template} value={template} onChange={(e) => setTemplate(e.target.value)}>
            {(Object.keys(n.templates) as (keyof typeof n.templates)[]).map((k) => (
              <option key={k} value={k}>
                {n.templates[k]}
              </option>
            ))}
            {templates.data?.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Dialog>
  );
}

export function MoveDialog({ note, folders, error, onClose, onMove }: { note: NoteRef; folders: string[]; error: string | null; onClose(): void; onMove(dir: string): Promise<void> }) {
  const [dir, setDir] = useState("");
  return (
    <Dialog
      open
      title={n.moveTitle}
      description={`把「${note.title}」移到另一个文件夹；指向它的双链会同步更新。`}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" onClick={() => void onMove(dir)}>
            {n.moveDo}
          </Button>
        </>
      }
    >
      <Field label={n.folderLabel}>
        <select aria-label={n.folderLabel} value={dir} onChange={(e) => setDir(e.target.value)}>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f || "Vault 根目录"}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
