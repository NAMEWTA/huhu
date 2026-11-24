import type { HuhuEvent } from "@huhu/contracts";

export const REPLAY_BUFFER = 1000;
export const EVENT_REPLAY_BYTES = 4 * 1024 * 1024;
export const EVENT_SOCKET_BYTES = 1024 * 1024;
const MAX_SERVER_FRAME_HEADER_BYTES = 10;

export interface SeqEvent {
  seq: number;
  event: HuhuEvent;
}

export interface EventFrame {
  text: string;
  bytes: number;
}

export function eventFrame(message: object): EventFrame {
  const text = JSON.stringify(message);
  return { text, bytes: Buffer.byteLength(text) + MAX_SERVER_FRAME_HEADER_BYTES };
}

type ReplayEvent = SeqEvent & { frame: EventFrame };

/** Bound recent events by count and encoded bytes. A past gap requires a fresh workbench snapshot. */
export class EventReplay {
  private buffer: ReplayEvent[] = [];
  private bytes = 0;
  private seq = 0;
  /** 每次监听器启动生成代次，带回不同代次的客户端需要重读快照。 */
  readonly epoch = Math.random().toString(36).slice(2, 10);

  push(event: HuhuEvent): SeqEvent & { frame?: EventFrame } {
    const entry = { seq: ++this.seq, event };
    const frame = eventFrame({ seq: entry.seq, ...event });
    if (frame.bytes > EVENT_SOCKET_BYTES) {
      // A single frame that exceeds the connection budget cannot be replayed.
      this.buffer = [];
      this.bytes = 0;
      return entry;
    }
    const wire = { ...entry, frame };
    this.buffer.push(wire);
    this.bytes += frame.bytes;
    while (this.buffer.length > REPLAY_BUFFER || this.bytes > EVENT_REPLAY_BYTES) {
      this.bytes -= this.buffer.shift()!.frame.bytes;
    }
    return wire;
  }

  get lastSeq(): number {
    return this.seq;
  }

  since(lastSeq: number): { resync: true } | { resync: false; events: ReplayEvent[] } {
    const oldest = this.buffer[0]?.seq ?? this.seq + 1;
    if (!Number.isInteger(lastSeq) || lastSeq < 0 || lastSeq > this.seq || lastSeq < oldest - 1) return { resync: true };
    return { resync: false, events: this.buffer.filter((e) => e.seq > lastSeq) };
  }
}
