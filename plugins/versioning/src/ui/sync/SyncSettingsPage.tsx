import { Button } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import { useState } from "react";
import { canSendAuthentication } from "../../shared/git-auth.js";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";
import { GitAuthPanel } from "./GitAuthPanel.js";
import type { Cfg, SyncStatus } from "./types.js";

/** 同步设置页（versioning 插件）：远端、分支、凭据、同步模式、间隔与排除规则。状态、预览与执行留在版本模块的同步页。 */
export function SyncSettingsPage() {
  const cfg = useCapability<Cfg>("sync.get", {});
  const status = useCapability<SyncStatus>("sync.status", {});
  if (cfg.isError)
    return (
      <div role="alert" className="hu-overdue" data-testid="sync-load-error">
        {cfg.error instanceof Error ? cfg.error.message : String(cfg.error)}
      </div>
    );
  if (!cfg.data) return <p>…</p>;
  // 不能用配置值做 key：保存后配置变化会让表单重挂载，把“已保存”提示一并清掉
  return <SyncSettingsForm cfg={cfg.data} status={status.data} />;
}

function SyncSettingsForm({ cfg, status }: { cfg: Cfg; status: SyncStatus | undefined }) {
  const call = useCall();
  const [remote, setRemote] = useState(cfg.remote);
  const [branch, setBranch] = useState(cfg.branch);
  const [mode, setMode] = useState(cfg.mode);
  const [exclude, setExclude] = useState(cfg.exclude.join("\n"));
  const [pullSec, setPullSec] = useState(String(cfg.pullIntervalSec));
  const [pushSec, setPushSec] = useState(String(cfg.pushIntervalSec));
  const okSec = (v: string) => /^\d+$/.test(v) && Number(v) >= 30 && Number(v) <= 3600;
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const dirty = remote !== cfg.remote || branch !== cfg.branch || mode !== cfg.mode || exclude !== cfg.exclude.join("\n") || pullSec !== String(cfg.pullIntervalSec) || pushSec !== String(cfg.pushIntervalSec);
  const pausedReason = status?.pausedReason;

  async function save() {
    setMsg(null);
    const target = remote.trim();
    const r = await call<Cfg>("sync.update", {
      remote: target,
      branch: branch.trim(),
      mode,
      pullIntervalSec: okSec(pullSec) ? Number(pullSec) : cfg.pullIntervalSec,
      pushIntervalSec: okSec(pushSec) ? Number(pushSec) : cfg.pushIntervalSec,
      exclude: exclude
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    if (r.ok) setRemote((current) => (current.trim() === target ? r.data.remote : current));
    setMsg(r.ok ? { tone: "ok", text: t.sync.saved } : { tone: "error", text: r.message });
  }

  return (
    <div data-testid="sync-settings">
      <form
        className="hu-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        aria-label={t.sync.settings}
      >
        <label>
          {t.sync.remote}
          <input className="hu-input" data-testid="sync-remote" value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://… 或 /path/to/repo.git" />
        </label>
        <label>
          {t.sync.branch}
          <input className="hu-input" data-testid="sync-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <fieldset>
          <legend>{t.sync.mode}</legend>
          <div role="radiogroup" aria-label={t.sync.mode} className="hu-row">
            {(["off", "follow", "full"] as const).map((m) => (
              <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? "primary" : "secondary"} data-testid={`sync-mode-${m}`} onClick={() => setMode(m)}>
                {t.sync.modes[m]}
              </Button>
            ))}
          </div>
          <p>{t.sync.modeNote}</p>
          {mode !== "off" ? (
            <div className="hu-row">
              <label>
                {t.sync.pullEvery}
                <input className="hu-input" inputMode="numeric" data-testid="sync-pull-sec" aria-invalid={!okSec(pullSec)} value={pullSec} onChange={(e) => setPullSec(e.target.value)} />
              </label>
              {mode === "full" ? (
                <label>
                  {t.sync.pushEvery}
                  <input className="hu-input" inputMode="numeric" data-testid="sync-push-sec" aria-invalid={!okSec(pushSec)} value={pushSec} onChange={(e) => setPushSec(e.target.value)} />
                </label>
              ) : null}
              <span>{t.sync.intervalRange}</span>
            </div>
          ) : null}
          {pausedReason ? (
            <p role="status" className="hu-overdue" data-testid="sync-auto-paused">
              {t.sync.autoPaused[pausedReason]}
            </p>
          ) : null}
        </fieldset>
        <label>
          {t.sync.exclude}
          <textarea className="hu-input" data-testid="sync-exclude" rows={3} value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" disabled={!dirty || !remote.trim() || !branch.trim() || (mode !== "off" && !okSec(pullSec)) || (mode === "full" && !okSec(pushSec))} data-testid="sync-save">
          {t.sync.save}
        </Button>
      </form>

      {msg ? (
        <div role={msg.tone === "error" ? "alert" : "status"} className={msg.tone === "error" ? "hu-overdue" : undefined} data-testid="sync-message">
          {msg.text}
        </div>
      ) : null}
      {canConfigureAuth(remote.trim()) ? (
        cfg.remote !== remote.trim() ? (
          <p role="status">{t.sync.credentialSaveRemote}</p>
        ) : host() ? (
          <GitAuthPanel key={cfg.remote} remote={cfg.remote} readOnly={status?.name === "read-only"} />
        ) : (
          <p role="status">{t.sync.credentialDesktop}</p>
        )
      ) : null}
    </div>
  );
}

function canConfigureAuth(remote: string): boolean {
  try {
    return canSendAuthentication(remote);
  } catch {
    return false;
  }
}
