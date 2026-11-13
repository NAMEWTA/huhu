import { DataTable } from "@huhu/ui";
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
      <section className="card">
        <div className="card-head">
          <h2>{c.title}</h2>
        </div>
        <DataTable
          label={c.title}
          rows={SHORTCUTS}
          rowKey={(s) => s.keys}
          rowTestId="shortcut-row"
          columns={[
            { id: "action", header: c.action, width: 420, cell: (s) => s.action },
            { id: "keys", header: c.keys, width: 160, cell: (s) => <kbd>{displayKeys(s.keys, platform)}</kbd> },
            { id: "scope", header: c.scope, width: 160, cell: (s) => s.scope },
          ]}
        />
        <p className="hint-text">{c.note}</p>
      </section>
    </div>
  );
}
