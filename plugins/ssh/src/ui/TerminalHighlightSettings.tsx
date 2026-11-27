import { Button, validTerminalPattern } from "@huhu/ui";
import { maxHighlightRules, type DevicePreferences } from "./device-preferences.js";

type Rules = DevicePreferences["terminalHighlightRules"];

export function TerminalHighlightSettings({ label, rules, change }: { label: string; rules: Rules; change(next: Rules): void }) {
  function patch(id: string, next: Partial<Rules[number]>) {
    change(rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));
  }
  function move(index: number, target: number) {
    if (!rules[target]) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target]!, next[index]!];
    change(next);
  }
  return (
    <fieldset className="hu-stack">
      <legend>{label}</legend>
      {rules.map((rule, index) => {
        const error = rule.pattern !== "" && !validTerminalPattern(rule);
        const errorId = `ssh-highlight-${rule.id}-error`;
        return (
          <fieldset key={rule.id} className="hu-stack">
            <legend>规则 {index + 1}</legend>
            <label className="hu-setting-row">
              启用
              <input type="checkbox" checked={rule.enabled} onChange={(event) => patch(rule.id, { enabled: event.currentTarget.checked })} />
            </label>
            <label className="hu-setting-row">
              匹配方式
              <select value={rule.mode} onChange={(event) => patch(rule.id, { mode: event.currentTarget.value === "regex" ? "regex" : "literal" })}>
                <option value="literal">字面文本</option>
                <option value="regex">正则表达式</option>
              </select>
            </label>
            <label className="hu-setting-row">
              规则内容
              <textarea required rows={2} maxLength={160} value={rule.pattern} aria-invalid={error || undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => patch(rule.id, { pattern: event.currentTarget.value })} />
            </label>
            {error && <p id={errorId}>请输入有效的匹配内容。</p>}
            <div className="ssh-workspace-controls">
              <Button type="button" disabled={index === 0} onClick={() => move(index, index - 1)}>
                上移
              </Button>
              <Button type="button" disabled={index === rules.length - 1} onClick={() => move(index, index + 1)}>
                下移
              </Button>
              <Button type="button" onClick={() => change(rules.filter(({ id }) => id !== rule.id))}>
                删除
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button type="button" disabled={rules.length >= maxHighlightRules} onClick={() => change([...rules, { id: crypto.randomUUID(), pattern: "", mode: "literal", enabled: true }])}>
          添加高亮规则
        </Button>
      </div>
    </fieldset>
  );
}
