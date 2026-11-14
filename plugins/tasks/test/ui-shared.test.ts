import type { TaskDto } from "@huhu/contracts";
import { describe, expect, test } from "vitest";
import { groupByDue, monthGrid, shiftMonth } from "../src/shared/calendar.js";
import { buildCandidates, scorePath, searchCandidates } from "../src/shared/references.js";
import { matchesQuery } from "../src/shared/search.js";

describe("月历", () => {
  test("2026-11：周一起、6 行 7 列，11 月 1 日是周日所以排在第一行末尾", () => {
    const g = monthGrid(2026, 11);
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]?.[0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(g[0]?.[6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(30);
  });
  test("月份加减跨年；按 due 投影，无截止日的不出现", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    const m = groupByDue([{ due: "2026-11-10" }, { due: null }, { due: "2026-11-10" }]);
    expect(m.get("2026-11-10")).toHaveLength(2);
    expect(m.size).toBe(1);
  });
});

describe("搜索", () => {
  test("多个词都要命中；标题、正文、项目都参与；不区分大小写", () => {
    const t = { title: "写周报", body: "整理 Notes", project: "工作" };
    expect(matchesQuery(t, "")).toBe(true);
    expect(matchesQuery(t, "周报 工作")).toBe(true);
    expect(matchesQuery(t, "notes")).toBe(true);
    expect(matchesQuery(t, "周报 家庭")).toBe(false);
  });
});

describe("@ 引用候选搜索", () => {
  const c = buildCandidates([
    { path: "Notes/周报.md", type: "file" },
    { path: "Notes", type: "dir" },
    { path: "Archive/周报备份.md", type: "file" },
    { path: ".huhu/index.json", type: "file" },
  ]);
  test("内部目录不出现；文件夹与文件都可作为候选", () => {
    expect(c.map((x) => x.kind).sort()).toEqual(["file", "file", "folder"]);
    expect(c.some((x) => x.path.startsWith(".huhu"))).toBe(false);
  });
  test("文件名完全匹配优先于路径包含；多个词缩小范围；不匹配的不出现", () => {
    expect(scorePath("Notes/周报.md", "周报.md")).toBe(1);
    expect(scorePath("Notes/周报.md", "notes")).toBe(2);
    expect(scorePath("Notes/周报.md", "zzz")).toBeNull();
    expect(searchCandidates(c, "周报").map((x) => x.path)).toEqual(["Archive/周报备份.md", "Notes/周报.md"]); // 同档按路径排序
    expect(searchCandidates(c, "周报 notes").map((x) => x.path)).toEqual(["Notes/周报.md"]);
    expect(searchCandidates(c, "", 2)).toHaveLength(2);
    const many = buildCandidates(Array.from({ length: 30 }, (_, i) => ({ path: `n${i}.md`, type: "file" as const, mtimeMs: i })));
    const recent = searchCandidates(many, "");
    expect(recent).toHaveLength(20); // 最近 20 项
    expect(recent[0]?.path).toBe("n29.md");
  });
});

import { draftFromTask, draftToWritable, emptyDraft, validateDraft } from "../src/shared/draft.js";

describe("编辑表单", () => {
  test("human 任务：标题必填；保存内容裁掉首尾空白，项目为空存 null，不带执行配置", () => {
    expect(validateDraft(emptyDraft())).toEqual(["title"]);
    const w = draftToWritable(emptyDraft({ title: "  买菜 ", project: " ", tags: ["#家务", "家务"] }));
    expect(w).toMatchObject({ title: "买菜", type: "human", project: null, execution: null, tags: ["家务"], reminders: [] });
  });
  test("agent 任务必须有 Space 和 CLI；提醒必须选了时间", () => {
    expect(validateDraft(emptyDraft({ title: "x", type: "agent" }))).toEqual(["space", "provider"]);
    expect(validateDraft(emptyDraft({ title: "x", reminders: [{ id: "r1", at: null, enabled: true, deliveredAt: null }] }))).toEqual(["reminder"]);
    const ok = emptyDraft({ title: "x", type: "agent", spaceId: "s1", provider: "claude", model: "m" });
    expect(validateDraft(ok)).toEqual([]);
    expect(draftToWritable(ok).execution).toEqual({ spaceId: "s1", provider: "claude", model: "m", effort: null, fast: false });
  });
  test("任务 ↔ 表单往返不丢字段", () => {
    const task: TaskDto = {
      id: "t",
      path: "Tasks/t.md",
      version: "v",
      title: "T",
      body: "正文 [[Notes/a.md]]",
      type: "agent",
      status: "not_started",
      completedAt: null,
      tags: ["周报"],
      due: "2026-11-12",
      project: "工作",
      origin: { kind: "desktop" },
      execution: { spaceId: "s", provider: "codex", model: null, effort: null, fast: false },
      reminders: [{ id: "r", channel: "in_app", at: "2026-11-12T01:00:00Z", enabled: true, deliveredAt: null }],
      inputRevision: 1,
      inputHash: "h",
      createdAt: "",
      updatedAt: "",
      readOnly: false,
      comments: [],
      references: [],
      problems: [],
      dispatchBlockers: [],
    };
    const w = draftToWritable(draftFromTask(task));
    expect(w).toMatchObject({ title: "T", body: "正文 [[Notes/a.md]]", type: "agent", tags: ["周报"], due: "2026-11-12", project: "工作", execution: { spaceId: "s", provider: "codex" }, reminders: task.reminders });
  });
});
