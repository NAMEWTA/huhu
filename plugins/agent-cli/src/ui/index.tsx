import "./agent-cli.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution, type SettingsPageContribution } from "@huhu/workbench";
import { SquareTerminal } from "lucide-react";
import { AgentCliModule } from "./AgentCliModule.js";
import { AgentSettingsPage } from "./AgentSettingsPage.js";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { agentEntryHomeWidget } from "../shared/home-widget.js";
import { AgentEntryHomeWidget } from "./HomeWidget.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "agent-cli", plugin: "agent-cli", title: t.title, group: "execution", order: 10, icon: <SquareTerminal size={18} aria-hidden />, component: AgentCliModule }] satisfies ModuleContribution[],
  settingsPages: [{ id: "agent-cli", plugin: "agent-cli", title: "智能体", icon: <SquareTerminal size={16} aria-hidden />, order: 40, component: AgentSettingsPage }] satisfies SettingsPageContribution[],
  homeWidgets: [defineHomeWidgetContribution(agentEntryHomeWidget, 13, AgentEntryHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};
