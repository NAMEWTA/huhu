import type { SettingsPageContribution } from "@huhu/workbench";
import { BookOpen } from "lucide-react";
import { AgentAccessPage } from "./AgentAccessPage.js";

/** agent-guide 没有模块，只贡献一个设置页；插件停用时它随之消失。 */
export const contributions: { settingsPages: SettingsPageContribution[] } = {
  settingsPages: [{ id: "agent-access", plugin: "agent-guide", title: "Agent 接入", icon: <BookOpen size={16} aria-hidden />, order: 10, component: AgentAccessPage }],
};
