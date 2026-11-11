import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";

interface RunRow { id: string; kind: "task-run" | "automation-run"; state: string; title: string; startedAt: string | null; finishedAt: string | null; attempt: number | null; live: boolean }
interface Question { id: string; text: string; options: string[]; answer: string | null }
interface RunDetail { id: string; kind: "task-run" | "automation-run"; body: string; title: string; live: boolean; canRetry: boolean; data: Record<string, unknown> }

const fmt = (v: unknown): string => (typeof v === "string" && v ? new Date(v).toLocaleString() : "—");

/** 运行列表 + 详情：状态、时间、Space、cwd、CLI、模型、会话 id、结果、问题与回答；取消 / 标记失败并重试。 */
export function RunsPanel() {
  const engine = useEngine();
  const qc = useQueryClient();
  const runs = useCapability<RunRow[]>("automations.runs.list", {});
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

  async function act(cap: string, input: unknown): Promise<boolean> {
    setError(null);
    try { await engine.call(cap, input, { write: true }); await refresh(); return true; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
  }

  return (
    <>
      <h1>{t.nav.runs}</h1>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      {(runs.data ?? []).length === 0 ? <EmptyState title={t.runs.none} /> : (
        <div role="list" aria-label={t.nav.runs}>
          {(runs.data ?? []).map((r) => (
            <div key={r.id} role="listitem" className="hu-row" data-testid="run-row">
              <button type="button" className="hu-nav-item" aria-current={sel === r.id} onClick={() => setSel(r.id)}>
                <span>{r.title}</span>
              </button>
              <Badge>{t.runs.state[r.state] ?? r.state}</Badge>
              {r.attempt && r.attempt > 1 ? <span className="hu-meta">{t.runs.attempt(r.attempt)}</span> : null}
              <span className="hu-meta">{fmt(r.startedAt)}</span>
            </div>
          ))}
        </div>
      )}
      {sel ? <RunDetailView key={sel} runId={sel} act={act} /> : null}
    </>
  );
}

function RunDetailView({ runId, act }: { runId: string; act(cap: string, input: unknown): Promise<boolean> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const detail = useCapability<RunDetail>("automations.runs.read", { runId });
  const d = detail.data;
  const data = d?.data ?? {};
  const questions = (Array.isArray(data["questions"]) ? data["questions"] : []) as Question[];
  const open = questions.filter((q) => q.answer === null);
  const state = String(data["state"] ?? "");
  return (
    <>
      {d ? (
        <section aria-label={t.runs.detail} data-testid="run-detail" className="hu-card">
          <h2>{d.title}</h2>
          <dl className="hu-meta">
            <dt>{t.runs.status}</dt><dd data-testid="run-state">{t.runs.state[state] ?? state}</dd>
            <dt>{t.runs.started}</dt><dd>{fmt(data["startedAt"])}</dd>
            <dt>{t.runs.finished}</dt><dd>{fmt(data["finishedAt"])}</dd>
            {d.kind === "task-run" ? <><dt>{t.runs.cwd}</dt><dd>{String(data["cwd"] ?? "—")}</dd><dt>{t.runs.cli}</dt><dd>{String(data["provider"] ?? "—")}{data["model"] ? ` · ${String(data["model"])}` : ""}</dd><dt>{t.runs.attemptRound}</dt><dd>{String(data["attempt"] ?? 1)} / {String(data["round"] ?? 1)}</dd></> : null}
            <dt>{t.runs.session}</dt><dd data-testid="run-session">{data["nativeSessionId"] ? String(data["nativeSessionId"]) : "—"}</dd>
            {data["exitCode"] !== null && data["exitCode"] !== undefined ? <><dt>{t.runs.exitCode}</dt><dd>{String(data["exitCode"])}</dd></> : null}
          </dl>
          {questions.length > 0 ? (
            <div data-testid="run-questions">
              <h3>{t.runs.questions}</h3>
              {questions.map((q) => (
                <div key={q.id} className="hu-form">
                  <p>{q.text}</p>
                  {q.answer !== null ? <p className="hu-meta">{t.runs.answered}：{q.answer}</p> : state === "waiting_input" ? (
                    <>
                      {q.options.length > 0 ? <div className="hu-row" role="group" aria-label={q.text}>{q.options.map((o) => <Button key={o} aria-pressed={answers[q.id] === o} onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</Button>)}</div> : null}
                      <input className="hu-input" aria-label={t.runs.answerFor(q.id)} placeholder={t.runs.answerPlaceholder} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                    </>
                  ) : null}
                </div>
              ))}
              {state === "waiting_input" && open.length > 0 ? (
                <Button variant="primary" disabled={busy || open.every((q) => !(answers[q.id] ?? "").trim())} onClick={() => { setBusy(true); void act("automations.runs.answer", { runId: d.id, answers: open.filter((q) => (answers[q.id] ?? "").trim()).map((q) => ({ id: q.id, answer: (answers[q.id] ?? "").trim() })) }).then((ok) => { if (ok) setAnswers({}); }).finally(() => setBusy(false)); }}>{t.runs.submitAnswers}</Button>
              ) : null}
            </div>
          ) : null}
          <h3>{t.runs.result}</h3>
          <pre className="hu-pre" data-testid="run-body">{d.body.trim() || "—"}</pre>
          <div className="hu-row">
            {d.live || state === "waiting_input" ? <Button variant="danger" disabled={busy} onClick={() => { setBusy(true); void act("automations.runs.cancel", { runId: d.id }).finally(() => setBusy(false)); }}>{t.runs.cancel}</Button> : null}
            {d.canRetry ? (confirmRetry ? (
              <>
                <span>{state === "unknown" ? t.runs.retryUnknownConfirm : t.runs.retryConfirm}</span>
                <Button variant="primary" disabled={busy} onClick={() => { setBusy(true); void act("automations.runs.retry", { runId: d.id }).then(() => setConfirmRetry(false)).finally(() => setBusy(false)); }}>{t.runs.retryDo}</Button>
                <Button onClick={() => setConfirmRetry(false)}>{t.runs.retryAbort}</Button>
              </>
            ) : <Button onClick={() => setConfirmRetry(true)}>{t.runs.retry}</Button>) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
