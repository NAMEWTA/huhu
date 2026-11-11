import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { HuhuEvent } from "@huhu/contracts";

export type EventTone = "success" | "error" | "neutral";
export interface EventRecord {
  id: string;
  time: string;
  /** 来源模块的中文名（任务、自动化、同步…）。 */
  module: string;
  message: string;
  tone: EventTone;
}

const MAX = 5000;

/**
 * 面向用户的事件日志（`.huhu/diagnostics/events.ndjson`，最近 5000 条）：最近活动与健康中心的事件日志共用。
 * 追加写；超出上限时整体原子重写。读取时跳过崩溃留下的半行。
 */
export class EventLog {
  private items: EventRecord[] | null = null;
  private appended = 0;
  /** 文件末尾没有换行（上次崩溃留下半行）：第一次追加先补一个换行，免得新记录接在半行后面被一起丢掉。 */
  private needsNewline = false;

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private load(): EventRecord[] {
    if (this.items) return this.items;
    const out: EventRecord[] = [];
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, "utf8").split("\n").filter(Boolean)) {
        try {
          out.push(JSON.parse(line) as EventRecord);
        } catch {
          // 崩溃时的半行
        }
      }
    }
    if (existsSync(this.file)) {
      const text = readFileSync(this.file, "utf8");
      this.needsNewline = text.length > 0 && !text.endsWith("\n");
    }
    this.items = out.slice(-MAX);
    return this.items;
  }

  append(r: Omit<EventRecord, "id" | "time">): EventRecord {
    const rec: EventRecord = { id: `ev-${randomUUID()}`, time: this.now().toISOString(), ...r };
    const list = this.load();
    list.push(rec);
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, (this.needsNewline ? "\n" : "") + JSON.stringify(rec) + "\n");
    this.needsNewline = false;
    this.appended++;
    if (this.appended >= 500 && list.length > MAX) {
      // 攒够一批再整理文件，避免每条都重写
      list.splice(0, list.length - MAX);
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, list.map((x) => JSON.stringify(x)).join("\n") + "\n");
      renameSync(tmp, this.file);
      this.appended = 0;
    }
    return rec;
  }

  /** 新的在前。 */
  list(q: { limit?: number | undefined; module?: string | undefined; query?: string | undefined } = {}): EventRecord[] {
    const needle = q.query?.trim().toLowerCase();
    return this.load()
      .filter((e) => (!q.module || e.module === q.module) && (!needle || `${e.message} ${e.module}`.toLowerCase().includes(needle)))
      .slice(-Math.max(1, Math.min(q.limit ?? 100, 1000)))
      .reverse();
  }

  modules(): string[] {
    return [...new Set(this.load().map((e) => e.module))].sort();
  }
}

const ENTITY_LABEL: Record<string, string> = { task: "任务", note: "笔记", archive: "档案", capture: "收件箱", "automation-rule": "自动化规则" };
const OP_LABEL: Record<string, string> = { created: "已创建", deleted: "已删除" }; // “更新”太频繁（笔记自动保存、任务勾选另有记录），不进日志
const PLUGIN_STATE: Record<string, string> = { active: "已启用", disabled: "已停用", failed: "出错" };
const RUN_STATE: Record<string, [string, EventTone]> = { succeeded: ["已完成", "success"], failed: ["失败", "error"], cancelled: ["已取消", "neutral"], waiting_input: ["在等你回答", "neutral"], unknown: ["结果无法确认", "error"] };
const SYNC_STATE: Record<string, [string, EventTone]> = { synced: ["已同步", "success"], conflict: ["出现冲突，需要处理", "error"], error: ["同步出错", "error"], paused: ["同步已暂停", "neutral"], syncing: ["正在同步", "neutral"] };

/**
 * 把引擎事件翻译成面向用户的一行记录；不面向用户的事件（文件监听、索引、终端状态抖动…）返回 null。
 * `titleOf` 让任务 / 档案等能带上标题（拿不到就只写类别）。
 */
export function describeEvent(e: Pick<HuhuEvent, "type" | "payload">, titleOf: (kind: string, id: string) => string | null = () => null): Omit<EventRecord, "id" | "time"> | null {
  const p = e.payload as Record<string, unknown>;
  const s = (k: string): string => String(p[k] ?? "");
  switch (e.type) {
    case "entity.changed": {
      const label = ENTITY_LABEL[s("kind")];
      if (!label || !OP_LABEL[s("op")]) return null;
      const title = titleOf(s("kind"), s("id"));
      return { module: label.replace("自动化规则", "自动化"), message: `${label}${title ? `「${title}」` : ""}${OP_LABEL[s("op")] ?? s("op")}`, tone: "neutral" };
    }
    case "task.completedChanged": {
      const title = titleOf("task", s("taskId"));
      return { module: "任务", message: `任务${title ? `「${title}」` : ""}${p["completed"] ? "已完成" : "已重新打开"}`, tone: p["completed"] ? "success" : "neutral" };
    }
    case "automation.activated":
      return { module: "自动化", message: `自动化规则已激活（${s("trigger") === "manual" ? "手动" : "定时"}）`, tone: "neutral" };
    case "run.stateChanged": {
      const st = RUN_STATE[s("state")];
      return st ? { module: "自动化", message: `Agent 运行${st[0]}`, tone: st[1] } : null;
    }
    case "reminder.due":
      return { module: "任务", message: `提醒：${s("title")}`, tone: "neutral" };
    case "plugin.stateChanged":
      return { module: "插件", message: `插件 ${s("id")} ${PLUGIN_STATE[s("state")] ?? s("state")}${p["error"] ? `：${s("error")}` : ""}`, tone: s("state") === "failed" ? "error" : "neutral" };
    case "sync.statusChanged": {
      const st = SYNC_STATE[s("status")];
      return st ? { module: "同步", message: st[0], tone: st[1] } : null;
    }
    case "ssh.connectionChanged":
      return s("state") === "connected" || s("state") === "failed" ? { module: "远程", message: `远程连接${s("state") === "connected" ? "已连接" : "失败"}`, tone: s("state") === "connected" ? "success" : "error" } : null;
    default:
      return null;
  }
}
