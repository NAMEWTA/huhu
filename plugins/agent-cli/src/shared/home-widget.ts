import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const agentEntryHomeWidget = defineHomeWidget({
  owner: "agent-cli",
  id: "entry",
  title: "Agent CLI",
  description: "打开工作区的 Agent 会话。",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: 1,
  configSchema: z.strictObject({}),
  defaultConfig: {},
  capabilities: [{ name: "agent.core.status", required: true }],
});
