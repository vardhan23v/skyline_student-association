import { Outlet, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { GlassNav } from '@/components/landing/GlassNav';
import { BackgroundStage } from '@/components/landing/BackgroundStage';
import { StudentCursor } from '@/components/cursor/StudentCursor';

/**
 * Public pages, /me and tickets, in the landing page's language: the glass navbar, the hero photo behind everything,
 * the student cursor, and the landing sections' enter motion (fade + 12px rise, 0.4 s) on every page change.
 * The Control Room (/admin) has its own layout, AdminLayout.
 */
export function AppLayout() {
  const loc = useLocation();
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100svh]">
        <BackgroundStage variant="still" />
        <GlassNav />
        {/* 16px gutter on phones, 24px from md; top padding clears the fixed navbar and the notch. */}
        <main id="main" className="relative z-[1] mx-auto w-full max-w-7xl px-4 pb-[max(4rem,calc(env(safe-area-inset-bottom)+2rem))] pt-[calc(env(safe-area-inset-top)+6.5rem)] md:px-6 md:pt-[calc(env(safe-area-inset-top)+7rem)]">
          {/* min-height: while a page is still loading, the footer stays below the fold instead of jumping down (CLS). */}
          <motion.div key={loc.pathname} className="min-h-[100svh]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
          <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-4 text-center t-label sm:justify-between sm:text-left">
            <span>Skyline Student Association · Beyond the Bell.</span><span>{new Date().getFullYear()}</span>
          </footer>
        </main>
        <StudentCursor />
      </div>
    </MotionConfig>
  );
}
