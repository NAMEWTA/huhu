/** Reader for SSH binary fields. The caller supplies the domain error for truncated input. */
export class SshFields {
  private offset = 0;

  constructor(
    private readonly bytes: Buffer,
    private readonly invalid: () => never,
  ) {}

  get position() {
    return this.offset;
  }

  get done() {
    return this.offset === this.bytes.length;
  }

  take(length: number): Buffer {
    if (length > this.bytes.length - this.offset) this.invalid();
    const begin = this.offset;
    this.offset += length;
    return this.bytes.subarray(begin, this.offset);
  }

  uint32() {
    return this.take(4).readUInt32BE(0);
  }

  uint64() {
    return this.take(8).readBigUInt64BE(0);
  }

  string() {
    return this.take(this.uint32());
  }
}
