import type { ModuleContribution } from "@huhu/workbench";
import { SquareTerminal } from "lucide-react";
import { AgentCliModule } from "./AgentCliModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "agent-cli", plugin: "agent-cli", title: t.title, group: "execution", order: 10, icon: <SquareTerminal size={18} aria-hidden />, component: AgentCliModule }],
};
