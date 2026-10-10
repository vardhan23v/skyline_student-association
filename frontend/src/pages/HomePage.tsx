import { MotionConfig } from 'framer-motion';
import { useSmoothScroll } from '../hooks/useSmoothScroll';
import { GlassNav } from '../components/landing/GlassNav';
import { Hero } from '../components/landing/Hero';
import { EventCarousel } from '../components/landing/EventCarousel';
import { PastEventsGrid } from '../components/landing/PastEventsGrid';
import { MerchSection } from '../components/landing/MerchCursorPreview';
import { AboutSection } from '../components/landing/AboutSection';
import { GalleryMarquee } from '../components/landing/GalleryMarquee';
import { JoinCTA } from '../components/landing/JoinCTA';
import { Footer } from '../components/landing/Footer';
import { SectionTransition } from '../components/landing/SectionTransition';
import { StudentCursor } from '../components/cursor/StudentCursor';

/** Public landing page ("/"). Content lives in src/data/landing.ts. */
export function HomePage() {
  useSmoothScroll();
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing min-h-screen overflow-x-clip">
        <a href="#events" className="sr-only z-[90] rounded-full bg-crimson px-4 py-2 font-bold text-ivory focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <GlassNav />
        <main>
          <Hero />
          <SectionTransition><EventCarousel /></SectionTransition>
          <SectionTransition><PastEventsGrid /></SectionTransition>
          <SectionTransition><MerchSection /></SectionTransition>
          <SectionTransition><AboutSection /></SectionTransition>
          <SectionTransition><GalleryMarquee /></SectionTransition>
          <SectionTransition><JoinCTA /></SectionTransition>
        </main>
        <Footer />
        <div aria-hidden="true" className="grain" />
        <StudentCursor />
      </div>
    </MotionConfig>
  );
}
