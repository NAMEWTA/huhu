import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const gitHomeWidget = defineHomeWidget({
  owner: "versioning",
  id: "git",
  title: "版本与同步",
  description: "查看当前分支和工作区的改动数量。",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: 1,
  configSchema: z.strictObject({}),
  defaultConfig: {},
  capabilities: [{ name: "git.status", required: true }],
});
