export function resolveHostTargets(availableHostIds: readonly string[], selectedHostIds: readonly string[], contextHostId?: string): string[] {
  const available = new Set(availableHostIds);
  const selected = [...new Set(selectedHostIds)].filter((id) => available.has(id));
  if (contextHostId === undefined) return selected;
  if (!available.has(contextHostId)) return [];
  return selected.includes(contextHostId) ? selected : [contextHostId];
}
