import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import { ClipboardList, Scale, Ticket } from 'lucide-react';
import { about, statLabels, type StatKey } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { StatCounter } from './StatCounter';
import { dur, ease } from '../../lib/motion';

const icons = { ticket: Ticket, clipboard: ClipboardList, scale: Scale };

type PublicStats = Record<StatKey, number> & { upcoming_events: number; as_of: string };

export function AboutSection() {
  // Counted live from the database (GET /api/stats); nothing is shown until the real numbers arrive.
  const q = useQuery({ queryKey: ['stats'], queryFn: () => get<PublicStats>('/stats'), staleTime: 60_000 });
  return (
    <section id="about" data-bg="about" data-theme="dark" tabIndex={-1} aria-labelledby="about-h" className="l-section border-t border-cream/20 outline-none">
      <div className="l-gutter mx-auto max-w-7xl">
        <div className="grid gap-8 md:gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading id="about-h" script="our" title="Story" />
            <p className="t-body mt-6 max-w-[60ch] text-cream md:mt-8">{about.paragraph}</p>
          </div>
          <ul className="grid gap-3 md:gap-4">
            {about.features.map((f, i) => {
              const Icon = icons[f.icon];
              return (
                <motion.li
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10% 0px' }}
                  transition={{ duration: dur.base, ease: ease.out, delay: i * 0.1 }}
                  className="glass-l flex gap-4 rounded-2xl p-5 transition-colors hover:border-cream/60 md:gap-5 md:p-6"
                >
                  <Icon aria-hidden="true" strokeWidth={1.5} className="h-8 w-8 shrink-0 text-cream" />
                  <div>
                    <h3 className="t-h3 text-cream">{f.title}</h3>
                    <p className="t-body mt-1 text-cream/70">{f.body}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
        {q.data && (
          <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-8 md:mt-20 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
            {statLabels.map((s) => <StatCounter key={s.key} stat={{ ...s, value: q.data[s.key] }} />)}
          </div>
        )}
      </div>
    </section>
  );
}
