import { Button, ChoiceSwitch, PageHead, appearanceController } from "@huhu/ui";
import { RangeField } from "./RangeField.js";
import type { Settings } from "@huhu/contracts";
import { NotebookPen } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useSettingsPages, type ModuleProps } from "../contributions.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";

export interface SettingsData {
  s: Settings;
  update(patch: Record<string, unknown>): Promise<void>;
}
const SettingsDataContext = createContext<SettingsData | null>(null);
/** 系统设置页读取当前设置与保存函数（插件设置页各自管理自己的存储，不使用它）。 */
export function useSettingsData(): SettingsData {
  const v = useContext(SettingsDataContext);
  if (!v) throw new Error("useSettingsData 只能在设置模块内使用");
  return v;
}

/** 设置（原型 Preferences）：页面由外壳左侧导航选择（系统页 + 插件页，见注册表）；修改立即生效，随当前 Vault 独立保存。 */
export function SettingsModule({ section }: ModuleProps) {
  const pages = useSettingsPages();
  const page = pages.find((p) => p.id === section);
  const Page = page?.component;
  const engine = useEngine();
  const qc = useQueryClient();
  const settings = useCapability<Settings>("settings.get", {});
  const [error, setError] = useState<string | null>(null);
  if (settings.isError)
    return (
      <div role="alert" className="hu-field-error">
        {settings.error instanceof Error ? settings.error.message : String(settings.error)}
      </div>
    );
  if (!settings.data) return <p>{t.loading}</p>;
  const s = settings.data;

  async function update(patch: Record<string, unknown>) {
    setError(null);
    try {
      const next = await engine.call<Settings>("settings.update", { patch }, { write: true });
      appearanceController().set(next.appearance);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="hu-module-layout" data-testid="settings-module">
      <div className="hu-view-content">
        <PageHead title={page?.title ?? "设置"} description="修改立即生效，随当前 Vault 独立保存。" />
        <div className="shell-system-scroll hu-scroll shell-settings-content">
          {error ? (
            <div role="alert" className="hu-field-error">
              {error}
            </div>
          ) : null}
          <SettingsDataContext.Provider value={{ s, update }}>{Page ? <Page /> : null}</SettingsDataContext.Provider>
        </div>
      </div>
    </div>
  );
}

export function EditorPage() {
  const { s, update } = useSettingsData();
  const e = s.editor;
  const set = (patch: Record<string, unknown>) => void update({ editor: patch });
  return (
    <div data-testid="settings-editor">
      <section className="hu-settings-section hu-card-alt">
        <h2>阅读与编辑</h2>
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.editorFontSize}</strong>
            <p>同步到 Markdown 编辑与阅读区域。</p>
          </div>
          <RangeField label={t.settings.editorFontSize} value={e.fontSize} min={14} max={20} onCommit={(n) => set({ fontSize: n })} />
        </div>
        <div className="hu-setting-row">
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
        <div className="hu-setting-row">
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
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.autosave}</strong>
            <p>{t.settings.autosaveNote}</p>
          </div>
          <ChoiceSwitch checked={e.autosave} onChange={(v) => set({ autosave: v })} label={t.settings.autosave} />
        </div>
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.lineNumbers}</strong>
            <p>只影响 Markdown 源码视图。</p>
          </div>
          <ChoiceSwitch checked={e.lineNumbers} onChange={(v) => set({ lineNumbers: v })} label={t.settings.lineNumbers} />
        </div>
        <div className="hu-setting-row">
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

export function DateTimePage() {
  const { s, update } = useSettingsData();
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
      <section className="hu-settings-section hu-card-alt">
        <h2>统一日期与时间</h2>
        <p>绝对时间按所选时区显示；只含日期的值不会跨日转换。</p>
        <div className="hu-setting-row">
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
          <div role="alert" className="hu-field-error" data-testid="settings-zone-invalid">
            {t.settings.zoneInvalid}
          </div>
        ) : null}
        <div className="shell-date-format-samples">
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
      <section className="hu-settings-section hu-card-alt">
        <h2>统一交互规范</h2>
        <div className="shell-date-help-grid">
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
