import "./versioning.css";
import type { HomeWidgetContribution, ModuleContribution, SettingsPageContribution } from "@huhu/workbench";
import { History, RefreshCw } from "lucide-react";
import { VersioningHomeWidget } from "./HomeWidget.js";
import { SyncSettingsPage } from "./sync/SyncSettingsPage.js";
import { VersioningModule } from "./VersioningModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; homeWidgets: HomeWidgetContribution[]; settingsPages: SettingsPageContribution[] } = {
  modules: [{ id: "versioning", plugin: "versioning", title: t.title, group: "system", order: 40, icon: <History size={18} aria-hidden />, component: VersioningModule }],
  homeWidgets: [{ id: "git", plugin: "versioning", title: "版本与同步", order: 10, component: VersioningHomeWidget }],
  settingsPages: [{ id: "versioning", plugin: "versioning", title: "版本与同步", icon: <RefreshCw size={16} aria-hidden />, order: 30, component: SyncSettingsPage }],
};
