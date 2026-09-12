import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { cx } from "class-variance-authority";

/** Default icon tint — matches `--color-ink`. */
export const INK_ICON_COLORS = "primary:#2a211a,secondary:#2a211a";
export const WHITE_ICON_COLORS = "primary:#ffffff,secondary:#ffffff";

export type LordIconTrigger = "in" | "click" | "hover" | "loop" | "loop-on-hover" | "morph" | "boomerang" | "sequence";

type LordIconProps = {
  src: string;
  className?: string;
  size?: number;
  trigger?: LordIconTrigger;
  animate?: boolean | string;
  animateOnHover?: boolean | string;
  animation?: string;
  colors?: string;
  stroke?: "light" | "regular" | "bold";
  speed?: number;
  state?: string;
  target?: string;
  onReady?: () => void;
  onComplete?: () => void;
};

export function LordIcon({
  src,
  className,
  size,
  trigger,
  animate = false,
  animateOnHover = true,
  animation: _animation,
  colors = INK_ICON_COLORS,
  stroke = "bold",
  speed = 1,
  state,
  target,
  onReady,
  onComplete
}: LordIconProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const resolvedTrigger: LordIconTrigger = trigger ?? (animate ? "loop" : animateOnHover ? "hover" : "in");
  const style: CSSProperties | undefined = size
    ? {
        width: `${size}px`,
        height: `${size}px`
      }
    : undefined;

  useEffect(() => {
    const element = containerRef.current?.querySelector("lord-icon");
    if (!element) {
      return;
    }

    const readyHandler = () => onReady?.();
    const completeHandler = () => onComplete?.();

    if (onReady) {
      element.addEventListener("ready", readyHandler);
    }
    if (onComplete) {
      element.addEventListener("complete", completeHandler);
    }

    return () => {
      if (onReady) {
        element.removeEventListener("ready", readyHandler);
      }
      if (onComplete) {
        element.removeEventListener("complete", completeHandler);
      }
    };
  }, [onReady, onComplete, src, state, trigger, animate, animateOnHover]);

  return (
    <span ref={containerRef} className={cx("lord-icon-wrapper inline-flex items-center justify-center", className)} style={style} aria-hidden>
      <lord-icon
        src={src}
        trigger={resolvedTrigger}
        colors={colors}
        stroke={stroke}
        speed={speed}
        state={state}
        target={target}
        loading="lazy"
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}
