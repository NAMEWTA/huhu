import type { HomeWidgetContribution, ModuleContribution } from "@huhu/workbench";
import { Server } from "lucide-react";
import { SshHomeWidget } from "./HomeWidget.js";
import { SshModule } from "./SshModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; homeWidgets: HomeWidgetContribution[] } = {
  modules: [{ id: "ssh", plugin: "ssh", title: t.title, group: "execution", order: 20, icon: <Server size={18} aria-hidden />, component: SshModule }],
  homeWidgets: [{ id: "hosts", plugin: "ssh", title: "SSH 主机", order: 20, component: SshHomeWidget }],
};
