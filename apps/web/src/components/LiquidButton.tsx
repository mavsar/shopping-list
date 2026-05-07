import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { PropsWithChildren } from "react";

type LiquidButtonProps = PropsWithChildren<
  HTMLMotionProps<"button"> & {
    className?: string;
  }
>;

export function LiquidButton({ children, className = "", ...props }: LiquidButtonProps) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 240, damping: 18 }}
      className={`group relative overflow-hidden rounded-2xl px-4 py-2 font-semibold text-white shadow-[0_12px_35px_rgba(99,102,241,0.35)] disabled:cursor-default disabled:opacity-60 ${className}`}
      {...props}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(120deg,#22d3ee,#3b82f6,#8b5cf6,#ec4899)] bg-[length:240%_240%]"
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="pointer-events-none absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
