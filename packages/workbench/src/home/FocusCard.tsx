import { Badge, Button, IconButton } from "@huhu/ui";
import { Flame, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface FocusView {
  remainingSec: number;
  running: boolean;
  endsAt: string | null;
  completedToday: number;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** 专注计时：状态在引擎里（startedAt + 剩余秒数），界面只负责每秒显示；到零时让引擎结算（记一次完成并发通知）。 */
export function FocusCard({ children }: { children?: ReactNode }) {
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
      void act("sync").finally(() => {
        settling.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.running, remaining]);

  if (!v)
    return (
      <section className="card focus-card" data-testid="card-focus">
        <div className="card-head">
          <h2>
            <Flame size={17} aria-hidden /> {tHome.focusCard.title}
          </h2>
        </div>
      </section>
    );
  return (
    <section className="card focus-card" data-testid="card-focus" aria-label={tHome.focusCard.title}>
      <div className="card-head">
        <h2>
          <Flame size={17} aria-hidden /> {tHome.focusCard.title}
        </h2>
        <Badge tone="success">
          <span data-testid="focus-completed">{tHome.focus.completedToday(v.completedToday)}</span>
        </Badge>
      </div>
      <div className="timer-display" data-testid="focus-time" role="timer" aria-live="off">
        {fmt(remaining).slice(0, 2)}
        <span>:</span>
        {fmt(remaining).slice(3)}
      </div>
      <p>{v.running ? tHome.focusCard.runningHint : tHome.focusCard.idleHint}</p>
      <div className="timer-buttons">
        {v.running ? (
          <Button variant="primary" icon={Pause} onClick={() => void act("pause")} data-testid="focus-pause">
            {tHome.focusCard.pause}
          </Button>
        ) : (
          <Button variant="primary" icon={Play} onClick={() => void act("start")} data-testid="focus-start">
            {tHome.focusCard.start}
          </Button>
        )}
        <IconButton icon={RotateCcw} label={tHome.focusCard.reset} onClick={() => void act("reset")} data-testid="focus-reset" />
      </div>
      {error ? (
        <div role="alert" className="field-error">
          {error}
        </div>
      ) : null}
      {children}
    </section>
  );
}
