import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";
import { RuleEditor, type EditableRule } from "./RuleEditor.js";
import { RunsPanel } from "./RunsPanel.js";

interface Rule extends EditableRule {
  data: EditableRule["data"] & { enabled: boolean };
}
interface Preview {
  next: string[];
  tasksDisabled: boolean;
  candidates: { taskId: string; title: string }[];
  skipped: { taskId: string; title: string; reason: keyof typeof t.reasons }[];
}
interface ScriptRow {
  id: string;
  title: string;
  program: string;
  cwd: string;
  timeoutSec: number;
  envRefs: Record<string, string>;
}
interface Activation {
  activationId: string;
  ruleId: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt?: string;
  summary?: unknown;
}

export function AutomationsModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [nav, setNav] = useState<"rules" | "activations" | "runs" | "scripts">("rules");
  const [sf, setSf] = useState({ title: "", program: "", cwd: "", timeoutSec: "60", env: "" });
  const scripts = useCapability<ScriptRow[]>("automations.scripts.list", {});
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 正在编辑的规则 id（null = 底部显示“新建”）
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
        {(["rules", "activations", "runs", "scripts"] as const).map((k) => (
          <button key={k} type="button" className="hu-nav-item" aria-current={nav === k} onClick={() => setNav(k)}>
            <span>{t.nav[k]}</span>
          </button>
        ))}
      </aside>
      <section className="hu-content">
        {error ? (
          <div role="alert" className="hu-overdue">
            {error}
          </div>
        ) : null}
        {nav === "runs" ? (
          <RunsPanel />
        ) : nav === "scripts" ? (
          <>
            <h1>{t.scriptsTitle}</h1>
            <p className="hu-meta">{t.scriptsHint}</p>
            <form
              className="hu-form"
              onSubmit={(e) => {
                e.preventDefault();
                const envRefs: Record<string, string> = {};
                for (const line of sf.env
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)) {
                  const i = line.indexOf("=");
                  if (i > 0) envRefs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
                }
                void act("automations.scripts.save", { title: sf.title, program: sf.program, args: [], cwd: sf.cwd, envRefs, timeoutSec: Number(sf.timeoutSec) }).then((r) => {
                  if (r) setSf({ title: "", program: "", cwd: "", timeoutSec: "60", env: "" });
                });
              }}
            >
              <input className="hu-input" aria-label={t.scriptName} placeholder={t.scriptName} value={sf.title} onChange={(e) => setSf({ ...sf, title: e.target.value })} />
              <input className="hu-input" aria-label={t.scriptProgram} placeholder={t.scriptProgram} value={sf.program} onChange={(e) => setSf({ ...sf, program: e.target.value })} />
              <input className="hu-input" aria-label={t.scriptCwd} placeholder={t.scriptCwd} value={sf.cwd} onChange={(e) => setSf({ ...sf, cwd: e.target.value })} />
              <input className="hu-input" type="number" aria-label={t.scriptTimeout} value={sf.timeoutSec} onChange={(e) => setSf({ ...sf, timeoutSec: e.target.value })} />
              <textarea className="hu-input" aria-label={t.scriptEnv} placeholder={t.scriptEnv} value={sf.env} onChange={(e) => setSf({ ...sf, env: e.target.value })} />
              <Button type="submit" disabled={!sf.title.trim() || !sf.program.trim() || !sf.cwd.trim()}>
                {t.scriptSave}
              </Button>
            </form>
            {(scripts.data ?? []).length === 0 ? (
              <EmptyState title={t.noScripts} />
            ) : (
              (scripts.data ?? []).map((s) => (
                <div key={s.id} className="hu-row" data-testid="script-row">
                  <strong>{s.title}</strong>
                  <code>{s.program}</code>
                  <span className="hu-meta">{Object.keys(s.envRefs).join(", ")}</span>
                  <Button variant="danger" aria-label={`${t.scriptDelete} ${s.title}`} onClick={() => void act("automations.scripts.delete", { id: s.id })}>
                    {t.scriptDelete}
                  </Button>
                </div>
              ))
            )}
          </>
        ) : nav === "rules" ? (
          <>
            <h1>{t.nav.rules}</h1>
            {editing === null ? <RuleEditor key="new" zone={zone} onSave={async (v) => (await act("automations.create", v)) !== null} /> : null}
            {(rules.data ?? []).map((r) => (
              <div key={r.id} className="hu-row" data-testid="rule-row" aria-current={cur?.id === r.id}>
                <button
                  type="button"
                  className="hu-nav-item"
                  onClick={() => {
                    setSel(r.id);
                    setPreview(null);
                    setEditing(null);
                  }}
                >
                  <strong>{r.data.title}</strong>
                  <span className="hu-meta">
                    {r.data.trigger.cron} · {r.data.trigger.zone}
                  </span>
                </button>
                {r.data.builtin ? <Badge tone="blue">{t.builtin}</Badge> : null}
                <Badge tone={r.data.enabled ? "success" : "neutral"}>{r.data.enabled ? t.enabled : t.paused}</Badge>
              </div>
            ))}
            {cur ? (
              <article aria-label={cur.data.title} data-testid="rule-detail">
                <h2>{cur.data.title}</h2>
                <div className="hu-form">
                  <Button aria-expanded={editing === cur.id} onClick={() => setEditing(editing === cur.id ? null : cur.id)} data-testid="rule-edit">
                    {t.edit}
                  </Button>
                  <Button onClick={() => void act("automations.setEnabled", { id: cur.id, enabled: !cur.data.enabled })}>{cur.data.enabled ? t.pause : t.enable}</Button>
                  <Button onClick={() => void act<Preview>("automations.preview", { id: cur.id }).then(setPreview)}>{t.preview}</Button>
                  <Button variant="primary" onClick={() => void act("automations.runNow", { id: cur.id })}>
                    {t.runNow}
                  </Button>
                  <Button onClick={() => void act("automations.cancel", { id: cur.id })}>{t.cancel}</Button>
                  {!cur.data.builtin ? (
                    <Button variant="danger" onClick={() => void act("automations.delete", { id: cur.id })}>
                      {t.delete}
                    </Button>
                  ) : null}
                </div>
                {editing === cur.id ? (
                  <RuleEditor
                    key={cur.id}
                    rule={cur}
                    zone={zone}
                    onCancel={() => setEditing(null)}
                    onSave={async (v) => {
                      const r = await act("automations.update", { id: cur.id, expectedVersion: cur.version, patch: { title: v.title, trigger: v.trigger, action: v.action }, body: v.body });
                      if (r !== null) setEditing(null);
                      return r !== null;
                    }}
                  />
                ) : null}
                {preview ? (
                  <div data-testid="rule-preview">
                    <h3>{t.next}</h3>
                    <ul>
                      {preview.next.map((n) => (
                        <li key={n}>{new Date(n).toLocaleString()}</li>
                      ))}
                    </ul>
                    {preview.tasksDisabled ? <p>{t.tasksDisabled}</p> : null}
                    <h3>
                      {t.candidates} {preview.candidates.length}
                    </h3>
                    <ul>
                      {preview.candidates.map((c) => (
                        <li key={c.taskId} data-testid="preview-candidate">
                          {c.title}
                        </li>
                      ))}
                    </ul>
                    <h3>
                      {t.skipped} {preview.skipped.length}
                    </h3>
                    <ul>
                      {preview.skipped.map((s) => (
                        <li key={s.taskId} data-testid="preview-skipped">
                          {s.title} — {t.reasons[s.reason] ?? s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ) : null}
          </>
        ) : (
          <>
            <h1>{t.nav.activations}</h1>
            {(acts.data ?? []).length === 0 ? (
              <EmptyState title={t.noActivations} />
            ) : (
              (acts.data ?? []).map((a) => (
                <div key={a.activationId} className="hu-row" data-testid="activation-row">
                  <span>{new Date(a.startedAt).toLocaleString()}</span>
                  <span>{(rules.data ?? []).find((r) => r.id === a.ruleId)?.data.title ?? a.ruleId}</span>
                  <Badge>{t.trigger[a.trigger]}</Badge>
                  <span>{t.summary(a.summary)}</span>
                </div>
              ))
            )}
          </>
        )}
      </section>
    </div>
  );
}
