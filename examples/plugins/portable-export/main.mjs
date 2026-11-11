// 便携导出：notes.list + notes.read 合并为单个 Markdown；通过返回值里的 saveFile 请求桌面保存对话框。
export function activate(api) {
  api.registerCommand("export", "便携导出：合并全部笔记为一个 Markdown", async () => {
    const notes = await api.call("notes.list", { filter: "all" });
    const parts = [];
    for (const n of notes) {
      const f = await api.call("notes.read", { path: n.path });
      parts.push(`<!-- ${n.path} -->\n\n${f.text.trim()}\n`);
    }
    return { saveFile: { name: "HUHU-便携导出.md", content: parts.join("\n---\n\n") }, count: notes.length };
  });
}
