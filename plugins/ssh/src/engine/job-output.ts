import { StringDecoder } from "node:string_decoder";
import { errors } from "@huhu/contracts";

const retentionBytes = 64 * 1024;

function isContinuation(byte: number) {
  return (byte & 0xc0) === 0x80;
}

export function unavailableOutput(cursor: number, endCursor: number) {
  if (cursor > endCursor) throw errors.invalidInput("输出游标超出已接收的字节");
  return { fromCursor: endCursor, nextCursor: endCursor, endCursor, skippedBytes: endCursor - cursor, truncated: endCursor > 0, text: "" };
}

/** Cursors count emitted UTF-8 bytes, including U+FFFD for malformed input. */
export class ExecOutput {
  private readonly decoder = new StringDecoder("utf8");
  private readonly ring = Buffer.allocUnsafe(retentionBytes);
  private position = 0;

  get endCursor() {
    return this.position;
  }

  append(data: Buffer): void {
    this.appendText(this.decoder.write(data));
  }

  finish(): void {
    this.appendText(this.decoder.end());
  }

  private appendText(text: string) {
    if (!text) return;
    const bytes = Buffer.from(text);
    const start = Math.max(0, bytes.length - retentionBytes);
    const offset = (this.position + start) % retentionBytes;
    const firstEnd = Math.min(bytes.length, start + retentionBytes - offset);
    bytes.copy(this.ring, offset, start, firstEnd);
    if (firstEnd < bytes.length) bytes.copy(this.ring, 0, firstEnd);
    this.position += bytes.length;
  }

  read(cursor: number, limit: number) {
    const endCursor = this.position;
    if (cursor > endCursor) throw errors.invalidInput("输出游标超出已接收的字节");
    const oldest = Math.max(0, endCursor - retentionBytes);
    const byteAt = (offset: number) => this.ring[offset % retentionBytes]!;
    let from = Math.max(cursor, oldest);
    while (from < endCursor && isContinuation(byteAt(from))) from++;
    let next = Math.min(endCursor, from + limit);
    while (next < endCursor && next > from && isContinuation(byteAt(next))) next--;
    const bytes = Buffer.allocUnsafe(next - from);
    const offset = from % retentionBytes;
    const first = Math.min(bytes.length, retentionBytes - offset);
    this.ring.copy(bytes, 0, offset, offset + first);
    if (first < bytes.length) this.ring.copy(bytes, first, 0, bytes.length - first);
    return { fromCursor: from, nextCursor: next, endCursor, skippedBytes: from - cursor, truncated: oldest > 0, text: bytes.toString("utf8") };
  }
}
