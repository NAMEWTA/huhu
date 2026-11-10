import { Badge, Button } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { useState } from "react";
import { t } from "../i18n/zh-CN.js";

interface PluginInfo { id: string; title: string; description: string; version: string; origin: string; state: "active" | "disabled" | "failed"; error?: string; dependsOn: string[] }

/** 插件中心：启用/停用内置插件；停用前列出将被一并停用的插件并要求确认。 */
export function PluginCenterModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const list = useCapability<PluginInfo[]>("plugins.list", {});
  const [confirm, setConfirm] = useState<{ id: string; alsoDisabled: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plugins = list.data ?? [];
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("plugins.") });

  async function setEnabled(id: string, enabled: boolean) {
    setError(null);
    try {
      await engine.call("plugins.setEnabled", { id, enabled }, { write: true });
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  /** 依赖它的、当前启用的插件（传递闭包）。 */
  const dependents = (id: string): string[] => {
    const out = new Set<string>();
    const walk = (x: string) => { for (const p of plugins) if (p.state === "active" && p.dependsOn.includes(x) && !out.has(p.id)) { out.add(p.id); walk(p.id); } };
    walk(id);
    return [...out];
  };

  return (
    <div className="hu-content" data-testid="plugin-center">
      <h1>{t.plugins.title}</h1>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      {confirm ? (
        <div role="alertdialog" aria-label={t.plugins.confirmTitle} data-testid="plugin-confirm">
          <p>{t.plugins.confirmBody(confirm.alsoDisabled)}</p>
          <Button variant="danger" onClick={() => void setEnabled(confirm.id, false)}>{t.plugins.disable}</Button>
          <Button onClick={() => setConfirm(null)}>{t.plugins.cancel}</Button>
        </div>
      ) : null}
      {plugins.map((p) => (
        <div key={p.id} className="hu-row" data-testid="plugin-row" data-plugin={p.id}>
          <strong>{p.title}</strong>
          <span>{p.id} · {p.version}</span>
          <Badge tone={p.state === "active" ? "success" : p.state === "failed" ? "danger" : "neutral"}>{t.plugins.states[p.state]}</Badge>
          {p.error ? <span className="hu-overdue">{p.error}</span> : null}
          {p.state === "active" ? (
            <Button aria-label={`${t.plugins.disable} ${p.title}`} onClick={() => { const d = dependents(p.id); if (d.length) setConfirm({ id: p.id, alsoDisabled: d }); else void setEnabled(p.id, false); }}>{t.plugins.disable}</Button>
          ) : (
            <Button aria-label={`${t.plugins.enable} ${p.title}`} variant="primary" onClick={() => void setEnabled(p.id, true)}>{t.plugins.enable}</Button>
          )}
        </div>
      ))}
    </div>
  );
}
