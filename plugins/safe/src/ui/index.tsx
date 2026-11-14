import "./safe.css";
import type { ModuleContribution, SettingsPageContribution } from "@huhu/workbench";
import { History, KeyRound, ShieldCheck } from "lucide-react";
import { SafeModule } from "./SafeModule.js";
import { SafeSettingsPage } from "./SafeSettingsPage.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[]; settingsPages: SettingsPageContribution[] } = {
  modules: [
    {
      id: "safe",
      plugin: "safe",
      title: t.title,
      group: "system",
      order: 30,
      icon: <ShieldCheck size={18} aria-hidden />,
      nav: "tabs",
      sections: [
        { id: "all", label: "凭据", tabIcon: KeyRound },
        { id: "audit", label: "访问记录", tabIcon: History },
      ],
      description: "凭据引用、锁定与访问记录",
      component: SafeModule,
    },
  ],
  settingsPages: [{ id: "safe", plugin: "safe", title: "保险箱", icon: <ShieldCheck size={16} aria-hidden />, order: 20, component: SafeSettingsPage }],
};
