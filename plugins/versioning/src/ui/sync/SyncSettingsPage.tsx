import { Button } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";
import type { Cfg, SyncStatus } from "./types.js";

/** 同步设置页（versioning 插件）：远端、分支、凭据、同步模式、间隔与排除规则。状态、预览与执行留在版本模块的同步页。 */
export function SyncSettingsPage() {
  const cfg = useCapability<Cfg>("sync.get", {});
  const items = useCapability<{ id: string; name: string; type: string; allowedModules: string[] }[]>("safe.items.list", {}); // 保险箱插件停用/未解锁时会报错，忽略即可
  const status = useCapability<SyncStatus>("sync.status", {});
  if (cfg.isError)
    return (
      <div role="alert" className="hu-overdue" data-testid="sync-load-error">
        {cfg.error instanceof Error ? cfg.error.message : String(cfg.error)}
      </div>
    );
  if (!cfg.data) return <p>…</p>;
  // 不能用配置值做 key：保存后配置变化会让表单重挂载，把“已保存”提示一并清掉
  return <SyncSettingsForm cfg={cfg.data} safeItems={(items.data ?? []).filter((i) => i.allowedModules.includes("versioning") && (i.type === "token" || i.type === "password"))} pausedReason={status.data?.pausedReason ?? null} />;
}

function SyncSettingsForm({ cfg, safeItems, pausedReason }: { cfg: Cfg; safeItems: { id: string; name: string }[]; pausedReason: SyncStatus["pausedReason"] }) {
  const call = useCall();
  const [remote, setRemote] = useState(cfg.remote);
  const [branch, setBranch] = useState(cfg.branch);
  const [mode, setMode] = useState(cfg.mode);
  const [exclude, setExclude] = useState(cfg.exclude.join("\n"));
  const [credential, setCredential] = useState(cfg.credential);
  const [credUser, setCredUser] = useState(cfg.credentialUser);
  const [pullSec, setPullSec] = useState(String(cfg.pullIntervalSec));
  const [pushSec, setPushSec] = useState(String(cfg.pushIntervalSec));
  const okSec = (v: string) => /^\d+$/.test(v) && Number(v) >= 30 && Number(v) <= 3600;
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const dirty =
    remote !== cfg.remote ||
    branch !== cfg.branch ||
    mode !== cfg.mode ||
    exclude !== cfg.exclude.join("\n") ||
    credential !== cfg.credential ||
    credUser !== cfg.credentialUser ||
    pullSec !== String(cfg.pullIntervalSec) ||
    pushSec !== String(cfg.pushIntervalSec);

  async function save() {
    setMsg(null);
    const r = await call<Cfg>("sync.update", {
      remote: remote.trim(),
      branch: branch.trim(),
      mode,
      credential,
      credentialUser: credUser.trim() || "git",
      pullIntervalSec: okSec(pullSec) ? Number(pullSec) : cfg.pullIntervalSec,
      pushIntervalSec: okSec(pushSec) ? Number(pushSec) : cfg.pushIntervalSec,
      exclude: exclude
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    });
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
        <label>
          {t.sync.credential}
          <select data-testid="sync-credential" aria-label={t.sync.credential} value={credential} onChange={(e) => setCredential(e.target.value)}>
            <option value="">{t.sync.credentialNone}</option>
            {safeItems.map((i) => (
              <option key={i.id} value={`safe://${i.id}`}>
                {i.name}
              </option>
            ))}
            {credential && !safeItems.some((i) => `safe://${i.id}` === credential) ? <option value={credential}>{t.sync.credentialMissing}</option> : null}
          </select>
        </label>
        {credential ? (
          <label>
            {t.sync.credentialUser}
            <input className="hu-input" data-testid="sync-credential-user" value={credUser} onChange={(e) => setCredUser(e.target.value)} />
          </label>
        ) : null}
        <p>{safeItems.length === 0 ? t.sync.credentialHint : t.sync.credentialNote}</p>
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
    </div>
  );
}
