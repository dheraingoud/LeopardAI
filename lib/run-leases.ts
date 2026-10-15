// Generation fence for late async work: a stale lease no-ops, so a superseded
// run's effects are dropped even though the work itself still resolves.
export type RunLease = {
  isCurrent(): boolean;
};

export class RunLeases {
  private _generation = 0;

  public begin(): RunLease {
    this._generation++;
    return this.current();
  }

  public current(): RunLease {
    const generation = this._generation;
    return { isCurrent: () => generation === this._generation };
  }

  public invalidate(): void {
    this._generation++;
  }

  public async fenced<T>(
    fn: (lease: RunLease) => Promise<T>,
  ): Promise<T | undefined> {
    const lease = this.current();
    const result = await fn(lease);
    return lease.isCurrent() ? result : undefined;
  }
}
