import type { TextareaHTMLAttributes } from "react";
import { cva } from "class-variance-authority";

const textAreaClassName = cva(
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
      },
      resize: {
        none: "resize-none",
        y: "resize-y",
        both: "resize"
      }
    },
    defaultVariants: {
      size: "md",
      invalid: false,
      resize: "y"
    }
  }
);

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: "md" | "lg";
  invalid?: boolean;
  resize?: "none" | "y" | "both";
};

export function Textarea({ className, size = "md", invalid = false, resize = "y", ...props }: TextareaProps) {
  return <textarea className={textAreaClassName({ size, invalid, resize, className })} {...props} />;
}
