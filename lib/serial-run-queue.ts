// Leopard fork of leopard's SerialRunQueue: at most one turn is in flight, and a
// payload enqueued while one runs waits for it instead of racing it.
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
  enqueue(payload: TPayload): Promise<void>;
  drop(): void;
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
