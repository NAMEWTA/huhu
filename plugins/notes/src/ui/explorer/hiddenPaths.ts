/** hiddenPaths 规则的纯逻辑（A02）：规则是规范相对路径，目录规则作用于整棵子树。 */
const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export function isHiddenPath(path: string, rules: readonly string[]): boolean {
  const p = norm(path);
  return rules.some((r) => p === r || p.startsWith(`${r}/`));
}

/** 加入一条规则；已被祖先规则覆盖则不变；新规则会吞掉它的后代规则。 */
export function addHiddenRule(rules: readonly string[], path: string): string[] {
  const p = norm(path);
  if (!p || isHiddenPath(p, rules)) return [...rules];
  return [...rules.filter((r) => !r.startsWith(`${p}/`)), p].sort();
}

/** 取消隐藏：移除该规则本身；若是被祖先规则覆盖的后代，则拆祖先——这里不猜测，保持祖先规则并返回 null 让 UI 提示“请取消上层目录的隐藏”。 */
export function removeHiddenRule(rules: readonly string[], path: string): string[] | null {
  const p = norm(path);
  if (rules.includes(p)) return rules.filter((r) => r !== p);
  return isHiddenPath(p, rules) ? null : [...rules];
}
