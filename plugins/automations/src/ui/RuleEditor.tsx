import { Button, Field } from "@huhu/ui";
import { Clock } from "lucide-react";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import { nextRuns } from "../shared/cron.js";
import { PRESETS, cronFor, presetOf, type PresetId } from "./cron-presets.js";
import { t } from "./i18n.js";

export interface EditableRule {
  id: string;
  version: string;
  body: string;
  data: {
    title: string;
    trigger: { preset: string; cron: string; zone: string };
    action: Action;
  };
}
type Action =
  | { kind: "agent"; input: { source: "tasks"; tags: string[]; maxConcurrent: number } | { source: "prompt"; spaceId: string; provider: string; model: string | null; effort: string | null; fast: boolean } }
  | { kind: "terminal"; command: string; shell: string; spaceId: string | null; envRefs: Record<string, string> }
  | { kind: "reminder"; mode: "notification" | "task" | "both"; text: string; taskId: string | null };
/** 表单里的动作种类：agent 动作按输入来源拆成两项。 */
type FormKind = "agent_tasks" | "agent_prompt" | "terminal" | "reminder";
const formKindOf = (a: Action | undefined): FormKind => (!a ? "reminder" : a.kind === "agent" ? (a.input.source === "tasks" ? "agent_tasks" : "agent_prompt") : a.kind);

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

/** 规则编辑器（新建 / 编辑）：标题、触发（预设+时刻或 cron+时区）、动作（让 Agent 执行 / 运行终端命令 / 提醒），保存时默认保持暂停。 */
export function RuleEditor({
  rule,
  zone,
  onSave,
  onCancel,
}: {
  rule?: EditableRule;
  zone: string;
  onSave(v: { title: string; trigger: { preset: string; cron: string; zone: string }; action: Record<string, unknown>; body: string }): Promise<boolean>;
  onCancel?(): void;
}) {
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const providers = useCapability<Detected[]>("agent.catalog.detect", {});
  const init = rule ? presetOf(rule.data.trigger.cron) : { preset: "every5" as PresetId, time: "09:00" };
  const a = rule?.data.action;
  const [title, setTitle] = useState(rule?.data.title ?? "");
  const [preset, setPreset] = useState<PresetId>(init.preset);
  const [time, setTime] = useState(init.time);
  const [custom, setCustom] = useState(rule?.data.trigger.cron ?? "*/5 * * * *");
  const [tz, setTz] = useState(rule?.data.trigger.zone ?? zone);
  const [kind, setKind] = useState<FormKind>(formKindOf(a));
  const prompt0 = a?.kind === "agent" && a.input.source === "prompt" ? a.input : null;
  const [text, setText] = useState(a?.kind === "reminder" ? a.text : "");
  const [mode, setMode] = useState<"notification" | "task" | "both">(a?.kind === "reminder" ? a.mode : "notification");
  const [spaceId, setSpaceId] = useState(prompt0?.spaceId ?? (a?.kind === "terminal" ? (a.spaceId ?? "") : ""));
  const [provider, setProvider] = useState(prompt0?.provider ?? "");
  const [model, setModel] = useState(prompt0?.model ?? "");
  const [prompt, setPrompt] = useState(prompt0 || (a?.kind === "agent" && a.input.source === "tasks") ? (rule?.body ?? "") : "");
  const [tagsText, setTagsText] = useState(a?.kind === "agent" && a.input.source === "tasks" ? a.input.tags.join(", ") : "");
  const [command, setCommand] = useState(a?.kind === "terminal" ? a.command : "");
  const [envText, setEnvText] = useState(
    a?.kind === "terminal"
      ? Object.entries(a.envRefs)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "",
  );
  const [busy, setBusy] = useState(false);
  const cron = cronFor(preset, time, custom);
  const found = (providers.data ?? []).filter((p) => p.installed && p.headless);

  const actionValid = kind === "reminder" ? text.trim() !== "" : kind === "agent_prompt" ? spaceId !== "" && provider !== "" && prompt.trim() !== "" : kind === "terminal" ? command.trim() !== "" : true;
  const timeOk = !PRESETS.find((p) => p.id === preset)?.time || /^\d{1,2}:\d{2}$/.test(time);
  // 触发设置的即时校验：cron 或时区不合法时在表单里就给出原因，并显示接下来三次激活
  let upcoming: string[] = [];
  let triggerError: string | null = null;
  if (!timeOk) triggerError = t.timeRequired;
  else if (cron === "") triggerError = t.cronRequired;
  else {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() || zone });
      upcoming = nextRuns(cron, tz.trim() || zone, 3);
    } catch (e) {
      triggerError = /Range|time ?zone/i.test(String(e)) ? t.zoneInvalid : t.cronInvalid;
    }
  }
  const valid = title.trim() !== "" && tz.trim() !== "" && triggerError === null && actionValid;

  async function submit() {
    setBusy(true);
    const tags = tagsText
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const envRefs = Object.fromEntries(
      envText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()] as const)
        .filter(([k]) => k !== ""),
    );
    const action: Record<string, unknown> =
      kind === "reminder"
        ? { kind: "reminder", mode, text: text.trim(), taskId: a?.kind === "reminder" ? a.taskId : null }
        : kind === "agent_prompt"
          ? { kind: "agent", input: { source: "prompt", spaceId, provider, model: model.trim() || null, effort: prompt0?.effort ?? null, fast: prompt0?.fast ?? false } }
          : kind === "agent_tasks"
            ? { kind: "agent", input: { source: "tasks", tags, maxConcurrent: a?.kind === "agent" && a.input.source === "tasks" ? a.input.maxConcurrent : 1 } }
            : { kind: "terminal", command: command.trim(), shell: "default", spaceId: spaceId || null, envRefs: a?.kind === "terminal" ? { ...a.envRefs, ...envRefs } : envRefs };
    const ok = await onSave({ title: title.trim(), trigger: { preset, cron, zone: tz.trim() }, action, body: kind === "agent_prompt" || kind === "agent_tasks" ? prompt.trim() : "" });
    setBusy(false);
    if (ok && !rule) {
      setTitle("");
      setText("");
      setPrompt("");
    }
  }

  return (
    <form
      data-testid="rule-editor"
      aria-label={rule ? t.editRule : t.ruleEditor}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <div className="hu-tw-editor-grid">
        <div className="automations-editor-body">
          <Field label={t.ruleTitle}>
            <input autoFocus aria-label={t.ruleTitle} placeholder={t.ruleTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="automations-action-fields">
            <Field label={t.actionKind}>
              <select aria-label={t.actionKind} data-testid="rule-kind" value={kind} onChange={(e) => setKind(e.target.value as FormKind)}>
                <option value="agent_tasks">{t.kinds.agent_tasks}</option>
                <option value="agent_prompt">{t.kinds.agent_prompt}</option>
                <option value="terminal">{t.kinds.terminal}</option>
                <option value="reminder">{t.kinds.reminder}</option>
              </select>
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
                <Field label={t.instruction}>
                  <textarea className="automations-description-input" rows={4} aria-label={t.instruction} placeholder={t.instructionPlaceholder} data-testid="rule-instruction" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "reminder" ? (
              <>
                <Field label={t.reminderMode}>
                  <select aria-label={t.reminderMode} data-testid="rule-reminder-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="notification">{t.reminderModes.notification}</option>
                    <option value="task">{t.reminderModes.task}</option>
                    <option value="both">{t.reminderModes.both}</option>
                  </select>
                </Field>
                <Field label={t.ruleText}>
                  <input aria-label={t.ruleText} placeholder={t.ruleText} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "agent_prompt" ? (
              <>
                <Field label={t.space}>
                  <select aria-label={t.space} data-testid="rule-space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                    <option value="">{t.choose}</option>
                    {(spaces.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.provider}>
                  <select aria-label={t.provider} data-testid="rule-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
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
                  </select>
                </Field>
                {found.length === 0 && providers.data ? <p className="tasks-hint">{t.noProvider}</p> : null}
                <Field label={t.model}>
                  <input aria-label={t.model} placeholder={t.model} value={model} onChange={(e) => setModel(e.target.value)} />
                </Field>
                <Field label={t.prompt}>
                  <textarea className="automations-description-input" rows={7} aria-label={t.prompt} placeholder={t.prompt} data-testid="rule-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "terminal" ? (
              <>
                <Field label={t.command}>
                  <textarea className="automations-description-input" rows={3} aria-label={t.command} placeholder={t.commandPlaceholder} data-testid="rule-command" value={command} onChange={(e) => setCommand(e.target.value)} />
                </Field>
                <Field label={t.space}>
                  <select aria-label={t.space} data-testid="rule-space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                    <option value="">{t.vaultRoot}</option>
                    {(spaces.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.envRefs}>
                  <textarea rows={3} aria-label={t.envRefs} placeholder={t.envRefsPlaceholder} value={envText} onChange={(e) => setEnvText(e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>
        </div>
        <aside className="automations-editor-aside">
          <div className="hu-tw-section-label">
            <Clock size={14} aria-hidden />
            <strong>何时激活</strong>
          </div>
          <Field label={t.frequency}>
            <select
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
            </select>
          </Field>
          {PRESETS.find((p) => p.id === preset)?.time ? (
            <Field label={t.timeOfDay}>
              <input type="time" aria-label={t.timeOfDay} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          ) : null}
          <Field label={t.ruleCron}>{preset === "custom" ? <input aria-label={t.ruleCron} value={custom} onChange={(e) => setCustom(e.target.value)} /> : <code data-testid="rule-cron">{cron}</code>}</Field>
          <Field label={t.zone}>
            <input aria-label={t.zone} placeholder={t.zone} value={tz} aria-invalid={triggerError === t.zoneInvalid} onChange={(e) => setTz(e.target.value)} />
          </Field>
          {triggerError ? (
            <p role="alert" className="automations-schedule-error" data-testid="rule-trigger-error">
              {triggerError}
            </p>
          ) : (
            <div className="automations-schedule-preview" data-testid="rule-upcoming">
              <strong>{t.upcoming}</strong>
              <small>{tz.trim() || zone} · 仅预览</small>
              {upcoming.map((x) => (
                <time key={x}>{new Date(x).toLocaleString("zh-CN", { timeZone: tz.trim() || zone, hour12: false })}</time>
              ))}
            </div>
          )}
          <p className="tasks-hint">{t.savedPaused}</p>
        </aside>
      </div>
      <div className="automations-modal-actions">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.cancelEdit}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={!valid || busy} data-testid="rule-save">
          {rule ? t.save : t.create}
        </Button>
      </div>
    </form>
  );
}
