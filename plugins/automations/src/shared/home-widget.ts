import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const automationSummaryWidget = defineHomeWidget({
  owner: "automations",
  id: "summary",
  title: "自动化摘要",
  description: "查看各来源的启用计划、受阻数量和下次执行。",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: 1,
  configSchema: z.strictObject({}),
  defaultConfig: {},
  capabilities: [{ name: "automations.plans.summary", required: true }],
});
