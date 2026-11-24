import "./notes.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { NotebookPen } from "lucide-react";
import { NotesModule } from "./NotesModule.js";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { recentNotesHomeWidget } from "../shared/home-widget.js";
import { RecentNotesHomeWidget } from "./HomeWidget.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "notes", plugin: "notes", title: t.title, group: "primary", order: 20, icon: <NotebookPen size={18} aria-hidden />, component: NotesModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(recentNotesHomeWidget, 11, RecentNotesHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};

export { DocumentSessionConnection } from "./documents/useDocumentSession.js";
