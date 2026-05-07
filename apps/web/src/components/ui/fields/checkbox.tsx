import { motion } from "motion/react";
import { cva, cx } from "class-variance-authority";
import { type ChangeEvent, type InputHTMLAttributes, type ReactNode, useEffect, useState } from "react";

const checkboxRootClassName = cva("inline-flex items-center gap-2 text-sm text-slate-200", {
  variants: {
    disabled: {
      true: "cursor-default opacity-70",
      false: "cursor-pointer"
    }
  },
  defaultVariants: {
    disabled: false
  }
});

const checkboxBoxClassName = cva(
  "inline-flex items-center justify-center rounded-md border backdrop-blur-sm transition",
  {
    variants: {
      uiSize: {
        md: "h-4 w-4",
        lg: "h-5 w-5"
      },
      checked: {
        true: "border-cyan-300/70 bg-cyan-400/25 text-cyan-100",
        false: "border-slate-400/40 bg-slate-950/85 text-transparent"
      },
      disabled: {
        true: "",
        false: ""
      }
    },
    defaultVariants: {
      uiSize: "md",
      checked: false,
      disabled: false
    }
  }
);

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  children?: ReactNode;
  uiSize?: "md" | "lg";
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({
  children,
  className,
  checked,
  defaultChecked,
  disabled,
  uiSize = "md",
  onChange,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
  const isControlled = typeof checked === "boolean";
  const isChecked = isControlled ? checked : internalChecked;

  useEffect(() => {
    if (isControlled) {
      setInternalChecked(Boolean(checked));
    }
  }, [checked, isControlled]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isControlled) {
      setInternalChecked(event.target.checked);
    }

    onCheckedChange?.(event.target.checked);
    onChange?.(event);
  }

  return (
    <label className={checkboxRootClassName({ disabled, className })}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={handleChange}
        {...props}
      />
      <motion.span
        whileTap={disabled ? undefined : { scale: 0.92 }}
        className={checkboxBoxClassName({ uiSize, checked: isChecked, disabled })}
      >
        <motion.svg
          viewBox="0 0 14 14"
          className={cx("h-3 w-3", uiSize === "lg" && "h-3.5 w-3.5")}
          initial={false}
          animate={isChecked ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <motion.path
            d="M3 7.2L5.6 9.6L11 4.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={isChecked ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          />
        </motion.svg>
      </motion.span>
      {children ? <span>{children}</span> : null}
    </label>
  );
}
