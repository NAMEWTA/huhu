import { z } from "zod";
import { HostKeyPrompt } from "./trust.js";

export const SESSION_INTERVALS = [1, 2, 5] as const;
export const PANEL_INTERVALS = [2, 5, 10, 30, 60] as const;
export const RETENTION_MINUTES = [15, 60, 360, 1440] as const;
export const SessionInterval = z.literal(SESSION_INTERVALS);
export const PanelInterval = z.literal(PANEL_INTERVALS);
export const Retention = z.literal(RETENTION_MINUTES);
export const MonitorPanelRevision = z.strictObject({ id: z.uuid(), expectedRevision: z.uuid() });
const panel = {
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(240),
  hostIds: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(12)
    .refine((values) => new Set(values).size === values.length),
  interval: PanelInterval,
  retention: Retention,
};
export const SaveMonitorPanel = z.strictObject({ ...panel, previous: MonitorPanelRevision.optional() });
export type SaveMonitorPanel = z.infer<typeof SaveMonitorPanel>;
export const MonitorPanel = z.strictObject({ ...panel, id: z.uuid(), revision: z.uuid() });
export type MonitorPanel = z.infer<typeof MonitorPanel>;

export const MonitorSessionOpen = z.strictObject({ hostId: z.string().min(1), shellId: z.string().min(1), interval: SessionInterval });
export const MonitorSessionId = z.strictObject({ id: z.uuid() });
export const MonitorSessionChange = z.discriminatedUnion("action", [
  MonitorSessionId.extend({ action: z.enum(["pause", "continue", "retry", "close"]) }),
  MonitorSessionId.extend({ action: z.literal("interval"), interval: SessionInterval }),
]);
export const MonitorPanelChange = z.discriminatedUnion("action", [
  MonitorPanelRevision.extend({ action: z.enum(["start", "pause", "continue", "stop"]) }),
  MonitorPanelRevision.extend({ action: z.literal("retry"), hostId: z.string().min(1) }),
]);

export const MonitorSample = z.object({
  cpu: z.number().min(0).max(100).optional(),
  memory: z.object({ total: z.number().positive(), available: z.number().nonnegative() }).optional(),
  disk: z.object({ mount: z.string().max(100), total: z.number().positive(), available: z.number().nonnegative() }).optional(),
  network: z.object({ received: z.number().nonnegative(), sent: z.number().nonnegative() }).optional(),
  uptimeSec: z.number().nonnegative().optional(),
  load: z.number().nonnegative().optional(),
});
export type MonitorSample = z.infer<typeof MonitorSample>;
export const MonitorPoint = z.object({ at: z.number().int(), sample: MonitorSample.nullable() });
export type MonitorPoint = z.infer<typeof MonitorPoint>;
export const MonitorHost = z.object({
  hostId: z.string(),
  connectionId: z.string().optional(),
  state: z.enum(["connecting", "trust", "sampling", "running", "paused", "stopped", "disconnected", "unsupported", "denied", "failed", "missing"]),
  platform: z.enum(["linux", "windows"]).optional(),
  prompt: HostKeyPrompt.optional(),
  message: z.string().optional(),
  interval: z.number().int().positive().optional(),
  subscribers: z.number().int().nonnegative(),
  latest: MonitorPoint.optional(),
  history: z.array(MonitorPoint),
});
export type MonitorHost = z.infer<typeof MonitorHost>;
export const MonitorSession = MonitorSessionId.extend({ interval: SessionInterval, host: MonitorHost, source: z.literal("external").optional() });
export type MonitorSession = z.infer<typeof MonitorSession>;
export const MonitorPanelRun = z.object({ id: z.uuid(), revision: z.uuid(), state: z.enum(["running", "paused", "stopped"]), hosts: z.array(MonitorHost) });
export type MonitorPanelRun = z.infer<typeof MonitorPanelRun>;

export const MonitorTool = z.enum(["processes", "containers"]);
export type MonitorTool = z.infer<typeof MonitorTool>;
export const MonitorToolRequest = MonitorSessionOpen.omit({ interval: true }).extend({ tool: MonitorTool });
export const MonitorToolResult = z.object({
  connectionId: z.string(),
  tool: MonitorTool,
  state: z.enum(["ready", "denied", "unsupported", "failed"]),
  message: z.string().optional(),
  rows: z.array(z.object({ id: z.string(), name: z.string(), detail: z.string().optional() })).max(64),
});
export type MonitorToolResult = z.infer<typeof MonitorToolResult>;
