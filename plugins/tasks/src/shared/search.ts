/** 任务搜索：标题、正文、项目；多个词用空白分隔，全部命中才算（不区分大小写）。 */
export function matchesQuery(task: { title: string; body: string; project: string | null }, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${task.title}\n${task.body}\n${task.project ?? ""}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}
