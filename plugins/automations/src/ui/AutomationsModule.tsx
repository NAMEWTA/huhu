import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";

interface Rule { id: string; version: string; data: { title: string; enabled: boolean; builtin: boolean; trigger: { cron: string; zone: string }; action: { kind: string; text?: string } } }
interface Preview { next: string[]; tasksDisabled: boolean; candidates: { taskId: string; title: string }[]; skipped: { taskId: string; title: string; reason: keyof typeof t.reasons }[] }
interface Activation { activationId: string; ruleId: string; trigger: "schedule" | "manual"; startedAt: string; finishedAt?: string; summary?: unknown }

export function AutomationsModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [nav, setNav] = useState<"rules" | "activations">("rules");
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", text: "", cron: "*/5 * * * *" });
  const rules = useCapability<Rule[]>("automations.list", {});
  const acts = useCapability<Activation[]>("automations.activations", {});
  const cur = (rules.data ?? []).find((r) => r.id === sel) ?? rules.data?.[0] ?? null;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

  async function act<T>(cap: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="hu-module" data-testid="automations-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title}</h2>
        {(["rules", "activations"] as const).map((k) => <button key={k} type="button" className="hu-nav-item" aria-current={nav === k} onClick={() => setNav(k)}><span>{t.nav[k]}</span></button>)}
      </aside>
      <section className="hu-content">
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        {nav === "rules" ? (
          <>
            <h1>{t.nav.rules}</h1>
            <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void act("automations.create", { title: form.title, trigger: { preset: "custom", cron: form.cron, zone }, action: { kind: "notify", channel: "in_app", text: form.text } }).then(() => setForm({ title: "", text: "", cron: "*/5 * * * *" })); }}>
              <input className="hu-input" aria-label={t.ruleTitle} placeholder={t.ruleTitle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className="hu-input" aria-label={t.ruleText} placeholder={t.ruleText} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              <input className="hu-input" aria-label={t.ruleCron} value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} />
              <Button type="submit" disabled={!form.title.trim() || !form.text.trim()}>{t.create}</Button>
            </form>
            {(rules.data ?? []).map((r) => (
              <div key={r.id} className="hu-row" data-testid="rule-row" aria-current={cur?.id === r.id}>
                <button type="button" className="hu-nav-item" onClick={() => { setSel(r.id); setPreview(null); }}><strong>{r.data.title}</strong><span className="hu-meta">{r.data.trigger.cron} · {r.data.trigger.zone}</span></button>
                {r.data.builtin ? <Badge tone="blue">{t.builtin}</Badge> : null}
                <Badge tone={r.data.enabled ? "success" : "neutral"}>{r.data.enabled ? t.enabled : t.paused}</Badge>
              </div>
            ))}
            {cur ? (
              <article aria-label={cur.data.title} data-testid="rule-detail">
                <h2>{cur.data.title}</h2>
                <div className="hu-form">
                  <Button onClick={() => void act("automations.setEnabled", { id: cur.id, enabled: !cur.data.enabled })}>{cur.data.enabled ? t.pause : t.enable}</Button>
                  <Button onClick={() => void act<Preview>("automations.preview", { id: cur.id }).then(setPreview)}>{t.preview}</Button>
                  <Button variant="primary" onClick={() => void act("automations.runNow", { id: cur.id })}>{t.runNow}</Button>
                  <Button onClick={() => void act("automations.cancel", { id: cur.id })}>{t.cancel}</Button>
                  {!cur.data.builtin ? <Button variant="danger" onClick={() => void act("automations.delete", { id: cur.id })}>{t.delete}</Button> : null}
                </div>
                {preview ? (
                  <div data-testid="rule-preview">
                    <h3>{t.next}</h3><ul>{preview.next.map((n) => <li key={n}>{new Date(n).toLocaleString()}</li>)}</ul>
                    {preview.tasksDisabled ? <p>{t.tasksDisabled}</p> : null}
                    <h3>{t.candidates} {preview.candidates.length}</h3>
                    <ul>{preview.candidates.map((c) => <li key={c.taskId} data-testid="preview-candidate">{c.title}</li>)}</ul>
                    <h3>{t.skipped} {preview.skipped.length}</h3>
                    <ul>{preview.skipped.map((s) => <li key={s.taskId} data-testid="preview-skipped">{s.title} — {t.reasons[s.reason] ?? s.reason}</li>)}</ul>
                  </div>
                ) : null}
              </article>
            ) : null}
          </>
        ) : (
          <>
            <h1>{t.nav.activations}</h1>
            {(acts.data ?? []).length === 0 ? <EmptyState title={t.noActivations} /> : (acts.data ?? []).map((a) => (
              <div key={a.activationId} className="hu-row" data-testid="activation-row">
                <span>{new Date(a.startedAt).toLocaleString()}</span>
                <span>{(rules.data ?? []).find((r) => r.id === a.ruleId)?.data.title ?? a.ruleId}</span>
                <Badge>{t.trigger[a.trigger]}</Badge>
                <span>{t.summary(a.summary)}</span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
