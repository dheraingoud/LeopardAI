// Ported from assistant-ui optimistic-state.ts — self-contained, no aui imports.

export type Unsubscribe = () => void;

type Transform<TState, TResult> = {
  execute: () => Promise<TResult>;
  then?: (state: TState, result: TResult) => TState;
  optimistic?: (state: TState) => TState;
  loading?: (state: TState, task: Promise<TResult>) => TState;
};

type PendingTransform<TState, TResult> = Transform<TState, TResult> & {
  order: number;
  task: Promise<TResult>;
};

type CompletedOptimistic<TState> = {
  order: number;
  optimistic: (state: TState) => TState;
};

const pipeTransforms = <TState, TExtra>(
  initialState: TState,
  extraParam: TExtra,
  transforms: (((state: TState, extra: TExtra) => TState) | undefined)[],
): TState =>
  transforms.reduce((state, t) => t?.(state, extraParam) ?? state, initialState);

export class OptimisticState<TState> {
  private _subscribers = new Set<() => void>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _pendingTransforms: Array<PendingTransform<TState, any>> = [];
  // Completed optimistic callbacks replay over the base value while any
  // transform is pending; dropped once the last transform settles.
  // `optimistic` callbacks must be idempotent.
  private readonly _completedOptimistics: Array<CompletedOptimistic<TState>> = [];
  private _nextTransformOrder = 0;
  private _epoch = 0;

  private _baseValue: TState;
  private _cachedValue: TState;

  public constructor(initialState: TState) {
    this._baseValue = initialState;
    this._cachedValue = initialState;
  }

  public subscribe(callback: () => void): Unsubscribe {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  private _notifySubscribers(): void {
    for (const cb of [...this._subscribers]) {
      cb();
    }
  }

  private _updateState(): void {
    const activeTransforms = [
      ...this._pendingTransforms.map((t) => ({
        order: t.order,
        apply: (state: TState) =>
          pipeTransforms(state, t.task, [t.loading, t.optimistic]),
      })),
      ...this._completedOptimistics.map(({ order, optimistic }) => ({
        order,
        apply: optimistic,
      })),
    ].sort((a, b) => a.order - b.order);

    this._cachedValue = activeTransforms.reduce(
      (state, t) => t.apply(state),
      this._baseValue,
    );
    this._notifySubscribers();
  }

  public get baseValue(): TState {
    return this._baseValue;
  }

  public get value(): TState {
    return this._cachedValue;
  }

  public update(state: TState): void {
    this._baseValue = state;
    this._updateState();
  }

  public reset(state: TState): void {
    // In-flight optimisticUpdate calls must not write into the replacement state.
    this._epoch++;
    this._pendingTransforms.length = 0;
    this._completedOptimistics.length = 0;
    this._baseValue = state;
    this._cachedValue = state;
    this._notifySubscribers();
  }

  public async optimisticUpdate<TResult>(
    transform: Transform<TState, TResult>,
  ): Promise<TResult> {
    const epoch = this._epoch;
    const order = this._nextTransformOrder++;
    const task = transform.execute();
    const pendingTransform: PendingTransform<TState, TResult> = {
      ...transform,
      order,
      task,
    };
    try {
      this._pendingTransforms.push(pendingTransform);
      this._updateState();

      const result = await task;
      if (epoch !== this._epoch) return result;
      this._baseValue = pipeTransforms(this._baseValue, result, [
        transform.optimistic,
        transform.then,
      ]);

      // `then` can replace state with a stale snapshot, so replay every
      // completed effect; otherwise replay only newer overlapping effects.
      for (const completed of this._completedOptimistics) {
        if (transform.then || completed.order > pendingTransform.order) {
          this._baseValue = completed.optimistic(this._baseValue);
        }
      }

      if (transform.optimistic) {
        this._completedOptimistics.push({
          order: pendingTransform.order,
          optimistic: transform.optimistic,
        });
        this._completedOptimistics.sort((a, b) => a.order - b.order);
      }

      return result;
    } finally {
      const index = this._pendingTransforms.indexOf(pendingTransform);
      if (index > -1) {
        this._pendingTransforms.splice(index, 1);
      }

      try {
        this._updateState();
      } finally {
        if (this._pendingTransforms.length === 0) {
          this._completedOptimistics.length = 0;
        }
      }
    }
  }
}
