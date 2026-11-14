import "./agent-cli.css";
import type { ModuleContribution, SettingsPageContribution } from "@huhu/workbench";
import { SquareTerminal } from "lucide-react";
import { AgentCliModule } from "./AgentCliModule.js";
import { AgentSettingsPage } from "./AgentSettingsPage.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; settingsPages: SettingsPageContribution[] } = {
  modules: [{ id: "agent-cli", plugin: "agent-cli", title: t.title, group: "execution", order: 10, icon: <SquareTerminal size={18} aria-hidden />, component: AgentCliModule }],
  settingsPages: [{ id: "agent-cli", plugin: "agent-cli", title: "智能体", icon: <SquareTerminal size={16} aria-hidden />, order: 40, component: AgentSettingsPage }],
};
