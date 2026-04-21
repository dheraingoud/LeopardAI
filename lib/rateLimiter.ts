export class ClientRateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs = 60_000;
  private readonly maxRequests = 35;

  /** Returns true if a new request can be made immediately. */
  canRequest(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return this.timestamps.length < this.maxRequests;
  }

  /** Records that a request was just made. */
  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  /** How many requests are still available in the current window. */
  getRemainingRequests(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Milliseconds to wait until the oldest slot expires.
   * Returns 0 if `canRequest()` would return true.
   */
  getMsUntilNextSlot(): number {
    if (this.canRequest()) return 0;
    const oldest = this.timestamps[0] ?? Date.now();
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }
}

export const rateLimiter = new ClientRateLimiter();