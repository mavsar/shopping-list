import type { PropsWithChildren } from "react";
import { motion } from "motion/react";
import { BubbleBackground } from "../components/animate-ui/components/backgrounds/bubble";

/** Butter, basil, carrot and a hint of tomato drifting slowly behind the page. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-[12vw] -right-[12vw] z-0">
      <BubbleBackground
        interactive={false}
        blendClassName="mix-blend-multiply"
        intensity={0.22}
        className="absolute inset-0 overflow-visible bg-transparent"
        colors={{
          first: '245,205,110', // butter
          second: '150,205,170', // basil (light)
          third: '245,190,140', // carrot (light)
          fourth: '240,180,165', // tomato (soft)
          fifth: '220,230,170', // olive / fresh greens
          sixth: '190,198,235', // blueberry (light)
        }}
      />
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
