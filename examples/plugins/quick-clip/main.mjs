// 快速剪藏：只申请 inbox.write；调用其他能力（例如 notes.save）会得到 PERMISSION_DENIED。
export function activate(api) {
  api.registerCommand("clip", "快速剪藏：收集一条想法", async (args) => {
    const body = typeof args.text === "string" && args.text.trim() ? args.text.trim() : "来自快速剪藏的想法";
    const item = await api.call("inbox.capture", { body });
    return { captured: item.id, title: item.title };
  });
}
