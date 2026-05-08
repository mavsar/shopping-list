import type { PropsWithChildren } from "react";
import { motion } from "motion/react";
import { BubbleBackground } from "../components/animate-ui/components/backgrounds/bubble";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="relative h-[100dvh] h-[100svh] min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[env(safe-area-inset-bottom)]">
      <BubbleBackground
        interactive={false}
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(165deg,rgba(9,16,24,0.94),rgba(15,23,42,0.97))]"
        colors={{
          first: "116,155,94",
          second: "148,163,108",
          third: "200,153,84",
          fourth: "153,90,64",
          fifth: "96,128,88",
          sixth: "132,146,106"
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 opacity-60" />
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
