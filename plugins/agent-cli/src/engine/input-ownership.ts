type LocalOwner = "manual" | "review";

/** The Vault has one Engine writer. Claims are synchronous so an input write and a competing claim cannot both start. */
export class InputOwnership {
  private readonly local = new Map<string, LocalOwner>();

  constructor(
    private readonly taskOwner: (sessionId: string) => string | undefined,
    private readonly hasPendingReview: (sessionId: string) => boolean,
  ) {}

  take(sessionId: string, owner: LocalOwner): (() => void) | undefined {
    if (this.local.has(sessionId) || this.taskOwner(sessionId) || (owner === "manual" && this.hasPendingReview(sessionId))) return undefined;
    this.local.set(sessionId, owner);
    return () => this.local.delete(sessionId);
  }

  availableForTask(sessionId: string, dispatchId?: string): boolean {
    const owner = this.taskOwner(sessionId);
    return (!owner || owner === dispatchId) && !this.local.has(sessionId) && !this.hasPendingReview(sessionId);
  }

  hasTask(sessionId: string, dispatchId?: string): boolean {
    const owner = this.taskOwner(sessionId);
    return owner !== undefined && (dispatchId === undefined || owner === dispatchId);
  }
}
