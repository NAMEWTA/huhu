import { Button } from "@huhu/ui";
import { Check } from "lucide-react";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface HabitsView {
  habits: { id: string; title: string; done: boolean }[];
}

/** 习惯（在专注卡片下方）：当日勾选；跨日（按设置的时区）自动清空勾选，习惯本身保留。 */
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
    <div data-testid="card-habits" aria-label={tHome.habits.title}>
      <div className="shell-habit-divider" />
      <div className="shell-habit-title">
        {tHome.focusCard.habits}{" "}
        <span>
          {list.filter((h) => h.done).length} / {list.length}
        </span>
      </div>
      {list.length === 0 ? <div className="hu-mini-empty">{tHome.habits.empty}</div> : null}
      {list.map((h) => (
        <div key={h.id} className="row" data-testid="habit-row">
          <button type="button" role="checkbox" aria-checked={h.done} aria-label={h.title} className={`shell-habit-row ${h.done ? "done" : ""}`} onClick={() => void act({ action: "toggle", id: h.id })}>
            <span>{h.done ? <Check size={12} aria-hidden /> : null}</span>
            {h.title}
          </button>
          <Button variant="ghost" aria-label={tHome.habits.remove(h.title)} onClick={() => void act({ action: "remove", id: h.id })}>
            ×
          </Button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim())
            void act({ action: "add", title }).then((ok) => {
              if (ok) setTitle("");
            });
        }}
      >
        <input aria-label={tHome.habits.newLabel} placeholder={tHome.habits.newLabel} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" disabled={!title.trim()}>
          {tHome.habits.add}
        </Button>
      </form>
      {error ? (
        <div role="alert" className="hu-field-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
