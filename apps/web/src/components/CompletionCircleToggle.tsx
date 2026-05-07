import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check as LucideCheck } from "lucide-react";
import { cx } from "class-variance-authority";
import { AnimateIcon } from "./animate-ui/icons/icon";

const MotionCheck = motion.create(LucideCheck);

const SPARKLE_COUNT = 10;
const EMERALD_FILL = "rgb(16 185 129)";
const EMERALD_BORDER = "rgb(52 211 153)";
const EMPTY_BORDER = "rgba(255 255 255 / 0.35)";

type CompletionCircleToggleProps = {
  completed: boolean;
  disabled: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
};

export function CompletionCircleToggle({ completed, disabled, onToggle, size = "md" }: CompletionCircleToggleProps) {
  const prevCompleted = useRef(completed);
  const [sparkleBurst, setSparkleBurst] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!prevCompleted.current && completed) {
      setSparkleBurst(true);
    }
    prevCompleted.current = completed;
  }, [completed]);

  useEffect(() => {
    if (!sparkleBurst) {
      return;
    }
    const id = window.setTimeout(() => setSparkleBurst(false), 720);
    return () => window.clearTimeout(id);
  }, [sparkleBurst]);

  const controlSizeClass = size === "sm" ? "h-6 w-6" : "h-10 w-10";
  const checkSizeClass = size === "sm" ? "size-[12px]" : "size-[18px]";
  const sparkleDistanceBase = size === "sm" ? 14 : 22;

  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center overflow-visible", controlSizeClass)}>
      <motion.button
        type="button"
        className={cx(
          "relative z-[1] flex shrink-0 cursor-pointer items-center justify-center rounded-full border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
          controlSizeClass
        )}
        aria-label={completed ? "Označi kot aktivno" : "Označi kot končano"}
        aria-pressed={completed}
        disabled={disabled}
        onClick={onToggle}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        initial={false}
        animate={{
          backgroundColor: completed ? EMERALD_FILL : "rgba(0, 0, 0, 0)",
          borderColor: completed ? EMERALD_BORDER : EMPTY_BORDER,
          color: completed ? "rgb(255 255 255)" : "transparent",
          scale: sparkleBurst ? [1, 1.1, 1] : 1,
          boxShadow: sparkleBurst
            ? [
                "inset 0 1px 0 rgba(255,255,255,0.15)",
                "inset 0 1px 0 rgba(255,255,255,0.25), 0 0 0 10px rgba(52,211,153,0.35), 0 0 24px rgba(16,185,129,0.55)",
                "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 0 0 rgba(52,211,153,0)"
              ]
            : completed
              ? "inset 0 1px 0 rgba(255,255,255,0.2)"
              : "none"
        }}
        transition={{
          backgroundColor: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
          borderColor: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          boxShadow: { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
        }}
      >
        <AnimatePresence>
          {!completed && isHovered ? (
            <motion.span
              key="hover-check"
              className="absolute"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              <AnimateIcon animate animation="path-draw">
                <LucideCheck size={size === "sm" ? 12 : 14} className="text-white/70" aria-hidden />
              </AnimateIcon>
            </motion.span>
          ) : null}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {completed ? (
            <MotionCheck
              key="done"
              className={checkSizeClass}
              strokeWidth={2.75}
              aria-hidden
              initial={{ opacity: 0, scale: 0.15, rotate: -58 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{
                opacity: { duration: 0.18 },
                scale: { type: "spring", stiffness: 520, damping: 26, mass: 0.65 },
                rotate: { type: "spring", stiffness: 420, damping: 28 }
              }}
              exit={{
                opacity: 0,
                scale: 0.5,
                rotate: 24,
                transition: { duration: 0.14 }
              }}
            />
          ) : null}
        </AnimatePresence>
      </motion.button>
      {sparkleBurst
        ? Array.from({ length: SPARKLE_COUNT }, (_, i) => {
            const angle = (i / SPARKLE_COUNT) * Math.PI * 2 - Math.PI / 2;
            const distance = sparkleDistanceBase + (i % 3) * 4;
            return (
              <motion.span
                key={i}
                className="pointer-events-none absolute left-1/2 top-1/2 z-[2] size-[5px] rounded-full bg-amber-100 shadow-[0_0_8px_rgba(253,224,71,0.95)]"
                style={{ marginLeft: "-2.5px", marginTop: "-2.5px" }}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [0, 1, 0.85, 0],
                  scale: [0, 1.25, 1, 0.15],
                  x: Math.cos(angle) * distance,
                  y: Math.sin(angle) * distance
                }}
                transition={{
                  duration: 0.58,
                  ease: [0.22, 1, 0.36, 1],
                  delay: i * 0.028
                }}
              />
            );
          })
        : null}
    </span>
  );
}
