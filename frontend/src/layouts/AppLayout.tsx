import { Outlet } from 'react-router-dom';
import { GlassNav } from '@/components/landing/GlassNav';

/** Public pages, /me, tickets and the admin dashboard: the landing page's glass navbar over the page content. */
export function AppLayout() {
  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[40vh]" style={{ background: 'var(--glow-page)' }} aria-hidden />
      <GlassNav />
      <main id="main" className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-28 lg:px-6">
        <Outlet />
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 t-label">
          <span>Skyline Student Association · Beyond the Bell.</span><span>{new Date().getFullYear()}</span>
        </footer>
      </main>
    </div>
  );
}
