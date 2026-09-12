import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cva, cx } from "class-variance-authority";

const inputClassName = cva(
  "rounded-2xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint outline-none transition focus:border-basil focus:ring-2 focus:ring-inset focus:ring-basil/15 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "h-11 text-base md:h-10 md:text-sm",
        lg: "h-13 px-4 py-2.5 text-base"
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

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, uiSize = "md", invalid = false, ...props }, ref) {
    const widthClass = hasWidthUtilityClass(className) ? "" : "w-full";
    return <input ref={ref} className={cx(widthClass, inputClassName({ size: uiSize, invalid }), className)} {...props} />;
  }
);
