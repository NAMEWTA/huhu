import type { z } from "zod";
import { ArchiveFrontmatterSchema, ArchiveTypeFrontmatterSchema } from "./archive.js";
import { AutomationRuleFrontmatterSchema, AutomationRunFrontmatterSchema } from "./automation.js";
import { CaptureFrontmatterSchema, CommentFrontmatterSchema } from "./capture.js";
import type { KindName } from "./common.js";
import { TaskFrontmatterSchema } from "./task.js";
import { TaskRunFrontmatterSchema } from "./task-run.js";

export * from "./archive.js";
export * from "./automation.js";
export * from "./capture.js";
export * from "./common.js";
export * from "./task.js";
export * from "./task-run.js";

export interface KindSpec {
  dir: string;
  plugin: string;
  /** 当前代码支持的 schema 版本；文件版本更高则只读。 */
  currentSchema: number;
  schema: z.ZodType;
  /** 文件名前缀字段（标题类字段），文件名规则 `<标题>--<id>.md`。 */
  titleField: string;
}

/** 各 kind 的目录、所属插件与模式；data-model.md §4 的唯一实现。 */
export const KINDS: Readonly<Record<KindName, KindSpec>> = {
  task: { dir: "Tasks", plugin: "tasks", currentSchema: 1, schema: TaskFrontmatterSchema, titleField: "title" },
  "task-run": { dir: "Task Runs", plugin: "automations", currentSchema: 1, schema: TaskRunFrontmatterSchema, titleField: "taskId" },
  "automation-rule": { dir: "Automations", plugin: "automations", currentSchema: 1, schema: AutomationRuleFrontmatterSchema, titleField: "title" },
  "automation-run": { dir: "Automation Runs", plugin: "automations", currentSchema: 1, schema: AutomationRunFrontmatterSchema, titleField: "ruleId" },
  "archive-type": { dir: "Archive Types", plugin: "archives", currentSchema: 1, schema: ArchiveTypeFrontmatterSchema, titleField: "name" },
  archive: { dir: "Archives", plugin: "archives", currentSchema: 1, schema: ArchiveFrontmatterSchema, titleField: "name" },
  capture: { dir: "Inbox", plugin: "inbox", currentSchema: 1, schema: CaptureFrontmatterSchema, titleField: "title" },
  comment: { dir: "Comments", plugin: "notes", currentSchema: 1, schema: CommentFrontmatterSchema, titleField: "documentId" },
};
