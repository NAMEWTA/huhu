import type { RichEditorPort } from "@huhu/editor/rich";
import { agentById } from "@huhu/plugin-agent-cli/shared";
import { normalizeTag, type TaskDto, type TaskHistorySelection } from "@huhu/contracts";
import { Button, Combobox, DateTimePicker, Dialog, Field, IconButton, Select } from "@huhu/ui";
import { createRequestId, host, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Bell, FileText, FolderOpen, Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { draftFromTask, draftToWritable, emptyDraft, validateDraft, type TaskDraft } from "../shared/draft.js";
import { followUpInstants, followUpWallTime } from "../shared/follow-up-time.js";
import { t } from "./i18n.js";
import { TaskMarkdownInput } from "./compact.js";
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

const newId = (): string => `rem-${createRequestId()}`;

type DispatchTarget = { mode: "new" | "existing" | "resume"; provider: string; sessionId?: string; nativeSessionId?: string; history?: TaskHistorySelection; historyTitle?: string; available: boolean; reason: string | null };

function historyOption(nativeId: string, selection: TaskHistorySelection | undefined): string {
  return JSON.stringify(["resume", nativeId, selection?.historyId, selection?.historyRevision, selection?.machineId, selection?.spaceId, selection?.spaceRevision]);
}

function DispatchTargetSelect({ spaceId, target, error, onChange }: { spaceId: string; target: TaskDraft["target"]; error: string | null; onChange(target: TaskDraft["target"], provider?: string): void }) {
  const field = useId();
  const query = useCapability<DispatchTarget[]>("tasks.dispatch.targets", { spaceId });
  const entries = (query.data ?? []).flatMap((entry) => {
    if (entry.mode === "existing" && entry.sessionId) return [{ ...entry, value: `session:${entry.sessionId}`, label: entry.sessionId }];
    if (entry.mode === "resume" && entry.nativeSessionId && entry.history)
      return [{ ...entry, value: historyOption(entry.nativeSessionId, entry.history), label: `${entry.historyTitle ?? "原生历史"} · ${entry.nativeSessionId.slice(0, 8)}` }];
    return [];
  });
  const picked = target?.mode === "existing" ? target.sessionId : null;
  const savedHistory = target?.mode === "resume";
  const value = picked ? `session:${picked}` : savedHistory ? historyOption(target.nativeSessionId, target.history) : "new";
  const missing = value !== "new" && !entries.some((entry) => entry.value === value);
  const message = error ?? (savedHistory && missing && query.isSuccess ? "原生历史已变化或不可用，请重新选择。" : null);
  const renderOption = ({ value, label, provider, available, reason }: (typeof entries)[number]) => {
    const waiting = reason === "input_owned" || reason === "binding_unverified" || reason === "history_writer_busy";
    return (
      <option key={value} value={value} disabled={!available && !waiting}>
        {agentById(provider)?.displayName ?? provider} · {label} · {available ? "可用" : waiting ? "等待会话可用" : "当前不可用"}
      </option>
    );
  };
  const live = entries.filter((entry) => entry.mode === "existing");
  const history = entries.filter((entry) => entry.mode === "resume");
  const unsupported = (query.data ?? []).filter((entry) => entry.mode === "resume" && !entry.history);
  return (
    <div className="hu-field">
      <label className="hu-field-label" htmlFor={field}>
        会话目标
      </label>
      <Select
        id={field}
        name="executionTarget"
        value={value}
        aria-invalid={message ? true : undefined}
        aria-describedby={`${field}-hint${message ? ` ${field}-error` : ""}`}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "new") return onChange({ mode: "new" });
          const selected = entries.find((entry) => entry.value === next);
          if (selected?.mode === "existing" && selected.sessionId) onChange({ mode: "existing", sessionId: selected.sessionId });
          if (selected?.mode === "resume" && selected.nativeSessionId && selected.history) onChange({ mode: "resume", nativeSessionId: selected.nativeSessionId, history: selected.history }, selected.provider);
        }}
      >
        <option value="new">新建会话</option>
        {missing ? (
          <option value={value} disabled>
            {savedHistory ? `原生历史 · ${target.nativeSessionId.slice(0, 8)}` : "原会话"} · 当前不可用
          </option>
        ) : null}
        {live.length > 0 ? <optgroup label="现有会话">{live.map(renderOption)}</optgroup> : null}
        {history.length > 0 || unsupported.length > 0 ? (
          <optgroup label="原生历史">
            {history.map(renderOption)}
            {unsupported.map(({ provider }) => (
              <option key={provider} value={`history-unavailable:${provider}`} disabled>
                {agentById(provider)?.displayName ?? provider} · {provider === "codex" ? "没有符合条件的受控历史" : "暂不支持受控历史派遣"}
              </option>
            ))}
          </optgroup>
        ) : null}
      </Select>
      {message ? (
        <p id={`${field}-error`} className="hu-field-error">
          {message}
        </p>
      ) : null}
      <p id={`${field}-hint`} role="status" className="tasks-hint">
        {query.isPending ? "正在读取工作区会话…" : query.error ? "暂时无法读取工作区会话，重连后可再选择。" : history.length ? "" : "当前工作区没有可派遣的受控 Codex 历史。"}
      </p>
    </div>
  );
}

/** 新建 / 编辑任务（原型 TaskEditor）：左栏 名称 / 内容 / 截止日 / 项目 / 关联资料；右栏 执行方式 / 提醒。保存永远不会启动 Agent。 */
export function TaskEditor({ task, initial, projects, onClose, onSaved }: { task: TaskDto | null; initial?: Partial<TaskDraft>; projects: string[]; onClose(): void; onSaved(saved: TaskDto): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const refs = useReferenceIndex();
  const [tagInput, setTagInput] = useState("");
  const providers = useCapability<Detected[]>("agent.catalog.detect", {});
  const start = useRef(task).current; // 打开时的快照：保存用它的 version 做冲突检测，不受后台刷新影响
  const [draft, setDraft] = useState<TaskDraft>(() => (start ? draftFromTask(start) : emptyDraft(initial)));
  const original = useRef(JSON.stringify(draft)).current;
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [bodyPort, setBodyPort] = useState<RichEditorPort | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const zone = useCapability<{ dateTime: { zone: string } }>("settings.get", {}).data?.dateTime.zone;
  const availableField = useId();
  const [wallOverride, setWallOverride] = useState<string | null>(null);
  const [instantChoice, setInstantChoice] = useState("");
  const [availableError, setAvailableError] = useState("");
  const scheduleZone = useMemo(() => {
    if (!zone) return null;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: zone });
      return zone;
    } catch {
      return null;
    }
  }, [zone]);
  const wall = wallOverride ?? (draft.availableAt && scheduleZone ? followUpWallTime(draft.availableAt, scheduleZone) : "");
  const instants = useMemo(() => (wallOverride && scheduleZone ? followUpInstants(wallOverride, scheduleZone) : []), [wallOverride, scheduleZone]);
  const selectedInstant = instants.length === 1 ? instants[0] : instants.find((instant) => instant === instantChoice);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const usable = useMemo(() => (providers.data ?? []).filter((p) => p.headless && p.installed), [providers.data]);
  const models = agentById(draft.provider ?? "")?.options.models ?? [];
  const model = models.find((m) => m.id === draft.model);
  const canFast = model?.fast === true;
  const readDraft = async (): Promise<TaskDraft> => {
    if (!bodyPort) return draft;
    await bodyPort.flush();
    return { ...draft, body: bodyPort.getDraft() };
  };
  const requestClose = async () => {
    if (savingRef.current) return;
    try {
      if (wallOverride !== null || JSON.stringify(await readDraft()) !== original) setDiscard(true);
      else onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  };

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
      chooseSpace(sp.id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  function chooseSpace(spaceId: string | null) {
    setDraft((current) => ({
      ...current,
      spaceId,
      target: current.spaceId === spaceId || current.target?.mode === "new" ? current.target : current.target?.mode === "resume" ? { mode: "resume", nativeSessionId: current.target.nativeSessionId } : null,
    }));
  }

  async function save() {
    if (savingRef.current || bodyPort?.isComposing()) return;
    savingRef.current = true;
    setSaving(true);
    setFailure(null);
    try {
      const current = await readDraft();
      const bad = validateDraft(current);
      setProblems(bad);
      const missingInstant = Boolean(wallOverride && !selectedInstant);
      if (missingInstant) {
        setAvailableError(!scheduleZone ? "工作台时区不可用。" : instants.length ? "请选择回拨时段的 UTC 偏移。" : "此时区没有这个时间，请另选时间。");
      }
      if (bad.length > 0 || missingInstant) return;
      const w = draftToWritable({ ...current, availableAt: wallOverride === null ? current.availableAt : (selectedInstant ?? null) });
      const saved = start
        ? await engine.call<TaskDto>("tasks.update", { id: start.id, expectedVersion: start.version, baseEditHash: start.editHash, patch: w }, { write: true })
        : await engine.call<TaskDto>("tasks.create", w, { write: true });
      onSaved(saved);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const err = (k: string): string | null => (problems.includes(k) ? (t.editor.errors[k] ?? null) : null);

  return (
    <Dialog open wide testId="task-editor" title={task ? t.editor.editTitle : t.editor.newTitle} description={t.editor.description} onClose={requestClose}>
      <form
        className="hu-form-columns"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="hu-form-grid">
          <div className="hu-form-primary">
            <Field label={t.editor.name} error={err("title")}>
              <input autoFocus aria-label={t.editor.name} aria-invalid={problems.includes("title") || undefined} value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder={t.editor.namePlaceholder} />
            </Field>
            <Field label={t.editor.body}>
              <div className="tasks-body-editor" data-testid="task-body">
                <TaskMarkdownInput id={`task-body-${start?.id ?? "new"}`} value={draft.body} onChange={(v) => set("body", v)} onPort={setBodyPort} refs={refs} placeholder={t.editor.bodyLabel} />
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
                <DateTimePicker label={t.editor.due} field={{ kind: "date", value: draft.due }} onChange={(next) => { if (next.kind === "date") set("due", next.value); }} data-testid="task-due" />
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
            <div className="hu-field">
              <label className="hu-field-label" htmlFor={availableField}>
                最早派遣时间
              </label>
              <DateTimePicker
                label="最早派遣时间"
                id={availableField}
                name="availableAt"
                field={{ kind: "local-date-time", zone: scheduleZone ?? "", value: wall ? { local: wall } : null }}
                step={60}
                disabled={!scheduleZone}
                data-testid="task-available-at"
                aria-invalid={Boolean(availableError) || undefined}
                aria-describedby={`${availableField}-hint${availableError ? ` ${availableField}-error` : ""}`}
                onChange={(next) => {
                  if (next.kind !== "local-date-time") return;
                  setWallOverride(next.value?.local.slice(0, 16) ?? "");
                  setInstantChoice("");
                  setAvailableError("");
                }}
              />
              <p id={`${availableField}-hint`} className="tasks-hint">
                {scheduleZone ? `工作台时区 ${scheduleZone}` : "工作台时区不可用。"} · 可留空
              </p>
              {instants.length > 1 && scheduleZone ? (
                <fieldset>
                  <legend>回拨时间的 UTC 偏移</legend>
                  {instants.map((instant) => {
                    const offset = new Intl.DateTimeFormat("en", { timeZone: scheduleZone, timeZoneName: "longOffset" }).formatToParts(new Date(instant)).find(({ type }) => type === "timeZoneName")?.value;
                    return (
                      <label key={instant} className="row">
                        <input
                          type="radio"
                          name={`${availableField}-offset`}
                          checked={instantChoice === instant}
                          onChange={() => {
                            setInstantChoice(instant);
                            setAvailableError("");
                          }}
                        />
                        {offset} · <time dateTime={instant}>{instant}</time>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              {availableError ? (
                <p id={`${availableField}-error`} className="hu-field-error" role="alert">
                  {availableError}
                </p>
              ) : null}
            </div>
          </div>
          <aside className="hu-form-aside">
            <div className="tasks-execution-fields">
              <Field label={t.editor.type}>
                <Select aria-label={t.editor.type} value={draft.type} onChange={(e) => set("type", e.target.value === "agent" ? "agent" : "human")} data-testid="task-type">
                  <option value="human">{t.editor.human}</option>
                  <option value="agent">{t.editor.agent}</option>
                </Select>
              </Field>
              {draft.type === "agent" ? (
                <div className="tasks-execution-fields" data-testid="task-agent-fields">
                  <Field label={t.editor.space} error={err("space")}>
                    {spaces.data && spaces.data.length === 0 ? (
                      <p className="tasks-hint">{t.editor.spaceEmpty}</p>
                    ) : (
                      <Select aria-label={t.editor.space} value={draft.spaceId ?? ""} onChange={(e) => chooseSpace(e.target.value || null)}>
                        <option value="">{t.editor.spaceNone}</option>
                        {(spaces.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.root}
                          </option>
                        ))}
                      </Select>
                    )}
                    {host()?.pickOpenPath ? (
                      <Button icon={FolderOpen} data-testid="task-pick-dir" onClick={() => void chooseLocalDir()}>
                        {t.editor.pickDir}
                      </Button>
                    ) : null}
                  </Field>
                  {draft.spaceId ? (
                    <DispatchTargetSelect
                      spaceId={draft.spaceId}
                      target={draft.target}
                      error={err("target")}
                      onChange={(target, provider) => {
                        setProblems((current) => current.filter((problem) => problem !== "target"));
                        setDraft((current) => (provider ? { ...current, target, provider, model: null, effort: null, fast: false } : { ...current, target }));
                      }}
                    />
                  ) : null}
                  {!draft.target || draft.target.mode === "new" ? (
                    <>
                      <Field label={t.editor.cli} error={err("provider")}>
                        {providers.data && usable.length === 0 ? (
                          <p className="tasks-hint">{t.editor.cliEmpty}</p>
                        ) : (
                          <Select aria-label={t.editor.cliLabel} value={draft.provider ?? ""} onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value || null, model: null, effort: null }))}>
                            <option value="">{t.editor.cliNone}</option>
                            {usable.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.displayName}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field label={t.editor.model}>
                        <Select aria-label={t.editor.model} value={draft.model ?? ""} disabled={models.length === 0} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || null, effort: null }))}>
                          <option value="">{t.editor.modelDefault}</option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t.editor.effort}>
                        <Select aria-label={t.editor.effort} value={draft.effort ?? ""} disabled={!model || model.efforts.length === 0} onChange={(e) => set("effort", e.target.value || null)}>
                          <option value="">{t.editor.effortDefault}</option>
                          {(model?.efforts ?? []).map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {canFast ? (
                        <label className="row">
                          <input type="checkbox" checked={draft.fast} onChange={(e) => set("fast", e.target.checked)} /> {t.editor.fast}
                        </label>
                      ) : null}
                    </>
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
                    <Select aria-label={t.editor.reminderChannel(i + 1)} value="in_app" onChange={() => undefined}>
                      <option value="in_app">{t.editor.channelInApp}</option>
                      {t.editor.channelUnsupported.map((c) => (
                        <option key={c} disabled>
                          {c}
                        </option>
                      ))}
                    </Select>
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
                    field={{ kind: "instant", value: r.at }}
                    clearable={false}
                    onChange={(next) => {
                      if (next.kind !== "instant") return;
                      set("reminders", draft.reminders.map((x) => (x.id === r.id ? { ...x, at: next.value, deliveredAt: null } : x)));
                    }}
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
        <div className="hu-form-actions">
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
