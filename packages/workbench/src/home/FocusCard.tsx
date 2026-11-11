import { Button } from "@huhu/ui";
import { useEffect, useRef, useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface FocusView { remainingSec: number; running: boolean; endsAt: string | null; completedToday: number }

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** 专注计时：状态在引擎里（startedAt + 剩余秒数），界面只负责每秒显示；到零时让引擎结算（记一次完成并发通知）。 */
export function FocusCard() {
  const engine = useEngine();
  const qc = useQueryClient();
  const focus = useCapability<FocusView>("home.focus.get", {});
  const [now, setNow] = useState(() => Date.now());
  const settling = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const v = focus.data;

  async function act(action: "start" | "pause" | "reset" | "sync") {
    setError(null);
    try {
      await engine.call("home.focus.update", { action }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!v?.running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [v?.running]);

  const remaining = v ? (v.running && v.endsAt ? Math.max(0, Math.ceil((Date.parse(v.endsAt) - now) / 1000)) : v.remainingSec) : 0;
  useEffect(() => {
    if (v?.running && remaining === 0 && !settling.current) {
      settling.current = true;
      void act("sync").finally(() => { settling.current = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.running, remaining]);

  if (!v) return <div className="hu-card" data-testid="card-focus"><span>{tHome.focus.title}</span></div>;
  return (
    <section className="hu-card" data-testid="card-focus" aria-label={tHome.focus.title}>
      <span>{tHome.focus.title}</span>
      <strong data-testid="focus-time" role="timer" aria-live="off">{fmt(remaining)}</strong>
      <div className="hu-row">
        {v.running
          ? <Button onClick={() => void act("pause")} data-testid="focus-pause">{tHome.focus.pause}</Button>
          : <Button variant="primary" onClick={() => void act("start")} data-testid="focus-start">{tHome.focus.start}</Button>}
        <Button onClick={() => void act("reset")} data-testid="focus-reset">{tHome.focus.reset}</Button>
      </div>
      <span className="hu-meta" data-testid="focus-completed">{tHome.focus.completedToday(v.completedToday)}</span>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
    </section>
  );
}
