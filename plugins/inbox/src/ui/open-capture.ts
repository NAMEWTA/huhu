import type { EngineClient } from "@huhu/workbench";

const pending = new WeakMap<EngineClient, string>();

export function requestOpenCapture(engine: EngineClient, id: string) {
  pending.set(engine, id);
}

export function takeOpenCapture(engine: EngineClient) {
  const id = pending.get(engine);
  pending.delete(engine);
  return id;
}
