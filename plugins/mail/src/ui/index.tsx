import "./mail.css";
import type { ModuleContribution } from "@huhu/workbench";
import { Mail } from "lucide-react";
import { MailModule } from "./MailModule.js";

export const contributions = {
  modules: [{ id: "mail", plugin: "mail", title: "邮件", group: "primary", order: 60, icon: <Mail size={18} aria-hidden />, component: MailModule }] satisfies ModuleContribution[],
};
