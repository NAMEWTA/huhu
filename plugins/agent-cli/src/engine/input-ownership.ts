type LocalOwner = "manual" | "review";
type LocalClaim = { owner: LocalOwner; controlId?: string; previous?: LocalClaim; notifyWhenReleased?: () => void; onReviewRecovered?: () => void };

/** The Vault has one Engine writer. Claims are synchronous so an input write and a competing claim cannot both start. */
export class InputOwnership {
  private readonly local = new Map<string, LocalClaim>();

  constructor(
    private readonly taskOwner: (sessionId: string) => string | undefined,
    private readonly hasPendingReview: (sessionId: string) => boolean,
  ) {}

  take(sessionId: string, owner: LocalOwner, controlId?: string, options?: { recovering?: boolean; onReviewRecovered?: () => void }): ((onReleased?: () => void) => void) | undefined {
    if (this.taskOwner(sessionId)) return undefined;
    const current = this.local.get(sessionId);
    if (owner === "review" && controlId !== undefined) {
      if (current?.owner !== "manual" || current.controlId !== controlId) return undefined;
      if (current.onReviewRecovered && !options?.recovering) return undefined;
      // Keep the original viewer reserved while Core serializes its keyboard input and the review submission.
      const review: LocalClaim = { owner, previous: current };
      this.local.set(sessionId, review);
      return () => {
        if (this.local.get(sessionId) !== review) return;
        if (review.previous) {
          this.local.set(sessionId, review.previous);
          this.notifyReviewRecovered(sessionId);
        } else {
          this.local.delete(sessionId);
          review.notifyWhenReleased?.();
        }
      };
    }
    if (current || (owner === "manual" && this.hasPendingReview(sessionId) && !options?.onReviewRecovered)) return undefined;
    const claim: LocalClaim = { owner, ...(controlId !== undefined && { controlId }), ...(options?.onReviewRecovered && { onReviewRecovered: options.onReviewRecovered }) };
    this.local.set(sessionId, claim);
    return (onReleased) => {
      const active = this.local.get(sessionId);
      if (active === claim) {
        this.local.delete(sessionId);
        onReleased?.();
      } else if (active?.previous === claim) {
        delete active.previous;
        if (onReleased) active.notifyWhenReleased = onReleased;
      }
    };
  }

  notifyReviewRecovered(sessionId: string): void {
    const reconnect = this.local.get(sessionId)?.onReviewRecovered;
    if (reconnect && !this.hasPendingReview(sessionId)) reconnect();
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
