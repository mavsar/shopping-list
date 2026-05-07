import type { PropsWithChildren } from "react";
import { motion } from "motion/react";

import { GradientBackground } from "@/components/animate-ui/components/backgrounds/gradient";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <GradientBackground className="pointer-events-none absolute inset-0 z-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl"
          animate={{ x: [0, 80, -40, 0], y: [0, 20, -30, 0], scale: [1, 1.1, 0.9, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-cyan-400/25 blur-3xl"
          animate={{ x: [0, -120, 60, 0], y: [0, -30, 35, 0], scale: [1, 0.9, 1.08, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[-120px] left-1/3 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl"
          animate={{ x: [0, 70, -90, 0], y: [0, -45, 20, 0], scale: [1, 1.12, 0.95, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-10 md:px-8"
      >
        {children}
      </motion.div>
    </main>
  );
}
