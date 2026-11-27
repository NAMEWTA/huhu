import type { PlanSummary } from "@huhu/contracts";
import { Button } from "@huhu/ui";
import { AutomationPlanLink, type useCapability, useEngine, type ModuleProps } from "@huhu/workbench";
import { useState, type Ref } from "react";

export type SyncState = {
  minutes: number;
  revision: string | null;
  plan: PlanSummary | null;
  available: boolean;
  accounts: { accountId: string; phase: "refreshing" | "ready" | "retrying"; at: string; retryAt?: string }[];
};
const phases = { refreshing: "正在刷新", ready: "刷新完成", retrying: "暂时无法刷新，稍后重试" };

export function MailSyncSettings({
  readOnly,
  accountNames,
  settings,
  onNavigate,
  openInitially,
  summaryRef,
}: {
  readOnly: boolean;
  accountNames: ReadonlyMap<string, string>;
  settings: ReturnType<typeof useCapability<SyncState>>;
  onNavigate: ModuleProps["onNavigate"];
  openInitially?: boolean;
  summaryRef?: Ref<HTMLElement>;
}) {
  const engine = useEngine();
  const [draft, setDraft] = useState<{ value: string; revision: string | null }>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const value = draft?.value ?? String(settings.data?.minutes ?? "");
  const plan = settings.data?.plan;
  const disabled = readOnly || busy || !settings.data?.available;
  async function save() {
    setBusy(true);
    setFeedback("");
    try {
      await engine.call("mail.sync.setInterval", { minutes: Number(value), expectedRevision: draft ? draft.revision : (settings.data?.revision ?? null) }, { write: true });
      await settings.refetch();
      setDraft(undefined);
      setFeedback("刷新周期已保存。");
    } catch (failure) {
      setFeedback(failure instanceof Error ? failure.message : "无法保存刷新周期，请重试。");
      await settings.refetch();
      setDraft(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details open={openInitially}>
      <summary ref={summaryRef}>邮件同步设置</summary>
      <form
        className="hu-mail-row"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          自动刷新（分钟，0 为关闭）{" "}
          <input
            className="hu-input"
            aria-label="自动刷新间隔（分钟）"
            type="number"
            min={0}
            max={1440}
            step={1}
            required
            value={value}
            disabled={disabled}
            onChange={(event) => setDraft({ value: event.currentTarget.value, revision: draft ? draft.revision : (settings.data?.revision ?? null) })}
          />
        </label>
        <Button type="submit" disabled={disabled || !value || Number(value) === settings.data?.minutes}>
          保存刷新周期
        </Button>
      </form>
      {plan && plan.intent !== "deleted" && <AutomationPlanLink planId={plan.planId} onNavigate={onNavigate} />}
      <div role="status">
        {feedback && <p>{feedback}</p>}
        {settings.isError && <p>无法读取同步状态。</p>}
        {settings.data && !settings.data.available ? <p>周期计划服务暂不可用。</p> : null}
        {plan?.availability.state === "blocked" ? <p>邮件周期同步受阻。</p> : null}
        {plan?.nextAt ? (
          <p>
            下次同步 <time dateTime={plan.nextAt}>{new Date(plan.nextAt).toLocaleString()}</time>
          </p>
        ) : null}
        {settings.data?.accounts
          .filter(({ accountId }) => accountNames.has(accountId))
          .map(({ accountId, phase, retryAt }) => (
            <p key={accountId}>
              {accountNames.get(accountId)} · {phases[phase]}
              {retryAt && ` · ${new Date(retryAt).toLocaleTimeString()}`}
            </p>
          ))}
      </div>
    </details>
  );
}
