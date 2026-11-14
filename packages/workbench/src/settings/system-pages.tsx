import { BookOpen, CalendarDays, Command, Database, Folder, NotebookPen, Palette } from "lucide-react";
import type { SettingsPageContribution } from "../contributions.js";
import { AboutPage } from "./AboutPage.js";
import { ShortcutsPage } from "./ShortcutsPage.js";
import { StoragePage } from "./StoragePage.js";
import { VaultPage } from "./VaultPage.js";
import { AppearancePage } from "./AppearancePage.js";
import { DateTimePage, EditorPage } from "./SettingsModule.js";

const icon = (I: typeof Palette) => <I size={16} aria-hidden />;

/** 系统设置页：随工作台内核提供，不随插件启停；与插件设置页注册到同一个注册表。 */
export function systemSettingsPages(): SettingsPageContribution[] {
  return [
    { id: "appearance", plugin: "kernel", title: "外观", icon: icon(Palette), order: 10, component: AppearancePage },
    { id: "vault", plugin: "kernel", title: "当前 Vault", icon: icon(Folder), order: 20, component: VaultPage },
    { id: "editor", plugin: "kernel", title: "编辑器", icon: icon(NotebookPen), order: 30, component: EditorPage },
    { id: "date-time", plugin: "kernel", title: "日期与时间", icon: icon(CalendarDays), order: 40, component: DateTimePage },
    { id: "shortcuts", plugin: "kernel", title: "快捷键", icon: icon(Command), order: 50, component: ShortcutsPage },
    { id: "data", plugin: "kernel", title: "数据与存储", icon: icon(Database), order: 60, component: StoragePage },
    { id: "about", plugin: "kernel", title: "关于", icon: icon(BookOpen), order: 70, component: AboutPage },
  ];
}
