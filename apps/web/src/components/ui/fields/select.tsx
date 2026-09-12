import type { SelectHTMLAttributes } from "react";
import { cva, cx } from "class-variance-authority";

const selectClassName = cva(
  "w-full appearance-none rounded-2xl border border-line bg-surface px-3 py-2 pr-9 text-ink outline-none transition focus:border-basil focus:ring-2 focus:ring-inset focus:ring-basil/15 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "h-11 text-base md:h-10 md:text-sm",
        lg: "h-13 px-4 py-2.5 pr-10 text-base"
      },
      invalid: {
        true: "border-tomato/60 focus:border-tomato focus:ring-tomato/25",
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
        className={cx("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted", uiSize === "lg" && "right-4")}
        viewBox="0 0 20 20"
        fill="none"
      >
        <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
