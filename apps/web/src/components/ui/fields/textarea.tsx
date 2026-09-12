import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cva } from "class-variance-authority";

const textAreaClassName = cva(
  "w-full rounded-2xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint outline-none transition focus:border-basil focus:ring-2 focus:ring-inset focus:ring-basil/15 disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      size: {
        md: "min-h-11 text-base md:min-h-10 md:text-sm",
        lg: "min-h-12 px-4 py-2.5 text-base"
      },
      invalid: {
        true: "border-tomato/60 focus:border-tomato focus:ring-tomato/25",
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
