import React from 'react';

export interface DrawerSwipeHandleProps {
  className?: string;
  label?: string;
}

export const DrawerSwipeHandle: React.FC<DrawerSwipeHandleProps> = ({
  className = '',
  label = 'Drag or swipe to dismiss',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-2 select-none touch-none ${className}`}>
      <div className="w-12 h-1.5 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-200" />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
};
