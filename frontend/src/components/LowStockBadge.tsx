import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface LowStockBadgeProps {
  stockQuantity: number;
  threshold?: number;
  className?: string;
}

export const LowStockBadge: React.FC<LowStockBadgeProps> = ({
  stockQuantity,
  threshold = 5,
  className = '',
}) => {
  const isOutOfStock = stockQuantity <= 0;
  const isLowStock = stockQuantity > 0 && stockQuantity <= threshold;

  if (isOutOfStock) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        Out of Stock
      </span>
    );
  }

  if (isLowStock) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        Low Stock ({stockQuantity} left)
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${className}`}>
      <CheckCircle2 className="w-3.5 h-3.5" />
      In Stock ({stockQuantity})
    </span>
  );
};
