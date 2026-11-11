import type { TaskDto } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog, Field, IconButton } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { Bell, FileText, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { draftFromTask, draftToWritable, emptyDraft, validateDraft, type TaskDraft } from "../shared/draft.js";
import { t } from "./i18n.js";
import { ResourcePicker } from "./ResourcePicker.js";

interface Space {
  id: string;
  name: string;
  root: string;
}
interface Provider {
  provider: string;
  displayName: string;
  status: string;
  headless: boolean;
  models: { id: string; label: string; efforts: string[] }[];
}

const newId = (): string => `rem-${globalThis.crypto.randomUUID()}`;

/** 新建 / 编辑任务（原型 TaskEditor）：左栏 名称 / 内容 / 截止日 / 项目 / 关联资料；右栏 执行方式 / 提醒。保存永远不会启动 Agent。 */
export function TaskEditor({ task, initial, projects, onClose, onSaved }: { task: TaskDto | null; initial?: Partial<TaskDraft>; projects: string[]; onClose(): void; onSaved(saved: TaskDto): void }) {
  const engine = useEngine();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const providers = useCapability<Provider[]>("agent.providers.detect", {});
  const start = useRef(task).current; // 打开时的快照：保存用它的 version 做冲突检测，不受后台刷新影响
  const [draft, setDraft] = useState<TaskDraft>(() => (start ? draftFromTask(start) : emptyDraft(initial)));
  const original = useRef(JSON.stringify(draft)).current;
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const usable = useMemo(() => (providers.data ?? []).filter((p) => p.headless && p.status === "found"), [providers.data]);
  const prov = usable.find((p) => p.provider === draft.provider);
  const model = prov?.models.find((m) => m.id === draft.model);
  const dirty = JSON.stringify(draft) !== original;
  const requestClose = () => (dirty ? setDiscard(true) : onClose());

  async function save() {
    const bad = validateDraft(draft);
    setProblems(bad);
    if (bad.length > 0) return;
    setSaving(true);
    setFailure(null);
    try {
      const w = draftToWritable(draft);
      const saved = start ? await engine.call<TaskDto>("tasks.update", { id: start.id, expectedVersion: start.version, patch: w }, { write: true }) : await engine.call<TaskDto>("tasks.create", w, { write: true });
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
        <div className="tw-editor-grid">
          <div className="tw-editor-body">
            <Field label={t.editor.name} error={err("title")}>
              <input autoFocus aria-label={t.editor.name} aria-invalid={problems.includes("title") || undefined} value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder={t.editor.namePlaceholder} />
            </Field>
            <Field label={t.editor.body}>
              <textarea className="tw-description-input" aria-label={t.editor.bodyLabel} value={draft.body} onChange={(e) => set("body", e.target.value)} placeholder={t.editor.bodyPlaceholder} />
            </Field>
            <div className="tw-two-fields">
              <Field label={t.editor.due}>
                <DateTimePicker label={t.editor.due} mode="date" value={draft.due} onChange={(v) => set("due", v)} testId="task-due" />
              </Field>
              <Field label={t.editor.project}>
                <input aria-label={t.editor.projectLabel} list="task-projects" value={draft.project} onChange={(e) => set("project", e.target.value)} placeholder={t.editor.projectPlaceholder} />
                <datalist id="task-projects">
                  {projects.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="tw-resource-field">
              <h3>{t.editor.resources}</h3>
              <ResourcePicker value={draft.resources} onChange={(v) => set("resources", v)} />
              <p className="tw-hint">{t.editor.resourcesHint}</p>
            </div>
          </div>
          <aside className="tw-editor-aside">
            <div className="tw-execution-fields">
              <Field label={t.editor.execution}>
                <select aria-label={t.editor.execution} value={draft.kind} onChange={(e) => set("kind", e.target.value === "agent" ? "agent" : "manual")} data-testid="task-exec">
                  <option value="manual">{t.editor.manual}</option>
                  <option value="agent">{t.editor.agent}</option>
                </select>
              </Field>
              {draft.kind === "agent" ? (
                <div className="tw-execution-fields" data-testid="task-agent-fields">
                  <Field label={t.editor.space} error={err("space")}>
                    {spaces.data && spaces.data.length === 0 ? (
                      <p className="tw-hint">{t.editor.spaceEmpty}</p>
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
                  </Field>
                  <Field label={t.editor.cli} error={err("provider")}>
                    {providers.data && usable.length === 0 ? (
                      <p className="tw-hint">{t.editor.cliEmpty}</p>
                    ) : (
                      <select aria-label={t.editor.cliLabel} value={draft.provider ?? ""} onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value || null, model: null, effort: null }))}>
                        <option value="">{t.editor.cliNone}</option>
                        {usable.map((p) => (
                          <option key={p.provider} value={p.provider}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label={t.editor.model}>
                    <select aria-label={t.editor.model} value={draft.model ?? ""} disabled={!prov} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || null, effort: null }))}>
                      <option value="">{t.editor.modelDefault}</option>
                      {(prov?.models ?? []).map((m) => (
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
                  <p className="tw-hint">{t.editor.agentHint}</p>
                </div>
              ) : null}
            </div>
            <section className="tw-reminders-editor">
              <div className="tw-section-label">
                <Bell size={14} aria-hidden />
                <strong>{t.editor.reminders}</strong>
                <Button variant="ghost" icon={Plus} onClick={() => set("reminders", [...draft.reminders, { id: newId(), at: null, enabled: true, deliveredAt: null }])}>
                  {t.editor.addReminder}
                </Button>
              </div>
              <p className="tw-hint">{t.editor.remindersHint}</p>
              {draft.reminders.map((r, i) => (
                <div key={r.id} className="tw-reminder-config" data-testid="reminder-row">
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
                <p role="alert" className="field-error">
                  {err("reminder")}
                </p>
              ) : null}
            </section>
          </aside>
        </div>
        {failure ? (
          <p className="tw-form-error" role="alert">
            {t.editor.saveFailed}：{failure}
          </p>
        ) : null}
        <div className="modal-actions">
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
