import { Badge, Button, ChoiceSwitch, PageHead, Segmented, applyAppearance } from "@huhu/ui";
import type { Settings } from "@huhu/contracts";
import { Check, Moon, NotebookPen, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModuleProps } from "../contributions.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { AboutPage } from "./AboutPage.js";
import { AgentAccessPage } from "./AgentAccessPage.js";
import { ShortcutsPage } from "./ShortcutsPage.js";
import { StoragePage } from "./StoragePage.js";
import { VaultPage } from "./VaultPage.js";

const TITLE: Record<string, string> = { appearance: "外观与布局", vault: "当前 Vault", "agent-access": "Agent 接入", editor: "编辑器", "date-time": "日期与时间", shortcuts: "快捷键", data: "数据与存储", about: "关于工作台" };

/** 设置（原型 Preferences）：分区由外壳左侧导航选择；修改立即生效，随当前 Vault 独立保存。 */
export function SettingsModule({ section }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const settings = useCapability<Settings>("settings.get", {});
  const [error, setError] = useState<string | null>(null);
  if (settings.isError)
    return (
      <div role="alert" className="field-error">
        {settings.error instanceof Error ? settings.error.message : String(settings.error)}
      </div>
    );
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
    <div className="module-layout" data-testid="settings-module">
      <div className="view-content">
        <PageHead title={TITLE[section] ?? "设置"} description="修改立即生效，随当前 Vault 独立保存。" />
        <div className="system-scroll scroll settings-content">
          {error ? (
            <div role="alert" className="field-error">
              {error}
            </div>
          ) : null}
          {section === "appearance" ? (
            <Appearance s={s} update={update} />
          ) : section === "vault" ? (
            <VaultPage />
          ) : section === "editor" ? (
            <Editor s={s} update={update} />
          ) : section === "date-time" ? (
            <DateTime s={s} update={update} />
          ) : section === "shortcuts" ? (
            <ShortcutsPage />
          ) : section === "data" ? (
            <StoragePage />
          ) : section === "agent-access" ? (
            <AgentAccessPage />
          ) : (
            <AboutPage />
          )}
        </div>
      </div>
    </div>
  );
}

interface PageProps {
  s: Settings;
  update(patch: Record<string, unknown>): Promise<void>;
}

const THEMES = [
  { id: "pearl", label: "Pearl", sub: "清晰 · 中性", colors: ["#fafafa", "#fff", "#171717"] },
  { id: "suliworld", label: "SuliWorld", sub: "温暖 · 自然", colors: ["#fbf7f0", "#f4eee3", "#1f3b2d"] },
  { id: "soft", label: "Soft", sub: "柔和 · 蓝灰", colors: ["#eff2f6", "#fff", "#2e5fa6"] },
] as const;

/** 滑块 + 数值徽标（原型 range + Badge）：拖动结束或键盘调整时提交。 */
function RangeField({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit(n: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="row">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={draft}
        onChange={(e) => {
          setDraft(Number(e.target.value));
          onCommit(Number(e.target.value));
        }}
      />
      <Badge>{draft}px</Badge>
    </div>
  );
}

function Appearance({ s, update }: PageProps) {
  const a = s.appearance;
  const set = (patch: Record<string, unknown>) => void update({ appearance: patch });
  return (
    <div data-testid="settings-appearance">
      <section className="settings-section card">
        <h2>主题与色彩</h2>
        <p>统一列表、编辑器、日历和弹层的色彩与边界。</p>
        <div className="theme-options" role="group" aria-label={t.settings.theme}>
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`theme-option ${a.theme === th.id ? "selected" : ""}`}
              aria-pressed={a.theme === th.id}
              aria-label={`${t.settings.theme} ${th.label}`}
              data-testid={`theme-${th.id}`}
              onClick={() => set({ theme: th.id })}
            >
              <div className="theme-preview" style={{ background: th.colors[0] }}>
                <i style={{ background: th.colors[1] }} />
                <span style={{ background: th.colors[2] }} />
                <b style={{ background: th.colors[1] }} />
              </div>
              <strong>
                {th.label}
                {a.theme === th.id ? <Check size={14} aria-hidden /> : null}
              </strong>
              <small>{th.sub}</small>
            </button>
          ))}
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.mode}</strong>
            <p>日期弹层、表格与编辑区域同步切换。</p>
          </div>
          <Segmented
            label={t.settings.mode}
            value={a.mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: "system", label: t.settings.modeSystem },
              { value: "light", label: t.settings.modeLight, icon: Sun },
              { value: "dark", label: t.settings.modeDark, icon: Moon },
            ]}
          />
        </div>
      </section>
      <section className="settings-section card">
        <h2>字体与密度</h2>
        <div className="setting-row">
          <div>
            <strong>{t.settings.fontSize}</strong>
            <p>Geist 已内嵌，中文使用系统字体回退。</p>
          </div>
          <RangeField label={t.settings.fontSize} value={a.fontSize} min={12} max={18} onCommit={(n) => set({ fontSize: n })} />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.compact}</strong>
            <p>减少列表行的纵向留白。</p>
          </div>
          <ChoiceSwitch checked={a.compact} onChange={(v) => set({ compact: v })} label={t.settings.compact} />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.motion}</strong>
            <p>跟随系统或减少动态效果。系统要求减少时，标准模式也会遵循。</p>
          </div>
          <Segmented
            label={t.settings.motion}
            value={a.motion}
            onChange={(v) => set({ motion: v })}
            options={[
              { value: "system", label: t.settings.motionSystem },
              { value: "standard", label: t.settings.motionStandard },
              { value: "reduced", label: t.settings.motionReduced },
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.navWidth}</strong>
            <p>仅影响此类分类导航，不增加重复栏位。</p>
          </div>
          <RangeField label={t.settings.navWidth} value={a.navWidth} min={176} max={300} step={4} onCommit={(n) => set({ navWidth: n })} />
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => set({ theme: "pearl", mode: "system", fontSize: 14, motion: "system", navWidth: 260, compact: false })}>
            {t.settings.reset}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Editor({ s, update }: PageProps) {
  const e = s.editor;
  const set = (patch: Record<string, unknown>) => void update({ editor: patch });
  return (
    <div data-testid="settings-editor">
      <section className="settings-section card">
        <h2>阅读与编辑</h2>
        <div className="setting-row">
          <div>
            <strong>{t.settings.editorFontSize}</strong>
            <p>同步到 Markdown 编辑与阅读区域。</p>
          </div>
          <RangeField label={t.settings.editorFontSize} value={e.fontSize} min={14} max={20} onCommit={(n) => set({ fontSize: n })} />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.editorLineHeight}</strong>
            <p>调整阅读节奏。</p>
          </div>
          <select aria-label={t.settings.editorLineHeight} value={String(e.lineHeight)} onChange={(ev) => set({ lineHeight: Number(ev.target.value) })}>
            {[1.5, 1.65, 1.8, 2].map((v) => (
              <option key={v} value={String(v)}>
                {v.toFixed(v === 1.65 ? 2 : 1)}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.editorWidth}</strong>
            <p>阅读区域的最大宽度。</p>
          </div>
          <select aria-label={t.settings.editorWidth} value={e.readableWidth} onChange={(ev) => set({ readableWidth: ev.target.value })}>
            <option value="680">680</option>
            <option value="760">760</option>
            <option value="880">880</option>
            <option value="full">{t.settings.widthFull}</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.autosave}</strong>
            <p>{t.settings.autosaveNote}</p>
          </div>
          <ChoiceSwitch checked={e.autosave} onChange={(v) => set({ autosave: v })} label={t.settings.autosave} />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.lineNumbers}</strong>
            <p>只影响 Markdown 源码视图。</p>
          </div>
          <ChoiceSwitch checked={e.lineNumbers} onChange={(v) => set({ lineNumbers: v })} label={t.settings.lineNumbers} />
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.settings.spellcheck}</strong>
            <p>使用浏览器当前语言的拼写检查。</p>
          </div>
          <ChoiceSwitch checked={e.spellcheck} onChange={(v) => set({ spellcheck: v })} label={t.settings.spellcheck} />
        </div>
        <div className="row">
          <Button icon={NotebookPen} variant="ghost" onClick={() => set({ fontSize: 16, lineHeight: 1.8, readableWidth: "760", autosave: true, lineNumbers: true, spellcheck: false })}>
            {t.settings.resetEditor}
          </Button>
        </div>
      </section>
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
  const valid = (z: string) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: z });
      return z.trim() !== "";
    } catch {
      return false;
    }
  };
  const today = (z: string) => {
    try {
      return new Intl.DateTimeFormat("zh-CN", { timeZone: z, dateStyle: "full", timeStyle: "medium" }).format(new Date());
    } catch {
      return "";
    }
  };
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div data-testid="settings-datetime">
      <section className="settings-section card">
        <h2>统一日期与时间</h2>
        <p>绝对时间按所选时区显示；只含日期的值不会跨日转换。</p>
        <div className="setting-row">
          <div>
            <strong>{t.settings.zone}</strong>
            <p>{t.settings.zoneNote}</p>
          </div>
          <input
            list="hu-zones"
            aria-label={t.settings.zone}
            data-testid="settings-zone"
            value={draft}
            aria-invalid={!valid(draft)}
            onChange={(e) => {
              setDraft(e.target.value);
              if (valid(e.target.value) && e.target.value) void update({ dateTime: { zone: e.target.value } });
            }}
          />
          <datalist id="hu-zones">
            {list.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
        {!valid(draft) ? (
          <div role="alert" className="field-error" data-testid="settings-zone-invalid">
            {t.settings.zoneInvalid}
          </div>
        ) : null}
        <div className="date-format-samples">
          <div>
            <span>此刻</span>
            <code data-testid="settings-zone-now">{t.settings.todayIn(today(s.dateTime.zone))}</code>
          </div>
        </div>
        <div className="row">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(systemZone);
              void update({ dateTime: { zone: systemZone } });
            }}
          >
            {t.settings.resetZone}
          </Button>
        </div>
      </section>
      <section className="settings-section card">
        <h2>统一交互规范</h2>
        <div className="date-help-grid">
          <div>
            <strong>日期</strong>
            <p>原生日期控件：年／月／日逐项输入，方向键移动，周一开始一周。</p>
          </div>
          <div>
            <strong>时间</strong>
            <p>24 小时制，时／分逐项输入；提醒按所选时区保存为绝对时间。</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Agent 接入（原型 agent-access）：指向 Agent 的入口（CLI / MCP）与技能说明的位置。 */
