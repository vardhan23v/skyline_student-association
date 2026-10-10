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
import { BackgroundStage } from '../components/landing/BackgroundStage';

/** Public landing page ("/"). Content lives in src/data/landing.ts. */
export function HomePage() {
  useSmoothScroll();
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative min-h-[100svh]">
        <BackgroundStage />
        <a href="#events" className="sr-only z-[90] rounded-full bg-cream px-4 py-2 font-bold text-midnight focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <GlassNav />
        <main className="relative z-[1]">
          <Hero />
          <SectionTransition><EventCarousel /></SectionTransition>
          <SectionTransition><PastEventsGrid /></SectionTransition>
          <SectionTransition><MerchSection /></SectionTransition>
          <SectionTransition><AboutSection /></SectionTransition>
          <SectionTransition><GalleryMarquee /></SectionTransition>
          <SectionTransition><JoinCTA /></SectionTransition>
        </main>
        <div className="relative z-[1]"><Footer /></div>
        <div aria-hidden="true" className="grain" />
        <StudentCursor />
      </div>
    </MotionConfig>
  );
}
