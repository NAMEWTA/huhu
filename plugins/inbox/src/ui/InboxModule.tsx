import { MarkdownPreview } from "@huhu/editor";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Archive, ArrowRight, ArrowUpRight, Check, CircleCheck, FileText, Inbox, Pencil, Plus, RotateCcw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "./i18n.js";

interface Capture {
  id: string;
  title: string;
  body: string;
  source: string;
  status: "pending" | "processed" | "dismissed";
  result: { kind: string; id: string } | null;
  version: string;
  createdAt?: string;
}
interface ArchiveType {
  id: string;
  name: string;
}
type Target = "task" | "note" | "archive";
type Status = Capture["status"];

const SOURCES = ["快速捕获", "笔记摘录", "Agent CLI", "手动导入"];
const TARGET_TEXT: Record<Target, string> = { task: "任务", note: "笔记", archive: "档案" };
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("zh-CN") : "");

/** 收件箱（原型 InboxView）：左侧状态分段 + 搜索 + 来源筛选 + 批量归档的列表；右侧快速捕获条与详情（待处理的三种整理方式 / 已处理的结果 / 已归档的恢复）。 */
export function InboxModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "edit"; item: Capture | null } | { kind: "convert"; item: Capture; target: Target } | { kind: "delete"; item: Capture } | { kind: "undo"; item: Capture } | null>(null);
  const every = useCapability<Capture[]>("inbox.list", {});
  const types = useCapability<ArchiveType[]>("archives.types.list", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const all = every.data ?? [];
  // 选中项按全量列表查找：处理后它会离开当前状态分组，但详情仍需显示（并提供撤销）
  const cur = all.find((c) => c.id === selected) ?? null;
  const sources = [...new Set(all.map((c) => c.source))];
  const items = all
    .filter((c) => c.status === status && (!source || c.source === source) && `${c.title}${c.body}`.toLowerCase().includes(query.toLowerCase()))
    .slice()
    .reverse();
  // 原型：进入收件箱默认选中第一条，右侧直接显示详情（没有选中项才是空态）
  const firstId = items[0]?.id ?? null;
  useEffect(() => {
    if (selected === null && firstId !== null) setSelected(firstId);
  }, [selected, firstId]);

  async function act(capability: string, input: unknown): Promise<boolean> {
    setError(null);
    try {
      await engine.call(capability, input, { write: true });
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  const noTypes = (types.data ?? []).length === 0;

  return (
    <div className="module-layout knowledge-root knowledge-inbox" data-testid="inbox-module">
      <aside className="resource-pane knowledge-inbox-list" aria-label={t.title}>
        <div className="resource-head">
          <div className="row">
            <strong className="grow">
              {t.title}
              <span className="knowledge-count">{items.length}</span>
            </strong>
            <IconButton icon={Plus} label="新建收集条目" onClick={() => setDialog({ kind: "edit", item: null })} />
          </div>
          <div className="knowledge-inbox-status-tabs">
            <Segmented<Status>
              label="收集状态"
              value={status}
              onChange={(s) => (setStatus(s), setSelected(null), setChecked(new Set()))}
              options={[
                { value: "pending", label: t.statuses.pending },
                { value: "processed", label: t.statuses.processed },
                { value: "dismissed", label: t.statuses.dismissed },
              ]}
            />
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="搜索收集内容…" />
          <select aria-label="按来源筛选" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">全部来源</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {checked.size > 0 ? (
          <div className="knowledge-inbox-bulk">
            <span>已选 {checked.size} 条</span>
            {status !== "dismissed" ? (
              <button
                type="button"
                onClick={() =>
                  void (async () => {
                    for (const id of checked) await act("inbox.dismiss", { id });
                    setChecked(new Set());
                  })()
                }
              >
                归档
              </button>
            ) : null}
            <button type="button" onClick={() => setChecked(new Set())}>
              取消
            </button>
          </div>
        ) : null}
        <div className="resource-list">
          {items.map((c) => (
            <div key={c.id} className={`knowledge-inbox-item ${c.id === selected ? "active" : ""}`}>
              <input
                type="checkbox"
                aria-label={`选择收集记录 ${c.title}`}
                checked={checked.has(c.id)}
                onChange={(e) =>
                  setChecked((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(c.id);
                    else n.delete(c.id);
                    return n;
                  })
                }
              />
              <button type="button" data-testid="capture-item" onClick={() => setSelected(c.id)}>
                <div className="knowledge-inbox-item-meta">
                  <span>{c.source}</span>
                  <time>{shortDate(c.createdAt)}</time>
                </div>
                <strong>{c.title}</strong>
                <p>{c.body.slice(0, 90)}</p>
                {c.result ? (
                  <span className="knowledge-inbox-converted">
                    <Check size={12} aria-hidden /> 已转为{TARGET_TEXT[c.result.kind as Target] ?? "关联内容"}
                  </span>
                ) : null}
              </button>
            </div>
          ))}
          {items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={query ? "没有匹配的内容" : status === "pending" ? "收件箱已清空" : "暂无记录"}
              hint={query ? "试试其他关键词。" : status === "pending" ? "现在可以安心专注于真正重要的事情。" : "处理后的记录会保留在这里。"}
              action={
                query ? (
                  <Button variant="ghost" onClick={() => setQuery("")}>
                    清空搜索
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setDialog({ kind: "edit", item: null })}>
                    捕获新想法
                  </Button>
                )
              }
            />
          ) : null}
        </div>
        <div className="knowledge-resource-footer">
          <span>保留来源 · 保留上下文</span>
          <Inbox size={14} aria-hidden />
        </div>
      </aside>
      <section className="view-content knowledge-inbox-main">
        <PageHead
          title={t.title}
          description="捕获想法，整理为笔记、任务或档案。"
          actions={
            <Button icon={Plus} onClick={() => setDialog({ kind: "edit", item: null })}>
              快速捕获
            </Button>
          }
        />
        <form
          className="knowledge-quick-capture"
          onSubmit={(e) => {
            e.preventDefault();
            const body = draft.trim();
            if (body) void act("inbox.capture", { body }).then((ok) => ok && setDraft(""));
          }}
        >
          <Sparkles size={18} aria-hidden />
          <input aria-label="快速捕获想法" placeholder={t.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" variant="primary" icon={ArrowRight} disabled={!draft.trim()}>
            收集
          </Button>
        </form>
        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
        {cur ? (
          <article className="knowledge-inbox-detail">
            <div className="knowledge-inbox-detail-meta">
              <Badge tone={cur.status === "pending" ? "violet" : cur.status === "processed" ? "success" : "neutral"}>{t.statuses[cur.status]}</Badge>
              <span>{cur.source}</span>
              <span>·</span>
              <span>{new Date(cur.createdAt ?? 0).toLocaleString("zh-CN")}</span>
              <span className="grow" />
              <IconButton icon={Pencil} label="编辑收集条目" onClick={() => setDialog({ kind: "edit", item: cur })} />
              <IconButton icon={Trash2} label="删除收集记录" onClick={() => setDialog({ kind: "delete", item: cur })} />
            </div>
            <h2>{cur.title}</h2>
            <div className="knowledge-inbox-note">
              <MarkdownPreview source={cur.body.trim() || "这条记录还没有补充内容。"} />
            </div>
            {cur.status === "pending" ? (
              <>
                <div className="knowledge-processing-heading">
                  <h3>{t.next}</h3>
                  <p>选择一种整理方式，保留原始记录与关联。</p>
                </div>
                <div className="knowledge-convert-options">
                  <button type="button" onClick={() => setDialog({ kind: "convert", item: cur, target: "task" })}>
                    <span>
                      <CircleCheck size={21} aria-hidden />
                    </span>
                    <strong>{t.toTask}</strong>
                    <p>一个需要完成的行动</p>
                    <ArrowUpRight size={15} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setDialog({ kind: "convert", item: cur, target: "note" })}>
                    <span>
                      <FileText size={21} aria-hidden />
                    </span>
                    <strong>{t.toNote}</strong>
                    <p>值得继续思考的内容</p>
                    <ArrowUpRight size={15} aria-hidden />
                  </button>
                  <button type="button" disabled={noTypes} title={noTypes ? t.noArchiveType : undefined} onClick={() => setDialog({ kind: "convert", item: cur, target: "archive" })}>
                    <span>
                      <Archive size={21} aria-hidden />
                    </span>
                    <strong>{t.toArchive}</strong>
                    <p>{noTypes ? t.noArchiveType : "需要长期保存的信息"}</p>
                    <ArrowUpRight size={15} aria-hidden />
                  </button>
                </div>
                <div className="knowledge-inbox-bottom">
                  <span className="muted small">暂时没有后续行动？可以归档保留。</span>
                  <Button icon={Archive} onClick={() => void act("inbox.dismiss", { id: cur.id })}>
                    {t.dismiss}
                  </Button>
                </div>
              </>
            ) : null}
            {cur.status === "processed" ? (
              <div className="knowledge-converted-result">
                <span className="knowledge-result-check">
                  <Check size={22} aria-hidden />
                </span>
                <div>
                  <h3>{t.processed}</h3>
                  <p>
                    已转为{TARGET_TEXT[(cur.result?.kind as Target) ?? "task"] ?? "关联内容"} · {cur.result?.id}
                  </p>
                  <div className="row">
                    <Button variant="ghost" icon={Undo2} onClick={() => setDialog({ kind: "undo", item: cur })}>
                      {t.undo}
                    </Button>
                    <Button variant="ghost" icon={Archive} onClick={() => void act("inbox.dismiss", { id: cur.id })}>
                      归档记录
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {cur.status === "dismissed" ? (
              <div className="knowledge-dismissed-result">
                <Archive size={26} aria-hidden />
                <h3>这条记录已归档</h3>
                <p>内容仍然保留。需要继续处理时，可以放回收件箱。</p>
                <Button icon={RotateCcw} onClick={() => void act("inbox.restore", { id: cur.id })}>
                  {t.restore}
                </Button>
              </div>
            ) : null}
          </article>
        ) : (
          <EmptyState icon={Inbox} title="一张清爽的工作桌" hint="新的灵感可以先放在这里，再从容地整理。" />
        )}
      </section>
      {dialog?.kind === "edit" ? (
        <EditDialog
          error={error}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSave={async (v) =>
            (dialog.item ? await act("inbox.update", { id: dialog.item.id, expectedVersion: dialog.item.version, title: v.title, body: v.body }) : await act("inbox.capture", { title: v.title, body: v.body, source: v.source })) &&
            (setDialog(null), true)
          }
        />
      ) : null}
      {dialog?.kind === "convert" ? (
        <ConvertDialog
          error={error}
          item={dialog.item}
          target={dialog.target}
          types={types.data ?? []}
          onClose={() => setDialog(null)}
          onSubmit={async (fields) => (await act("inbox.convert", { id: dialog.item.id, target: dialog.target, fields })) && (setDialog(null), true)}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <Dialog
          open
          error={error}
          title="永久删除收集记录？"
          description="只删除原始收集记录；此前转化生成的笔记、任务或档案会保留。"
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() =>
                  void act("inbox.delete", { id: dialog.item.id }).then((ok) => {
                    if (ok) {
                      setSelected(null);
                      setDialog(null);
                    }
                  })
                }
              >
                删除记录
              </Button>
            </>
          }
        >
          <p className="confirm-description">记录会移到回收站。</p>
        </Dialog>
      ) : null}
      {dialog?.kind === "undo" ? (
        <Dialog
          open
          error={error}
          title="撤销这次处理？"
          description="条目会返回待处理。已生成的笔记、任务或档案不会被删除。"
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>取消</Button>
              <Button variant="primary" onClick={() => void act("inbox.undo", { id: dialog.item.id }).then((ok) => ok && setDialog(null))}>
                撤销处理
              </Button>
            </>
          }
        >
          <p className="confirm-description">撤销后可以重新选择整理方式。</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function EditDialog({ error, item, onClose, onSave }: { error: string | null; item: Capture | null; onClose(): void; onSave(v: { title: string; body: string; source: string }): Promise<boolean | undefined> }) {
  const [v, setV] = useState({ title: item?.title ?? "", body: item?.body ?? "", source: item?.source ?? SOURCES[0]! });
  return (
    <Dialog
      open
      error={error}
      title={item ? "编辑收集条目" : "快速捕获"}
      description="先把想法放进来，稍后再决定它应该去哪里。"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!v.title.trim()} onClick={() => void onSave(v)}>
            {item ? "保存修改" : "收进收件箱"}
          </Button>
        </>
      }
    >
      <div className="form-body">
        <Field label="标题">
          <input autoFocus aria-label="标题" placeholder="记录一个想法、链接或行动" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="内容">
          <textarea aria-label="内容" rows={6} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        </Field>
        {item ? null : (
          <Field label="来源">
            <select aria-label="来源" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function ConvertDialog({
  error,
  item,
  target,
  types,
  onClose,
  onSubmit,
}: {
  error: string | null;
  item: Capture;
  target: Target;
  types: ArchiveType[];
  onClose(): void;
  onSubmit(fields: Record<string, unknown>): Promise<boolean | undefined>;
}) {
  const label = TARGET_TEXT[target];
  const [name, setName] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [due, setDue] = useState("");
  const [type, setType] = useState(types[0]?.id ?? "");
  return (
    <Dialog
      open
      error={error}
      title={`转为${label}`}
      description="原始收集记录会保留在已处理列表，并记录生成内容的关联。"
      onClose={onClose}
      testId="convert-dialog"
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => void onSubmit(target === "task" ? { title: name.trim(), body, ...(due ? { due } : {}) } : target === "note" ? { name: name.trim(), template: "blank" } : { name: name.trim(), type, body })}
          >
            创建{label}并完成处理
          </Button>
        </>
      }
    >
      <div className="form-body">
        <Field label={`${label}名称`}>
          <input autoFocus aria-label={`${label}名称`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {target === "task" ? (
          <Field label="截止日期">
            <input type="date" aria-label="截止日期" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        ) : null}
        {target === "archive" ? (
          <Field label="档案类型">
            <select aria-label="档案类型" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {target !== "note" ? (
          <Field label="内容">
            <textarea aria-label="内容" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}
