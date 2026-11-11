// 每日回顾：tasks.list + notes.list 汇总，notes.create + notes.save 写出回顾笔记。
const today = () => new Date().toISOString().slice(0, 10);

export function activate(api) {
  api.registerCommand("generate", "每日回顾：生成今天的回顾笔记", async () => {
    const tasks = await api.call("tasks.list", { completed: false });
    const notes = await api.call("notes.list", { filter: "all" });
    const name = `每日回顾 ${today()}`;
    const created = await api.call("notes.create", { name, folder: "回顾" });
    const file = await api.call("notes.read", { path: created.path });
    const lines = [`# ${name}`, "", `共有 ${notes.length} 篇笔记，${tasks.length} 项未完成任务。`, "", "## 未完成任务", "", ...(tasks.length ? tasks.slice(0, 20).map((t) => `- [ ] ${t.title}`) : ["- （没有）"]), ""];
    await api.call("notes.save", { path: created.path, text: lines.join("\n"), expectedVersion: file.version });
    return { path: created.path, tasks: tasks.length, notes: notes.length };
  });
}
