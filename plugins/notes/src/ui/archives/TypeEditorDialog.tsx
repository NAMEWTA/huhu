import type { ArchiveFieldDef, ArchiveTypeDto } from "@huhu/contracts";
import { Button, Dialog, Field, IconButton } from "@huhu/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ARCHIVE_ICONS } from "./icons.js";
import { a } from "./i18n.js";

interface Row {
  /** 打开对话框时的原名（新增的行为 null）；改名通过 renames 显式声明。 */
  original: string | null;
  name: string;
  type: ArchiveFieldDef["type"];
}

/** 新建类型 / 编辑字段：逐行编辑名称与类型（类型用下拉框显式选择），可排序、新增、删除，可改图标。 */
export function TypeEditorDialog({
  type,
  error,
  onClose,
  onSave,
}: {
  type: ArchiveTypeDto | null;
  error: string | null;
  onClose(): void;
  onSave(v: { name: string; icon: string; fields: ArchiveFieldDef[]; renames: { from: string; to: string }[] }): Promise<unknown>;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [icon, setIcon] = useState(type?.icon ?? "folder");
  const [rows, setRows] = useState<Row[]>((type?.fields ?? []).map((f) => ({ original: f.name, name: f.name, type: f.type })));
  const [busy, setBusy] = useState(false);
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j] as Row, next[i] as Row];
      return next;
    });
  const submit = async () => {
    setBusy(true);
    try {
      const renames = rows.filter((r) => r.original !== null && r.original !== r.name.trim()).map((r) => ({ from: r.original as string, to: r.name.trim() }));
      await onSave({ name: name.trim(), icon, fields: rows.map((r) => ({ name: r.name.trim(), type: r.type })), renames });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      wide
      title={type ? a.editFieldsTitle : a.newTypeTitle}
      {...(type ? { description: a.editFieldsHint } : {})}
      error={error}
      onClose={onClose}
      testId="archive-category-dialog"
      actions={
        <>
          <Button onClick={onClose}>{a.cancel}</Button>
          <Button variant="primary" disabled={busy || !name.trim() || rows.some((r) => !r.name.trim())} onClick={() => void submit()} data-testid="archive-category-save">
            {a.save}
          </Button>
        </>
      }
    >
      <div className="hu-form-body">
        <Field label={a.typeName}>
          <input autoFocus aria-label={a.typeName} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={a.icon}>
          <select aria-label={a.icon} value={icon} onChange={(e) => setIcon(e.target.value)}>
            {Object.keys(ARCHIVE_ICONS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <div className="notes-archive-field-rows" data-testid="archive-field-rows">
          {rows.map((r, i) => (
            <div key={i} className="notes-archive-field-row" data-testid="archive-field-row">
              <input aria-label={a.fieldName} placeholder={a.fieldName} value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <select aria-label={a.fieldType} value={r.type} onChange={(e) => patch(i, { type: e.target.value as Row["type"] })}>
                {(["text", "date", "url", "number"] as const).map((t) => (
                  <option key={t} value={t}>
                    {a.fieldTypes[t]}
                  </option>
                ))}
              </select>
              <IconButton icon={ArrowUp} label={a.moveUp} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={a.moveDown} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon={Trash2} label={a.removeField} onClick={() => setRows((x) => x.filter((_, k) => k !== i))} />
            </div>
          ))}
          <Button icon={Plus} onClick={() => setRows((x) => [...x, { original: null, name: "", type: "text" }])} data-testid="archive-field-add">
            {a.addField}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
