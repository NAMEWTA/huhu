import type { HuhuEvent } from "@huhu/contracts";

export const REPLAY_BUFFER = 1000;

export interface SeqEvent {
  seq: number;
  event: HuhuEvent;
}

/** 保留最近 1000 条事件；重连带 lastSeq 补发，超出范围返回 resync。 */
export class EventReplay {
  private buffer: SeqEvent[] = [];
  private seq = 0;

  push(event: HuhuEvent): SeqEvent {
    const e = { seq: ++this.seq, event };
    this.buffer.push(e);
    if (this.buffer.length > REPLAY_BUFFER) this.buffer.shift();
    return e;
  }

  get lastSeq(): number {
    return this.seq;
  }

  since(lastSeq: number): { resync: true } | { resync: false; events: SeqEvent[] } {
    const oldest = this.buffer[0]?.seq ?? this.seq + 1;
    if (!Number.isInteger(lastSeq) || lastSeq < 0 || lastSeq > this.seq) return { resync: true }; // Engine 重启后序号倒退
    if (lastSeq < oldest - 1) return { resync: true };
    return { resync: false, events: this.buffer.filter((e) => e.seq > lastSeq) };
  }
}
