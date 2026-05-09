import { cva } from "class-variance-authority";

const loaderContainerClassName = cva("", {
  variants: {
    placement: {
      inline: "",
      overlay: "absolute inset-0 z-20 grid place-items-center"
    }
  },
  defaultVariants: {
    placement: "inline"
  }
});

const loaderContentClassName = cva("m-0 flex items-center gap-2 text-xs text-slate-300");

type LoaderProps = {
  label?: string;
  placement?: "inline" | "overlay";
};

export function Loader({ label = "Nalaganje...", placement = "inline" }: LoaderProps) {
  return (
    <div className={loaderContainerClassName({ placement })} role="status" aria-live="polite" aria-busy="true">
      <p className={loaderContentClassName()}>
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-300/60 border-t-transparent" aria-hidden />
        {label}
      </p>
    </div>
  );
}
