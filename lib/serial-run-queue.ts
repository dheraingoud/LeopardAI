// Serial turn queue (aui react-langgraph SerialRunQueue pattern, ported 2026-10-15).
//
// Why: Leopard's composer could fire a second turn while the first was still
// streaming. The SDK's own guard makes that a no-op or a race depending on
// status timing, so the user sees "sent" and nothing happens — or two bubbles
// fight over one assistant slot. A queue makes the rule explicit: at most one
// turn is in flight, and a payload enqueued while one runs WAITS for it.
//
// The subtle part is `onRunningChange`. Back-to-back sends must read as ONE
// continuous running window, not running → idle → running, or the composer
// flickers between send and stop mid-typing. So the callback fires only on
// real transitions, and a run's own completion reports `false` only when
// nothing else is queued behind it.
//
// Failure policy: a run that rejects drops every payload queued behind it
// (their promises reject) and rejects its own. `drop()` does the same for
// everything not yet started, leaving an active run untouched — that is the
// stop-generation path: kill what is queued, let the live turn finish settling.

export class SerialRunQueueDropError extends Error {
  constructor() {
    super("Queued run was dropped.");
    this.name = "SerialRunQueueDropError";
  }
}

type QueuedRun<TPayload> = {
  payload: TPayload;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

export type SerialRunQueue<TPayload> = {
  /** Resolves once THIS payload's run has completed. */
  enqueue(payload: TPayload): Promise<void>;
  /** Rejects everything not yet started; an active run is left alone. */
  drop(): void;
  /** True while a run is active OR one is queued behind it. */
  isRunning(): boolean;
};

export const createSerialRunQueue = <TPayload>({
  run,
  onRunningChange,
}: {
  run: (payload: TPayload, onComplete: () => void) => Promise<void>;
  onRunningChange?: (isRunning: boolean) => void;
}): SerialRunQueue<TPayload> => {
  const queue: QueuedRun<TPayload>[] = [];
  let draining = false;
  let running = false;

  const setRunning = (value: boolean): void => {
    if (running === value) return;
    running = value;
    onRunningChange?.(value);
  };

  const drop = (): void => {
    const error = new SerialRunQueueDropError();
    for (const queued of queue.splice(0)) queued.reject(error);
  };

  const drain = async (): Promise<void> => {
    draining = true;
    try {
      let queued: QueuedRun<TPayload> | undefined;
      while ((queued = queue.shift())) {
        setRunning(true);
        try {
          await run(queued.payload, () => {
            if (queue.length === 0) setRunning(false);
          });
          queued.resolve();
        } catch (error) {
          // A failed run takes its followers with it: they would otherwise run
          // against state the failed run never produced.
          drop();
          setRunning(false);
          queued.reject(error);
        }
      }
    } finally {
      draining = false;
      setRunning(false);
    }
  };

  return {
    enqueue: (payload) =>
      new Promise<void>((resolve, reject) => {
        queue.push({ payload, resolve, reject });
        if (!draining) void drain();
      }),
    drop,
    isRunning: () => running,
  };
};
