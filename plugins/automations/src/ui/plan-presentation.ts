import type { PlanSummary, PlanTrigger } from "@huhu/contracts";
import { presetOf } from "./cron-presets.js";
import { t } from "./i18n.js";

export const occurrenceLabel = {
  scheduled: "已安排", blocked: "受阻", cancelled: "已取消", accepted: "已受理",
  running: "运行中", completed: "已完成", failed: "失败", unknown: "待核实",
};

export const blockedLabel = {
  "plugin-disabled": "来源插件未启用", "read-only": "Vault 只读", "foreign-owner": "由另一设备执行",
  "credentials-unavailable": "凭据不可用", "connection-unavailable": "连接不可用",
  "domain-conflict": "来源状态冲突", "target-unavailable": "原目标不可用",
};

export function formatMoment(value: string, zone?: string): string {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      ...(zone && { timeZone: zone }), hour12: false, timeZoneName: "shortOffset",
    });
  } catch (failure) {
    if (!(failure instanceof RangeError)) throw failure;
    return `${value} · 时区不可用`;
  }
}

export function planZone(plan: PlanSummary): string | undefined {
  return plan.trigger.kind === "cron" ? plan.trigger.zone : undefined;
}

export function describeTrigger(trigger: PlanTrigger): string {
  switch (trigger.kind) {
    case "once": return `一次性 · ${formatMoment(trigger.scheduledFor)}`;
    case "interval": return `每 ${trigger.every} ${trigger.unit === "minutes" ? "分钟" : "秒"}`;
    case "observe": return `每 ${trigger.everySeconds} 秒检查`;
    case "event": return `事件 · ${trigger.event}`;
    case "cron": {
      const preset = presetOf(trigger.expression);
      const summary = preset.preset === "custom" ? trigger.expression
        : `${t.presets[preset.preset]}${["daily", "weekdays", "monday"].includes(preset.preset) ? ` ${preset.time}` : ""}`;
      return `${summary} · ${trigger.zone}`;
    }
  }
}
