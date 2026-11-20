import "./ssh.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { Server } from "lucide-react";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { sshHostsWidget } from "../shared/index.js";
import { SshHomeWidget } from "./HomeWidget.js";
import { SshModule } from "./SshModule.js";
import { t } from "./i18n.js";

export const contributions = {
  modules: [{ id: "ssh", plugin: "ssh", title: t.title, group: "execution", order: 20, icon: <Server size={18} aria-hidden />, component: SshModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(sshHostsWidget, 20, SshHomeWidget)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};
