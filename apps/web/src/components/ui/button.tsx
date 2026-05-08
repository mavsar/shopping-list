import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { cva, cx } from "class-variance-authority";

type ButtonColor = "gradient" | "success" | "danger" | "white";
type ButtonAppearance = "full" | "outline" | "transparent";

const buttonClassName = cva(
  "inline-flex cursor-pointer items-center justify-center rounded-2xl font-semibold text-slate-50 transition disabled:cursor-default disabled:opacity-60",
  {
    variants: {
      color: {
        gradient: "",
        success: "",
        danger: "",
        white: ""
      },
      appearance: {
        full: "",
        outline: "",
        transparent: ""
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base"
      },
      stretch: {
        true: "w-full",
        false: ""
      },
      iconOnly: {
        true: "px-0",
        false: ""
      }
    },
    compoundVariants: [
      {
        size: "sm",
        iconOnly: true,
        className: "h-8 w-8"
      },
      {
        size: "md",
        iconOnly: true,
        className: "h-10 w-10"
      },
      {
        size: "lg",
        iconOnly: true,
        className: "h-12 w-12"
      },
      {
        color: "gradient",
        appearance: "full",
        className: "group relative overflow-hidden shadow-[0_12px_35px_rgba(99,102,241,0.35)] text-white"
      },
      {
        color: "success",
        appearance: "full",
        className: "border border-emerald-300/40 bg-emerald-500/80 text-emerald-50 backdrop-blur-sm hover:bg-emerald-500"
      },
      {
        color: "danger",
        appearance: "full",
        className: "border border-rose-300/40 bg-rose-500/75 text-rose-50 backdrop-blur-sm hover:bg-rose-500/85"
      },
      {
        color: "white",
        appearance: "full",
        className: "border border-white/30 bg-white/16 text-slate-100 backdrop-blur-sm hover:bg-white/24"
      },
      {
        color: "gradient",
        appearance: "outline",
        className:
          "border border-cyan-300/45 bg-transparent text-cyan-100 backdrop-blur-sm hover:bg-[linear-gradient(120deg,#22d3ee,#3b82f6,#8b5cf6,#ec4899)] hover:text-white"
      },
      {
        color: "success",
        appearance: "outline",
        className:
          "border border-emerald-300/50 bg-transparent text-emerald-200 backdrop-blur-sm hover:bg-emerald-500/80 hover:text-emerald-50"
      },
      {
        color: "danger",
        appearance: "outline",
        className:
          "border border-rose-300/45 bg-transparent text-rose-100 backdrop-blur-sm hover:bg-rose-500/75 hover:text-rose-50"
      },
      {
        color: "white",
        appearance: "outline",
        className: "border border-white/35 bg-transparent text-slate-100 backdrop-blur-sm hover:bg-white/16"
      },
      {
        color: "gradient",
        appearance: "transparent",
        className:
          "border border-transparent bg-transparent text-cyan-100 hover:bg-[linear-gradient(120deg,#22d3ee,#3b82f6,#8b5cf6,#ec4899)] hover:text-white"
      },
      {
        color: "success",
        appearance: "transparent",
        className: "border border-transparent bg-transparent text-emerald-200 hover:bg-emerald-500/80 hover:text-emerald-50"
      },
      {
        color: "danger",
        appearance: "transparent",
        className: "border border-transparent bg-transparent text-rose-100 hover:bg-rose-500/75 hover:text-rose-50"
      },
      {
        color: "white",
        appearance: "transparent",
        className: "border border-transparent bg-transparent text-slate-100 hover:bg-white/16"
      }
    ],
    defaultVariants: {
      color: "gradient",
      appearance: "full",
      size: "md",
      stretch: false,
      iconOnly: false
    }
  }
);

const buttonForegroundClassName = cva("relative z-10");

const buttonIconClassName = cva("inline-flex shrink-0 items-center justify-center", {
  variants: {
    size: {
      sm: "[&_svg]:size-5 [&_.lord-icon-wrapper]:size-5",
      md: "[&_svg]:size-6 [&_.lord-icon-wrapper]:size-6",
      lg: "[&_svg]:size-7 [&_.lord-icon-wrapper]:size-7"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  color?: ButtonColor;
  appearance?: ButtonAppearance;
  size?: "sm" | "md" | "lg";
  stretch?: boolean;
  tapScale?: number;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  iconOnly?: boolean;
};

export function Button({
  children,
  className,
  color,
  appearance,
  size = "md",
  stretch = false,
  tapScale = 0.95,
  icon,
  iconPosition = "start",
  iconOnly = false,
  ...props
}: ButtonProps) {
  const { onHoverStart, onHoverEnd, ...restProps } = props;
  const isDisabled = Boolean(props.disabled);
  const showOnlyIcon = iconOnly || (!children && Boolean(icon));
  const buttonLabel = props["aria-label"] ?? (showOnlyIcon && typeof props.title === "string" ? props.title : undefined);
  const resolvedColor: ButtonColor = color ?? "gradient";
  const resolvedAppearance: ButtonAppearance = appearance ?? "full";
  const isGradientFull = resolvedColor === "gradient" && resolvedAppearance === "full";
  type IconElementProps = {
    animate?: boolean | string;
    animation?: string;
    animateOnHover?: boolean | string;
    target?: string;
  };
  const resolvedIcon = isValidElement(icon)
    ? cloneElement(icon as ReactElement<IconElementProps>, {
        animate: Boolean((icon as ReactElement<IconElementProps>).props.animate),
        animateOnHover: (icon as ReactElement<IconElementProps>).props.animateOnHover ?? true,
        animation: (icon as ReactElement<IconElementProps>).props.animation ?? "default",
        target: (icon as ReactElement<IconElementProps>).props.target ?? "button"
      })
    : icon;

  return (
    <motion.button
      whileTap={isDisabled ? undefined : { scale: tapScale }}
      onHoverStart={(event, info) => {
        onHoverStart?.(event, info);
      }}
      onHoverEnd={(event, info) => {
        onHoverEnd?.(event, info);
      }}
      className={buttonClassName({
        color: resolvedColor,
        appearance: resolvedAppearance,
        size,
        stretch,
        iconOnly: showOnlyIcon,
        className
      })}
      aria-label={buttonLabel}
      {...restProps}
    >
      {isGradientFull ? (
        <>
          <span aria-hidden className="absolute inset-0 bg-[linear-gradient(120deg,#22d3ee,#3b82f6,#8b5cf6,#ec4899)]" />
          <span className="pointer-events-none absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
          <span className={cx(buttonForegroundClassName(), "inline-flex items-center", showOnlyIcon ? "justify-center" : "gap-2")}>
            {showOnlyIcon ? (
              icon ? (
                <span aria-hidden className={buttonIconClassName({ size })}>
                  {resolvedIcon}
                </span>
              ) : null
            ) : (
              <>
                {icon && iconPosition === "start" ? (
                  <span aria-hidden className={buttonIconClassName({ size })}>
                    {resolvedIcon}
                  </span>
                ) : null}
                {children}
                {icon && iconPosition === "end" ? (
                  <span aria-hidden className={buttonIconClassName({ size })}>
                    {resolvedIcon}
                  </span>
                ) : null}
              </>
            )}
          </span>
        </>
      ) : (
        <span className={cx(buttonForegroundClassName(), "inline-flex items-center", showOnlyIcon ? "justify-center" : "gap-2")}>
          {showOnlyIcon ? (
            icon ? (
              <span aria-hidden className={buttonIconClassName({ size })}>
                {resolvedIcon}
              </span>
            ) : null
          ) : (
            <>
              {icon && iconPosition === "start" ? (
                <span aria-hidden className={buttonIconClassName({ size })}>
                  {resolvedIcon}
                </span>
              ) : null}
              {children}
              {icon && iconPosition === "end" ? (
                <span aria-hidden className={buttonIconClassName({ size })}>
                  {resolvedIcon}
                </span>
              ) : null}
            </>
          )}
        </span>
      )}
    </motion.button>
  );
}
