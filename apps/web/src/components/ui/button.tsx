import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { cva, cx } from "class-variance-authority";
import { INK_ICON_COLORS, WHITE_ICON_COLORS } from "../lordicon/lord-icon";

/**
 * Colour roles kept from the previous design system so call sites stay untouched:
 *  - gradient → primary (basil)
 *  - success  → basil (same family, used for confirmations)
 *  - danger   → tomato
 *  - white    → neutral surface
 */
type ButtonColor = "gradient" | "success" | "danger" | "white";
type ButtonAppearance = "full" | "outline" | "transparent";

const BASIL_ICON_COLORS = "primary:#2e7a4c,secondary:#2e7a4c";
const TOMATO_ICON_COLORS = "primary:#b93a22,secondary:#b93a22";

const buttonClassName = cva(
  "inline-flex cursor-pointer items-center justify-center rounded-2xl font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-default disabled:opacity-50",
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
        xs: "h-7 px-2.5 text-xs",
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm md:h-10",
        lg: "h-13 px-6 text-base"
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
      { size: "xs", iconOnly: true, className: "h-7 w-7" },
      { size: "sm", iconOnly: true, className: "h-9 w-9" },
      { size: "md", iconOnly: true, className: "h-11 w-11 md:h-10 md:w-10" },
      { size: "lg", iconOnly: true, className: "h-13 w-13" },

      // ── primary / basil ──
      {
        color: "gradient",
        appearance: "full",
        className: "bg-basil text-white shadow-basil hover:bg-basil-deep"
      },
      {
        color: "success",
        appearance: "full",
        className: "bg-basil text-white shadow-basil hover:bg-basil-deep"
      },
      {
        color: "gradient",
        appearance: "outline",
        className: "border border-basil/40 bg-surface text-basil-deep hover:bg-basil-soft"
      },
      {
        color: "success",
        appearance: "outline",
        className: "border border-basil/40 bg-surface text-basil-deep hover:bg-basil-soft"
      },
      {
        color: "gradient",
        appearance: "transparent",
        className: "bg-transparent text-basil-deep hover:bg-basil-soft"
      },
      {
        color: "success",
        appearance: "transparent",
        className: "bg-transparent text-basil-deep hover:bg-basil-soft"
      },

      // ── danger / tomato ──
      {
        color: "danger",
        appearance: "full",
        className: "bg-tomato text-white hover:bg-tomato-deep"
      },
      {
        color: "danger",
        appearance: "outline",
        className: "border border-tomato/40 bg-surface text-tomato-deep hover:bg-tomato-soft"
      },
      {
        color: "danger",
        appearance: "transparent",
        className: "bg-transparent text-tomato-deep hover:bg-tomato-soft"
      },

      // ── neutral ──
      {
        color: "white",
        appearance: "full",
        className: "border border-line bg-surface text-ink shadow-card hover:bg-paper-deep"
      },
      {
        color: "white",
        appearance: "outline",
        className: "border border-line-strong bg-transparent text-ink hover:bg-surface"
      },
      {
        color: "white",
        appearance: "transparent",
        className: "bg-transparent text-ink-soft hover:bg-ink/6 hover:text-ink"
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

const buttonIconClassName = cva("inline-flex shrink-0 items-center justify-center", {
  variants: {
    size: {
      xs: "[&_svg]:size-4 [&_.lord-icon-wrapper]:size-4",
      sm: "[&_svg]:size-5 [&_.lord-icon-wrapper]:size-5",
      md: "[&_svg]:size-6 [&_.lord-icon-wrapper]:size-6",
      lg: "[&_svg]:size-8 [&_.lord-icon-wrapper]:size-8"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

function iconColorsFor(color: ButtonColor, appearance: ButtonAppearance): string {
  if (appearance === "full") {
    return color === "white" ? INK_ICON_COLORS : WHITE_ICON_COLORS;
  }
  if (color === "danger") return TOMATO_ICON_COLORS;
  if (color === "white") return INK_ICON_COLORS;
  return BASIL_ICON_COLORS;
}

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  color?: ButtonColor;
  appearance?: ButtonAppearance;
  size?: "xs" | "sm" | "md" | "lg";
  stretch?: boolean;
  tapScale?: number;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  iconOnly?: boolean;
};

type IconElementProps = {
  animate?: boolean | string;
  animation?: string;
  animateOnHover?: boolean | string;
  target?: string;
  colors?: string;
};

export function Button({
  children,
  className,
  color,
  appearance,
  size = "md",
  stretch = false,
  tapScale = 0.96,
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

  const resolvedIcon = isValidElement(icon)
    ? cloneElement(icon as ReactElement<IconElementProps>, {
        animate: Boolean((icon as ReactElement<IconElementProps>).props.animate),
        animateOnHover: (icon as ReactElement<IconElementProps>).props.animateOnHover ?? true,
        animation: (icon as ReactElement<IconElementProps>).props.animation ?? "default",
        target: (icon as ReactElement<IconElementProps>).props.target ?? "button",
        colors: (icon as ReactElement<IconElementProps>).props.colors ?? iconColorsFor(resolvedColor, resolvedAppearance)
      })
    : icon;

  const iconSlot = icon ? (
    <span aria-hidden className={buttonIconClassName({ size })}>
      {resolvedIcon}
    </span>
  ) : null;

  return (
    <motion.button
      whileTap={isDisabled ? undefined : { scale: tapScale }}
      onHoverStart={(event, info) => onHoverStart?.(event, info)}
      onHoverEnd={(event, info) => onHoverEnd?.(event, info)}
      className={cx(
        buttonClassName({
          color: resolvedColor,
          appearance: resolvedAppearance,
          size,
          stretch,
          iconOnly: showOnlyIcon
        }),
        className
      )}
      aria-label={buttonLabel}
      {...restProps}
    >
      <span className={cx("inline-flex items-center", showOnlyIcon ? "justify-center" : "gap-2")}>
        {showOnlyIcon ? (
          iconSlot
        ) : (
          <>
            {iconPosition === "start" ? iconSlot : null}
            {children}
            {iconPosition === "end" ? iconSlot : null}
          </>
        )}
      </span>
    </motion.button>
  );
}
