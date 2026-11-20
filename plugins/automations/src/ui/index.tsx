import "./automations.css";
import { defineHomeWidgetContribution, type HomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { Workflow } from "lucide-react";
import { AutomationsModule } from "./AutomationsModule.js";
import { AutomationHomeWidget } from "./AutomationHomeWidget.js";
import { automationSummaryWidget } from "../shared/home-widget.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; homeWidgets: HomeWidgetContribution[] } = {
  modules: [{ id: "automations", plugin: "automations", title: t.title, group: "execution", order: 30, icon: <Workflow size={18} aria-hidden />, component: AutomationsModule }],
  homeWidgets: [defineHomeWidgetContribution(automationSummaryWidget, 40, AutomationHomeWidget)],
};
