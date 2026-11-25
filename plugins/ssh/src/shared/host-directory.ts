type SearchableHost = { name: string; host: string; port: number; user: string; tags?: readonly string[] | undefined };

export function hostSearchTerms(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesHostSearch(host: SearchableHost, terms: readonly string[]) {
  if (!terms.length) return true;
  const address = host.host.includes(":") ? `[${host.host}]:${host.port}` : `${host.host}:${host.port}`;
  const fields = [host.name, host.user, host.host, address, `${host.user}@${address}`, ...(host.tags ?? [])].map((field) => field.toLowerCase());
  return terms.every((term) => fields.some((field) => field.includes(term)));
}

export function groupsInScope(groups: readonly { groupId: string; parentId: string | null }[], groupId: string) {
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (group.parentId === null) continue;
    const siblings = children.get(group.parentId) ?? [];
    siblings.push(group.groupId);
    children.set(group.parentId, siblings);
  }
  const ids = new Set([groupId]);
  for (const id of ids) for (const child of children.get(id) ?? []) ids.add(child);
  return ids;
}

export function directoryGroupPath(groups: ReadonlyMap<string, { name: string; parentId: string | null }>, groupId: string | null | undefined) {
  const seen = new Set<string>();
  const names: string[] = [];
  while (groupId && !seen.has(groupId)) {
    const group = groups.get(groupId);
    if (!group) break;
    seen.add(groupId);
    names.push(group.name);
    groupId = group.parentId;
  }
  return names.reverse().join(" / ");
}
