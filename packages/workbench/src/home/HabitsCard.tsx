import { Button } from "@huhu/ui";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface HabitsView {
  habits: { id: string; title: string; done: boolean }[];
}

/** 习惯：当日勾选；跨日（按设置的时区）自动清空勾选，习惯本身保留。 */
export function HabitsCard() {
  const engine = useEngine();
  const qc = useQueryClient();
  const habits = useCapability<HabitsView>("home.habits.get", {});
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(input: Record<string, unknown>): Promise<boolean> {
    setError(null);
    try {
      await engine.call("home.habits.update", input, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  const list = habits.data?.habits ?? [];
  return (
    <section className="hu-card" data-testid="card-habits" aria-label={tHome.habits.title}>
      <span>{tHome.habits.title}</span>
      {list.length === 0 ? <span className="hu-meta">{tHome.habits.empty}</span> : null}
      {list.map((h) => (
        <div key={h.id} className="hu-row" data-testid="habit-row">
          <label>
            <input type="checkbox" checked={h.done} aria-label={h.title} onChange={() => void act({ action: "toggle", id: h.id })} /> {h.title}
          </label>
          <Button variant="ghost" aria-label={tHome.habits.remove(h.title)} onClick={() => void act({ action: "remove", id: h.id })}>
            ×
          </Button>
        </div>
      ))}
      <form
        className="hu-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim())
            void act({ action: "add", title }).then((ok) => {
              if (ok) setTitle("");
            });
        }}
      >
        <input className="hu-input" aria-label={tHome.habits.newLabel} placeholder={tHome.habits.newLabel} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" disabled={!title.trim()}>
          {tHome.habits.add}
        </Button>
      </form>
      {error ? (
        <div role="alert" className="hu-overdue">
          {error}
        </div>
      ) : null}
    </section>
  );
}
