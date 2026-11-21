// 每日回顾：tasks.list + notes.list 汇总，notes.create + notes.save 写出回顾笔记。
const today = () => new Date().toISOString().slice(0, 10);

export function activate(api) {
  api.registerCommand("generate", async (_args, context) => {
    const tasks = await context.call("tasks.list", { status: ["not_started", "in_progress"] }, "list-tasks");
    const notes = await context.call("notes.list", { filter: "all" }, "list-notes");
    const name = `每日回顾 ${today()}`;
    const created = await context.call("notes.create", { name, folder: "回顾" }, "create-note");
    const file = await context.call("notes.read", { path: created.path }, "read-note");
    const lines = [`# ${name}`, "", `共有 ${notes.length} 篇笔记，${tasks.length} 项未完成任务。`, "", "## 未完成任务", "", ...(tasks.length ? tasks.slice(0, 20).map((t) => `- [ ] ${t.title}`) : ["- （没有）"]), ""];
    await context.call("notes.save", { path: created.path, text: lines.join("\n"), expectedVersion: file.version }, "save-note");
    return { path: created.path, tasks: tasks.length, notes: notes.length };
  });
}
