import { cva, cx, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const cardClassName = cva("w-full rounded-2xl border bg-surface shadow-card", {
  variants: {
    tone: {
      default: "border-line",
      completed: "border-transparent bg-transparent shadow-none opacity-55 hover:opacity-90"
    },
    interactive: {
      true: "transition-[border-color,box-shadow] duration-150 hover:border-basil/45 hover:shadow-float",
      false: ""
    },
    padding: {
      md: "p-4",
      sm: "p-2",
      none: ""
    }
  },
  compoundVariants: [
    {
      interactive: true,
      tone: "default",
      className: "group-focus-visible:ring-2 group-focus-visible:ring-basil/40"
    }
  ],
  defaultVariants: {
    tone: "default",
    interactive: false,
    padding: "md"
  }
});

type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardClassName> & {
    children: ReactNode;
  };

export function Card({ children, className, tone, interactive, padding, ...props }: CardProps) {
  return (
    <div className={cx(cardClassName({ tone, interactive, padding }), className)} {...props}>
      {children}
    </div>
  );
}
