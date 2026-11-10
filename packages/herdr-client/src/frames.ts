/** framed 模式帧：`[channel u32 LE][kind u8][len u32 LE][payload]`，payload 至多 16 MiB（herdr-core schema/README.md）。 */
export const FrameKind = { DATA: 0, CREDIT: 1, CLOSE: 2, RESIZE: 3, FOCUS: 4, FACTS: 5, AUTOMATIC_INPUT: 6 } as const;
export const MAX_PAYLOAD = 16 * 1024 * 1024;
const HEADER = 9;

export interface Frame {
  channel: number;
  kind: number;
  payload: Buffer;
}

export function encodeFrame(f: Frame): Buffer {
  if (f.payload.length > MAX_PAYLOAD) throw new RangeError("帧载荷超过 16 MiB");
  const out = Buffer.allocUnsafe(HEADER + f.payload.length);
  out.writeUInt32LE(f.channel, 0);
  out.writeUInt8(f.kind, 4);
  out.writeUInt32LE(f.payload.length, 5);
  f.payload.copy(out, HEADER);
  return out;
}

export const creditFrame = (channel: number, consumed: number): Buffer => {
  const p = Buffer.alloc(4);
  p.writeUInt32LE(consumed, 0);
  return encodeFrame({ channel, kind: FrameKind.CREDIT, payload: p });
};

export const resizeFrame = (channel: number, cols: number, rows: number): Buffer => {
  const p = Buffer.alloc(4);
  p.writeUInt16LE(cols, 0);
  p.writeUInt16LE(rows, 2);
  return encodeFrame({ channel, kind: FrameKind.RESIZE, payload: p });
};

/** 增量解码器：字节流任意切分都能还原帧；长度非法抛错。 */
export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Frame[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const frames: Frame[] = [];
    for (;;) {
      if (this.buf.length < HEADER) break;
      const len = this.buf.readUInt32LE(5);
      if (len > MAX_PAYLOAD) throw new RangeError(`帧长度非法：${len}`);
      if (this.buf.length < HEADER + len) break;
      frames.push({ channel: this.buf.readUInt32LE(0), kind: this.buf.readUInt8(4), payload: Buffer.from(this.buf.subarray(HEADER, HEADER + len)) });
      this.buf = this.buf.subarray(HEADER + len);
    }
    return frames;
  }
}
