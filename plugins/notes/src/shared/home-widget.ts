import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const recentNotesHomeWidget = defineHomeWidget({
  owner: "notes",
  id: "recent",
  title: "最近笔记",
  description: "继续编辑最近打开的笔记。",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: 1,
  configSchema: z.strictObject({}),
  defaultConfig: {},
  capabilities: [
    { name: "home.notes.recent", required: true },
    { name: "notes.list", required: true },
  ],
});
