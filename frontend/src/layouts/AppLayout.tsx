import { Outlet, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { GlassNav } from '@/components/landing/GlassNav';
import { BackgroundStage } from '@/components/landing/BackgroundStage';
import { StudentCursor } from '@/components/cursor/StudentCursor';

/**
 * Public pages, /me, tickets and the admin dashboard, in the landing page's language: the glass navbar, the hero
 * photo behind everything (blurred and darkened on /admin so tables stay readable), the student cursor, and the
 * landing sections' enter motion (fade + 12px rise, 0.4 s) on every page and admin tab change.
 */
export function AppLayout() {
  const loc = useLocation();
  const admin = loc.pathname.startsWith('/admin');
  const tab = admin ? new URLSearchParams(loc.search).get('tab') ?? '' : '';
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh">
        <BackgroundStage variant={admin ? 'dim' : 'still'} />
        <GlassNav />
        <main id="main" className="relative z-[1] mx-auto w-full max-w-7xl px-4 pb-16 pt-28 lg:px-6">
          <motion.div key={loc.pathname + tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
          <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 t-label">
            <span>Skyline Student Association · Beyond the Bell.</span><span>{new Date().getFullYear()}</span>
          </footer>
        </main>
        <StudentCursor />
      </div>
    </MotionConfig>
  );
}
