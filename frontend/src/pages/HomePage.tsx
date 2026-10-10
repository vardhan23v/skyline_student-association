import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, HandCoins, Megaphone, QrCode, ShoppingBag, Users, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { Announcement, Event, Product } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/Brand';
import { Skyline, EventArt } from '@/components/Skyline';
import { EventCard } from '@/components/EventCard';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { CursorMedia } from '@/components/CursorMedia';
import { Reveal, SectionStack } from '@/components/SectionStack';
import { date, datetime, money } from '@/components/format';

/**
 * Public landing page. Everything on it is live data from public endpoints (events, announcements, products);
 * the "find your people" section is informational copy linking to real routes. There is no club entity in
 * this system, so there is no fabricated club list.
 */
export function HomePage() {
  const { me } = useAuth();
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const news = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  const products = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const now = Date.now();
  const live = (events.data ?? []).filter((e) => e.status !== 'draft');
  const upcoming = live.filter((e) => +new Date(e.starts_at) >= now).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const past = live.filter((e) => +new Date(e.starts_at) < now).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  const seatsSold = upcoming.reduce((s, e) => s + (e.capacity - e.seats_left), 0);
  const stock = (products.data ?? []).flatMap((p) => p.variants).reduce((s, v) => s + v.available, 0);

  return (
    <div className="min-h-dvh bg-background text-text-primary">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground">Skip to content</a>
      <header className="sticky top-0 z-[var(--z-nav)] border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:px-8">
          <Brand />
          <nav aria-label="Site" className="ml-auto hidden items-center gap-1 md:flex">
            {[['/events', 'Events'], ['/announcements', 'Announcements'], ['/shop', 'Shop'], ['/finance', 'Finances']].map(([to, t]) => <Link key={to} to={to} className="btn-ghost !min-h-10 !px-3 !text-sm">{t}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {me ? <Link to="/dashboard" className="btn-primary !min-h-10 !px-4 !text-sm">Dashboard<ArrowRight className="size-4" aria-hidden /></Link> : (<><Link to="/login" className="btn-ghost !min-h-10 !px-3 !text-sm">Log in</Link><Link to="/register" className="btn-primary !min-h-10 !px-4 !text-sm">Join</Link></>)}
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border" aria-labelledby="hero-h">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]" style={{ background: 'var(--glow-horizon)' }} aria-hidden />
          <div className="dots pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-0 pt-16 md:pt-24 lg:grid-cols-12 lg:px-8">
            <div className="lg:col-span-7">
              <p className="t-label mb-5 flex items-center gap-3"><span className="h-px w-8 bg-accent" aria-hidden />Skyline Student Association · Beyond the Bell.</p>
              <h1 id="hero-h" className="t-display max-w-[14ch] text-balance">Where Campus Life Reaches New Heights.</h1>
              <p className="mt-6 max-w-xl font-display text-xl font-medium leading-snug text-text-primary md:text-2xl">Discover events. Connect with people. Build something unforgettable.</p>
              <p className="mt-4 max-w-xl text-base text-text-secondary">Discover campus events, find your community, and turn everyday campus life into something unforgettable.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/events" className="btn-primary !min-h-12 !px-6 !text-base">Explore Events<ArrowRight className="size-4" aria-hidden /></Link>
                <a href="#get-involved" className="btn-secondary !min-h-12 !px-6 !text-base">Discover Clubs</a>
              </div>
              <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-border pt-6">
                {[[upcoming.length, 'upcoming events'], [seatsSold, 'seats taken'], [news.data?.length ?? 0, 'announcements']].map(([n, l]) => (
                  <div key={String(l)}><dt className="t-label order-2">{l}</dt><dd className="t-metric text-accent">{events.isLoading ? <span className="skeleton inline-block h-8 w-12" /> : n}</dd></div>
                ))}
              </dl>
            </div>
            <div className="relative flex items-end lg:col-span-5" data-cursor-media="Skyline Student Association">
              <Skyline className="w-full max-w-xl translate-y-px lg:max-w-none" />
            </div>
          </div>
        </section>

        {/* Sections below the hero stack like cards: each pins and recedes as the next scrolls over it. */}
        <SectionStack>
        {/* Upcoming events */}
        <section className="flex items-center" aria-labelledby="ev-h"><div className="mx-auto w-full max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <SectionHead id="ev-h" eyebrow="01 · Events" title="Upcoming events" to="/events" cta="All events" />
          {events.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-64 skeleton" />)}</div> : events.error ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : upcoming.length === 0 ? <EmptyState icon={<CalendarDays className="size-5" aria-hidden />} title="Nothing scheduled yet" description="New events are announced to members first." /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.slice(0, 6).map((e, i) => <Reveal key={e.id} delay={i * 60}><EventCard event={e} preview /></Reveal>)}</div>
          )}
        </div></section>

        {/* Get involved (no club entity exists; these are the real ways in) */}
        <section id="get-involved" className="flex items-center border-y border-border bg-surface" aria-labelledby="gi-h">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <SectionHead id="gi-h" eyebrow="02 · Community" title="Find your people" />
            <p className="-mt-4 mb-8 max-w-2xl text-text-secondary">One association, many ways in. Pick the one that fits and the rest of the platform opens up.</p>
            <Reveal><div className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Users, t: 'Members', d: 'Annual dues unlock member pricing on tickets and merch, a QR membership card, and members-only posts.', to: me ? '/me' : '/register', cta: me ? 'My membership' : 'Join now' },
                { icon: QrCode, t: 'Volunteers', d: 'Run the door with the QR scanner, verify members, pick up fundraiser tasks and get reimbursed with a receipt.', to: '/volunteer', cta: 'Volunteer tools' },
                { icon: HandCoins, t: 'Fundraisers', d: 'Bake sales, charity runs and project drives with targets, budgets and a shared task board.', to: me ? '/volunteer/tasks' : '/login', cta: 'See the board' },
                { icon: Wallet, t: 'Transparency', d: 'Every rupee in and out is in an append-only ledger. Any member can read the summary.', to: '/finance', cta: 'Club finances' },
              ].map((x) => (
                <Link key={x.t} to={x.to} className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-surface-elevated focus-ring" style={{ transitionDuration: 'var(--dur-fast)' }}>
                  <x.icon className="size-6 text-accent" aria-hidden />
                  <div><h3 className="t-section text-lg">{x.t}</h3><p className="mt-2 text-sm text-text-secondary">{x.d}</p></div>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent">{x.cta}<ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden /></span>
                </Link>
              ))}
            </div></Reveal>
          </div>
        </section>

        {/* Community highlights: past events + shop, all live data */}
        <section className="flex items-center" aria-labelledby="hl-h"><div className="mx-auto w-full max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <SectionHead id="hl-h" eyebrow="03 · Highlights" title="What we've been up to" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {past.length === 0 ? <EmptyState title="No past events yet" /> : (
                <ul className="divide-y divide-border border-y border-border">
                  {past.slice(0, 4).map((e) => (
                    <li key={e.id}><Link to={`/events/${e.id}`} data-cursor-media={e.title} className="group flex items-center gap-5 py-5 focus-ring">
                      <EventArt seed={e.id} className="hidden h-16 w-28 shrink-0 rounded-[var(--radius-sm)] sm:block" />
                      <div className="min-w-0 flex-1"><div className="t-label">{date(e.starts_at)}{e.venue && ` · ${e.venue}`}</div><h3 className="t-section mt-1 text-lg group-hover:text-accent transition-colors" style={{ transitionDuration: 'var(--dur-fast)' }}>{e.title}</h3>{e.description && <p className="mt-1 line-clamp-1 text-sm text-text-secondary">{e.description}</p>}</div>
                      <div className="text-right"><div className="t-metric !text-2xl">{e.capacity - e.seats_left}</div><div className="t-label">tickets</div></div>
                    </Link></li>
                  ))}
                </ul>
              )}
            </div>
            <aside className="card flex flex-col gap-4 glow-corner" aria-labelledby="shop-h">
              <div className="t-label">Merchandise</div>
              <h3 id="shop-h" className="t-section text-lg">{products.data?.length ? `${products.data.length} products, ${stock} in stock` : 'Shop'}</h3>
              <ul className="space-y-2">{(products.data ?? []).slice(0, 3).map((p) => <li key={p.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{p.name}</span><span className="t-num text-text-secondary">from {money(Math.min(...p.variants.map((v) => v.price_for_you)))}</span></li>)}</ul>
              <Link to="/shop" className="btn-secondary mt-auto"><ShoppingBag className="size-4" aria-hidden />Visit the shop</Link>
            </aside>
          </div>
        </div></section>

        {/* Announcements */}
        <section className="flex items-center border-t border-border" aria-labelledby="an-h">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <SectionHead id="an-h" eyebrow="04 · Announcements" title="Latest from the committee" to="/announcements" cta="Archive" />
            {news.isLoading ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-40 skeleton" />)}</div> : !news.data?.length ? <EmptyState icon={<Megaphone className="size-5" aria-hidden />} title="Nothing posted yet" /> : (
              <div className="grid gap-4 md:grid-cols-3">{news.data.slice(0, 3).map((a) => (
                <article key={a.id} className="card flex flex-col gap-3">
                  <div className="t-label">{datetime(a.published_at)} · {a.author_name}</div>
                  <h3 className="t-section text-lg">{a.title}</h3>
                  <p className="line-clamp-3 text-sm text-text-secondary">{a.body}</p>
                </article>
              ))}</div>
            )}
          </div>
        </section>

        {/* Join CTA */}
        <section className="relative flex items-center overflow-hidden border-t border-border" aria-labelledby="join-h">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-full" style={{ background: 'var(--glow-horizon)' }} aria-hidden />
          <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-8 px-5 py-20 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-28">
            <div><p className="t-label mb-4">Join Skyline</p><h2 id="join-h" className="t-display max-w-[12ch] text-balance">Your campus, above the noise.</h2><p className="mt-5 max-w-lg text-text-secondary">Membership takes two minutes. Dues can be paid online or at the sign-up table, and your member card lives in your pocket.</p></div>
            <div className="flex flex-wrap gap-3">{me ? <Link to="/dashboard" className="btn-primary !min-h-12 !px-6 !text-base">Go to your dashboard<ArrowRight className="size-4" aria-hidden /></Link> : (<><Link to="/register" className="btn-primary !min-h-12 !px-6 !text-base">Become a member<ArrowRight className="size-4" aria-hidden /></Link><Link to="/login" className="btn-secondary !min-h-12 !px-6 !text-base">Log in</Link></>)}</div>
          </div>
        </section>
        </SectionStack>
      </main>
      <CursorMedia />

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-5"><Brand tagline /><p className="mt-4 max-w-sm text-sm text-text-secondary">Skyline Student Association runs memberships, events, merchandise, fundraisers and club finances in one place.</p></div>
          {[
            ['Explore', [['/events', 'Events'], ['/announcements', 'Announcements'], ['/shop', 'Shop'], ['/finance', 'Club finances']]],
            ['Members', [['/register', 'Join'], ['/login', 'Log in'], ['/me', 'My account'], ['/volunteer', 'Volunteer']]],
            ['Operations', [['/dashboard', 'Dashboard'], ['/admin', 'Admin'], ['/treasurer', 'Treasurer'], ['/volunteer/scan', 'Door scanner']]],
          ].map(([h, links]) => (
            <div key={String(h)} className="lg:col-span-2"><h3 className="t-label mb-3">{h as string}</h3><ul className="space-y-2 text-sm">{(links as string[][]).map(([to, t]) => <li key={to}><Link to={to} className="text-text-secondary hover:text-text-primary">{t}</Link></li>)}</ul></div>
          ))}
        </div>
        <div className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-4 t-label lg:px-8"><span>© {new Date().getFullYear()} Skyline Student Association</span><span>Beyond the Bell.</span></div></div>
      </footer>
    </div>
  );
}

function SectionHead({ id, eyebrow, title, to, cta }: { id: string; eyebrow: string; title: string; to?: string; cta?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><div className="t-label mb-3">{eyebrow}</div><h2 id={id} className="t-title">{title}</h2></div>
      {to && <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">{cta}<ArrowRight className="size-4" aria-hidden /></Link>}
    </div>
  );
}
