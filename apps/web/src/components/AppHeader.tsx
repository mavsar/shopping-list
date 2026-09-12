import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookRecipes, GridList, LogOut, Refresh, SettingsCog, ShoppingBasket, X } from './lordicon/icons';
import { Button } from './ui/button';
import type { AuthUser } from '../types/auth';

type AppHeaderProps = {
  title: string;
  /** Small line under the title (e.g. progress "3 od 12"). */
  subtitle?: ReactNode;
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
  if (!lastSyncedAt) return 'Še ni sinhronizirano';

  const diffMs = Math.max(0, nowMs - lastSyncedAt.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Pred kratkim';
  if (diffMinutes < 60) return `${diffMinutes} min nazaj`;
  if (diffHours < 24) return `${diffHours} ur nazaj`;
  if (diffDays < 2) return 'Včeraj';

  return new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' }).format(lastSyncedAt);
}

const BASIL = 'primary:#2e7a4c,secondary:#2e7a4c';
const INK = 'primary:#2a211a,secondary:#2a211a';
const MUTED = 'primary:#8b7c6d,secondary:#8b7c6d';

const navItems = [
  { to: '/', label: 'Nakupovalni seznam', Icon: ShoppingBasket, match: (p: string) => p === '/' || p.startsWith('/lists') },
  { to: '/recipes', label: 'Recepti', Icon: BookRecipes, match: (p: string) => p.startsWith('/recipes') },
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
    return () => {
      document.body.style.overflow = '';
    };
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-ink/40"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(6px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ WebkitBackdropFilter: 'blur(6px)' }}
          />

          <Button
            color="white"
            appearance="full"
            icon={<X />}
            iconOnly
            size="md"
            type="button"
            aria-label="Zapri meni"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-full"
            onClick={() => setOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 270, damping: 24 }}
            className="relative z-10 flex w-full max-w-2xl flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* main page cards */}
            <div className="flex flex-col gap-3 sm:flex-row">
              {navItems.map(({ to, label, Icon, match }) => {
                const active = match(location.pathname);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={cx(
                      'group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border px-8 py-10 text-center shadow-float transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
                      active ? 'border-basil/50 bg-basil-soft' : 'border-line bg-surface hover:bg-paper',
                    )}
                  >
                    <div
                      className={cx(
                        'flex h-20 w-20 items-center justify-center rounded-2xl transition-colors duration-200',
                        active ? 'bg-basil text-white shadow-basil' : 'bg-paper-deep',
                      )}
                    >
                      <Icon size={44} animate colors={active ? 'primary:#ffffff,secondary:#ffffff' : INK} />
                    </div>
                    <div className="space-y-0.5">
                      <p className={cx('m-0 text-lg font-semibold tracking-tight', active ? 'text-basil-deep' : 'text-ink')}>
                        {label}
                      </p>
                      {active && <p className="m-0 text-xs font-medium text-basil">Trenutna stran</p>}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* footer row: settings + logout */}
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-float">
              {authUser && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate('/settings');
                  }}
                  className={cx(
                    'flex h-11 flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
                    location.pathname === '/settings'
                      ? 'bg-basil-soft text-basil-deep'
                      : 'text-ink-soft hover:bg-paper-deep hover:text-ink',
                  )}
                >
                  <SettingsCog size={20} animateOnHover colors={location.pathname === '/settings' ? BASIL : INK} />
                  Nastavitve
                </button>
              )}
              {authUser && onLogout && <div className="h-6 w-px bg-line" />}
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void onLogout();
                  }}
                  className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-xl px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-tomato-soft hover:text-tomato-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40"
                >
                  <LogOut size={20} animateOnHover colors={INK} />
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

export function AppHeader({ title, subtitle, actions, authUser, onLogout, syncInfo }: AppHeaderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const syncLabel = useMemo(
    () => (syncInfo?.refreshing ? 'Sinhroniziram…' : formatLastSynced(syncInfo?.lastSyncedAt ?? null, nowMs)),
    [nowMs, syncInfo?.lastSyncedAt, syncInfo?.refreshing],
  );

  useEffect(() => {
    if (!syncInfo) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, [syncInfo]);

  const handleRefresh = () => {
    if (!syncInfo?.onRefresh || syncInfo.refreshing) return;
    void syncInfo.onRefresh();
  };

  return (
    <div className="h-[calc(66px+env(safe-area-inset-top))]">
      <header className="fixed left-1/2 top-0 z-40 w-screen -translate-x-1/2 border-b border-line bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] w-full max-w-3xl items-center gap-3 px-3 md:px-8">
          <Link
            to="/"
            className="shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-basil/40"
            aria-label="Domov"
          >
            <img src="/logo-icon.svg" alt="" className="h-10 w-10" />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[17px] font-semibold leading-tight tracking-tight text-ink md:text-lg">
              {title}
            </h1>
            {subtitle ? <p className="m-0 truncate text-xs leading-tight text-ink-muted">{subtitle}</p> : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {syncInfo ? (
              <button
                type="button"
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-ink-muted transition hover:bg-ink/6 hover:text-ink disabled:cursor-default"
                aria-label="Osveži podatke"
                title={syncLabel}
                onClick={handleRefresh}
                disabled={Boolean(syncInfo.refreshing)}
              >
                <span className={cx(syncInfo.refreshing && 'animate-spin')}>
                  <Refresh size={16} colors={MUTED} animateOnHover={false} />
                </span>
                <span className="hidden sm:inline">{syncLabel}</span>
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
