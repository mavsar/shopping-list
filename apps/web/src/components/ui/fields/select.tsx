import type { SelectHTMLAttributes } from "react";
import { cva, cx } from "class-variance-authority";

const selectClassName = cva(
  "w-full appearance-none rounded-2xl border border-white/20 bg-slate-950/45 px-3 py-2 pr-9 text-slate-50 backdrop-blur-sm outline-none transition focus:border-cyan-300/75 focus:ring-1 focus:ring-inset focus:ring-cyan-300/30 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "h-10 text-base md:text-sm",
        lg: "h-12 px-4 py-2.5 pr-10 text-base"
      },
      invalid: {
        true: "border-rose-300/65 focus:border-rose-300/75 focus:ring-rose-300/35",
        false: ""
      }
    },
    defaultVariants: {
      size: "md",
      invalid: false
    }
  }
);

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  uiSize?: "md" | "lg";
  invalid?: boolean;
};

export function Select({ className, uiSize = "md", invalid = false, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select className={selectClassName({ size: uiSize, invalid, className })} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        className={cx("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300", uiSize === "lg" && "right-4")}
        viewBox="0 0 20 20"
        fill="none"
      >
        <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
