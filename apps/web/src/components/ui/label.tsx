import { cva, cx } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const labelClassName = cva("inline-flex items-center rounded-md font-semibold uppercase", {
  variants: {
    tone: {
      neutral: "bg-paper-deep text-ink-soft",
      info: "bg-blueberry-soft text-blueberry",
      success: "bg-basil-soft text-basil-deep"
    }
  },
  defaultVariants: {
    tone: "neutral"
  }
});

const dotClassName = cva("rounded-full", {
  variants: {
    tone: {
      neutral: "bg-ink-muted",
      info: "bg-blueberry",
      success: "bg-basil"
    }
  },
  defaultVariants: {
    tone: "neutral"
  }
});

type LabelProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: "neutral" | "info" | "success";
  withDot?: boolean;
};

export function Label({ children, className, tone = "neutral", withDot = false, ...props }: LabelProps) {
  return (
    <span className={cx(labelClassName({ tone }), "gap-1 px-2 py-0.5 text-[10px] tracking-[0.14em]", className)} {...props}>
      {withDot ? <span className={cx(dotClassName({ tone }), "h-1.5 w-1.5")} /> : null}
      {children}
    </span>
  );
}
