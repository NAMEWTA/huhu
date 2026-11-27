import { PlanSummarySchema } from "@huhu/contracts";
import { z } from "zod";
import { HostKeyPrompt } from "./trust.js";

export const SESSION_INTERVALS = [1, 2, 5] as const;
export const PANEL_INTERVALS = [2, 5, 10, 30, 60] as const;
export const RETENTION_MINUTES = [15, 60, 360, 1440] as const;
export const MONITOR_CORE_LIMIT = 64;
export const MONITOR_INTERFACE_LIMIT = 16;
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
const planRevision = { expectedPlanRevision: z.string().nullable().optional() };
export const SaveMonitorPanel = z.strictObject({ ...panel, previous: MonitorPanelRevision.optional(), ...planRevision });
export type SaveMonitorPanel = z.infer<typeof SaveMonitorPanel>;
export const MonitorPanel = z.strictObject({ ...panel, id: z.uuid(), revision: z.uuid(), plan: PlanSummarySchema.optional() });
export type MonitorPanel = z.infer<typeof MonitorPanel>;

export const MonitorSessionOpen = z.strictObject({ hostId: z.string().min(1), shellId: z.string().min(1), interval: SessionInterval, sudo: z.boolean().optional() });
export const MonitorSessionId = z.strictObject({ id: z.uuid() });
export const MonitorSessionChange = z.discriminatedUnion("action", [
  MonitorSessionId.extend({ action: z.enum(["pause", "continue", "retry", "close"]) }),
  MonitorSessionId.extend({ action: z.literal("interval"), interval: SessionInterval }),
]);
export const MonitorPanelChange = z.discriminatedUnion("action", [
  MonitorPanelRevision.extend({ action: z.enum(["start", "pause", "continue", "stop"]), ...planRevision }),
  MonitorPanelRevision.extend({ action: z.literal("retry"), hostId: z.string().min(1), ...planRevision }),
]);

export const MonitorPanelSudo = MonitorPanelRevision.extend({ hostId: z.string().min(1), sudo: z.boolean() });

const CpuPercent = z.number().min(0).max(100);
const NetworkRate = z.object({ received: z.number().nonnegative(), sent: z.number().nonnegative() });
export const MonitorSample = z.object({
  cpu: CpuPercent.optional(),
  cores: z
    .array(z.object({ index: z.number().int().nonnegative(), percent: CpuPercent }))
    .max(MONITOR_CORE_LIMIT)
    .optional(),
  memory: z.object({ total: z.number().positive(), available: z.number().nonnegative() }).optional(),
  disk: z.object({ mount: z.string().max(100), total: z.number().positive(), available: z.number().nonnegative() }).optional(),
  network: NetworkRate.optional(),
  interfaces: z
    .array(NetworkRate.extend({ name: z.string().min(1).max(64) }))
    .max(MONITOR_INTERFACE_LIMIT)
    .optional(),
  uptimeSec: z.number().nonnegative().optional(),
  load: z.number().nonnegative().optional(),
});
export type MonitorSample = z.infer<typeof MonitorSample>;
export const MonitorPoint = z.object({ at: z.number().int(), sample: MonitorSample.nullable() });
export type MonitorPoint = z.infer<typeof MonitorPoint>;
export const MonitorHost = z.object({
  hostId: z.string(),
  connectionId: z.string().optional(),
  sudo: z.boolean().optional(),
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
export const MonitorPanelRun = z.object({ id: z.uuid(), revision: z.uuid(), state: z.enum(["running", "paused", "stopped"]), hosts: z.array(MonitorHost), plan: PlanSummarySchema.optional() });
export type MonitorPanelRun = z.infer<typeof MonitorPanelRun>;

export const MonitorTool = z.enum(["processes", "containers", "images"]);
export type MonitorTool = z.infer<typeof MonitorTool>;
export const MonitorToolRequest = MonitorSessionOpen.omit({ interval: true }).extend({ tool: MonitorTool });
const ProcessStartTicks = z.string().regex(/^\d{1,20}$/u);
export const MonitorToolResult = z.object({
  connectionId: z.string(),
  tool: MonitorTool,
  state: z.enum(["ready", "denied", "unsupported", "failed"]),
  message: z.string().optional(),
  rows: z.array(z.object({ id: z.string(), name: z.string(), detail: z.string().optional(), startTicks: ProcessStartTicks.optional() })).max(64),
});
export type MonitorToolResult = z.infer<typeof MonitorToolResult>;

export const MonitorProcessTarget = MonitorSessionOpen.omit({ interval: true }).extend({
  pid: z.int().min(2).max(4194304),
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[^\p{Cc}]+$/u),
  startTicks: ProcessStartTicks,
});
export const MonitorContainerTarget = MonitorSessionOpen.omit({ interval: true }).extend({
  containerId: z.string().regex(/^[a-f0-9]{12,64}$/u),
});
