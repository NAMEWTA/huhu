import type { ModuleContribution } from "@huhu/workbench";
import { NotebookPen } from "lucide-react";
import { NotesModule } from "./NotesModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "notes", plugin: "notes", title: t.title, group: "primary", order: 20, icon: <NotebookPen size={18} aria-hidden />, component: NotesModule }],
};
