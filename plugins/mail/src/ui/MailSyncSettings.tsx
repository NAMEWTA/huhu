import { Button } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useState } from "react";

type SyncState = { minutes: number; accounts: { accountId: string; phase: "refreshing" | "ready" | "retrying"; at: string; retryAt?: string }[] };
const phases = { refreshing: "正在刷新", ready: "刷新完成", retrying: "暂时无法刷新，稍后重试" };

export function MailSyncSettings({ readOnly, accountNames }: { readOnly: boolean; accountNames: ReadonlyMap<string, string> }) {
  const engine = useEngine();
  const settings = useCapability<SyncState>("mail.sync.settings");
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const value = draft ?? String(settings.data?.minutes ?? "");
  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "mail-sync") void settings.refetch();
  });
  async function save() {
    setBusy(true);
    setFeedback("");
    try {
      await engine.call("mail.sync.setInterval", { minutes: Number(value) }, { write: true });
      await settings.refetch();
      setDraft(undefined);
      setFeedback("刷新周期已保存。");
    } catch {
      setFeedback("无法保存刷新周期，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>邮件同步设置</summary>
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
            disabled={readOnly || busy || !settings.data}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </label>
        <Button type="submit" disabled={readOnly || busy || !settings.data || !value || Number(value) === settings.data.minutes}>
          保存刷新周期
        </Button>
      </form>
      <div role="status">
        {feedback && <p>{feedback}</p>}
        {settings.isError && <p>无法读取同步状态。</p>}
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
