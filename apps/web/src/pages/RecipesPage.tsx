import { AppHeader } from '../components/AppHeader';
import type { AuthUser } from '../types/auth';

type RecipesPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

export function RecipesPage({ token: _token, authUser, onLogout }: RecipesPageProps) {
  return (
    <>
      <AppHeader title="Recepti" authUser={authUser} onLogout={onLogout} />
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 text-slate-400"
            aria-hidden
          >
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Z" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">Kmalu na voljo</h2>
          <p className="max-w-xs text-sm text-slate-400">
            Stran z recepti je v pripravi. Vsebina bo dodana kmalu.
          </p>
        </div>
      </section>
    </>
  );
}
