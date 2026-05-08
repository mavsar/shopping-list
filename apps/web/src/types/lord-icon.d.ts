import type { CSSProperties, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lord-icon": HTMLAttributes<HTMLElement> & {
        src?: string;
        trigger?: "in" | "click" | "hover" | "loop" | "loop-on-hover" | "morph" | "boomerang" | "sequence";
        colors?: string;
        stroke?: "light" | "regular" | "bold";
        speed?: number;
        state?: string;
        loading?: "lazy" | "interaction" | "delay";
        style?: CSSProperties;
        target?: string;
      };
    }
  }
}
