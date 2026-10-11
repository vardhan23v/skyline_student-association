import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { ExternalLink, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { GlassNav } from '@/components/landing/GlassNav';
import { BackgroundStage } from '@/components/landing/BackgroundStage';
import { StudentCursor } from '@/components/cursor/StudentCursor';
import { AdminTabs } from '@/components/AdminTabs';
import { Modal } from '@/components/Modal';
import { Skeleton } from '@/components/EmptyState';
import { PasswordUpdateBanner } from '@/pages/public/AuthPages';

const RAIL_KEY = 'ssa.admin.rail';
const readRail = () => { try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; } };
const writeRail = (v: boolean) => { try { localStorage.setItem(RAIL_KEY, v ? '1' : '0'); } catch { /* private mode: not remembered */ } };

/**
 * The Control Room: every /admin URL. The shared glass top bar (in its admin mode), the section list pinned on the
 * left from lg up (240px, or a 72px icon rail; the choice is remembered), and the section on the right. Below lg the
 * list opens as a left drawer from the top bar's menu button. This layout stays mounted while sections change, so
 * only the content animates.
 */
export function AdminLayout() {
  const loc = useLocation();
  const { logout } = useAuth();
  const [rail, setRail] = useState(readRail);
  const [drawer, setDrawer] = useState(false);
  const toggleRail = () => setRail((r) => { writeRail(!r); return !r; });
  // Widening past lg with the drawer open: the sidebar takes over.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => { if (mq.matches) setDrawer(false); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100svh]">
        <BackgroundStage variant="dim" />
        <GlassNav onAdminMenu={() => setDrawer(true)} />
        <div className="relative z-[1] mx-auto w-full max-w-[90rem] px-4 pb-[max(4rem,calc(env(safe-area-inset-bottom)+2rem))] pt-[calc(env(safe-area-inset-top)+6.5rem)] md:px-6 md:pt-[calc(env(safe-area-inset-top)+7rem)] lg:flex lg:items-start lg:gap-8">
          <aside aria-label="Control Room" className={`glass sticky top-28 hidden max-h-[calc(100svh-8rem)] shrink-0 flex-col rounded-2xl p-2 transition-[width] duration-300 lg:flex ${rail ? 'w-[72px]' : 'w-60'}`}>
            <nav aria-label="Control Room sections" className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"><AdminTabs collapsed={rail} /></nav>
            <button type="button" onClick={toggleRail} aria-pressed={rail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`t-nav interactive mt-2 flex min-h-11 items-center gap-2.5 rounded-xl border-t border-cream/10 !text-[0.65rem] text-cream/60 hover:text-cream focus-ring ${rail ? 'justify-center' : 'px-3.5'}`}>
              {rail ? <PanelLeftOpen className="size-4" aria-hidden /> : <><PanelLeftClose className="size-4" aria-hidden />Collapse</>}
            </button>
          </aside>
          <main id="main" className="min-w-0 flex-1">
            {/* Only the section animates; the bar and sidebar stay put. */}
            <motion.div key={loc.pathname} className="min-h-[70svh]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <PasswordUpdateBanner />
              <Suspense fallback={<div className="card"><Skeleton rows={6} /></div>}><Outlet /></Suspense>
            </motion.div>
            <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-4 text-center t-label sm:justify-between sm:text-left">
              <span>Skyline Student Association · Control Room</span><span>{new Date().getFullYear()}</span>
            </footer>
          </main>
        </div>
        <StudentCursor />
      </div>
      <Modal open={drawer} onClose={() => setDrawer(false)} variant="nav" title="Control Room">
        <nav aria-label="Control Room sections"><AdminTabs onNavigate={() => setDrawer(false)} /></nav>
        <div className="mt-4 grid gap-1 border-t border-cream/10 pt-4">
          <a href="/" target="_blank" rel="noopener" className="t-nav flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 !text-[0.7rem] text-cream/70 hover:bg-cream/5 hover:text-cream focus-ring"><ExternalLink className="size-4" aria-hidden />View site<span className="sr-only"> (opens in a new tab)</span></a>
          <button type="button" onClick={() => { setDrawer(false); logout(); }} className="t-nav flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 text-left !text-[0.7rem] text-cream/70 hover:bg-cream/5 hover:text-cream focus-ring"><LogOut className="size-4" aria-hidden />Log out</button>
        </div>
      </Modal>
    </MotionConfig>
  );
}
