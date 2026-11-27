import type { ArchiveDto } from "@huhu/contracts";
import { Button, Dialog, Select } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import type { Book } from "../shared/books.js";
import type { Reference, ReferenceList, ReferenceOwner, ReferenceView, ReviewDraft, ReviewNote, SetReference } from "../shared/references.js";
import { ReportQuery, type ReportView } from "../shared/reports.js";
import { fieldValue, LedgerField, useLedgerAction } from "./primitives.js";

type ResourceKind = Reference["resource"]["kind"];
type PickedResource = z.infer<typeof SetReference>["resource"];
type Resource = Reference["resource"] & { title: string };
type NoteEntry = { id: string | null; title: string; path: string };
type PluginEntry = { id: string; state: "active" | "disabled" | "failed" };
type OpenResource = (path: string) => void;
const kindLabels = { note: "笔记", archive: "档案" };
const ownerLabels = { book: "账本", budget: "预算", record: "流水" };
const resourceKey = ({ kind, documentId, path }: Reference["resource"]) => JSON.stringify([kind, documentId, documentId === null ? path : null]);

function useNotesState() {
  const query = useCapability<PluginEntry[]>("plugins.list", {});
  return { ...query, available: query.data?.find(({ id }) => id === "notes")?.state === "active" };
}

export function FinancialNotesButton({ book, owner, title, readOnly, openResource }: { book: Book; owner: ReferenceOwner; title: string; readOnly: boolean; openResource: OpenResource }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label={owner.kind === "book" ? "财务笔记" : `${title}的财务笔记`} onClick={() => setOpen(true)}>
        财务笔记
      </Button>
      {open && <FinancialNotes book={book} owner={owner} title={title} readOnly={readOnly} close={() => setOpen(false)} openResource={openResource} />}
    </>
  );
}

function FinancialNotes({ book, owner, title, readOnly, close, openResource }: { book: Book; owner: ReferenceOwner; title: string; readOnly: boolean; close(): void; openResource: OpenResource }) {
  const input = { bookId: book.id, owner };
  const notes = useNotesState();
  const references = useCapability<z.infer<typeof ReferenceList>>("ledger.references.list", input);
  const action = useLedgerAction();
  const [choice, setChoice] = useState<{ revision: string; replaceId?: string }>();
  const [notice, setNotice] = useState("");
  const done = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const locked = readOnly || book.status !== "active";
  const data = references.data;
  function choose(replaceId?: string) {
    if (!data) return;
    action.clearError();
    setNotice("");
    setChoice({ revision: data.revision, ...(replaceId && { replaceId }) });
  }
  async function openReference(referenceId: string) {
    setNotice("");
    const result = await action.run<ReferenceView>("ledger.references.open", { ...input, referenceId }, false);
    if (!result || !mounted.current) return;
    if (result.status === "available") {
      close();
      openResource(result.resource.path);
    } else {
      await references.refetch();
      setNotice(result.status === "missing" ? "资源已缺失，请选择替换资源。" : "Notes 已停用。重新启用后可打开关联。");
    }
  }
  async function save(resource: PickedResource) {
    if (!choice || locked || !notes.available) return;
    const result = await action.run<Reference>("ledger.references.link", {
      ...input,
      resource,
      expectedRevision: choice.revision,
      ...(choice.replaceId && { replaceId: choice.replaceId }),
    });
    if (result) {
      setChoice(undefined);
      setNotice(choice.replaceId ? "关联已修复。" : "资源已关联。");
      done.current?.focus();
    }
  }
  async function unlink(referenceId: string) {
    if (!data || locked) return;
    setNotice("");
    if (await action.run("ledger.references.unlink", { ...input, expectedRevision: data.revision, referenceId })) {
      setChoice(undefined);
      setNotice("关联已移除，原资源仍在知识库中。");
      done.current?.focus();
    }
  }
  const dismiss = () => {
    if (!action.working) close();
  };
  return (
    <Dialog
      open
      wide
      title={`${ownerLabels[owner.kind]}财务笔记`}
      error={action.error ?? notes.error?.message ?? references.error?.message}
      onClose={dismiss}
      initialFocusRef={done}
      actions={
        <Button ref={done} disabled={action.working} onClick={dismiss}>
          完成
        </Button>
      }
    >
      <div className="hu-stack">
        <p className="muted">{title}</p>
        {notes.data && !notes.available && <p role="status">Notes 已停用。请在插件中心重新启用以打开或修复关联，账本仍可记账。</p>}
        {references.isPending && <p role="status">正在读取财务笔记…</p>}
        {data &&
          (data.rows.length ? (
            <ul className="ledger-reference-list">
              {data.rows.map(({ id, resource, status }) => (
                <li key={id} data-testid={`ledger-reference-${id}`}>
                  <span className="ledger-resource-path">
                    {kindLabels[resource.kind]} · {resource.path}
                  </span>
                  <div className="ledger-budget-options">
                    {status === "available" && notes.available && (
                      <Button aria-label={`打开 ${resource.path}`} disabled={action.working} onClick={() => void openReference(id)}>
                        打开
                      </Button>
                    )}
                    {status === "missing" && (
                      <>
                        <span>资源已缺失</span>
                        <Button aria-label={`选择替换资源 ${resource.path}`} disabled={locked || action.working || !notes.available} onClick={() => choose(id)}>
                          选择替换资源
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" aria-label={`移除关联 ${resource.path}`} disabled={locked || action.working} onClick={() => void unlink(id)}>
                      移除关联
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>尚无财务笔记关联。</p>
          ))}
        <div>
          <Button variant="primary" disabled={locked || action.working || !data || !notes.available} onClick={() => choose()}>
            关联已有资源
          </Button>
        </div>
        {choice && notes.available && (
          <ResourcePicker
            key={choice.replaceId ?? "new"}
            replacing={!!choice.replaceId}
            existing={data?.rows.filter(({ id }) => id !== choice.replaceId).map(({ resource }) => resource) ?? []}
            disabled={locked || action.working}
            save={save}
            cancel={() => {
              setChoice(undefined);
              done.current?.focus();
            }}
          />
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </Dialog>
  );
}

function ResourcePicker({ replacing, existing, disabled, save, cancel }: { replacing: boolean; existing: Reference["resource"][]; disabled: boolean; save(resource: PickedResource): Promise<void>; cancel(): void }) {
  const notes = useCapability<NoteEntry[]>("notes.list", { filter: "all" });
  const archives = useCapability<ArchiveDto[]>("archives.list", {});
  const heading = useId();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ResourceKind | "">("");
  const [selected, setSelected] = useState("");
  const searchField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchField.current?.focus();
  }, []);
  const resources: Resource[] = [
    ...(notes.data ?? []).filter(({ path }) => path.split("/")[0]?.toLowerCase() !== "archives").map(({ path, id, title }): Resource => ({ kind: "note", path, documentId: id, title })),
    ...(archives.data ?? []).map(({ path, noteId, name }): Resource => ({ kind: "archive", path, documentId: noteId, title: name })),
  ];
  const known = new Set(existing.map(resourceKey));
  const query = search.trim().toLocaleLowerCase();
  const visible = resources.filter((resource) => (!kind || kind === resource.kind) && !known.has(resourceKey(resource)) && `${resource.title} ${resource.path}`.toLocaleLowerCase().includes(query));
  const selectedResource = visible.find((resource) => resourceKey(resource) === selected);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedResource && !disabled) void save({ kind: selectedResource.kind, path: selectedResource.path });
  }
  return (
    <form aria-labelledby={heading} className="hu-card-alt ledger-budget-card" onSubmit={submit}>
      <h3 id={heading}>{replacing ? "选择替换资源" : "选择已有资源"}</h3>
      <div className="ledger-budget-fields-grid">
        <LedgerField label="筛选资源">
          <input ref={searchField} type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
        </LedgerField>
        <LedgerField label="资源类型">
          <Select
            value={kind}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setKind(value === "note" || value === "archive" ? value : "");
            }}
          >
            <option value="">全部资源</option>
            <option value="note">笔记</option>
            <option value="archive">档案</option>
          </Select>
        </LedgerField>
      </div>
      <fieldset className="ledger-budget-fields" disabled={disabled}>
        <legend>在当前 Vault 选择</legend>
        {(notes.error || archives.error) && <p role="alert">{notes.error?.message ?? archives.error?.message}</p>}
        {notes.isPending || archives.isPending ? (
          <p role="status">正在读取资源…</p>
        ) : visible.length ? (
          <div className="ledger-resource-choices">
            {visible.map((resource) => {
              const key = resourceKey(resource);
              return (
                <label key={key}>
                  <input type="radio" name={heading} checked={selected === key} onChange={() => setSelected(key)} />
                  <span className="ledger-resource-path">
                    {resource.title}{" "}
                    <small className="muted">
                      {kindLabels[resource.kind]} · {resource.path}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p>没有可关联的匹配资源。</p>
        )}
      </fieldset>
      <div className="ledger-budget-options">
        <Button disabled={disabled} onClick={cancel}>
          取消选择
        </Button>
        <Button type="submit" variant="primary" disabled={disabled || !selectedResource}>
          {replacing ? "保存修复" : "确认关联"}
        </Button>
      </div>
    </form>
  );
}

type ReviewQuery = z.infer<typeof ReportQuery>;
type ReviewFields = Pick<ReviewQuery, "from" | "to" | "includeOffset"> & { currency: string };
export function PeriodReview({ book, readOnly, initial, currencies, close, openResource }: { book: Book; readOnly: boolean; initial: ReviewFields; currencies: ReportView["currencies"]; close(): void; openResource: OpenResource }) {
  const formId = useId();
  const notes = useNotesState();
  const action = useLedgerAction();
  const [fields, setFields] = useState(initial);
  const [draft, setDraft] = useState<z.infer<typeof ReviewDraft> & { query: ReviewQuery }>();
  const [name, setName] = useState("");
  const [result, setResult] = useState<z.infer<typeof ReviewNote>>();
  const locked = readOnly || book.status !== "active";
  const reason = readOnly ? "当前 Vault 为只读，可以预览复盘。" : book.status !== "active" ? "账本已归档，可以预览复盘。" : notes.data && !notes.available ? "Notes 已停用，可以预览。重新启用后才能保存。" : undefined;
  const busy = action.working;
  function change(next: Partial<ReviewFields>) {
    setFields((previous) => ({ ...previous, ...next }));
    setDraft(undefined);
    action.clearError();
  }
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = ReportQuery.safeParse({ ...fields, bookId: book.id, currency: fields.currency || undefined });
    if (!query.success) {
      action.setError("请选择顺序正确且不超过 366 天的期间。");
      return;
    }
    const response = await action.run<z.infer<typeof ReviewDraft>>("ledger.references.previewReview", query.data, false);
    if (response) {
      setDraft({ ...response, query: query.data });
      setName((previous) => previous || `账本复盘 ${query.data.from} 至 ${query.data.to}`);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || locked || !notes.available || result) return;
    const title = fieldValue(new FormData(event.currentTarget), "name");
    if (!title || /[\\/]/u.test(title)) {
      action.setError("请输入不含路径分隔符的笔记名称。");
      return;
    }
    const saved = await action.run<z.infer<typeof ReviewNote>>("ledger.references.saveReview", {
      ...draft.query,
      expectedRevision: draft.revision,
      name: title,
    });
    if (saved) setResult(saved);
  }
  const dismiss = () => {
    if (!busy) close();
  };
  return (
    <Dialog
      open
      wide
      title="期间复盘"
      onClose={dismiss}
      error={action.error ?? notes.error?.message}
      actions={
        <>
          <Button disabled={busy} onClick={dismiss}>
            关闭复盘
          </Button>
          {!result && (
            <Button type="submit" form={formId} variant="primary" disabled={!draft || locked || !notes.available || busy}>
              保存为笔记
            </Button>
          )}
        </>
      }
    >
      <div className="hu-stack">
        <form className="hu-stack" aria-label="选择复盘期间" onSubmit={preview}>
          <fieldset disabled={busy || !!result}>
            <div className="ledger-budget-fields-grid">
              <LedgerField label="复盘开始日期">
                <input type="date" value={fields.from} required onChange={(event) => change({ from: event.currentTarget.value })} />
              </LedgerField>
              <LedgerField label="复盘结束日期">
                <input type="date" value={fields.to} required onChange={(event) => change({ to: event.currentTarget.value })} />
              </LedgerField>
              <LedgerField label="复盘币种">
                <Select value={fields.currency} onChange={(event) => change({ currency: event.currentTarget.value })}>
                  <option value="">分别汇总所有币种</option>
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </Select>
              </LedgerField>
            </div>
            <div className="ledger-budget-options">
              <label>
                <input type="checkbox" checked={fields.includeOffset} onChange={(event) => change({ includeOffset: event.currentTarget.checked })} /> 纳入已平账流水
              </label>
              <Button type="submit" disabled={busy || !!result}>
                生成 Markdown 预览
              </Button>
            </div>
          </fieldset>
        </form>
        {reason && <p role="status">{reason}</p>}
        {draft && (
          <form id={formId} className="hu-stack" aria-label="保存 Markdown 预览" onSubmit={save}>
            <h3>Markdown 预览</h3>
            <pre className="ledger-review-markdown" aria-label="Markdown 预览正文">
              {draft.markdown}
            </pre>
            <LedgerField label="复盘笔记名称">
              <input name="name" required maxLength={100} value={name} onChange={(event) => setName(event.currentTarget.value)} disabled={locked || busy || !notes.available || !!result} />
            </LedgerField>
          </form>
        )}
        {result && (
          <div className="hu-stack">
            <p className="ledger-resource-path" role="status">
              已保存为 {result.path}。
            </p>
            <div>
              <Button
                disabled={!notes.available}
                onClick={() => {
                  close();
                  openResource(result.path);
                }}
              >
                打开复盘笔记
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
