import { AnimatePresence, motion } from "motion/react";
import { cva, cx } from "class-variance-authority";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "../lordicon/icons";
import { Button } from "./button";

const dialogPanelClassName = cva(
  "relative flex w-full flex-col border border-line bg-surface shadow-float " +
    // phone: bottom sheet; larger: centred card
    "rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-3xl sm:p-5",
  {
    variants: {
      size: {
        sm: "sm:max-w-md",
        md: "sm:max-w-xl",
        lg: "sm:max-w-2xl"
      }
    },
    defaultVariants: {
      size: "md"
    }
  }
);

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnOverlayClick?: boolean;
  fullHeight?: boolean;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnOverlayClick = true,
  fullHeight = false
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden overscroll-contain sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={
            closeOnOverlayClick
              ? (event) => {
                  if (event.target === event.currentTarget) onOpenChange(false);
                }
              : undefined
          }
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-ink/40"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(6px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ WebkitBackdropFilter: "blur(6px)" }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            className={cx(
              dialogPanelClassName({ size }),
              fullHeight
                ? "h-[calc(100dvh-2.5rem)] sm:h-[calc(100dvh-2rem)]"
                : "max-h-[calc(100dvh-2.5rem)] sm:max-h-[calc(100dvh-2rem)]"
            )}
            initial={{ opacity: 0, y: 48, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* grab handle (phone only) */}
            <span aria-hidden className="mx-auto -mt-2 mb-3 block h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
            <Button
              color="white"
              appearance="transparent"
              icon={<X />}
              iconOnly
              size="sm"
              type="button"
              aria-label="Zapri pogovorno okno"
              className="absolute right-3 top-3 sm:right-2 sm:top-2"
              onClick={() => onOpenChange(false)}
            />
            <h3 className="pr-10 text-lg font-semibold tracking-tight text-ink">{title}</h3>
            {description ? <p className="mt-1.5 text-sm text-ink-soft">{description}</p> : null}
            {children ? (
              <div className="mt-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-1 [-webkit-overflow-scrolling:touch]">
                {children}
              </div>
            ) : null}
            {footer ? <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">{footer}</div> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
