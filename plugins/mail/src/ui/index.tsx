import "./mail.css";
import type { CommandContribution, ModuleContribution } from "@huhu/workbench";
import { Mail } from "lucide-react";
import { MailModule } from "./MailModule.js";
import { requestMailSearch } from "./mail-search-command.js";

export function createMailContributions(openMail?: () => boolean | void | Promise<boolean | void>) {
  return {
    modules: [{ id: "mail", plugin: "mail", title: "邮件", group: "primary", order: 60, icon: <Mail size={18} aria-hidden />, component: MailModule }] satisfies ModuleContribution[],
    commands: [{ id: "mail.search", plugin: "mail", title: "搜索已缓存邮件", run: () => requestMailSearch(openMail) }] satisfies CommandContribution[],
  };
}

export const contributions = createMailContributions();
