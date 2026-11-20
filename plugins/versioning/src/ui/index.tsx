import "./versioning.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution, type SettingsPageContribution } from "@huhu/workbench";
import { History, RefreshCw } from "lucide-react";
import { VersioningHomeWidget } from "./HomeWidget.js";
import { SyncSettingsPage } from "./sync/SyncSettingsPage.js";
import { VersioningModule } from "./VersioningModule.js";
import { t } from "./i18n.js";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { gitHomeWidget } from "../shared/index.js";

export const contributions = {
  modules: [{ id: "versioning", plugin: "versioning", title: t.title, group: "system", order: 40, icon: <History size={18} aria-hidden />, component: VersioningModule }],
  homeWidgets: [defineHomeWidgetContribution(gitHomeWidget, 10, VersioningHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
  settingsPages: [{ id: "versioning", plugin: "versioning", title: "版本与同步", icon: <RefreshCw size={16} aria-hidden />, order: 30, component: SyncSettingsPage }],
} satisfies { modules: ModuleContribution[]; homeWidgets: ReturnType<typeof defineHomeWidgetContribution>[]; homeWidgetSource: ReturnType<typeof PluginManifestSchema.parse>; settingsPages: SettingsPageContribution[] };
