import type { PropsWithChildren } from "react";
import { motion } from "motion/react";
import { MeshBackground } from "../components/MeshBackground";

/** Soft mesh of butter, basil and carrot slowly flowing behind the page. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <MeshBackground />
    </div>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="fixed inset-x-0 top-0 h-[100lvh] overflow-hidden bg-paper ios-no-callout">
      <AmbientBackground />
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
