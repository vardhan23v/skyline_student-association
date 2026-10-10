import React from 'react';
import { Inbox, Sparkles } from 'lucide-react';

export interface EmptyIllustrationProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyIllustration: React.FC<EmptyIllustrationProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5 ${className}`}>
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-2xl bg-crimson/10 border border-crimson/20 flex items-center justify-center text-crimson-light">
          {icon || <Inbox className="w-8 h-8" />}
        </div>
        <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      {description && <p className="text-xs text-text-secondary max-w-sm mb-5">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
};
