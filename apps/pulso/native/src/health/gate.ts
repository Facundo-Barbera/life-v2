// When the app may present a system sheet: nothing of its own is presented
// (a modal route, a <Modal>), the app is in front, and that has held for
// `settleMs` (a dismissal's animation has finished). Pure, for tests.

export type Gate = {
  /** Something is presented until the returned release is called (idempotent). */
  hold(): () => void;
  setActive(active: boolean): void;
  idle(): boolean;
  /** Resolves once the gate has been idle for `settleMs` without interruption. */
  whenIdle(): Promise<void>;
};

export function createGate(settleMs: number, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }): Gate {
  let holders = 0;
  let active = true;
  let waiters: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const idle = () => holders === 0 && active;
  const check = () => {
    if (timer) timers.clear(timer);
    timer = null;
    if (!idle() || !waiters.length) return;
    timer = timers.set(() => {
      timer = null;
      if (!idle()) return;
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve();
    }, settleMs);
  };

  return {
    hold() {
      holders++;
      check();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders--;
        check();
      };
    },
    setActive(next) {
      active = next;
      check();
    },
    idle,
    whenIdle() {
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        check();
      });
    },
  };
}

/** Runs tasks one after another; a failing task doesn't stop the next. */
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };
}
