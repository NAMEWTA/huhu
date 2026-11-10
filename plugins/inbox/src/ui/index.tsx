import type { ModuleContribution } from "@huhu/workbench";
import { Inbox } from "lucide-react";
import { InboxModule } from "./InboxModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "inbox", plugin: "inbox", title: t.title, group: "primary", order: 50, icon: <Inbox size={18} aria-hidden />, component: InboxModule }],
};
