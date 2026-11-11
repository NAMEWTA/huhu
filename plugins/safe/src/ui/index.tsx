import type { ModuleContribution } from "@huhu/workbench";
import { ShieldCheck } from "lucide-react";
import { SafeModule } from "./SafeModule.js";
import { t } from "./i18n.js";

export const contributions: { modules: ModuleContribution[] } = {
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
        { id: "all", label: "凭据" },
        { id: "audit", label: "访问记录" },
        { id: "settings", label: "锁定设置" },
      ],
      description: "凭据引用、锁定与访问记录",
      component: SafeModule,
    },
  ],
};
