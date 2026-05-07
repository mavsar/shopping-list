import type { InputHTMLAttributes } from "react";
import { cva, cx } from "class-variance-authority";

const inputClassName = cva(
  "rounded-2xl border border-white/20 bg-slate-950/45 px-3 py-2 text-slate-50 backdrop-blur-sm outline-none transition focus:border-cyan-300/75 focus:ring-1 focus:ring-inset focus:ring-cyan-300/30 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "h-10 text-sm",
        lg: "h-12 px-4 py-2.5 text-base"
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

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  uiSize?: "md" | "lg";
  invalid?: boolean;
};

function hasWidthUtilityClass(className?: string): boolean {
  if (!className) {
    return false;
  }
  return /(?:^|\s)(?:[a-z-]+:)*w-[^\s]+/.test(className);
}

export function Input({ className, uiSize = "md", invalid = false, ...props }: InputProps) {
  const widthClass = hasWidthUtilityClass(className) ? "" : "w-full";
  return <input className={cx(widthClass, inputClassName({ size: uiSize, invalid }), className)} {...props} />;
}
