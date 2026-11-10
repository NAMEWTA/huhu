import type { ModuleContribution } from "@huhu/workbench";
import { Database } from "lucide-react";
import { ArchivesModule } from "./ArchivesModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "archives", plugin: "archives", title: t.title, group: "primary", order: 40, icon: <Database size={18} aria-hidden />, component: ArchivesModule }],
};
