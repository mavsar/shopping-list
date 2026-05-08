import { cva, cx, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const cardClassName = cva(
  "w-full rounded-2xl border bg-slate-900/25 shadow-[0_8px_18px_rgba(2,8,23,0.35)]",
  {
    variants: {
      tone: {
        default: "border-white/14 border-t-white/25",
        completed: "border-transparent bg-transparent shadow-none opacity-40 hover:opacity-100"
      },
      interactive: {
        true: "transition hover:border-cyan-300/45",
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
        className: "group-focus-visible:ring-2 group-focus-visible:ring-cyan-300/45"
      }
    ],
    defaultVariants: {
      tone: "default",
      interactive: false,
      padding: "md"
    }
  }
);

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
