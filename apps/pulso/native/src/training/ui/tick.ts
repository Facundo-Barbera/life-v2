import { useEffect, useState } from "react";
import { untilNextTick } from "../cardio";

/**
 * Now, re-rendered on the whole seconds of `origin` (the cardio clock's origin,
 * the rest's end): a timer ticking from when the screen appeared reads up to a
 * second off the Watch and the lock screen, one ticking from the clock's own
 * instant turns with them. Without an origin, once a second.
 */
export function useAlignedNow(origin: number | null, on = true): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = origin != null ? untilNextTick(origin) : 1000 - (Date.now() % 1000);
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, wait + 4);
    };
    setNow(Date.now());
    schedule();
    return () => clearTimeout(timer);
  }, [origin, on]);
  return now;
}
