import { Button, applyAppearance } from "@huhu/ui";
import type { Settings } from "@huhu/contracts";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { useState } from "react";
import { t } from "../i18n/zh-CN.js";

/** 设置 → 外观：保存后立即应用到 <html>（data-theme / data-mode / 字号）。 */
export function SettingsModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const settings = useCapability<Settings>("settings.get", {});
  const [error, setError] = useState<string | null>(null);
  if (!settings.data) return <p>{t.loading}</p>;
  const a = settings.data.appearance;

  async function update(patch: Record<string, unknown>) {
    setError(null);
    try {
      const next = await engine.call<Settings>("settings.update", { patch }, { write: true });
      applyAppearance(document.documentElement, next.appearance, window.matchMedia("(prefers-color-scheme: dark)").matches);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "settings.get" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="hu-content" data-testid="settings-module">
      <h1>{t.settings.title}</h1>
      <h2>{t.settings.appearance}</h2>
      <label>{t.settings.theme}
        <select aria-label={t.settings.theme} value={a.theme} onChange={(e) => void update({ appearance: { theme: e.target.value } })}>
          <option value="pearl">Pearl</option><option value="suliworld">SuliWorld</option><option value="soft">Soft</option>
        </select>
      </label>
      <label>{t.settings.mode}
        <select aria-label={t.settings.mode} value={a.mode} onChange={(e) => void update({ appearance: { mode: e.target.value } })}>
          <option value="system">{t.settings.modeSystem}</option><option value="light">{t.settings.modeLight}</option><option value="dark">{t.settings.modeDark}</option>
        </select>
      </label>
      <label>{t.settings.fontSize}
        <input className="hu-input" type="number" min={12} max={18} aria-label={t.settings.fontSize} value={a.fontSize} onChange={(e) => { const n = Number(e.target.value); if (n >= 12 && n <= 18) void update({ appearance: { fontSize: n } }); }} />
      </label>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      <Button variant="ghost" onClick={() => void update({ appearance: { theme: "pearl", mode: "system", fontSize: 14 } })}>{t.settings.reset}</Button>
    </div>
  );
}
