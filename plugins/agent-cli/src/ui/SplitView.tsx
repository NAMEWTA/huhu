import { Button, EmptyState, TerminalView } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { t } from "./i18n.js";
import type { Layout, SplitSession } from "./split-layout.js";

/** 分屏：最多 4 个终端同时显示（左右两格 / 2×2）；同一个会话不会出现在两格里。 */
export function SplitView({
  layout,
  cells,
  sessions,
  onChange,
  onAct,
}: {
  layout: Exclude<Layout, 1>;
  cells: (string | null)[];
  sessions: SplitSession[];
  onChange(index: number, value: string): void;
  onAct(cap: string, id: string): void;
}) {
  const engine = useEngine();
  const running = sessions.filter((s) => s.state === "running");
  const rows = layout === 4 ? 2 : 1;
  return (
    <div
      className="hu-split"
      data-testid="split-view"
      data-layout={layout}
      style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gap: "0.5rem", height: layout === 4 ? "70vh" : "55vh" }}
    >
      {Array.from({ length: layout }, (_, i) => {
        const id = cells[i] ?? null;
        const taken = new Set(cells.filter((c, j): c is string => c !== null && j !== i));
        const sess = id ? running.find((s) => s.id === id) : undefined;
        return (
          <section
            key={i}
            data-testid="split-cell"
            aria-label={t.split.cell(i + 1)}
            style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, border: "1px solid var(--line, #ddd)", borderRadius: 6, padding: "0.25rem" }}
          >
            <div className="hu-row">
              <select aria-label={t.split.pick(i + 1)} data-testid="split-pick" value={id ?? ""} onChange={(e) => onChange(i, e.target.value)}>
                <option value="">{t.split.empty}</option>
                {running
                  .filter((s) => !taken.has(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                {id && !sess ? <option value={id}>{t.split.ended}</option> : null}
              </select>
              {sess ? (
                <>
                  <Button aria-label={`${t.interrupt} ${sess.name}`} onClick={() => onAct("agent.sessions.interrupt", sess.id)}>
                    {t.interrupt}
                  </Button>
                  <Button variant="danger" aria-label={`${t.kill} ${sess.name}`} onClick={() => onAct("agent.sessions.kill", sess.id)}>
                    {t.kill}
                  </Button>
                </>
              ) : null}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {sess ? (
                <TerminalView key={sess.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={sess.id} ariaLabel={`${t.terminalLabel} ${sess.name}`} />
              ) : (
                <EmptyState title={id ? t.split.ended : t.split.emptyHint} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
