import { Button, applyAppearance } from "@huhu/ui";
import type { Settings } from "@huhu/contracts";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { useEffect, useState } from "react";
import { t } from "../i18n/zh-CN.js";
import { AboutPage } from "./AboutPage.js";
import { ShortcutsPage } from "./ShortcutsPage.js";
import { StoragePage } from "./StoragePage.js";
import { VaultPage } from "./VaultPage.js";

type Page = "appearance" | "vault" | "editor" | "datetime" | "shortcuts" | "storage" | "about";
const PAGES: Page[] = ["appearance", "vault", "editor", "datetime", "shortcuts", "storage", "about"];
const PAGE_LABEL: Record<Page, string> = { appearance: t.settings.appearance, vault: t.settings.vault.title, editor: t.settings.editor, datetime: t.settings.dateTime, shortcuts: t.settings.shortcuts.title, storage: t.settings.storage.title, about: t.settings.about.title };

/** 设置：外观 / 编辑器 / 日期与时间。保存后立即生效（外观写到 <html>，编辑器与时区由消费方读取 settings.get）。 */
export function SettingsModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const settings = useCapability<Settings>("settings.get", {});
  const [page, setPage] = useState<Page>("appearance");
  const [error, setError] = useState<string | null>(null);
  if (settings.isError) return <div role="alert" className="hu-overdue">{settings.error instanceof Error ? settings.error.message : String(settings.error)}</div>;
  if (!settings.data) return <p>{t.loading}</p>;
  const s = settings.data;

  async function update(patch: Record<string, unknown>) {
    setError(null);
    try {
      const next = await engine.call<Settings>("settings.update", { patch }, { write: true });
      applyAppearance(document.documentElement, next.appearance, window.matchMedia("(prefers-color-scheme: dark)").matches);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="hu-module" data-testid="settings-module">
      <aside className="hu-module-sidebar" aria-label={t.settings.title}>
        <h2>{t.settings.title}</h2>
        {PAGES.map((p) => <button key={p} type="button" className="hu-nav-item" aria-current={page === p} data-testid={`settings-nav-${p}`} onClick={() => setPage(p)}><span>{PAGE_LABEL[p]}</span></button>)}
      </aside>
      <section className="hu-content">
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        {page === "appearance" ? <Appearance s={s} update={update} /> : page === "vault" ? <VaultPage /> : page === "editor" ? <Editor s={s} update={update} /> : page === "datetime" ? <DateTime s={s} update={update} /> : page === "shortcuts" ? <ShortcutsPage /> : page === "storage" ? <StoragePage /> : <AboutPage />}
      </section>
    </div>
  );
}

/** 数字输入：键入过程中允许暂时越界（先输入 2 再输入 0），范围内立即提交，失焦时回到当前有效值。 */
function NumberField({ label, value, min, max, step, integer, onCommit }: { label: string; value: number; min: number; max: number; step?: number; integer?: boolean; onCommit(n: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const ok = draft.trim() !== "" && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
  return (
    <label>{label}
      <input className="hu-input" type="number" min={min} max={max} step={step} aria-label={label} aria-invalid={!ok} value={draft}
        onChange={(e) => { setDraft(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v))) onCommit(v); }}
        onBlur={() => setDraft(String(value))} />
    </label>
  );
}

interface PageProps { s: Settings; update(patch: Record<string, unknown>): Promise<void> }

function Appearance({ s, update }: PageProps) {
  const a = s.appearance;
  return (
    <div data-testid="settings-appearance">
      <h1>{t.settings.appearance}</h1>
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
      <NumberField label={t.settings.fontSize} value={a.fontSize} min={12} max={18} integer onCommit={(n) => void update({ appearance: { fontSize: n } })} />
      <label>{t.settings.motion}
        <select aria-label={t.settings.motion} value={a.motion} onChange={(e) => void update({ appearance: { motion: e.target.value } })}>
          <option value="system">{t.settings.motionSystem}</option><option value="standard">{t.settings.motionStandard}</option><option value="reduced">{t.settings.motionReduced}</option>
        </select>
      </label>
      <NumberField label={t.settings.navWidth} value={a.navWidth} min={200} max={360} step={10} integer onCommit={(n) => void update({ appearance: { navWidth: n } })} />
      <label><input type="checkbox" aria-label={t.settings.compact} checked={a.compact} onChange={(e) => void update({ appearance: { compact: e.target.checked } })} /> {t.settings.compact}</label>
      <Button variant="ghost" onClick={() => void update({ appearance: { theme: "pearl", mode: "system", fontSize: 14, motion: "system", navWidth: 260, compact: false } })}>{t.settings.reset}</Button>
    </div>
  );
}

function Editor({ s, update }: PageProps) {
  const e = s.editor;
  const set = (patch: Record<string, unknown>) => void update({ editor: patch });
  return (
    <div data-testid="settings-editor">
      <h1>{t.settings.editor}</h1>
      <NumberField label={t.settings.editorFontSize} value={e.fontSize} min={14} max={20} integer onCommit={(n) => set({ fontSize: n })} />
      <NumberField label={t.settings.editorLineHeight} value={e.lineHeight} min={1.4} max={2} step={0.1} onCommit={(n) => set({ lineHeight: Math.round(n * 100) / 100 })} />
      <label>{t.settings.editorWidth}
        <select aria-label={t.settings.editorWidth} value={e.readableWidth} onChange={(ev) => set({ readableWidth: ev.target.value })}>
          <option value="680">680</option><option value="760">760</option><option value="880">880</option><option value="full">{t.settings.widthFull}</option>
        </select>
      </label>
      <label><input type="checkbox" aria-label={t.settings.autosave} checked={e.autosave} onChange={(ev) => set({ autosave: ev.target.checked })} /> {t.settings.autosave}</label>
      <p className="hu-meta">{t.settings.autosaveNote}</p>
      <label><input type="checkbox" aria-label={t.settings.lineNumbers} checked={e.lineNumbers} onChange={(ev) => set({ lineNumbers: ev.target.checked })} /> {t.settings.lineNumbers}</label>
      <label><input type="checkbox" aria-label={t.settings.spellcheck} checked={e.spellcheck} onChange={(ev) => set({ spellcheck: ev.target.checked })} /> {t.settings.spellcheck}</label>
      <Button variant="ghost" onClick={() => set({ fontSize: 16, lineHeight: 1.8, readableWidth: "760", autosave: true, lineNumbers: false, spellcheck: false })}>{t.settings.resetEditor}</Button>
    </div>
  );
}

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

function DateTime({ s, update }: PageProps) {
  const list = zones();
  const [draft, setDraft] = useState(s.dateTime.zone);
  // 与引擎一致：Intl 接受就有效（包含 US/Pacific 这类别名）；列表只用于输入提示
  const valid = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z.trim() !== ""; } catch { return false; } };
  const today = (z: string) => { try { return new Intl.DateTimeFormat("zh-CN", { timeZone: z, dateStyle: "full", timeStyle: "medium" }).format(new Date()); } catch { return ""; } };
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div data-testid="settings-datetime">
      <h1>{t.settings.dateTime}</h1>
      <label>{t.settings.zone}
        <input className="hu-input" list="hu-zones" aria-label={t.settings.zone} data-testid="settings-zone" value={draft} aria-invalid={!valid(draft)}
          onChange={(e) => { setDraft(e.target.value); if (valid(e.target.value) && e.target.value) void update({ dateTime: { zone: e.target.value } }); }} />
        <datalist id="hu-zones">{list.map((z) => <option key={z} value={z} />)}</datalist>
      </label>
      {!valid(draft) ? <div role="alert" className="hu-overdue" data-testid="settings-zone-invalid">{t.settings.zoneInvalid}</div> : null}
      <p className="hu-meta">{t.settings.zoneNote}</p>
      <p data-testid="settings-zone-now">{t.settings.todayIn(today(s.dateTime.zone))}</p>
      <Button variant="ghost" onClick={() => { setDraft(systemZone); void update({ dateTime: { zone: systemZone } }); }}>{t.settings.resetZone}</Button>
    </div>
  );
}
