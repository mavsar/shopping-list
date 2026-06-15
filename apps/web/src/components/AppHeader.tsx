import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookRecipes, GridList, LogOut, SettingsCog, ShoppingBasket, X } from './lordicon/icons';
import { Button } from './ui/button';
import type { AuthUser } from '../types/auth';

type AppHeaderProps = {
  title: string;
  actions?: ReactNode;
  authUser?: AuthUser | null;
  onLogout?: () => void | Promise<void>;
  syncInfo?: {
    lastSyncedAt: Date | null;
    refreshing?: boolean;
    onRefresh?: () => void | Promise<void>;
  };
};

function formatLastSynced(lastSyncedAt: Date | null, nowMs: number): string {
  if (!lastSyncedAt) {
    return 'Še ni sinhronizirano';
  }

  const diffMs = Math.max(0, nowMs - lastSyncedAt.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return 'Pred kratkim';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min nazaj`;
  }
  if (diffHours < 24) {
    return `${diffHours} ur nazaj`;
  }
  if (diffDays < 2) {
    return 'Včeraj';
  }

  return new Intl.DateTimeFormat('sl-SI', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(lastSyncedAt);
}

const navItems = [
  { to: '/', label: 'Nakupovalni seznam', Icon: ShoppingBasket },
  { to: '/recipes', label: 'Recepti', Icon: BookRecipes },
];

function HamburgerMenu({ authUser, onLogout }: { authUser?: AuthUser | null; onLogout?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nav-overlay"
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          {/* backdrop — identical to dialog */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)', WebkitBackdropFilter: 'blur(8px)' }}
          />

          {/* close button — identical to dialog */}
          <Button
            color="white"
            appearance="transparent"
            icon={<X />}
            iconOnly
            size="sm"
            type="button"
            aria-label="Zapri meni"
            className="absolute right-2 top-2"
            onClick={() => setOpen(false)}
          />

          {/* nav cards + footer */}
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 270, damping: 24 }}
            className="relative z-10 flex w-full max-w-2xl flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* main page cards */}
            <div className="flex flex-col gap-4 sm:flex-row">
              {navItems.map(({ to, label, Icon }) => {
                const active = location.pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={`group relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-3xl border px-8 py-12 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45 ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-950/60 shadow-[inset_0_1px_0_rgba(34,211,238,0.18),0_0_0_1px_rgba(34,211,238,0.18),0_24px_64px_rgba(6,182,212,0.22)]'
                        : 'border-white/20 bg-slate-900/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(2,8,23,0.6)] hover:bg-slate-800/85'
                    }`}
                  >
                    {active && (
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(6,182,212,0.22),transparent_65%)]" />
                    )}
                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl border transition-colors duration-200 ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/25 shadow-[0_0_24px_rgba(6,182,212,0.25)]'
                        : 'border-white/10 bg-white/6 group-hover:border-white/18 group-hover:bg-white/10'
                    }`}>
                      <Icon size={44} animate />
                    </div>
                    <div className="space-y-1">
                      <p className={`text-xl font-semibold tracking-tight ${active ? 'text-cyan-200' : 'text-slate-100'}`}>
                        {label}
                      </p>
                      {active && (
                        <p className="text-xs font-medium tracking-wide text-cyan-400">Trenutna stran</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* footer row: settings + logout */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-slate-900/85 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              {authUser && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className={`flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45 ${
                    location.pathname === '/settings'
                      ? 'bg-cyan-500/12 text-cyan-300'
                      : 'text-slate-300 hover:bg-white/6 hover:text-slate-100'
                  }`}
                >
                  <SettingsCog size={20} animateOnHover />
                  Nastavitve
                </button>
              )}
              {authUser && onLogout && (
                <div className="h-5 w-px bg-white/10" />
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); void onLogout(); }}
                  className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/6 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
                >
                  <LogOut size={20} animateOnHover />
                  Odjava
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <Button
        color="white"
        appearance="transparent"
        size="md"
        type="button"
        icon={<GridList />}
        iconOnly
        aria-label="Navigacijski meni"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {createPortal(overlay, document.body)}
    </>
  );
}

export function AppHeader({ title, actions, authUser, onLogout, syncInfo }: AppHeaderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const syncLabel = useMemo(
    () =>
      syncInfo?.refreshing
        ? 'Sinhroniziram...'
        : formatLastSynced(syncInfo?.lastSyncedAt ?? null, nowMs),
    [nowMs, syncInfo?.lastSyncedAt, syncInfo?.refreshing],
  );

  useEffect(() => {
    if (!syncInfo) {
      return;
    }
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, [syncInfo]);

  const handleRefresh = () => {
    if (!syncInfo?.onRefresh || syncInfo.refreshing) {
      return;
    }
    void syncInfo.onRefresh();
  };

  return (
    <div className="h-[calc(74px+env(safe-area-inset-top))]">
      <header className="fixed top-0 left-1/2 z-40 w-screen -translate-x-1/2 overflow-hidden border-b border-white/14 bg-slate-950/58 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 shadow-[0_18px_44px_rgba(2,8,23,0.62)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(2,6,23,0.72),rgba(15,23,42,0.5)_40%,rgba(30,41,59,0.38)_75%,rgba(51,65,85,0.34))]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(14,116,144,0.18),transparent_34%),radial-gradient(circle_at_90%_80%,rgba(76,29,149,0.18),transparent_36%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-cyan-300/40 to-transparent" />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
            >
              <img src="/logo-icon.svg" alt="Logotip nakupovalnega seznama" className="h-11 w-11 shrink-0" />
            </Link>
            <p className="m-0 truncate text-base font-semibold tracking-tight text-slate-100 md:text-lg">
              {title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {syncInfo ? (
              <button
                type="button"
                className="inline-flex cursor-pointer items-center px-2 py-1 text-[11px] text-slate-300 transition hover:text-slate-100 disabled:cursor-default"
                aria-label="Osveži podatke"
                title="Osveži podatke"
                onClick={handleRefresh}
                disabled={Boolean(syncInfo.refreshing)}
              >
                {syncInfo.refreshing ? (
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-300/60 border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <span>{syncLabel}</span>
                )}
              </button>
            ) : null}
            {actions}
            <HamburgerMenu authUser={authUser} onLogout={onLogout} />
          </div>
        </div>
      </header>
    </div>
  );
}
