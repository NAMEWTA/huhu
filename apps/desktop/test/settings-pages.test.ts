import agentCliManifest from "@huhu/plugin-agent-cli/manifest" with { type: "json" };
import { contributions as agentCliUi } from "@huhu/plugin-agent-cli/ui";
import agentGuideManifest from "@huhu/plugin-agent-guide/manifest" with { type: "json" };
import { contributions as agentGuideUi } from "@huhu/plugin-agent-guide/ui";
import automationsManifest from "@huhu/plugin-automations/manifest" with { type: "json" };
import { contributions as automationsUi } from "@huhu/plugin-automations/ui";
import notesManifest from "@huhu/plugin-notes/manifest" with { type: "json" };
import { contributions as notesUi } from "@huhu/plugin-notes/ui";
import safeManifest from "@huhu/plugin-safe/manifest" with { type: "json" };
import { contributions as safeUi } from "@huhu/plugin-safe/ui";
import tasksManifest from "@huhu/plugin-tasks/manifest" with { type: "json" };
import { contributions as tasksUi } from "@huhu/plugin-tasks/ui";
import versioningManifest from "@huhu/plugin-versioning/manifest" with { type: "json" };
import { contributions as versioningUi } from "@huhu/plugin-versioning/ui";
import { ContributionRegistry, type SettingsPageContribution } from "@huhu/workbench";
import { describe, expect, test } from "vitest";

const plugins: { id: string; manifest: { id: string; contributes: { settingsPages: string[] } }; ui: { settingsPages?: SettingsPageContribution[] } }[] = [
  { id: "agent-cli", manifest: agentCliManifest, ui: agentCliUi },
  { id: "agent-guide", manifest: agentGuideManifest, ui: agentGuideUi },
  { id: "automations", manifest: automationsManifest, ui: automationsUi },
  { id: "notes", manifest: notesManifest, ui: notesUi },
  { id: "safe", manifest: safeManifest, ui: safeUi },
  { id: "tasks", manifest: tasksManifest, ui: tasksUi },
  { id: "versioning", manifest: versioningManifest, ui: versioningUi },
];

describe("设置页：清单与 UI 注册对齐（SF-06）", () => {
  test.each(plugins)("$id：清单声明的 settingsPages 与 UI 注册的 id 集合一致", ({ id, manifest, ui }) => {
    expect(manifest.id).toBe(id);
    const registered = (ui.settingsPages ?? []).map((p) => p.id).sort();
    expect(registered).toEqual([...manifest.contributes.settingsPages].sort());
    for (const p of ui.settingsPages ?? []) {
      expect(p.plugin).toBe(id);
      expect(p.icon).toBeTruthy(); // 没有模块的插件（agent-guide）必须显式给图标
    }
  });

  test("插件页随插件启停出现 / 消失；系统页始终在前", () => {
    const r = new ContributionRegistry();
    r.register(safeUi);
    r.register(versioningUi);
    r.register(agentGuideUi);
    r.register({ settingsPages: [{ id: "appearance", plugin: "kernel", title: "外观", icon: null, order: 10, component: () => null }] });
    expect(r.getSnapshot().settingsPages.map((p) => p.id)).toEqual(["appearance", "agent-access", "safe", "versioning"]);
    r.setEnabledPlugins(["versioning"]);
    expect(r.getSnapshot().settingsPages.map((p) => p.id)).toEqual(["appearance", "versioning"]);
    r.setEnabledPlugins(null);
    r.removePlugin("safe");
    expect(r.getSnapshot().settingsPages.map((p) => p.id)).not.toContain("safe");
  });
});
