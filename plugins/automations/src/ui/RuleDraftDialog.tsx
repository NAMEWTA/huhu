import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine, type ModuleProps } from "@huhu/workbench";
import { useRef, useState } from "react";
import { planIntentId } from "./PlanScheduleControls.js";
import { RuleEditor, type EditableRule, type RuleDraft, type RuleTemplate } from "./RuleEditor.js";
import { uncertainPlanWrite } from "./plan-write.js";
import { useDraftDismissal } from "./use-draft-dismissal.js";

type SaveRequest = { key: string; capability: string; input: unknown };

function unchangedAction(draft: RuleDraft["action"], saved: EditableRule["data"]["action"]): boolean {
  if (draft.kind === "agent" && draft.input.source === "tasks" && saved.kind === "agent" && saved.input.source === "tasks") {
    const { window, includeOverdue, includeUnscheduled, ...input } = saved.input;
    return JSON.stringify(draft.input) === JSON.stringify({
      ...input, window: window ?? null, includeOverdue: includeOverdue ?? false, includeUnscheduled: includeUnscheduled ?? !window,
    });
  }
  return JSON.stringify(draft) === JSON.stringify(saved);
}

export function RuleDraftDialog({ rule, template, onClose, onSaved, registerLeaveGuard }: {
  rule?: EditableRule;
  template?: RuleTemplate;
  onClose(): void;
  onSaved(id: string): void;
  registerLeaveGuard: ModuleProps["registerLeaveGuard"];
}) {
  const engine = useEngine();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<SaveRequest | null>(null);
  const [current, setCurrent] = useState<EditableRule | null>(null);
  const [reviewed, setReviewed] = useState<EditableRule | null>(null);
  const submitted = useRef(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { dismiss, confirmation } = useDraftDismissal({ dirty, locked: busy || pending !== null, close: onClose, registerLeaveGuard });

  async function save(fields: RuleDraft): Promise<boolean> {
    if (submitted.current || current) return false;
    submitted.current = true;
    setBusy(true);
    setError("");
    const original = rule?.data;
    const patch = original ? {
      ...(fields.title !== original.title && { title: fields.title }),
      ...((fields.trigger.cron !== original.trigger.cron || fields.trigger.zone !== original.trigger.zone) && { trigger: fields.trigger }),
      ...((original.legacyEnvironment || !unchangedAction(fields.action, original.action)) && { action: fields.action }),
      ...(fields.missedRunGraceMinutes !== (original.missedRunGraceMinutes ?? 30) && { missedRunGraceMinutes: fields.missedRunGraceMinutes }),
    } : {};
    const request = pending ?? (rule
      ? { key: planIntentId(), capability: "automations.update",
        input: { id: rule.id, expectedVersion: reviewed?.version ?? rule.version, patch, ...(fields.body !== rule.body && { body: fields.body }) } }
      : { key: planIntentId(), capability: "automations.create", input: fields });
    setPending(request);
    try {
      const saved = await engine.call<EditableRule>(request.capability, request.input, { write: true, idempotencyKey: request.key });
      setPending(null);
      onSaved(saved.id);
      return true;
    } catch (failure) {
      if (!uncertainPlanWrite(failure)) setPending(null);
      if (failure instanceof CapabilityError && failure.code === "VERSION_CONFLICT" && rule) {
        try {
          setCurrent(await engine.call<EditableRule>("automations.read", { id: rule.id }));
          setError("文件已被修改，当前草稿已保留。");
        } catch (readFailure) {
          setError(readFailure instanceof Error ? readFailure.message : "无法读取当前计划。");
        }
      } else {
        const description = failure instanceof Error ? failure.message : "暂时无法保存计划。";
        setError(uncertainPlanWrite(failure) ? `尚未确认保存结果。请核对原保存请求。 ${description}` : description);
      }
      return false;
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open wide title={rule ? "编辑自动化" : "新建自动化"} onClose={dismiss} dismissOnBackdrop error={error} testId="rule-dialog">
      {current ? <section className="automations-conflict" aria-label="当前计划版本">
        <p>当前版本「{current.data.title}」· {current.data.trigger.cron} · {current.data.trigger.zone}</p>
        <details><summary>查看当前配置</summary><pre>{JSON.stringify(current.data.action, null, 2)}{current.body ? `\n${current.body}` : ""}</pre></details>
        <Button onClick={() => {
          setReviewed(current);
          setCurrent(null);
          setError("再次保存将使用当前版本提交此草稿。");
        }}>保留草稿并采用当前修订</Button>
      </section> : null}
      <RuleEditor {...(rule && { rule })} {...(template && { template })} zone={zone}
        onSave={save} onCancel={dismiss} onDirty={() => setDirty(true)} waiting={pending !== null} />
      {confirmation}
    </Dialog>
  );
}
