import { cva, cx } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const labelClassName = cva("inline-flex items-center rounded-md font-semibold uppercase", {
  variants: {
    tone: {
      neutral: "bg-slate-500/18 text-slate-200",
      info: "bg-cyan-400/12 text-cyan-200",
      success: "bg-emerald-400/12 text-emerald-200"
    }
  },
  defaultVariants: {
    tone: "neutral"
  }
});

const dotClassName = cva("rounded-full", {
  variants: {
    tone: {
      neutral: "bg-slate-300/80",
      info: "bg-cyan-300/90",
      success: "bg-emerald-300/90"
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
