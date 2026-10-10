import { useCallback, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import type { Expense, Fundraiser, Member } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { SecretaryDrawer } from './SecretaryDrawer';
import { BottomBar, MenuSheet, SideNav, TopBar } from './LiquidGlassNav';

/**
 * App frame: desktop rail + top context bar; mobile top bar + bottom taskbar + menu sheet.
 * One page-level glow lives on the backdrop; cards stay flat unless they are the FeatureCard.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, has } = useAuth();
  const [ai, setAi] = useState(false);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);

  // "Needs attention" count feeds the bell + dashboard badge. Only queried for the roles that can act on them.
  // These keys are shared with pages that fetch them for other roles, so gate the sum too, not just `enabled`
  // (a disabled observer still reads whatever another page cached). Mirrors DashboardPage's "Needs attention".
  const canMembers = has('admin', 'treasurer'), canQueue = has('treasurer'), canTasks = has('volunteer', 'treasurer');
  const expiring = useQuery({ queryKey: ['members', 'expiring'], queryFn: () => get<Member[]>('/members?expiring_within_days=14'), enabled: canMembers });
  const queue = useQuery({ queryKey: ['expenses', 'submitted'], queryFn: () => get<Expense[]>('/expenses?status=submitted'), enabled: canQueue });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers'), enabled: canTasks });
  const attention = (canMembers ? expiring.data?.length ?? 0 : 0) + (canQueue ? queue.data?.length ?? 0 : 0) + (canTasks ? frs.data?.reduce((s, f) => s + f.tasks_overdue, 0) ?? 0 : 0);

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[40vh]" style={{ background: 'var(--glow-page)' }} aria-hidden />
      <div className="relative mx-auto flex w-full max-w-[1400px] gap-5 px-4 lg:px-5 lg:py-4">
        <SideNav onOpenSecretary={() => setAi(true)} attention={attention} />
        <div className="min-w-0 flex-1 pb-28 lg:pb-10">
          <TopBar onOpenSecretary={() => setAi(true)} attention={attention} onOpenMenu={() => setMenu(true)} />
          <main id="main" className="min-w-0">{children}</main>
          <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 t-label">
            <span>Skyline Student Association · Beyond the Bell.</span><span>{new Date().getFullYear()}</span>
          </footer>
        </div>
      </div>
      <BottomBar onMore={() => setMenu(true)} />
      <MenuSheet open={menu} onClose={closeMenu} onOpenSecretary={() => setAi(true)} />
      {me && <SecretaryDrawer open={ai} onClose={() => setAi(false)} />}
    </div>
  );
}
