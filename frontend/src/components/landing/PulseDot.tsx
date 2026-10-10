import React from 'react';

export interface PulseDotProps {
  color?: string;
  className?: string;
}

export const PulseDot: React.FC<PulseDotProps> = ({ color = 'bg-crimson', className = '' }) => {
  return (
    <span className={`relative flex h-2 w-2 ${className}`}>
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
};
