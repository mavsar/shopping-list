import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cva } from "class-variance-authority";

const textAreaClassName = cva(
  "w-full rounded-2xl border border-white/20 bg-slate-950/45 px-3 py-2 text-slate-50 backdrop-blur-sm outline-none transition focus:border-cyan-300/75 focus:ring-1 focus:ring-inset focus:ring-cyan-300/30 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "min-h-10 text-base md:text-sm",
        lg: "min-h-12 px-4 py-2.5 text-base"
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
  autoResize?: boolean;
};

export function Textarea({
  className,
  size = "md",
  invalid = false,
  resize = "y",
  autoResize = true,
  onInput,
  ...props
}: TextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function adjustHeight() {
    if (!autoResize || !textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }

  useEffect(() => {
    adjustHeight();
  }, [autoResize, props.value]);

  return (
    <textarea
      ref={textareaRef}
      className={textAreaClassName({ size, invalid, resize, className })}
      onInput={(event) => {
        adjustHeight();
        onInput?.(event);
      }}
      {...props}
    />
  );
}
