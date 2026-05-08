import type { PropsWithChildren } from "react";
import { motion } from "motion/react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.20),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.18),_transparent_42%),linear-gradient(160deg,rgba(15,23,42,0.85),rgba(30,41,59,0.92))]" />
      <div className="pointer-events-none absolute inset-0 z-0 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:3px_3px]" />
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
