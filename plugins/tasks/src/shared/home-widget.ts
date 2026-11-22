import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const tasksHomeWidget = defineHomeWidget({
  owner: "tasks",
  id: "tasks",
  title: "我的任务",
  description: "查看全部待办或今日安排。",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: null,
  configSchema: z.strictObject({ filter: z.enum(["all", "today"]).optional() }),
  defaultConfig: {},
  capabilities: [
    { name: "tasks.list", required: true },
    { name: "tasks.setStatus", required: false },
  ],
});
