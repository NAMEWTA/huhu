import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const inboxHomeWidget = defineHomeWidget({
  owner: "inbox",
  id: "inbox",
  title: "收件箱",
  description: "查看等待整理的捕获。",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: 1,
  configSchema: z.strictObject({}),
  defaultConfig: {},
  capabilities: [{ name: "inbox.list", required: true }],
});
