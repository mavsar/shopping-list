import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type AppHeaderProps = {
  title: string;
  actions?: ReactNode;
};

function BrandMark() {
  return (
    <svg viewBox="0 0 44 44" role="img" aria-label="Shopping list logo" className="h-11 w-11 shrink-0">
      <defs>
        <linearGradient id="shopping-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="40" height="40" rx="12" fill="none" stroke="url(#shopping-logo-gradient)" strokeWidth="2" />
      <path d="M13 15.5H31" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 22H31" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 28.5H23" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 29L27.5 31.5L32 27" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppHeader({ title, actions }: AppHeaderProps) {
  return (
    <div className="h-[74px]">
      <header className="fixed top-0 left-1/2 z-40 w-screen -translate-x-1/2 overflow-hidden border-b border-white/14 bg-slate-950/58 py-3 shadow-[0_18px_44px_rgba(2,8,23,0.62)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(2,6,23,0.72),rgba(15,23,42,0.5)_40%,rgba(30,41,59,0.38)_75%,rgba(51,65,85,0.34))]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(14,116,144,0.18),transparent_34%),radial-gradient(circle_at_90%_80%,rgba(76,29,149,0.18),transparent_36%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-cyan-300/40 to-transparent" />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45">
              <BrandMark />
            </Link>
            <p className="m-0 truncate text-base font-semibold tracking-tight text-slate-100 md:text-lg">
              {title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>
    </div>
  );
}
