import type { InputHTMLAttributes } from "react";
import { cva } from "class-variance-authority";

const inputClassName = cva(
  "w-full rounded-2xl border border-white/20 bg-slate-950/45 px-3 py-2 text-slate-50 backdrop-blur-sm outline-none transition focus:border-cyan-300/75 focus:ring-2 focus:ring-cyan-300/35 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "text-sm",
        lg: "px-4 py-2.5 text-base"
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

export function Input({ className, uiSize = "md", invalid = false, ...props }: InputProps) {
  return <input className={inputClassName({ size: uiSize, invalid, className })} {...props} />;
}
