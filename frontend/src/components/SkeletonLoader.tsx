import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  count = 1,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'text':
        return 'rounded h-4 w-3/4 my-1';
      case 'card':
        return 'rounded-2xl h-48 w-full';
      case 'rectangular':
      default:
        return 'rounded-lg';
    }
  };

  const elements = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      style={{ width, height }}
      className={`animate-pulse bg-white/5 border border-white/5 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent ${getVariantStyles()} ${className}`}
    />
  ));

  return count === 1 ? <>{elements[0]}</> : <div className="space-y-2">{elements}</div>;
};
