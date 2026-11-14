import { Button, ChoiceSwitch, Segmented, THEMES, resolveMode, themeList, type Appearance, type ThemeId } from "@huhu/ui";
import { Check, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../i18n/zh-CN.js";
import { RangeField } from "./RangeField.js";
import { useSettingsData } from "./SettingsModule.js";

const prefersDark = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/** 主题预览卡：用局部 data-theme / data-mode 套用对应主题，渲染一个迷你工作台；不使用任何硬编码的预览色。 */
function ThemeMini({ theme, mode }: { theme: ThemeId; mode: "light" | "dark" }) {
  return (
    <div className="shell-theme-mini" data-theme={theme} data-mode={mode} aria-hidden>
      <div className="shell-theme-mini-side">
        <i />
        <i />
        <i />
      </div>
      <div className="shell-theme-mini-main">
        <strong>{THEMES[theme].name}</strong>
        <span />
        <span />
        <div className="shell-theme-mini-row">
          <b>主按钮</b>
          <em>标签</em>
        </div>
      </div>
    </div>
  );
}

/** 外观：主题（Claude / Apple / Notion / Vercel）、明暗、字号、密度、动效、导航宽度。 */
export function AppearancePage() {
  const { s, update } = useSettingsData();
  const a = s.appearance as Appearance;
  const set = (patch: Record<string, unknown>) => void update({ appearance: patch });
  // 预览卡的明暗跟随当前设置；选“跟随系统”时随系统变化
  const [dark, setDark] = useState(prefersDark());
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  const mode = resolveMode(a.mode, dark);
  return (
    <div data-testid="settings-appearance">
      <section className="hu-settings-section hu-card-alt">
        <h2>主题与色彩</h2>
        <p>四套主题都有浅色和深色，统一列表、编辑器、日历和弹层的色彩、字体与形状。</p>
        <div className="shell-theme-options" role="group" aria-label={t.settings.theme}>
          {themeList().map((th) => (
            <button
              key={th.id}
              type="button"
              className={`shell-theme-option ${a.theme === th.id ? "selected" : ""}`}
              aria-pressed={a.theme === th.id}
              aria-label={`${t.settings.theme} ${th.name}`}
              data-testid={`theme-${th.id}`}
              onClick={() => set({ theme: th.id })}
            >
              <ThemeMini theme={th.id} mode={mode} />
              <strong>
                {th.name}
                {a.theme === th.id ? <Check size={14} aria-hidden /> : null}
              </strong>
              <small>{th.description}</small>
            </button>
          ))}
        </div>
        <div className="hu-setting-row">
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
      <section className="hu-settings-section hu-card-alt">
        <h2>字体与密度</h2>
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.fontSize}</strong>
            <p>字体随主题而定，已内嵌；中文使用系统字体回退。</p>
          </div>
          <RangeField label={t.settings.fontSize} value={a.fontSize} min={12} max={18} onCommit={(n) => set({ fontSize: n })} />
        </div>
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.compact}</strong>
            <p>减少列表行的纵向留白。</p>
          </div>
          <ChoiceSwitch checked={a.density === "compact"} onChange={(v) => set({ density: v ? "compact" : "comfortable" })} label={t.settings.compact} />
        </div>
        <div className="hu-setting-row">
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
        <div className="hu-setting-row">
          <div>
            <strong>{t.settings.navWidth}</strong>
            <p>仅影响此类分类导航，不增加重复栏位。</p>
          </div>
          <RangeField label={t.settings.navWidth} value={a.navWidth} min={176} max={300} step={4} onCommit={(n) => set({ navWidth: n })} />
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => set({ theme: "claude", mode: "system", fontSize: 14, motion: "system", navWidth: 220, density: "comfortable" })}>
            {t.settings.reset}
          </Button>
        </div>
      </section>
    </div>
  );
}
