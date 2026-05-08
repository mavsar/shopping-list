import { AnimatePresence, motion } from "motion/react";
import { cva } from "class-variance-authority";
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
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnOverlayClick = true
}: DialogProps) {
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
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.button
            aria-label="Close dialog"
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={closeOnOverlayClick ? () => onOpenChange(false) : undefined}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            className={dialogPanelClassName({ size })}
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
              aria-label="Close dialog"
              className="absolute right-2 top-2"
              onClick={() => onOpenChange(false)}
            />
            <h3 className="pr-10 text-xl font-semibold text-slate-50">{title}</h3>
            {description ? <p className="mt-2 text-sm text-slate-200/90">{description}</p> : null}
            {children ? <div className="mt-4">{children}</div> : null}
            {footer ? <div className="mt-4 flex flex-wrap gap-2">{footer}</div> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
