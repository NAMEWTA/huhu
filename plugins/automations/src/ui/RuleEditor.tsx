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
    builtin: boolean;
    trigger: { preset: string; cron: string; zone: string };
    action: { kind: string; text?: string; spaceId?: string; provider?: string; model?: string | null; effort?: string | null; fast?: boolean; scriptId?: string; args?: string[] };
  };
}
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
}
interface ScriptRow {
  id: string;
  title: string;
}

/** 规则编辑器（新建 / 编辑）：标题、触发（预设+时刻或 cron+时区）、动作（通知 / 让 Agent 执行 / 运行脚本），保存时默认保持暂停。 */
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
  const providers = useCapability<Provider[]>("agent.providers.detect", {});
  const scripts = useCapability<ScriptRow[]>("automations.scripts.list", {});
  const init = rule ? presetOf(rule.data.trigger.cron) : { preset: "every5" as PresetId, time: "09:00" };
  const a = rule?.data.action;
  const [title, setTitle] = useState(rule?.data.title ?? "");
  const [preset, setPreset] = useState<PresetId>(init.preset);
  const [time, setTime] = useState(init.time);
  const [custom, setCustom] = useState(rule?.data.trigger.cron ?? "*/5 * * * *");
  const [tz, setTz] = useState(rule?.data.trigger.zone ?? zone);
  const [kind, setKind] = useState<"notify" | "agent_prompt" | "script" | "scan_agent_tasks">((a?.kind as never) ?? "notify");
  const [text, setText] = useState(a?.kind === "notify" ? (a.text ?? "") : "");
  const [spaceId, setSpaceId] = useState(a?.kind === "agent_prompt" ? (a.spaceId ?? "") : "");
  const [provider, setProvider] = useState(a?.kind === "agent_prompt" ? (a.provider ?? "") : "");
  const [model, setModel] = useState(a?.kind === "agent_prompt" ? (a.model ?? "") : "");
  const [prompt, setPrompt] = useState(a?.kind === "agent_prompt" ? (rule?.body ?? "") : "");
  const [scriptId, setScriptId] = useState(a?.kind === "script" ? (a.scriptId ?? "") : "");
  const [busy, setBusy] = useState(false);
  const builtin = rule?.data.builtin === true;
  const cron = cronFor(preset, time, custom);
  const found = (providers.data ?? []).filter((p) => p.status === "found" && p.headless);

  const actionValid = kind === "notify" ? text.trim() !== "" : kind === "agent_prompt" ? spaceId !== "" && provider !== "" && prompt.trim() !== "" : kind === "script" ? scriptId !== "" : true;
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
    const action: Record<string, unknown> =
      kind === "notify"
        ? { kind, channel: "in_app", text: text.trim() }
        : kind === "agent_prompt"
          ? { kind, spaceId, provider, model: model.trim() || null, effort: a?.kind === "agent_prompt" ? (a.effort ?? null) : null, fast: a?.kind === "agent_prompt" ? (a.fast ?? false) : false }
          : kind === "script"
            ? { kind, scriptId, args: [] }
            : (a as Record<string, unknown>);
    const ok = await onSave({ title: title.trim(), trigger: { preset, cron, zone: tz.trim() }, action, body: kind === "agent_prompt" ? prompt.trim() : (rule?.body ?? "") });
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
      <div className="tw-editor-grid">
        <div className="tw-editor-body">
          <Field label={t.ruleTitle}>
            <input autoFocus aria-label={t.ruleTitle} placeholder={t.ruleTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="tw-action-fields">
            <Field label={t.actionKind}>
              <select aria-label={t.actionKind} data-testid="rule-kind" value={kind} disabled={builtin} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="notify">{t.kinds.notify}</option>
                <option value="agent_prompt">{t.kinds.agent_prompt}</option>
                <option value="script">{t.kinds.script}</option>
                {builtin ? <option value="scan_agent_tasks">{t.kinds.scan_agent_tasks}</option> : null}
              </select>
            </Field>
            {kind === "scan_agent_tasks" ? (
              <div className="tw-scan-contract">
                <strong>扫描已有任务</strong>
                <p>只处理未完成且执行方式为Agent的任务；按任务输入版本避免重复调用。</p>
                <p>不会创建另一份待办，也不会自动勾选完成。</p>
              </div>
            ) : null}
            {kind === "notify" ? (
              <Field label={t.ruleText}>
                <input aria-label={t.ruleText} placeholder={t.ruleText} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
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
                      <option key={p.provider} value={p.provider}>
                        {p.displayName}
                      </option>
                    ))}
                    {provider && !found.some((p) => p.provider === provider) ? (
                      <option value={provider}>
                        {provider}（{t.unavailable}）
                      </option>
                    ) : null}
                  </select>
                </Field>
                {found.length === 0 && providers.data ? <p className="tw-hint">{t.noProvider}</p> : null}
                <Field label={t.model}>
                  <input aria-label={t.model} placeholder={t.model} value={model} onChange={(e) => setModel(e.target.value)} />
                </Field>
                <Field label={t.prompt}>
                  <textarea className="tw-description-input" rows={7} aria-label={t.prompt} placeholder={t.prompt} data-testid="rule-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </>
            ) : null}
            {kind === "script" ? (
              <Field label={t.script}>
                <select aria-label={t.script} data-testid="rule-script" value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
                  <option value="">{t.choose}</option>
                  {(scripts.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        </div>
        <aside className="tw-editor-aside">
          <div className="tw-section-label">
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
            <p role="alert" className="tw-schedule-error" data-testid="rule-trigger-error">
              {triggerError}
            </p>
          ) : (
            <div className="tw-schedule-preview" data-testid="rule-upcoming">
              <strong>{t.upcoming}</strong>
              <small>{tz.trim() || zone} · 仅预览</small>
              {upcoming.map((x) => (
                <time key={x}>{new Date(x).toLocaleString("zh-CN", { timeZone: tz.trim() || zone, hour12: false })}</time>
              ))}
            </div>
          )}
          <p className="tw-hint">{t.savedPaused}</p>
        </aside>
      </div>
      <div className="modal-actions">
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
