import { useEffect, useRef, useState, type ReactNode } from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    (document.documentElement.dataset["motion"] === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

/**
 * Keeps the last non-empty children mounted for `duration` ms after they disappear, flagging the
 * wrapper with `data-closing` so CSS can play an exit animation before unmount.
 */
export function Presence({ children, duration = 200 }: { children: ReactNode; duration?: number }) {
  const [, rerender] = useState(0);
  const last = useRef<ReactNode>(null);
  const wasOpen = useRef(false);
  const generation = useRef(0);
  const open = Boolean(children);

  if (open) {
    // A new generation remounts the content when it reopens mid-exit, so form state resets.
    if (!wasOpen.current) generation.current += 1;
    last.current = children;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (open || !last.current) return;
    const timer = window.setTimeout(
      () => {
        last.current = null;
        rerender((count) => count + 1);
      },
      prefersReducedMotion() ? 0 : duration,
    );
    return () => window.clearTimeout(timer);
  }, [open, duration]);

  if (!last.current) return null;
  return (
    <div className="presence" key={generation.current} data-closing={open ? undefined : ""}>
      {last.current}
    </div>
  );
}

/** Counts up (or down) to `value` with an ease-out curve. */
export function AnimatedNumber({
  value,
  duration = 900,
  suffix = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const from = shown.current;
    if (from === value || prefersReducedMotion()) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown.current = Math.round(from + (value - from) * eased);
      setDisplay(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <>
      {display}
      {suffix}
    </>
  );
}
