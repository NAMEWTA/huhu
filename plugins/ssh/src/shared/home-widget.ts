import { defineHomeWidget } from "@huhu/contracts";
import { z } from "zod";

export const sshHostsWidgetConfigSchema = z.strictObject({ hostId: z.string().min(1).optional() });

export const sshHostsWidget = defineHomeWidget({
  owner: "ssh",
  id: "hosts",
  title: "SSH 主机",
  description: "查看已保存的 SSH 主机。",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  maxInstances: null,
  configSchema: sshHostsWidgetConfigSchema,
  defaultConfig: {},
  capabilities: [{ name: "ssh.hosts.list", required: true }],
});
