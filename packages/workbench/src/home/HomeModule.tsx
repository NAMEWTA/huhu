import { Button, EmptyState } from "@huhu/ui";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";
import { FocusCard } from "./FocusCard.js";
import { HabitsCard } from "./HabitsCard.js";

interface Summary {
  vault: { id: string; name: string };
  tasksToday: number;
  tasksOpen: number;
  inboxPending: number;
  notes: number;
  recentNotes: { path: string; title: string }[];
  enabled: { tasks: boolean; inbox: boolean; notes: boolean };
}
type Card = "focus" | "habits" | "tasks" | "inbox" | "recent";
const CARDS: Card[] = ["focus", "habits", "tasks", "inbox", "recent"];

/** 首页：概览卡片 + 专注 + 习惯；卡片可在“自定义”里显示/隐藏；对应插件停用时其卡片隐藏（数据不删）。 */
export function HomeModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const s = useCapability<Summary>("home.summary", {});
  const widgets = useCapability<{ hidden: Card[] }>("home.widgets.get", {});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!s.data) return <p>…</p>;
  const d = s.data;
  const hidden = new Set(widgets.data?.hidden ?? []);
  const show = (c: Card) => !hidden.has(c);

  async function toggle(c: Card) {
    setError(null);
    try {
      const next = hidden.has(c) ? [...hidden].filter((x) => x !== c) : [...hidden, c];
      await engine.call("home.widgets.update", { hidden: next }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const tasks: [string, number, string][] = [
    [tHome.tasksToday, d.tasksToday, "today"],
    [tHome.tasksOpen, d.tasksOpen, "open"],
  ];
  return (
    <div className="hu-content" data-testid="home-module">
      <h1>
        {d.vault.name}{" "}
        <Button variant="ghost" aria-expanded={editing} data-testid="home-customize" onClick={() => setEditing(!editing)}>
          {tHome.customize.open}
        </Button>
      </h1>
      {error ? (
        <div role="alert" className="hu-overdue">
          {error}
        </div>
      ) : null}
      {editing ? (
        <fieldset data-testid="home-customize-panel">
          <legend>{tHome.customize.title}</legend>
          {CARDS.map((c) => (
            <label key={c}>
              <input type="checkbox" checked={show(c)} aria-label={tHome.customize.cards[c]} onChange={() => void toggle(c)} /> {tHome.customize.cards[c]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="hu-cards">
        {show("tasks") && d.enabled.tasks
          ? tasks.map(([label, n, key]) => (
              <div key={key} className="hu-card" data-testid={`card-${key}`}>
                <span>{label}</span>
                <strong>{n}</strong>
              </div>
            ))
          : null}
        {show("inbox") && d.enabled.inbox ? (
          <div className="hu-card" data-testid="card-inbox">
            <span>{tHome.inboxPending}</span>
            <strong>{d.inboxPending}</strong>
          </div>
        ) : null}
        {d.enabled.notes ? (
          <div className="hu-card" data-testid="card-notes">
            <span>{tHome.notes}</span>
            <strong>{d.notes}</strong>
          </div>
        ) : null}
        {show("focus") ? <FocusCard /> : null}
        {show("habits") ? <HabitsCard /> : null}
      </div>
      {show("recent") && d.enabled.notes ? (
        <>
          <h2>{tHome.recent}</h2>
          {d.recentNotes.length === 0 ? (
            <EmptyState title={tHome.noRecent} />
          ) : (
            <ul>
              {d.recentNotes.map((n) => (
                <li key={n.path}>{n.title}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
