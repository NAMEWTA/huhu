import { Badge, Banner, Button, EmptyState } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useRef, useState } from "react";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";

interface Cfg { remote: string; branch: string; mode: "off" | "follow" | "full"; pullIntervalSec: number; pushIntervalSec: number; exclude: string[] }
interface Preview { push: string[]; skipped: { path: string; reason: string }[]; pull: string[]; ahead: number; behind: number }
interface RunResult { pulled: boolean; pushed: boolean; committed: boolean }

export function SyncPage({ onResolve }: { onResolve: () => void }) {
  const cfg = useCapability<Cfg>("sync.get", {});
  const status = useCapability<{ name: string; detail: string; pausedReason: "conflict" | "auth-failed" | null }>("sync.status", {});
  if (cfg.isError) return <div role="alert" className="hu-overdue" data-testid="sync-load-error">{cfg.error instanceof Error ? cfg.error.message : String(cfg.error)}</div>;
  if (!cfg.data) return <p>…</p>;
  // 不能用配置值做 key：保存后配置变化会让表单重挂载，把“已保存”提示一并清掉
  return <SyncForm cfg={cfg.data} status={status.data ?? { name: "unknown", detail: "", pausedReason: null }} onResolve={onResolve} />;
}

function SyncForm({ cfg, status, onResolve }: { cfg: Cfg; status: { name: string; detail: string; pausedReason: "conflict" | "auth-failed" | null }; onResolve: () => void }) {
  const call = useCall();
  const remoteRef = useRef<HTMLInputElement>(null);
  const [remote, setRemote] = useState(cfg.remote);
  const [branch, setBranch] = useState(cfg.branch);
  const [mode, setMode] = useState(cfg.mode);
  const [exclude, setExclude] = useState(cfg.exclude.join("\n"));
  const [pullSec, setPullSec] = useState(String(cfg.pullIntervalSec));
  const [pushSec, setPushSec] = useState(String(cfg.pushIntervalSec));
  const okSec = (v: string) => /^\d+$/.test(v) && Number(v) >= 30 && Number(v) <= 3600;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const configured = cfg.remote.trim() !== "";
  const dirty = remote !== cfg.remote || branch !== cfg.branch || mode !== cfg.mode || exclude !== cfg.exclude.join("\n") || pullSec !== String(cfg.pullIntervalSec) || pushSec !== String(cfg.pushIntervalSec);
  const conflictCount = status.name === "conflict" ? status.detail.split("、").filter(Boolean).length : 0;

  async function save() {
    setMsg(null);
    const r = await call<Cfg>("sync.update", { remote: remote.trim(), branch: branch.trim(), mode, pullIntervalSec: okSec(pullSec) ? Number(pullSec) : cfg.pullIntervalSec, pushIntervalSec: okSec(pushSec) ? Number(pushSec) : cfg.pushIntervalSec, exclude: exclude.split("\n").map((l) => l.trim()).filter(Boolean) });
    setMsg(r.ok ? { tone: "ok", text: t.sync.saved } : { tone: "error", text: r.message });
  }

  async function doPreview() {
    setBusy(true); setMsg(null);
    const r = await call<Preview>("sync.preview", {});
    setBusy(false);
    if (r.ok) setPreview(r.data);
    else setMsg({ tone: "error", text: describe(r.code, r.message) });
  }

  async function doRun(m: "pull" | "push" | "sync") {
    setBusy(true); setMsg(null); setPreview(null);
    const r = await call<RunResult>("sync.run", { mode: m });
    setBusy(false);
    if (r.ok) setMsg({ tone: "ok", text: `${t.sync.done}：${t.sync.pulledPushed(r.data.pulled, r.data.pushed)}` });
    else if (r.code !== "GIT_CONFLICT") setMsg({ tone: "error", text: describe(r.code, r.message) });
  }

  return (
    <div data-testid="sync-page">
      <h1>{t.nav.sync} <span data-testid="sync-state"><Badge tone={status.name === "idle" ? "success" : status.name === "conflict" || status.name === "auth-failed" ? "danger" : "neutral"}>{t.sync.state[status.name] ?? status.name}</Badge></span></h1>

      {status.name === "conflict" ? (
        <Banner tone="danger" action={<Button variant="primary" onClick={onResolve} data-testid="sync-resolve">{t.sync.resolveNow}</Button>}><span data-testid="sync-conflict-banner">{t.sync.conflictBanner(conflictCount)}</span></Banner>
      ) : null}
      {status.name === "auth-failed" ? (
        <Banner tone="danger" action={<Button onClick={() => remoteRef.current?.focus()} data-testid="sync-reconfigure">{t.sync.reconfigure}</Button>}><span data-testid="sync-auth-failed">{t.sync.authFailed}</span></Banner>
      ) : null}
      {status.name === "offline" ? <Banner tone="warning"><span data-testid="sync-offline">{t.sync.offline}</span></Banner> : null}

      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={t.sync.settings}>
        <label>{t.sync.remote}<input ref={remoteRef} className="hu-input" data-testid="sync-remote" value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://… 或 /path/to/repo.git" /></label>
        <label>{t.sync.branch}<input className="hu-input" data-testid="sync-branch" value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
        <fieldset>
          <legend>{t.sync.mode}</legend>
          <div role="radiogroup" aria-label={t.sync.mode} className="hu-row">
            {(["off", "follow", "full"] as const).map((m) => (
              <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? "primary" : "secondary"} data-testid={`sync-mode-${m}`} onClick={() => setMode(m)}>{t.sync.modes[m]}</Button>
            ))}
          </div>
          <p className="hu-meta">{t.sync.modeNote}</p>
          {mode !== "off" ? (
            <div className="hu-row">
              <label>{t.sync.pullEvery}<input className="hu-input" inputMode="numeric" data-testid="sync-pull-sec" aria-invalid={!okSec(pullSec)} value={pullSec} onChange={(e) => setPullSec(e.target.value)} /></label>
              {mode === "full" ? <label>{t.sync.pushEvery}<input className="hu-input" inputMode="numeric" data-testid="sync-push-sec" aria-invalid={!okSec(pushSec)} value={pushSec} onChange={(e) => setPushSec(e.target.value)} /></label> : null}
              <span className="hu-meta">{t.sync.intervalRange}</span>
            </div>
          ) : null}
          {status.pausedReason ? <p role="status" className="hu-overdue" data-testid="sync-auto-paused">{t.sync.autoPaused[status.pausedReason]}</p> : null}
        </fieldset>
        <label>{t.sync.exclude}<textarea className="hu-input" data-testid="sync-exclude" rows={3} value={exclude} onChange={(e) => setExclude(e.target.value)} /></label>
        <Button type="submit" variant="primary" disabled={!dirty || !remote.trim() || !branch.trim() || (mode !== "off" && !okSec(pullSec)) || (mode === "full" && !okSec(pushSec))} data-testid="sync-save">{t.sync.save}</Button>
      </form>

      <div className="hu-row" role="group" aria-label={t.nav.sync}>
        <Button disabled={!configured || busy} onClick={() => void doPreview()} data-testid="sync-preview">{t.sync.preview}</Button>
        <Button disabled={!configured || busy} onClick={() => void doRun("pull")} data-testid="sync-pull">{t.sync.pull}</Button>
        <Button disabled={!configured || busy} onClick={() => void doRun("push")} data-testid="sync-push">{t.sync.push}</Button>
        <Button variant="primary" disabled={!configured || busy} onClick={() => void doRun("sync")} data-testid="sync-run">{t.sync.run}</Button>
        {!configured ? <span className="hu-meta">{t.sync.needRemote}</span> : null}
      </div>

      {msg ? <div role={msg.tone === "error" ? "alert" : "status"} className={msg.tone === "error" ? "hu-overdue" : undefined} data-testid="sync-message">{msg.text}</div> : null}

      {preview ? (
        <div data-testid="sync-preview-result">
          <p className="hu-meta">{t.sync.ahead} {preview.ahead} · {t.sync.behind} {preview.behind}</p>
          <FileList title={t.sync.willPush} items={preview.push} testid="preview-push" />
          <FileList title={t.sync.willPull} items={preview.pull} testid="preview-pull" />
          <h2>{t.sync.skipped}</h2>
          {preview.skipped.length === 0 ? <EmptyState title={t.sync.nothing} /> : preview.skipped.map((s) => <div key={s.path} className="hu-row" data-testid="preview-skipped"><span>{s.path}</span><span className="hu-meta">{s.reason}</span></div>)}
        </div>
      ) : null}
    </div>
  );
}

function FileList({ title, items, testid }: { title: string; items: string[]; testid: string }) {
  return (
    <>
      <h2>{title}（{items.length}）</h2>
      {items.length === 0 ? <EmptyState title={t.sync.nothing} /> : items.map((p) => <div key={p} className="hu-row" data-testid={testid}>{p}</div>)}
    </>
  );
}

function describe(code: string, message: string): string {
  if (code === "GIT_OFFLINE") return t.sync.offline;
  if (code === "GIT_AUTH_FAILED") return t.sync.authFailed;
  return message;
}
