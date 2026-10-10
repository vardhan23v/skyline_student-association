import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  items,
  allowMultiple = false,
  className = '',
}) => {
  const [openIds, setOpenIds] = useState<string[]>([]);

  const toggleItem = (id: string) => {
    if (allowMultiple) {
      setOpenIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    } else {
      setOpenIds((prev) => (prev.includes(id) ? [] : [id]));
    }
  };

  return (
    <div className={`divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden ${className}`}>
      {items.map((item) => {
        const isOpen = openIds.includes(item.id);
        return (
          <div key={item.id} className="transition-colors">
            <button
              onClick={() => toggleItem(item.id)}
              className="w-full flex items-center justify-between p-4 text-left text-sm font-medium text-white hover:text-white transition-colors"
              aria-expanded={isOpen}
            >
              <span>{item.title}</span>
              <ChevronDown
                className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-crimson-light' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-xs text-text-secondary leading-relaxed animate-in fade-in slide-in-from-top-2 duration-150">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
