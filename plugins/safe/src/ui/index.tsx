import type { ModuleContribution } from "@huhu/workbench";
import { ShieldCheck } from "lucide-react";
import { SafeModule } from "./SafeModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "safe", plugin: "safe", title: t.title, group: "system", order: 30, icon: <ShieldCheck size={18} aria-hidden />, component: SafeModule }],
};
