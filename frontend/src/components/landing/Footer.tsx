import { Instagram, Linkedin, Mail, Youtube } from 'lucide-react';
import { navLinks, socials } from '../../data/landing';
import { scrollToSection } from '../../hooks/useSmoothScroll';
import { SkylineMark } from './SectionHeading';

const icons = { instagram: Instagram, linkedin: Linkedin, youtube: Youtube, mail: Mail };

export function Footer() {
  return (
    <footer className="border-t border-ash/20 bg-midnight px-4 py-14 text-ash sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-center md:justify-between">
        <a href="#top" onClick={(e) => { e.preventDefault(); scrollToSection('top'); }} className="flex items-center gap-3 text-ivory">
          <SkylineMark className="h-8 w-8 text-crimson" />
          <span className="text-sm font-extrabold tracking-[0.2em]">SKYLINE STUDENT ASSOCIATION</span>
        </a>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((l) => (
              <li key={l.id}><a href={`#${l.id}`} onClick={(e) => { e.preventDefault(); scrollToSection(l.id); }} className="text-sm text-ivory/65 transition-colors hover:text-ivory">{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <ul className="flex gap-2">
          {socials.map((s) => {
            const Icon = icons[s.icon];
            return <li key={s.label}><a href={s.href} aria-label={s.label} className="grid h-11 w-11 place-items-center rounded-full border border-ash/30 text-ivory/70 transition-colors hover:border-crimson hover:text-ivory"><Icon aria-hidden="true" className="h-4 w-4" /></a></li>;
          })}
        </ul>
      </div>
      <p className="mx-auto mt-10 max-w-7xl border-t border-ash/20 pt-6 text-sm text-ivory/55">© 2026 Skyline Student Association</p>
    </footer>
  );
}
