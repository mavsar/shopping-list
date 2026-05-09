import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type AppHeaderProps = {
  title: string;
  actions?: ReactNode;
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

export function AppHeader({ title, actions, syncInfo }: AppHeaderProps) {
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
          </div>
        </div>
      </header>
    </div>
  );
}
