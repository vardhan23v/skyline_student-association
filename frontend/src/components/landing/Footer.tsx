import { Instagram, Linkedin, Mail, Youtube } from 'lucide-react';
import { navLinks, socials } from '../../data/landing';
import { scrollToSection } from '../../hooks/useSmoothScroll';
import { SkylineMark } from './SectionHeading';

const icons = { instagram: Instagram, linkedin: Linkedin, youtube: Youtube, mail: Mail };

export function Footer() {
  return (
    <footer data-theme="dark" className="l-gutter border-t border-cream/20 bg-midnight pb-[max(3.5rem,calc(env(safe-area-inset-bottom)+2rem))] pt-12 text-cream/70 md:pt-14">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 text-center md:flex-row md:justify-between md:gap-10 md:text-left">
        <a href="#top" onClick={(e) => { e.preventDefault(); scrollToSection('top'); }} className="flex min-h-11 items-center gap-3 text-cream">
          <SkylineMark className="h-12 w-12" />
          <span className="t-nav font-extrabold">Skyline Student Association</span>
        </a>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap justify-center gap-x-2 md:gap-x-4">
            {navLinks.map((l) => (
              <li key={l.id}><a href={`#${l.id}`} onClick={(e) => { e.preventDefault(); scrollToSection(l.id); }} className="t-nav flex min-h-11 items-center px-2 text-cream/70 transition-colors hover:text-cream">{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <ul className="flex gap-3">
          {socials.map((s) => {
            const Icon = icons[s.icon];
            return <li key={s.label}><a href={s.href} aria-label={s.label} className="grid h-11 w-11 place-items-center rounded-full border border-cream/30 text-cream/70 transition-colors hover:border-cream hover:text-cream"><Icon aria-hidden="true" className="h-4 w-4" /></a></li>;
          })}
        </ul>
      </div>
      <p className="t-label mx-auto mt-10 max-w-7xl border-t border-cream/15 pt-6 text-center text-cream/70 md:text-left">© 2026 Skyline Student Association</p>
    </footer>
  );
}
