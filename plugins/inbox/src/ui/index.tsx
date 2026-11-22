import "./inbox.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { Inbox } from "lucide-react";
import { InboxModule } from "./InboxModule.js";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { inboxHomeWidget } from "../shared/home-widget.js";
import { InboxHomeWidget } from "./HomeWidget.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "inbox", plugin: "inbox", title: t.title, group: "primary", order: 50, icon: <Inbox size={18} aria-hidden />, component: InboxModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(inboxHomeWidget, 12, InboxHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};
