import React from 'react';
import { X } from 'lucide-react';

export interface FilterChipOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClear?: () => void;
  className?: string;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  options,
  selectedId,
  onSelect,
  onClear,
  className = '',
}) => {
  return (
    <div className={`flex items-center flex-wrap gap-2 ${className}`}>
      {options.map((opt) => {
        const isSelected = opt.id === selectedId;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            type="button"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              isSelected
                ? 'bg-crimson text-white shadow-lg shadow-crimson/30 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white border border-white/10'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isSelected ? 'bg-black/20 text-white' : 'bg-white/10 text-text-secondary'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}

      {selectedId !== 'all' && onClear && (
        <button
          onClick={onClear}
          type="button"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-text-secondary/70 hover:text-white hover:underline transition-colors"
        >
          <X className="w-3 h-3" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
};
