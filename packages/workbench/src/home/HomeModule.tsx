import { EmptyState } from "@huhu/ui";
import { useCapability } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface Summary { vault: { id: string; name: string }; tasksToday: number; tasksOpen: number; inboxPending: number; notes: number; recentNotes: { path: string; title: string }[] }

/** 首页：当前 Vault 的概览卡片。对应插件停用时，该卡片显示 0 而不是报错。 */
export function HomeModule() {
  const s = useCapability<Summary>("home.summary", {});
  if (!s.data) return <p>…</p>;
  const d = s.data;
  const cards: [string, number, string][] = [[tHome.tasksToday, d.tasksToday, "today"], [tHome.tasksOpen, d.tasksOpen, "open"], [tHome.inboxPending, d.inboxPending, "inbox"], [tHome.notes, d.notes, "notes"]];
  return (
    <div className="hu-content" data-testid="home-module">
      <h1>{d.vault.name}</h1>
      <div className="hu-cards">
        {cards.map(([label, n, key]) => (
          <div key={key} className="hu-card" data-testid={`card-${key}`}><span>{label}</span><strong>{n}</strong></div>
        ))}
      </div>
      <h2>{tHome.recent}</h2>
      {d.recentNotes.length === 0 ? <EmptyState title={tHome.noRecent} /> : <ul>{d.recentNotes.map((n) => <li key={n.path}>{n.title}</li>)}</ul>}
    </div>
  );
}
