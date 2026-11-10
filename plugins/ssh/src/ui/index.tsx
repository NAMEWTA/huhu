import type { ModuleContribution } from "@huhu/workbench";
import { Server } from "lucide-react";
import { SshModule } from "./SshModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "ssh", plugin: "ssh", title: t.title, group: "execution", order: 20, icon: <Server size={18} aria-hidden />, component: SshModule }],
};
