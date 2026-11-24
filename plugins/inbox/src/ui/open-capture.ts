import type { EngineClient } from "@huhu/workbench";

const pending = new WeakMap<EngineClient, string>();
const listeners = new WeakMap<EngineClient, Set<(id: string) => void>>();

export function requestOpenCapture(engine: EngineClient, id: string) {
  const active = listeners.get(engine);
  if (!active?.size) pending.set(engine, id);
  else for (const open of active) open(id);
}

export function onOpenCaptureRequest(engine: EngineClient, open: (id: string) => void): () => void {
  const active = listeners.get(engine) ?? new Set<(id: string) => void>();
  active.add(open);
  listeners.set(engine, active);
  const id = pending.get(engine);
  pending.delete(engine);
  if (id !== undefined) open(id);
  return () => active.delete(open);
}
