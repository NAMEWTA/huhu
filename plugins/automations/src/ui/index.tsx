import "./automations.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { Workflow } from "lucide-react";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { AutomationsModule } from "./AutomationsModule.js";
import { AutomationHomeWidget } from "./AutomationHomeWidget.js";
import { automationSummaryWidget } from "../shared/home-widget.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "automations", plugin: "automations", title: t.title, group: "execution", order: 30, icon: <Workflow size={18} aria-hidden />, component: AutomationsModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(automationSummaryWidget, 40, AutomationHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};
