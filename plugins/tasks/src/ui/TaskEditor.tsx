import { agentById } from "@huhu/plugin-agent-cli/shared";
import { normalizeTag, type TaskDto } from "@huhu/contracts";
import { MarkdownEditor, referenceCompletion } from "@huhu/editor";
import { Button, Combobox, DateTimePicker, Dialog, Field, IconButton } from "@huhu/ui";
import { host, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Bell, FileText, FolderOpen, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { draftFromTask, draftToWritable, emptyDraft, validateDraft, type TaskDraft } from "../shared/draft.js";
import { t } from "./i18n.js";
import { useReferenceIndex } from "./references.js";

interface Space {
  id: string;
  name: string;
  root: string;
}
interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
  headless: boolean;
}

const newId = (): string => `rem-${globalThis.crypto.randomUUID()}`;

/** 新建 / 编辑任务（原型 TaskEditor）：左栏 名称 / 内容 / 截止日 / 项目 / 关联资料；右栏 执行方式 / 提醒。保存永远不会启动 Agent。 */
export function TaskEditor({ task, initial, projects, onClose, onSaved }: { task: TaskDto | null; initial?: Partial<TaskDraft>; projects: string[]; onClose(): void; onSaved(saved: TaskDto): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const refs = useReferenceIndex();
  const extensions = useMemo(() => [referenceCompletion(refs.search)], [refs.search]);
  const [tagInput, setTagInput] = useState("");
  const providers = useCapability<Detected[]>("agent.catalog.detect", {});
  const start = useRef(task).current; // 打开时的快照：保存用它的 version 做冲突检测，不受后台刷新影响
  const [draft, setDraft] = useState<TaskDraft>(() => (start ? draftFromTask(start) : emptyDraft(initial)));
  const original = useRef(JSON.stringify(draft)).current;
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const usable = useMemo(() => (providers.data ?? []).filter((p) => p.headless && p.installed), [providers.data]);
  const models = agentById(draft.provider ?? "")?.options.models ?? [];
  const model = models.find((m) => m.id === draft.model);
  const canFast = model?.fast === true;
  const dirty = JSON.stringify(draft) !== original;
  const requestClose = () => (dirty ? setDiscard(true) : onClose());

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag && !draft.tags.includes(tag) && draft.tags.length < 20) set("tags", [...draft.tags, tag]);
    setTagInput("");
  };
  /** 选择一个本地目录作为工作目录：复用路径相同的 Space，没有就通过 agent.spaces.save 新建，不另外保存目录数据。 */
  async function chooseLocalDir() {
    const picked = await host()?.pickOpenPath("directory");
    if (!picked) return;
    try {
      const same = (spaces.data ?? []).find((s) => s.root === picked);
      const sp = same ?? (await engine.call<Space>("agent.spaces.save", { name: picked.split(/[\\/]/).filter(Boolean).at(-1) ?? picked, root: picked }, { write: true }));
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.spaces") });
      set("spaceId", sp.id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    const bad = validateDraft(draft);
    setProblems(bad);
    if (bad.length > 0) return;
    setSaving(true);
    setFailure(null);
    try {
      const w = draftToWritable(draft);
      const saved = start
        ? await engine.call<TaskDto>("tasks.update", { id: start.id, expectedVersion: start.version, baseInputHash: start.inputHash, patch: w }, { write: true })
        : await engine.call<TaskDto>("tasks.create", w, { write: true });
      onSaved(saved);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const err = (k: string) => (problems.includes(k) ? t.editor.errors[k] : null);

  return (
    <Dialog open wide testId="task-editor" title={task ? t.editor.editTitle : t.editor.newTitle} description={t.editor.description} onClose={requestClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="hu-tw-editor-grid">
          <div className="automations-editor-body">
            <Field label={t.editor.name} error={err("title")}>
              <input autoFocus aria-label={t.editor.name} aria-invalid={problems.includes("title") || undefined} value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder={t.editor.namePlaceholder} />
            </Field>
            <Field label={t.editor.body}>
              <div className="automations-description-input tasks-body-editor" data-testid="task-body">
                <MarkdownEditor documentId={`task-body-${start?.id ?? "new"}`} value={draft.body} mode="source" lineNumbers={false} ariaLabel={t.editor.bodyLabel} extensions={extensions} onChange={(v) => set("body", v)} />
              </div>
              <p className="tasks-hint">{t.editor.bodyHint}</p>
            </Field>
            <Field label={t.editor.tags}>
              <div className="hu-tw-tag-input" data-testid="task-tags">
                {draft.tags.map((tag) => (
                  <span key={tag} className="tasks-tag">
                    {tag}
                    <button
                      type="button"
                      aria-label={t.editor.removeTag(tag)}
                      onClick={() =>
                        set(
                          "tags",
                          draft.tags.filter((x) => x !== tag),
                        )
                      }
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </span>
                ))}
                <input
                  aria-label={t.editor.tags}
                  value={tagInput}
                  placeholder={t.editor.tagPlaceholder}
                  onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value.slice(0, -1)) : setTagInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (e.key === "Backspace" && tagInput === "" && draft.tags.length > 0) set("tags", draft.tags.slice(0, -1));
                  }}
                  onBlur={() => tagInput.trim() && addTag(tagInput)}
                />
              </div>
            </Field>
            <div className="tasks-two-fields">
              <Field label={t.editor.due}>
                <DateTimePicker label={t.editor.due} mode="date" value={draft.due} onChange={(v) => set("due", v)} testId="task-due" />
              </Field>
              <Field label={t.editor.project}>
                <Combobox
                  label={t.editor.projectLabel}
                  value={draft.project}
                  onChange={(v) => set("project", v)}
                  options={projects.map((p) => ({ value: p }))}
                  placeholder={t.editor.projectPlaceholder}
                  allowCustom
                  emptyText="还没有项目，直接输入新的项目名"
                  testId="task-project"
                />
              </Field>
            </div>
          </div>
          <aside className="automations-editor-aside">
            <div className="tasks-execution-fields">
              <Field label={t.editor.type}>
                <select aria-label={t.editor.type} value={draft.type} onChange={(e) => set("type", e.target.value === "agent" ? "agent" : "human")} data-testid="task-type">
                  <option value="human">{t.editor.human}</option>
                  <option value="agent">{t.editor.agent}</option>
                </select>
              </Field>
              {draft.type === "agent" ? (
                <div className="tasks-execution-fields" data-testid="task-agent-fields">
                  <Field label={t.editor.space} error={err("space")}>
                    {spaces.data && spaces.data.length === 0 ? (
                      <p className="tasks-hint">{t.editor.spaceEmpty}</p>
                    ) : (
                      <select aria-label={t.editor.space} value={draft.spaceId ?? ""} onChange={(e) => set("spaceId", e.target.value || null)}>
                        <option value="">{t.editor.spaceNone}</option>
                        {(spaces.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.root}
                          </option>
                        ))}
                      </select>
                    )}
                    {host()?.pickOpenPath ? (
                      <Button icon={FolderOpen} data-testid="task-pick-dir" onClick={() => void chooseLocalDir()}>
                        {t.editor.pickDir}
                      </Button>
                    ) : null}
                  </Field>
                  <Field label={t.editor.cli} error={err("provider")}>
                    {providers.data && usable.length === 0 ? (
                      <p className="tasks-hint">{t.editor.cliEmpty}</p>
                    ) : (
                      <select aria-label={t.editor.cliLabel} value={draft.provider ?? ""} onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value || null, model: null, effort: null }))}>
                        <option value="">{t.editor.cliNone}</option>
                        {usable.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label={t.editor.model}>
                    <select aria-label={t.editor.model} value={draft.model ?? ""} disabled={models.length === 0} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || null, effort: null }))}>
                      <option value="">{t.editor.modelDefault}</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.editor.effort}>
                    <select aria-label={t.editor.effort} value={draft.effort ?? ""} disabled={!model || model.efforts.length === 0} onChange={(e) => set("effort", e.target.value || null)}>
                      <option value="">{t.editor.effortDefault}</option>
                      {(model?.efforts ?? []).map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {canFast ? (
                    <label className="row">
                      <input type="checkbox" checked={draft.fast} onChange={(e) => set("fast", e.target.checked)} /> {t.editor.fast}
                    </label>
                  ) : null}
                  <p className="tasks-hint">{t.editor.agentHint}</p>
                </div>
              ) : null}
            </div>
            <section className="hu-tw-reminders-editor">
              <div className="hu-tw-section-label">
                <Bell size={14} aria-hidden />
                <strong>{t.editor.reminders}</strong>
                <Button variant="ghost" icon={Plus} onClick={() => set("reminders", [...draft.reminders, { id: newId(), at: null, enabled: true, deliveredAt: null }])}>
                  {t.editor.addReminder}
                </Button>
              </div>
              <p className="tasks-hint">{t.editor.remindersHint}</p>
              {draft.reminders.map((r, i) => (
                <div key={r.id} className="hu-tw-reminder-config" data-testid="reminder-row">
                  <div>
                    <select aria-label={t.editor.reminderChannel(i + 1)} value="in_app" onChange={() => undefined}>
                      <option value="in_app">{t.editor.channelInApp}</option>
                      {t.editor.channelUnsupported.map((c) => (
                        <option key={c} disabled>
                          {c}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      icon={X}
                      label={t.editor.removeReminder(i + 1)}
                      onClick={() =>
                        set(
                          "reminders",
                          draft.reminders.filter((x) => x.id !== r.id),
                        )
                      }
                    />
                  </div>
                  <DateTimePicker
                    label={t.editor.reminderAt(i + 1)}
                    mode="datetime"
                    value={r.at}
                    clearable={false}
                    onChange={(v) =>
                      set(
                        "reminders",
                        draft.reminders.map((x) => (x.id === r.id ? { ...x, at: v, deliveredAt: null } : x)),
                      )
                    }
                  />
                  {r.deliveredAt ? <small>{t.editor.delivered}</small> : null}
                </div>
              ))}
              {err("reminder") ? (
                <p role="alert" className="hu-field-error">
                  {err("reminder")}
                </p>
              ) : null}
            </section>
          </aside>
        </div>
        {failure ? (
          <p className="tasks-form-error" role="alert">
            {t.editor.saveFailed}：{failure}
          </p>
        ) : null}
        <div className="automations-modal-actions">
          {discard ? (
            <>
              <span role="alert">{t.editor.discardTitle}</span>
              <Button onClick={() => setDiscard(false)}>{t.editor.discardKeep}</Button>
              <Button variant="danger" onClick={onClose}>
                {t.editor.discardDo}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={requestClose}>
                {t.editor.cancel}
              </Button>
              <Button type="submit" icon={FileText} loading={saving} data-testid="task-save">
                {t.editor.save}
              </Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
