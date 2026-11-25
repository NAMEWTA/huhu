import type { AutomationRuleFrontmatter, TaskDispatchWindow } from "@huhu/contracts";
import { Button, DateInput, DateTimePicker, Field, Select } from "@huhu/ui";
import { Clock } from "lucide-react";
import { useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import { validateSchedule } from "../shared/cron.js";
import { PRESETS, cronFor, presetOf, type PresetId } from "./cron-presets.js";
import { formatMoment } from "./plan-presentation.js";
import { t } from "./i18n.js";

export interface EditableRule {
  id: string;
  version: string;
  body: string;
  data: {
    title: string;
    enabled: boolean;
    trigger: { preset: string; cron: string; zone: string };
    action: AutomationRuleFrontmatter["action"];
    missedRunGraceMinutes?: number;
    legacyEnvironment?: boolean;
  };
}
type Action = AutomationRuleFrontmatter["action"];
export type RuleDraft = {
  title: string;
  trigger: AutomationRuleFrontmatter["trigger"];
  action: Action;
  body: string;
  missedRunGraceMinutes: number;
};
type Preview = {
  at: string;
  next: string[];
  candidates: { taskId: string; title: string }[];
  skipped: { taskId: string; title: string; reason: string; detail?: string }[];
  tasksDisabled: boolean;
};
/** 表单里的动作种类：agent 动作按输入来源拆成两项。 */
type FormKind = "agent_tasks" | "agent_prompt" | "terminal" | "reminder";
export type RuleTemplate = { kind: FormKind; title: string; cron: string };
const formKindOf = (a: Action | undefined): FormKind => (!a ? "reminder" : a.kind === "agent" ? (a.input.source === "tasks" ? "agent_tasks" : "agent_prompt") : a.kind);

interface Space {
  id: string;
  name: string;
  root: string;
  binding?: { status: "bound" | "needs-binding" };
}
interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
  headless: boolean;
  models?: { id: string; label: string; efforts: string[]; fast: boolean }[];
}

/** 规则编辑器（新建 / 编辑）：标题、触发（预设+时刻或 cron+时区）、动作（让 Agent 执行 / 运行终端命令 / 提醒），保存时默认保持暂停。 */
export function RuleEditor({
  rule,
  template,
  zone,
  onSave,
  onCancel,
  onDirty,
  waiting = false,
}: {
  rule?: EditableRule;
  template?: RuleTemplate;
  zone: string;
  onSave(draft: RuleDraft): Promise<boolean>;
  onDirty(): void;
  waiting?: boolean;
  onCancel?(): void;
}) {
  const engine = useEngine();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const providers = useCapability<Detected[]>("agent.catalog.detect", {});
  const [start] = useState(rule);
  const initialCron = start?.data.trigger.cron ?? template?.cron;
  const init = initialCron ? presetOf(initialCron) : { preset: "every5" as PresetId, time: "09:00" };
  const a = start?.data.action;
  const [title, setTitle] = useState(rule?.data.title ?? template?.title ?? "");
  const [preset, setPreset] = useState<PresetId>(init.preset);
  const [time, setTime] = useState(init.time);
  const [days, setDays] = useState(init.days ?? [1]);
  const [custom, setCustom] = useState(initialCron ?? "*/5 * * * *");
  const [tz, setTz] = useState(rule?.data.trigger.zone ?? zone);
  const [kind, setKind] = useState<FormKind>(template?.kind ?? formKindOf(a));
  const tasks = useCapability<{ id: string; title: string }[]>("tasks.list", {}, { enabled: kind === "reminder" });
  const prompt0 = a?.kind === "agent" && a.input.source === "prompt" ? a.input : null;
  const [text, setText] = useState(a?.kind === "reminder" ? a.text : "");
  const [mode, setMode] = useState<"notification" | "task" | "both">(a?.kind === "reminder" ? a.mode : "notification");
  const [taskId, setTaskId] = useState(a?.kind === "reminder" ? a.taskId ?? "" : "");
  const [spaceId, setSpaceId] = useState(prompt0?.spaceId ?? (a?.kind === "terminal" ? (a.spaceId ?? "") : ""));
  const [provider, setProvider] = useState(prompt0?.provider ?? "");
  const [model, setModel] = useState(prompt0?.model ?? "");
  const [effort, setEffort] = useState(prompt0?.effort ?? "");
  const [fast, setFast] = useState(prompt0?.fast ?? false);
  const [prompt, setPrompt] = useState(prompt0 || (a?.kind === "agent" && a.input.source === "tasks") ? (rule?.body ?? "") : "");
  const originalScan = a?.kind === "agent" && a.input.source === "tasks" ? a.input : null;
  const [tagsText, setTagsText] = useState(originalScan?.tags.join(", ") ?? "");
  const [windowKind, setWindowKind] = useState<TaskDispatchWindow["kind"] | "">(originalScan?.window?.kind ?? "");
  const savedWindow = originalScan?.window?.kind === "custom" ? originalScan.window : null;
  const [windowStart, setWindowStart] = useState<string | null>(savedWindow?.start ?? null);
  const [windowEnd, setWindowEnd] = useState<string | null>(savedWindow?.end ?? null);
  const [overdue, setOverdue] = useState(originalScan?.includeOverdue ?? false);
  const [unscheduled, setUnscheduled] = useState(originalScan?.includeUnscheduled);
  const [parallel, setParallel] = useState(String(originalScan?.maxConcurrent ?? 1));
  const [grace, setGrace] = useState(String(start?.data.missedRunGraceMinutes ?? 30));
  const [command, setCommand] = useState(a?.kind === "terminal" ? a.command : "");
  const [shell, setShell] = useState(a?.kind === "terminal" ? a.shell : "default");
  const [replaceLegacy, setReplaceLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const scheduleError = useId();
  const cron = cronFor(preset, time, custom, days);
  const found = (providers.data ?? []).filter((p) => p.installed && p.headless);

  const targetSpace = spaces.data?.find((item) => item.id === spaceId);
  const canUseSpace = Boolean(targetSpace?.root && targetSpace.binding?.status !== "needs-binding");
  const models = found.find((item) => item.id === provider)?.models ?? [];
  const selectedModel = models.find((item) => item.id === model);
  const validProvider = found.some((item) => item.id === provider);
  const unchangedModel = prompt0?.provider === provider && prompt0?.model === model;
  const validModel = !model || Boolean(selectedModel) || unchangedModel;
  const windowValid = windowKind !== "custom" || Boolean(windowStart && windowEnd && Date.parse(windowStart) < Date.parse(windowEnd));
  const parallelCount = Number(parallel);
  const scanValid = windowValid && Number.isInteger(parallelCount) && parallelCount >= 1 && parallelCount <= 4 && prompt.length <= 20_000;
  const actionValid = kind === "reminder" ? Boolean(text.trim() && (!taskId || tasks.data?.some(({ id }) => id === taskId)))
    : kind === "agent_prompt" ? canUseSpace && validProvider && validModel && Boolean(prompt.trim())
    : kind === "terminal" ? Boolean(command.trim() && (!spaceId || canUseSpace))
    : scanValid;
  const timeOk = !PRESETS.find((p) => p.id === preset)?.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  // 本地反馈用于校验输入，预览时刻来自负责执行的 Engine。
  let triggerError: string | null = null;
  if (!timeOk) triggerError = t.timeRequired;
  else if (cron === "") triggerError = preset === "weekly" ? "请选择至少一个星期日。" : t.cronRequired;
  else if (!tz.trim()) triggerError = "请输入规则的时区。";
  else {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
      validateSchedule(cron, tz.trim());
    } catch (e) {
      triggerError = /Range|time ?zone/i.test(String(e)) ? t.zoneInvalid : t.cronInvalid;
    }
  }
  const graceNumber = Number(grace);
  const valid = Boolean(title.trim() && triggerError === null && actionValid && grace.trim()
    && Number.isInteger(graceNumber) && graceNumber >= 0 && (graceNumber <= 1440 || graceNumber === start?.data.missedRunGraceMinutes)
    && (!rule?.data.legacyEnvironment || replaceLegacy));
  const draft = (): RuleDraft => {
    const window: TaskDispatchWindow | null = windowKind === "custom" ? { kind: "custom", start: windowStart ?? "", end: windowEnd ?? "" }
      : windowKind ? { kind: windowKind } : null;
    const action: Action = kind === "reminder"
      ? { kind: "reminder", mode, text: text.trim(), taskId: taskId || null }
      : kind === "agent_prompt"
        ? { kind: "agent", input: { source: "prompt", spaceId, provider, model: model || null, effort: effort || null, fast } }
        : kind === "agent_tasks"
          ? { kind: "agent", input: { source: "tasks", tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
            maxConcurrent: parallelCount, window, includeOverdue: overdue, includeUnscheduled: unscheduled ?? !window } }
          : { kind: "terminal", command: command.trim(), shell, spaceId: spaceId || null };
    return { title: title.trim(), trigger: { preset, cron, zone: tz.trim() }, action, body: kind.startsWith("agent_") ? prompt : "", missedRunGraceMinutes: graceNumber };
  };

  const { trigger, action, body } = draft();
  const schedule = useCapability<Pick<Preview, "at" | "next">>("automations.plans.previewRuleDraft", { trigger }, { enabled: triggerError === null });
  const previewVersion = JSON.stringify([trigger, action, body]);
  const activePreview = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<{ version: string; status: "loading" | "loaded" | "error"; data?: Preview; error?: string } | null>(null);
  const shownPreview = preview?.version === previewVersion ? preview : null;

  useEffect(() => () => activePreview.current?.abort(), [engine, previewVersion]);

  async function previewCandidates() {
    activePreview.current?.abort();
    const controller = new AbortController();
    activePreview.current = controller;
    setPreview({ version: previewVersion, status: "loading" });
    try {
      const data = await engine.call<Preview>("automations.plans.previewRuleDraft", { trigger, action, body }, { signal: controller.signal });
      if (!controller.signal.aborted) setPreview({ version: previewVersion, status: "loaded", data });
    } catch (failure) {
      if (!controller.signal.aborted) setPreview({ version: previewVersion, status: "error", error: failure instanceof Error ? failure.message : "暂时无法预览。"});
    }
  }

  async function submit() {
    setBusy(true);
    try {
      await onSave(draft());
    } finally {
      setBusy(false);
    }
  }

  function chooseProvider(value: string) {
    const choices = found.find((item) => item.id === value)?.models;
    const keep = choices?.find((item) => item.id === model);
    setProvider(value);
    if (!keep) setModel("");
    if (!keep?.efforts.includes(effort)) setEffort("");
    if (!keep?.fast) setFast(false);
  }

  return (
    <form
      className="hu-form-columns"
      data-testid="rule-editor"
      aria-label={rule ? t.editRule : t.ruleEditor}
      onChange={onDirty}
      onSubmit={(e) => {
        e.preventDefault();
        if ((valid || waiting) && !busy) void submit();
      }}
    >
      <fieldset className="hu-form-grid automation-editor-fields" disabled={busy || waiting}>
        <div className="hu-form-primary">
          <h3>做什么</h3>
          <Field label={t.ruleTitle}>
            <input autoFocus required aria-label={t.ruleTitle} placeholder={t.ruleTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="automations-action-fields">
            <Field label={t.actionKind}>
              <Select aria-label={t.actionKind} data-testid="rule-kind" value={kind} onChange={(e) => setKind(e.target.value as FormKind)}>
                <option value="agent_tasks">{t.kinds.agent_tasks}</option>
                <option value="agent_prompt">{t.kinds.agent_prompt}</option>
                <option value="terminal">{t.kinds.terminal}</option>
                <option value="reminder">{t.kinds.reminder}</option>
              </Select>
            </Field>
            {kind === "agent_tasks" ? (
              <>
                <div className="automations-scan-contract">
                  <strong>{t.scanTitle}</strong>
                  <p>{t.scanHintA}</p>
                  <p>{t.scanHintB}</p>
                </div>
                <Field label={t.tagFilter}>
                  <input aria-label={t.tagFilter} data-testid="rule-tags" placeholder={t.tagFilterPlaceholder} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
                </Field>
                <Field label="派遣窗口">
                  <Select aria-label="派遣窗口" value={windowKind} onChange={(event) => setWindowKind(event.target.value as typeof windowKind)}>
                    <option value="">不限</option><option value="today">今天</option><option value="week">本周</option>
                    <option value="month">本月</option><option value="next-seven-days">未来 7 天</option><option value="custom">自定义范围</option>
                  </Select>
                </Field>
                {windowKind === "custom" ? <>
                  <DateTimePicker label="窗口开始" field={{ kind: "instant", value: windowStart }}
                    onChange={(field) => { if (field.kind === "instant") { onDirty(); setWindowStart(field.value); } }} />
                  <DateTimePicker label="窗口结束" field={{ kind: "instant", value: windowEnd }}
                    onChange={(field) => { if (field.kind === "instant") { onDirty(); setWindowEnd(field.value); } }} />
                  {!windowValid ? <p role="alert">请选择结束时刻晚于开始时刻的范围。</p> : null}
                </> : null}
                <label><input type="checkbox" checked={overdue} onChange={(event) => setOverdue(event.target.checked)} /> 包括逾期</label>
                <label><input type="checkbox" checked={unscheduled ?? !windowKind} onChange={(event) => setUnscheduled(event.target.checked)} /> 包括未排期</label>
                <Field label="每次并发上限"><input aria-label="每次并发上限" type="number" min={1} max={4} value={parallel} onChange={(event) => setParallel(event.target.value)} /></Field>
                <Field label={t.instruction}>
                  <textarea className="automations-description-input" rows={4} maxLength={20_000} aria-label={t.instruction} placeholder={t.instructionPlaceholder} data-testid="rule-instruction" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "reminder" ? (
              <>
                <Field label={t.reminderMode}>
                  <Select aria-label={t.reminderMode} data-testid="rule-reminder-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="notification">{t.reminderModes.notification}</option>
                    <option value="task">{t.reminderModes.task}</option>
                    <option value="both">{t.reminderModes.both}</option>
                  </Select>
                </Field>
                <Field label="关联任务">
                  <Select aria-label="关联任务" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                    <option value="">无关联任务</option>
                    {taskId && !tasks.data?.some(({ id }) => id === taskId) ? <option value={taskId}>当前任务暂不可用</option> : null}
                    {tasks.data?.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
                  </Select>
                </Field>
                <Field label={t.ruleText} description={!text.trim() ? "填写要发送的提醒内容。" : undefined}>
                  <input required aria-label={t.ruleText} placeholder={t.ruleText} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "agent_prompt" ? (
              <>
                <Field label={t.space} description={!spaceId ? "请选择规则执行的工作区。" : undefined}>
                  <Select required aria-label={t.space} data-testid="rule-space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                    <option value="">{t.choose}</option>
                    {spaceId && !targetSpace ? <option value={spaceId}>原 Space 不可用 · {spaceId}</option> : null}
                    {(spaces.data ?? []).map((s) => (
                      <option key={s.id} value={s.id} disabled={!s.root || s.binding?.status === "needs-binding"}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.provider} description={!provider ? "请选择执行任务的 CLI。" : undefined}>
                  <Select required aria-label={t.provider} data-testid="rule-provider" value={provider} onChange={(e) => chooseProvider(e.target.value)}>
                    <option value="">{t.choose}</option>
                    {found.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                    {provider && !found.some((p) => p.id === provider) ? (
                      <option value={provider}>
                        {provider}（{t.unavailable}）
                      </option>
                    ) : null}
                  </Select>
                </Field>
                {found.length === 0 && providers.data ? <p className="tasks-hint">{t.noProvider}</p> : null}
                <Field label={t.model}>
                  <Select aria-label={t.model} value={model} onChange={(event) => {
                    const next = models.find((item) => item.id === event.target.value);
                    setModel(event.target.value);
                    if (!next?.efforts.includes(effort)) setEffort("");
                    if (!next?.fast) setFast(false);
                  }}>
                    <option value="">使用 Agent 默认模型</option>
                    {model && !selectedModel ? <option value={model}>原模型 · {model}</option> : null}
                    {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </Select>
                </Field>
                {selectedModel?.efforts.length || effort ? <Field label="推理档位">
                  <Select aria-label="推理档位" value={effort} onChange={(event) => setEffort(event.target.value)}>
                    <option value="">使用默认档位</option>
                    {effort && !selectedModel?.efforts.includes(effort) ? <option value={effort}>原档位 · {effort}</option> : null}
                    {selectedModel?.efforts.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field> : null}
                {selectedModel?.fast || fast ? <label><input type="checkbox" checked={fast} onChange={(event) => setFast(event.target.checked)} /> 快速模式</label> : null}
                <p>每次执行都会在所选 Space 创建并派遣新任务。</p>
                {spaceId && !canUseSpace ? <p role="status">原 Space 需要重新绑定或已不可用。</p> : null}
                {provider && !validProvider ? <p role="status">所选 CLI 当前不可用。请检查 Agent 配置。</p> : null}
                {model && !selectedModel ? <p>当前 CLI 的目录无法确认原模型，已保留原值。</p> : null}
                <Field label={t.prompt} description={!prompt.trim() ? "填写每次激活要执行的要求。" : undefined}>
                  <textarea required className="automations-description-input" rows={7} aria-label={t.prompt} placeholder={t.prompt} data-testid="rule-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "terminal" ? (
              <>
                <Field label={t.command} description={!command.trim() ? "填写规则激活时要运行的命令。" : undefined}>
                  <textarea required className="automations-description-input" rows={3} aria-label={t.command} placeholder={t.commandPlaceholder} data-testid="rule-command" value={command} onChange={(e) => setCommand(e.target.value)} />
                </Field>
                <Field label={t.space}>
                  <Select aria-label={t.space} data-testid="rule-space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                    <option value="">{t.vaultRoot}</option>
                    {spaceId && !targetSpace ? <option value={spaceId}>原 Space 不可用 · {spaceId}</option> : null}
                    {(spaces.data ?? []).map((s) => (
                      <option key={s.id} value={s.id} disabled={!s.root || s.binding?.status === "needs-binding"}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shell">
                  <Select aria-label="Shell" value={shell} onChange={(event) => setShell(event.target.value as typeof shell)}>
                    <option value="default">默认 Shell</option>
                    {["bash", "zsh", "sh", "powershell", "cmd"].map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <p className="tasks-hint">在已保存规则的详情中设置受保护环境。</p>
              </>
            ) : null}
          </div>
        </div>
        <aside className="hu-form-aside">
          {rule?.data.legacyEnvironment ? (
            <label>
              <input type="checkbox" checked={replaceLegacy} onChange={(event) => setReplaceLegacy(event.target.checked)} />
              移除旧环境引用并暂停规则。保存后可在详情中重新配置。
            </label>
          ) : null}
          <div className="hu-tw-section-label">
            <Clock size={14} aria-hidden />
            <strong>何时激活</strong>
          </div>
          <Field label={t.frequency}>
            <Select
              aria-label={t.frequency}
              data-testid="rule-preset"
              value={preset}
              onChange={(e) => {
                const next = e.target.value as PresetId;
                if (next === "custom") setCustom(cron);
                setPreset(next);
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t.presets[p.id]}
                </option>
              ))}
            </Select>
          </Field>
          {PRESETS.find((p) => p.id === preset)?.time ? (
            <Field label={t.timeOfDay}>
              <DateInput type="time" label={t.timeOfDay} value={time || null} onChange={(next) => { onDirty(); setTime(next ?? ""); }} />
            </Field>
          ) : null}
          {preset === "weekly" ? <fieldset className="plan-weekdays">
            <legend>执行星期</legend>
            {["日", "一", "二", "三", "四", "五", "六"].map((label, day) => <label key={day}>
              <input type="checkbox" checked={days.includes(day)} onChange={() => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} /> 周{label}
            </label>)}
          </fieldset> : null}
          <Field label={t.ruleCron}>{preset === "custom" ? <input aria-label={t.ruleCron} value={custom} onChange={(e) => setCustom(e.target.value)} /> : <code data-testid="rule-cron">{cron}</code>}</Field>
          <Field label={t.zone}>
            <input
              aria-label={t.zone}
              name="zone"
              placeholder={t.zone}
              value={tz}
              aria-invalid={!tz.trim() || triggerError === t.zoneInvalid || undefined}
              aria-describedby={triggerError ? scheduleError : undefined}
              onChange={(e) => setTz(e.target.value)}
            />
          </Field>
          {triggerError ? (
            <p id={scheduleError} role="alert" className="automations-schedule-error" data-testid="rule-trigger-error">
              {triggerError}
            </p>
          ) : (
            <div className="automations-schedule-preview" data-testid="rule-upcoming" aria-busy={schedule.isPending || undefined}>
              <strong>{t.upcoming}</strong>
              <small>{tz.trim()} · 仅预览</small>
              {schedule.isError ? <p role="alert">无法读取激活时间。<Button variant="ghost" onClick={() => void schedule.refetch()}>重试</Button></p> : null}
              {schedule.data?.next.length === 0 ? <p>当前日程没有后续激活时间。</p> : null}
              {schedule.data?.next.map((x) => (
                <time key={x} dateTime={x}>
                  {formatMoment(x, trigger.zone)}
                </time>
              ))}
            </div>
          )}
          <details>
            <summary>运行策略</summary>
            <Field label="错过宽限（分钟）">
              <input type="number" aria-label="错过宽限（分钟）" min={0} max={Math.max(1440, start?.data.missedRunGraceMinutes ?? 0)} value={grace} onChange={(event) => setGrace(event.target.value)} />
            </Field>
            <p>宽限内仅补最近一次，重叠执行时跳过。</p>
          </details>
          {kind === "agent_tasks" ? <section aria-label="候选预览">
            <Button type="button" disabled={triggerError !== null || !scanValid || shownPreview?.status === "loading"} onClick={() => void previewCandidates()}>预览候选</Button>
            {shownPreview?.error ? <p role="alert">{shownPreview.error}</p> : null}
            {shownPreview?.data ? <>
              <p role="status">{formatMoment(shownPreview.data.at, tz.trim())} · {shownPreview.data.candidates.length} 个候选，{shownPreview.data.skipped.length} 个跳过</p>
              {shownPreview.data.tasksDisabled ? <p>任务插件当前不可用。</p> : null}
              <ul>{shownPreview.data.candidates.map((item) => <li key={item.taskId}>{item.title}</li>)}</ul>
              <ul>{shownPreview.data.skipped.map((item) => <li key={item.taskId}>{item.title} · {t.reasons[item.reason as keyof typeof t.reasons] ?? item.reason}{item.detail ? ` · ${item.detail}` : ""}</li>)}</ul>
            </> : null}
          </section> : null}
          <p className="tasks-hint">{start?.data.legacyEnvironment ? "保存并替换旧环境后暂停。" : start ? (start.data.enabled ? "保存后保持启用，后续触发采用新日程。已受理的派遣保留原设置。" : "保存后保持暂停。") : t.savedPaused}</p>
        </aside>
      </fieldset>
      <div className="hu-form-actions">
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={busy || waiting} onClick={onCancel}>
            {t.cancelEdit}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={(!valid && !waiting) || busy} data-testid="rule-save">
          {waiting ? "核对原保存请求" : rule ? t.save : t.create}
        </Button>
      </div>
    </form>
  );
}
