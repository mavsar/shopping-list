import { AnimatePresence, motion } from "motion/react";
import { cva, cx } from "class-variance-authority";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "../lordicon/icons";
import { Button } from "./button";

const dialogPanelClassName = cva(
  "relative w-full rounded-3xl border border-white/20 bg-slate-900/85 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(2,8,23,0.6)] backdrop-blur-2xl",
  {
    variants: {
      size: {
        sm: "max-w-md",
        md: "max-w-xl",
        lg: "max-w-2xl"
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
    if (!open) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={
            closeOnOverlayClick
              ? (event) => {
                  if (event.target === event.currentTarget) {
                    onOpenChange(false);
                  }
                }
              : undefined
          }
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            style={{ backgroundColor: "rgba(2, 6, 23, 0.55)", WebkitBackdropFilter: "blur(8px)" }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            className={cx(
              dialogPanelClassName({ size }),
              fullHeight ? "h-[calc(100dvh-2rem)] h-[calc(100svh-2rem)]" : "max-h-[calc(100dvh-2rem)] max-h-[calc(100svh-2rem)]",
              "flex flex-col overflow-hidden"
            )}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 270, damping: 24 }}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              color="white"
              appearance="transparent"
              icon={<X />}
              iconOnly
              size="sm"
              type="button"
              aria-label="Zapri pogovorno okno"
              className="absolute right-2 top-2"
              onClick={() => onOpenChange(false)}
            />
            <h3 className="pr-10 text-xl font-semibold text-slate-50">{title}</h3>
            {description ? <p className="mt-2 text-sm text-slate-200/90">{description}</p> : null}
            {children ? (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y [-webkit-overflow-scrolling:touch]">
                {children}
              </div>
            ) : null}
            {footer ? <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">{footer}</div> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
