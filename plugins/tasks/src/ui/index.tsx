import type { ModuleContribution } from "@huhu/workbench";
import { ListTodo } from "lucide-react";
import { TasksModule } from "./TasksModule.js";
import { t } from "./i18n.js";

/** 插件 UI 入口：向外壳贡献"任务"模块。 */
export const contributions: { modules: ModuleContribution[] } = {
  modules: [{ id: "tasks", plugin: "tasks", title: t.title, group: "primary", order: 30, icon: <ListTodo size={18} aria-hidden />, component: TasksModule }],
};
