// P-S2a-srv：上游 agent-activity.ts 里 pre-drain-discriminator 只用到 walkYTextItems 与 YjsStackItemShape，其余（AI 会话 diff）不适用，已删。
import type * as Y from 'yjs';
import type { Item } from 'yjs';
export interface YjsDeleteSetShape {
  clients: Map<number, Array<{ clock: number; len: number }>>;
}
export interface YjsStackItemShape {
  insertions: YjsDeleteSetShape;
  deletions: YjsDeleteSetShape;
  meta: Map<unknown, unknown>;
}

export function* walkYTextItems(ytext: Y.Text): IterableIterator<Item> {
  let cursor = (ytext as unknown as { _start: Item | null })._start;
  while (cursor !== null) {
    yield cursor;
    cursor = cursor.right;
  }
}

