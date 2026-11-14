import { Badge, Banner, Button, EmptyState } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";
import type { Cfg, SyncStatus } from "./types.js";
interface Preview {
  push: string[];
  skipped: { path: string; reason: string }[];
  pull: string[];
  ahead: number;
  behind: number;
}
interface RunResult {
  pulled: boolean;
  pushed: boolean;
  committed: boolean;
}

export function SyncPage({ onResolve, onOpenSettings }: { onResolve: () => void; onOpenSettings: () => void }) {
  const cfg = useCapability<Cfg>("sync.get", {});
  const status = useCapability<SyncStatus>("sync.status", {});
  if (cfg.isError)
    return (
      <div role="alert" className="hu-overdue" data-testid="sync-load-error">
        {cfg.error instanceof Error ? cfg.error.message : String(cfg.error)}
      </div>
    );
  if (!cfg.data) return <p>…</p>;
  return <SyncActions configured={cfg.data.remote.trim() !== ""} status={status.data ?? { name: "unknown", detail: "", pausedReason: null }} onResolve={onResolve} onOpenSettings={onOpenSettings} />;
}

function SyncActions({ configured, status, onResolve, onOpenSettings }: { configured: boolean; status: SyncStatus; onResolve: () => void; onOpenSettings: () => void }) {
  const call = useCall();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const conflictCount = status.name === "conflict" ? status.detail.split("、").filter(Boolean).length : 0;

  async function doPreview() {
    setBusy(true);
    setMsg(null);
    const r = await call<Preview>("sync.preview", {});
    setBusy(false);
    if (r.ok) setPreview(r.data);
    else setMsg({ tone: "error", text: describe(r.code, r.message) });
  }

  async function doRun(m: "pull" | "push" | "sync") {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    const r = await call<RunResult>("sync.run", { mode: m });
    setBusy(false);
    if (r.ok) setMsg({ tone: "ok", text: `${t.sync.done}：${t.sync.pulledPushed(r.data.pulled, r.data.pushed)}` });
    else if (r.code !== "GIT_CONFLICT") setMsg({ tone: "error", text: describe(r.code, r.message) });
  }

  return (
    <div data-testid="sync-page">
      <h1>
        {t.nav.sync}{" "}
        <span data-testid="sync-state">
          <Badge tone={status.name === "idle" ? "success" : status.name === "conflict" || status.name === "auth-failed" ? "danger" : "neutral"}>{t.sync.state[status.name] ?? status.name}</Badge>
        </span>
      </h1>

      {status.name === "conflict" ? (
        <Banner
          tone="danger"
          action={
            <Button variant="primary" onClick={onResolve} data-testid="sync-resolve">
              {t.sync.resolveNow}
            </Button>
          }
        >
          <span data-testid="sync-conflict-banner">{t.sync.conflictBanner(conflictCount)}</span>
        </Banner>
      ) : null}
      {status.name === "auth-failed" ? (
        <Banner
          tone="danger"
          action={
            <Button onClick={onOpenSettings} data-testid="sync-reconfigure">
              {t.sync.reconfigure}
            </Button>
          }
        >
          <span data-testid="sync-auth-failed">{t.sync.authFailed}</span>
        </Banner>
      ) : null}
      {status.name === "offline" ? (
        <Banner tone="warning">
          <span data-testid="sync-offline">{t.sync.offline}</span>
        </Banner>
      ) : null}

      <div className="hu-row" role="group" aria-label={t.nav.sync}>
        <Button disabled={!configured || busy} onClick={() => void doPreview()} data-testid="sync-preview">
          {t.sync.preview}
        </Button>
        <Button disabled={!configured || busy} onClick={() => void doRun("pull")} data-testid="sync-pull">
          {t.sync.pull}
        </Button>
        <Button disabled={!configured || busy} onClick={() => void doRun("push")} data-testid="sync-push">
          {t.sync.push}
        </Button>
        <Button variant="primary" disabled={!configured || busy} onClick={() => void doRun("sync")} data-testid="sync-run">
          {t.sync.run}
        </Button>
        {!configured ? (
          <>
            <span>{t.sync.needRemote}</span>
            <Button variant="ghost" onClick={onOpenSettings} data-testid="sync-open-settings">
              {t.sync.settings}
            </Button>
          </>
        ) : null}
      </div>

      {msg ? (
        <div role={msg.tone === "error" ? "alert" : "status"} className={msg.tone === "error" ? "hu-overdue" : undefined} data-testid="sync-message">
          {msg.text}
        </div>
      ) : null}

      {preview ? (
        <div data-testid="sync-preview-result">
          <p>
            {t.sync.ahead} {preview.ahead} · {t.sync.behind} {preview.behind}
          </p>
          <FileList title={t.sync.willPush} items={preview.push} testid="preview-push" />
          <FileList title={t.sync.willPull} items={preview.pull} testid="preview-pull" />
          <h2>{t.sync.skipped}</h2>
          {preview.skipped.length === 0 ? (
            <EmptyState title={t.sync.nothing} />
          ) : (
            preview.skipped.map((s) => (
              <div key={s.path} className="hu-row" data-testid="preview-skipped">
                <span>{s.path}</span>
                <span>{s.reason}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function FileList({ title, items, testid }: { title: string; items: string[]; testid: string }) {
  return (
    <>
      <h2>
        {title}（{items.length}）
      </h2>
      {items.length === 0 ? (
        <EmptyState title={t.sync.nothing} />
      ) : (
        items.map((p) => (
          <div key={p} className="hu-row" data-testid={testid}>
            {p}
          </div>
        ))
      )}
    </>
  );
}

function describe(code: string, message: string): string {
  if (code === "GIT_OFFLINE") return t.sync.offline;
  if (code === "GIT_AUTH_FAILED") return t.sync.authFailed;
  return message;
}
