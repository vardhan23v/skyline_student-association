import { motion } from 'framer-motion';
import { ClipboardList, Scale, Ticket } from 'lucide-react';
import { about, stats } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { StatCounter } from './StatCounter';
import { dur, ease } from '../../lib/motion';

const icons = { ticket: Ticket, clipboard: ClipboardList, scale: Scale };

export function AboutSection() {
  return (
    <section id="about" data-theme="dark" tabIndex={-1} aria-labelledby="about-h" className="border-t border-ash/20 py-24 outline-none sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading id="about-h" script="our" title="Story" />
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-ivory/80 sm:text-xl">{about.paragraph}</p>
          </div>
          <ul className="grid gap-4">
            {about.features.map((f, i) => {
              const Icon = icons[f.icon];
              return (
                <motion.li
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10% 0px' }}
                  transition={{ duration: dur.base, ease: ease.out, delay: i * 0.1 }}
                  className="flex gap-5 rounded-2xl border border-ash/20 bg-ivory/[0.03] p-6 transition-colors hover:border-crimson/60"
                >
                  <Icon aria-hidden="true" strokeWidth={1.5} className="h-8 w-8 shrink-0 text-crimson" />
                  <div>
                    <h3 className="text-lg font-bold text-ivory">{f.title}</h3>
                    <p className="mt-1 text-ivory/65">{f.body}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
        <div className="mt-20 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {stats.map((s) => <StatCounter key={s.label} stat={s} />)}
        </div>
      </div>
    </section>
  );
}
