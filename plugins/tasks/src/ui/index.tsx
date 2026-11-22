import "./tasks.css";
import { PluginManifestSchema } from "@huhu/contracts";
import { defineHomeWidgetContribution, type ModuleContribution } from "@huhu/workbench";
import { ListTodo } from "lucide-react";
import { TasksModule } from "./TasksModule.js";
import manifest from "../../huhu-plugin.json" with { type: "json" };
import { tasksHomeWidget } from "../shared/home-widget.js";
import { TasksHomeWidget, TasksHomeWidgetConfig } from "./HomeWidget.js";
import { t } from "./i18n.js";

/** 插件 UI 入口：向外壳贡献"任务"模块。 */
export const contributions = {
  modules: [{ id: "tasks", plugin: "tasks", title: t.title, group: "primary", order: 30, icon: <ListTodo size={18} aria-hidden />, component: TasksModule }] satisfies ModuleContribution[],
  homeWidgets: [defineHomeWidgetContribution(tasksHomeWidget, 10, TasksHomeWidget, TasksHomeWidgetConfig)],
  homeWidgetSource: PluginManifestSchema.parse(manifest),
};
