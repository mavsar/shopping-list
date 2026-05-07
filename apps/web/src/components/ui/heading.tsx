import { cva, cx } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

const headingClassName = cva("font-semibold tracking-tight", {
  variants: {
    color: {
      white: "text-slate-50",
      gradient: "bg-linear-to-r from-cyan-300 via-blue-300 to-fuchsia-300 bg-clip-text text-transparent"
    }
  },
  defaultVariants: {
    color: "white"
  }
});

type HeadingColor = "white" | "gradient";

type SharedHeadingProps = {
  children: ReactNode;
  color?: HeadingColor;
  className?: string;
};

type H1Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;
type H2Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;
type H3Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;
type H4Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;
type H5Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;
type H6Props = HTMLAttributes<HTMLHeadingElement> & SharedHeadingProps;

export function H1({ children, color = "white", className, ...props }: H1Props) {
  return (
    <h1 className={cx(headingClassName({ color }), "text-5xl leading-tight", className)} {...props}>
      {children}
    </h1>
  );
}

export function H2({ children, color = "white", className, ...props }: H2Props) {
  return (
    <h2 className={cx(headingClassName({ color }), "text-4xl leading-tight", className)} {...props}>
      {children}
    </h2>
  );
}

export function H3({ children, color = "white", className, ...props }: H3Props) {
  return (
    <h3 className={cx(headingClassName({ color }), "text-3xl leading-snug", className)} {...props}>
      {children}
    </h3>
  );
}

export function H4({ children, color = "white", className, ...props }: H4Props) {
  return (
    <h4 className={cx(headingClassName({ color }), "text-2xl leading-snug", className)} {...props}>
      {children}
    </h4>
  );
}

export function H5({ children, color = "white", className, ...props }: H5Props) {
  return (
    <h5 className={cx(headingClassName({ color }), "text-xl leading-snug", className)} {...props}>
      {children}
    </h5>
  );
}

export function H6({ children, color = "white", className, ...props }: H6Props) {
  return (
    <h6 className={cx(headingClassName({ color }), "text-lg leading-snug", className)} {...props}>
      {children}
    </h6>
  );
}
