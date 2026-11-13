import type { HomeWidgetContribution, ModuleContribution } from "@huhu/workbench";
import { History } from "lucide-react";
import { VersioningHomeWidget } from "./HomeWidget.js";
import { VersioningModule } from "./VersioningModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; homeWidgets: HomeWidgetContribution[] } = {
  modules: [{ id: "versioning", plugin: "versioning", title: t.title, group: "system", order: 40, icon: <History size={18} aria-hidden />, component: VersioningModule }],
  homeWidgets: [{ id: "git", plugin: "versioning", title: "版本与同步", order: 10, component: VersioningHomeWidget }],
};
