/** 串行执行同一身份下的读取、校验和提交。不同任务可以同时写入。 */
export class WriteQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(id: string, write: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(write);
    this.tails.set(id, next);
    try {
      return await next;
    } finally {
      if (this.tails.get(id) === next) this.tails.delete(id);
    }
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.tails.values());
  }
}
