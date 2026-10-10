import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export interface ScrollToTopProps {
  threshold?: number;
  className?: string;
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({ threshold = 300, className = '' }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll back to top"
      className={`fixed bottom-6 right-6 z-40 p-3 rounded-full bg-crimson/90 hover:bg-crimson text-white shadow-xl shadow-crimson/30 backdrop-blur-md border border-white/20 transition-all duration-200 hover:scale-110 active:scale-95 ${className}`}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};
