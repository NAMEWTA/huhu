import { useEffect, useState } from "react";
import { SHORTCUTS, displayKeys } from "../shortcuts.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

/** 设置 → 快捷键：只读，来自已实现快捷键的登记表。 */
export function ShortcutsPage() {
  const [platform, setPlatform] = useState("linux");
  useEffect(() => {
    void host()
      ?.appInfo()
      .then(
        (i) => setPlatform(i.platform),
        () => undefined,
      );
  }, []);
  const c = t.settings.shortcuts;
  return (
    <div data-testid="settings-shortcuts">
      <h1>{c.title}</h1>
      <table>
        <thead>
          <tr>
            <th scope="col">{c.keys}</th>
            <th scope="col">{c.action}</th>
            <th scope="col">{c.scope}</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} data-testid="shortcut-row">
              <td>
                <kbd>{displayKeys(s.keys, platform)}</kbd>
              </td>
              <td>{s.action}</td>
              <td>{s.scope}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hu-meta">{c.note}</p>
    </div>
  );
}
