import type { ModuleContribution } from "@huhu/workbench";
import { Workflow } from "lucide-react";
import { AutomationsModule } from "./AutomationsModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "automations", plugin: "automations", title: t.title, group: "execution", order: 30, icon: <Workflow size={18} aria-hidden />, component: AutomationsModule }],
};
