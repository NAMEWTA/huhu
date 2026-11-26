import type { TerminalInput } from "@huhu/ui";

export type TerminalTarget = { id: string; label: string; sessionId: string; send: TerminalInput | undefined };

export function currentBroadcastTargets(selected: readonly TerminalTarget[], visible: readonly TerminalTarget[]): readonly TerminalTarget[] {
  if (selected.length < 2 || selected.some((before) => !before.send?.sendKeys || !visible.some((after) =>
    after.id === before.id && after.sessionId === before.sessionId && after.send === before.send
  ))) return [];
  return selected;
}

export function broadcastTerminalKey(targets: readonly TerminalTarget[], sourceId: string, keys: string) {
  if (!targets.some(({ id }) => id === sourceId)) return;
  for (const target of targets) if (target.id !== sourceId) target.send?.sendKeys?.(keys);
}
