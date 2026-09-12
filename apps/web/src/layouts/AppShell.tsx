import type { PropsWithChildren } from "react";
import { motion } from "motion/react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="paper-grain fixed inset-x-0 top-0 h-[100lvh] overflow-hidden bg-paper ios-no-callout">
      <main className="relative z-10 h-full overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-8 md:pb-16"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
