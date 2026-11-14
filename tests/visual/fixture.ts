import { cpSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 确定性的固定 Vault：所有时间与 id 都写死，保证两次运行得到同样的界面数据。 */
const T0 = "2026-11-10T08:00:00Z";

type Seed = { id: string; title: string; type?: "human" | "agent"; status?: "not_started" | "in_progress" | "completed"; project?: string; due?: string; tags?: string[]; body?: string };

function taskFile(s: Seed): string {
  const done = s.status === "completed";
  return `---
huhu:
  kind: task
  id: ${s.id}
  schema: 2
title: ${s.title}
type: ${s.type ?? "human"}
status: ${s.status ?? "not_started"}
completedAt: ${done ? "2026-11-12T08:00:00Z" : "null"}
tags: [${(s.tags ?? []).join(", ")}]
due: ${s.due ?? "null"}
project: ${s.project ?? "null"}
origin:
  kind: desktop
execution: null
reminders: []
inputRevision: 1
createdAt: ${T0}
updatedAt: ${T0}
---

<task>
${s.body ?? "固定正文。"}
</task>
`;
}

export const TASKS: Seed[] = [
  { id: "task-fix000001", title: "整理本周计划", project: "日常", due: "2026-11-20", tags: ["计划"], body: "列出三件最重要的事。\n\n- [ ] 周一\n- [ ] 周二" },
  { id: "task-fix000002", title: "回复客户邮件", project: "客户", due: "2026-11-09", tags: ["邮件", "紧急"] },
  { id: "task-fix000003", title: "撰写发布说明", project: "发布", status: "in_progress", due: "2026-11-25" },
  { id: "task-fix000004", title: "代码审查：任务模块", type: "agent", project: "发布", status: "in_progress" },
  { id: "task-fix000005", title: "整理收件箱", project: "日常", status: "completed" },
  { id: "task-fix000006", title: "没有项目的任务" },
];

export function seedVault(vault: string): void {
  cpSync(path.resolve(import.meta.dirname, "../../apps/desktop/resources/demo-vault"), vault, { recursive: true }); // 随包 demo vault：含“通讯录”档案示例
  mkdirSync(path.join(vault, "Tasks"), { recursive: true });
  for (const t of TASKS) writeFileSync(path.join(vault, "Tasks", `${t.title}--${t.id}.md`), taskFile(t));
  writeFileSync(path.join(vault, "示例笔记.md"), "# 示例笔记\n\n这是一段**固定**的正文，含 [[欢迎]] 链接与 `代码`。\n\n- 列表一\n- 列表二\n\n> 引用\n");
  writeFileSync(path.join(vault, "欢迎.md"), "# 欢迎\n\n回到 [[示例笔记]]。\n");
  fixMtimes(vault);
}

/** 把 Vault 里所有文件与目录的修改时间固定下来（界面会显示“修改时间”，复制时间每次不同）。 */
export function fixMtimes(dir: string, when = new Date("2026-11-10T08:00:00Z")): void {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) fixMtimes(p, when);
    utimesSync(p, when, when);
  }
  utimesSync(dir, when, when);
}
