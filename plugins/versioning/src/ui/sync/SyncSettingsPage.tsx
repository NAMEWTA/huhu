import { Button } from "@huhu/ui";
import { AutomationPlanLink, host, useCapability, type ModuleProps } from "@huhu/workbench";
import { useId, useState } from "react";
import { canSendAuthentication } from "../../shared/git-auth.js";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";
import { GitAuthPanel } from "./GitAuthPanel.js";
import type { Cfg, SyncStatus } from "./types.js";
import type { GitPlanRevisions } from "../../engine/sync-plans.js";

type ScheduleDraft = { mode: Cfg["mode"]; pullSec: string; pushSec: string; revisions: GitPlanRevisions; revision: string | undefined };

/** 同步设置页（versioning 插件）：远端、分支、凭据、同步模式、间隔与排除规则。状态、预览与执行留在版本模块的同步页。 */
export function SyncSettingsPage({ onNavigate }: Pick<ModuleProps, "onNavigate">) {
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
  return <SyncSettingsForm cfg={cfg.data} status={status.data} onNavigate={onNavigate} />;
}

function SyncSettingsForm({ cfg, status, onNavigate }: { cfg: Cfg; status: SyncStatus | undefined; onNavigate: ModuleProps["onNavigate"] }) {
  const call = useCall();
  const [remote, setRemote] = useState(cfg.remote);
  const [branch, setBranch] = useState(cfg.branch);
  const [exclude, setExclude] = useState(cfg.exclude.join("\n"));
  const [schedule, setSchedule] = useState<ScheduleDraft>();
  const [busy, setBusy] = useState(false);
  const intervalHint = useId();
  const base = { mode: cfg.mode, pullSec: String(cfg.pullIntervalSec), pushSec: String(cfg.pushIntervalSec) };
  const { mode, pullSec, pushSec } = schedule ?? base;
  const updateSchedule = (patch: Partial<typeof base>) =>
    setSchedule((previous) => ({
      ...base,
      revisions: { pull: cfg.periodics?.pull?.revision ?? null, sync: cfg.periodics?.sync?.revision ?? null },
      revision: cfg.revision,
      ...previous,
      ...patch,
    }));
  const okSec = (v: string) => /^\d+$/.test(v) && Number(v) >= 30 && Number(v) <= 3600;
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const dirty = remote !== cfg.remote || branch !== cfg.branch || mode !== cfg.mode || exclude !== cfg.exclude.join("\n") || pullSec !== String(cfg.pullIntervalSec) || pushSec !== String(cfg.pushIntervalSec);
  const pausedReason = status?.pausedReason;
  const readOnly = status?.name === "read-only";
  const canSave = dirty && !busy && !readOnly && Boolean(remote.trim() && branch.trim()) && (mode === "off" || okSec(pullSec)) && (mode !== "full" || okSec(pushSec));

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    const r = await call<Cfg>("sync.update", {
      remote: remote.trim(),
      branch: branch.trim(),
      ...((schedule ? schedule.revision : cfg.revision) && { expectedRevision: schedule ? schedule.revision : cfg.revision }),
      ...(schedule && {
        expectedPlans: schedule.revisions,
        ...(mode !== cfg.mode && { mode }),
        ...(okSec(pullSec) && Number(pullSec) !== cfg.pullIntervalSec && { pullIntervalSec: Number(pullSec) }),
        ...(okSec(pushSec) && Number(pushSec) !== cfg.pushIntervalSec && { pushIntervalSec: Number(pushSec) }),
      }),
      exclude: exclude
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    if (r.ok) {
      setRemote(r.data.remote);
      setBranch(r.data.branch);
      setExclude(r.data.exclude.join("\n"));
    }
    if (r.ok || r.code === "VERSION_CONFLICT") setSchedule(undefined);
    setMsg(r.ok ? { tone: "ok", text: t.sync.saved } : { tone: "error", text: r.message });
    setBusy(false);
  }

  return (
    <div className="hu-sync-settings" data-testid="sync-settings">
      <form
        className="hu-sync-settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        aria-label={t.sync.settings}
      >
        <div className="hu-sync-settings-grid">
          <section className="hu-settings-section hu-card-alt hu-sync-fields">
            <h2>连接信息</h2>
            <label>
              {t.sync.remote}
              <input className="hu-input" data-testid="sync-remote" disabled={busy || readOnly} value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://… 或 /path/to/repo.git" />
            </label>
            <label>
              {t.sync.branch}
              <input className="hu-input" data-testid="sync-branch" disabled={busy || readOnly} value={branch} onChange={(e) => setBranch(e.target.value)} />
            </label>
          </section>
          <section className="hu-settings-section hu-card-alt">
            <h2>同步行为</h2>
            <fieldset className="hu-sync-fields" disabled={busy || readOnly || !cfg.periodics}>
              <legend>{t.sync.mode}</legend>
              <div role="radiogroup" aria-label={t.sync.mode} className="hu-sync-actions">
                {(["off", "follow", "full"] as const).map((m) => (
                  <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? "primary" : "secondary"} data-testid={`sync-mode-${m}`} onClick={() => updateSchedule({ mode: m })}>
                    {t.sync.modes[m]}
                  </Button>
                ))}
              </div>
              <p>{t.sync.modeNote}</p>
              {mode !== "off" ? (
                <>
                  <label>
                    {t.sync.pullEvery}
                    <input
                      className="hu-input"
                      type="number"
                      min={30}
                      max={3600}
                      data-testid="sync-pull-sec"
                      aria-invalid={!okSec(pullSec)}
                      aria-describedby={intervalHint}
                      value={pullSec}
                      onChange={(e) => updateSchedule({ pullSec: e.target.value })}
                    />
                  </label>
                  {mode === "full" ? (
                    <label>
                      {t.sync.pushEvery}
                      <input
                        className="hu-input"
                        type="number"
                        min={30}
                        max={3600}
                        data-testid="sync-push-sec"
                        aria-invalid={!okSec(pushSec)}
                        aria-describedby={intervalHint}
                        value={pushSec}
                        onChange={(e) => updateSchedule({ pushSec: e.target.value })}
                      />
                    </label>
                  ) : null}
                  <small id={intervalHint}>{t.sync.intervalRange}</small>
                </>
              ) : null}
            </fieldset>
            {pausedReason ? (
              <p role="status" className="hu-overdue" data-testid="sync-auto-paused">
                {t.sync.autoPaused[pausedReason]}
              </p>
            ) : null}
            {!cfg.periodics ? <p role="status">周期计划服务暂不可用。</p> : null}
            <div className="hu-sync-actions">
              {cfg.periodics?.pull && cfg.periodics.pull.intent !== "deleted" && <AutomationPlanLink planId={cfg.periodics.pull.planId} onNavigate={onNavigate} label="管理 Git 拉取计划" />}
              {cfg.periodics?.sync && cfg.periodics.sync.intent !== "deleted" && <AutomationPlanLink planId={cfg.periodics.sync.planId} onNavigate={onNavigate} label="管理 Git 同步计划" />}
            </div>
          </section>
        </div>
        <section className="hu-settings-section hu-card-alt hu-sync-fields">
          <h2>排除规则</h2>
          <label>
            {t.sync.exclude}
            <textarea className="hu-input" data-testid="sync-exclude" rows={5} disabled={busy || readOnly} value={exclude} onChange={(e) => setExclude(e.target.value)} />
          </label>
        </section>
        <div className="hu-sync-actions">
          <Button type="submit" variant="primary" disabled={!canSave} loading={busy} data-testid="sync-save">
            {t.sync.save}
          </Button>
          {msg ? (
            <div role={msg.tone === "error" ? "alert" : "status"} className={msg.tone === "error" ? "hu-overdue" : undefined} data-testid="sync-message">
              {msg.text}
            </div>
          ) : null}
        </div>
      </form>
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
