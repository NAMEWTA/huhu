import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SafeSession, Tag, TagFields } from "../engine/personal.js";
import { SAFE_TAG_COLORS, type SafeTagColor } from "../shared/tag-colors.js";

const colorText: Record<SafeTagColor, string> = { blue: "蓝色", green: "绿色", orange: "橙色", purple: "紫色" };
export const emptyTag: TagFields = { name: "", color: SAFE_TAG_COLORS[0] };

export function FormField({ label, children }: { label: string; children(id: string): ReactNode }) {
  const id = useId();
  return (
    <div className="hu-field">
      <label className="hu-field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function TagBadge({ tag }: { tag: TagFields }) {
  return (
    <span className="safe-tag-badge" data-color={tag.color} title={colorText[tag.color]}>
      {tag.name}
    </span>
  );
}

export function TagFieldsInput({ value, onChange, nested = false }: { value: TagFields; onChange(next: TagFields): void; nested?: boolean }) {
  return (
    <div className="safe-form-pair">
      <FormField label="标签名称">{(id) => <input id={id} required={!nested} pattern={String.raw`.*\S.*`} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />}</FormField>
      <FormField label="颜色">
        {(id) => (
          <select id={id} value={value.color} onChange={(event) => onChange({ ...value, color: event.target.value as SafeTagColor })}>
            {SAFE_TAG_COLORS.map((color) => (
              <option key={color} value={color}>
                {colorText[color]}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </div>
  );
}

type ManagerView = { kind: "list" } | { kind: "create" } | { kind: "update" | "delete"; tag: Tag };

export function TagManager({
  tags,
  counts,
  revision,
  session,
  getSignal,
  reload,
  onError,
  onClose,
}: {
  tags: Tag[];
  counts: ReadonlyMap<string, number>;
  revision: number;
  session: SafeSession;
  getSignal(): AbortSignal | undefined;
  reload(signal: AbortSignal): Promise<unknown>;
  onError(error: unknown): boolean;
  onClose(): void;
}) {
  const engine = useEngine();
  const [view, setView] = useState<ManagerView>({ kind: "list" });
  const [fields, setFields] = useState(emptyTag);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const formId = useId();

  useLayoutEffect(() => {
    if (view.kind === "list") root.current?.querySelector<HTMLElement>("h3")?.focus();
    else root.current?.querySelector<HTMLElement>(view.kind === "delete" ? "button" : "input")?.focus();
  }, [view.kind]);

  function open(next: ManagerView) {
    if (active.current) return;
    setError(null);
    setConflict(false);
    setView(next);
    if (next.kind === "create") setFields(emptyTag);
    if (next.kind === "update") setFields({ name: next.tag.name, color: next.tag.color });
  }

  function close() {
    if (active.current) return;
    if (view.kind === "list") {
      root.current?.closest("dialog")?.close();
      onClose();
    } else open({ kind: "list" });
  }

  async function submit(reloadOnly = false) {
    const signal = getSignal();
    if (active.current || !signal || signal.aborted || view.kind === "list" || (conflict && !reloadOnly)) return;
    active.current = true;
    setPending(true);
    setError(null);
    try {
      if (reloadOnly) {
        await reload(signal);
        if (!signal.aborted) setConflict(false);
        return;
      }
      const base = { session, expectedRevision: revision };
      const input = view.kind === "create" ? { ...base, ...fields } : { ...base, tagId: view.tag.tagId, ...(view.kind === "update" ? fields : {}) };
      const receipt = await engine.call<{ status?: "saved" | "reused" }>(`safe.tags.${view.kind}`, input, { write: true, signal });
      if (signal.aborted) return;
      const message = view.kind === "delete" ? "已删除标签" : receipt.status === "reused" ? "已复用现有标签" : "标签已保存";
      try {
        await reload(signal);
        if (signal.aborted) return;
        setNotice(message);
        setView({ kind: "list" });
      } catch (cause) {
        if (!signal.aborted && !onError(cause)) {
          setConflict(true);
          setError(`${message}，暂时无法更新列表。请重读标签。`);
        }
      }
    } catch (cause) {
      if (signal.aborted || onError(cause)) return;
      if (cause instanceof CapabilityError && cause.code === "NAME_CONFLICT") setError("已有同名标签，请改用其他名称。");
      else if (cause instanceof CapabilityError && cause.code === "VERSION_CONFLICT") {
        setConflict(true);
        setError("版本已变化，请重读标签后核对。");
      } else {
        setConflict(true);
        setError("暂时无法确认标签操作。请重读标签后核对。");
      }
    } finally {
      active.current = false;
      if (!signal.aborted) setPending(false);
    }
  }

  return (
    <Dialog
      open
      title={view.kind === "list" ? "标签管理" : view.kind === "delete" ? "删除标签" : view.kind === "update" ? "编辑标签" : "新建标签"}
      testId="safe-tag-dialog"
      onClose={close}
      error={error}
      actions={
        view.kind === "list" ? (
          <Button onClick={close}>完成</Button>
        ) : (
          <>
            {view.kind !== "delete" ? (
              <Button disabled={pending} onClick={close}>
                返回标签管理
              </Button>
            ) : null}
            {conflict ? (
              <Button disabled={pending} onClick={() => void submit(true)}>
                重读标签
              </Button>
            ) : null}
            {view.kind === "delete" ? (
              <Button variant="danger" loading={pending} disabled={conflict} onClick={() => void submit()}>
                确认删除标签
              </Button>
            ) : (
              <Button type="submit" form={formId} variant="primary" loading={pending} disabled={conflict}>
                保存标签
              </Button>
            )}
          </>
        )
      }
    >
      <div className="hu-stack" ref={root}>
        {view.kind === "list" ? (
          <>
            <h3 tabIndex={-1}>标签列表</h3>
            <div role="status">{notice}</div>
            {tags.length ? (
              tags.map((tag) => (
                <div key={tag.tagId} className="safe-tag-manager-row" data-testid="safe-tag-row">
                  <span>
                    <TagBadge tag={tag} /> · {counts.get(tag.tagId) ?? 0} 个条目
                  </span>
                  <div className="safe-tag-strip">
                    <Button aria-label={`编辑 ${tag.name}`} onClick={() => open({ kind: "update", tag })}>
                      编辑
                    </Button>
                    <Button aria-label={`删除 ${tag.name}`} variant="danger" onClick={() => open({ kind: "delete", tag })}>
                      删除
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p>暂无标签。</p>
            )}
            <Button variant="primary" onClick={() => open({ kind: "create" })}>
              新建标签
            </Button>
          </>
        ) : view.kind === "delete" ? (
          <>
            <p>
              删除「{view.tag.name}」后，将解除 {counts.get(view.tag.tagId) ?? 0} 个条目的标签关联。条目和账号会保留。
            </p>
            <Button disabled={pending} onClick={close}>
              取消删除
            </Button>
          </>
        ) : (
          <form
            id={formId}
            aria-label={view.kind === "create" ? "新建标签" : "编辑标签"}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset className="safe-editor-fields" disabled={pending}>
              <TagFieldsInput value={fields} onChange={setFields} />
            </fieldset>
          </form>
        )}
      </div>
    </Dialog>
  );
}
