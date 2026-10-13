// Generation fence for late async work (aui RunLeases pattern). `begin()`
// advances the generation and returns a lease for the new run; `current()`
// captures the generation as-is; `invalidate()` advances without starting.
// A lease stays current until the next begin() or invalidate().
//
// Use: any async continuation checks lease.isCurrent() before touching state.
// A stale lease no-ops — the async work resolves but its effects are dropped.
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
}
