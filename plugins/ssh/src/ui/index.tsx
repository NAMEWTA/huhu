import "./ssh.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution, type SettingsPageContribution, type SshWorkspacePaneAddress } from "@huhu/workbench";
import { Server, Settings } from "lucide-react";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { sshHostsWidget } from "../shared/index.js";
import { SshHomeWidget, SshHomeWidgetConfig } from "./HomeWidget.js";
import { SshModule } from "./SshModule.js";
import { SshSettingsPage } from "./SshSettingsPage.js";
import { WorkspacePaneWindow } from "./WorkspacePaneWindow.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "ssh", plugin: "ssh", title: t.title, group: "execution", order: 20, icon: <Server size={18} aria-hidden />, component: SshModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(sshHostsWidget, 20, SshHomeWidget, SshHomeWidgetConfig)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
  settingsPages: [{ id: "ssh", plugin: "ssh", title: "SSH 设置", icon: <Settings size={16} aria-hidden />, order: 35, component: SshSettingsPage }] satisfies SettingsPageContribution[],
};

export function createSshContributions(target: SshWorkspacePaneAddress | undefined) {
  if (!target) return contributions;
  return { ...contributions, modules: contributions.modules.map((module) => ({ ...module, component: () => <WorkspacePaneWindow target={target} /> })) };
}
