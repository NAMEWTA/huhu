import type { ModuleContribution } from "@huhu/workbench";
import { History } from "lucide-react";
import { VersioningModule } from "./VersioningModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "versioning", plugin: "versioning", title: t.title, group: "system", order: 40, icon: <History size={18} aria-hidden />, component: VersioningModule }],
};
