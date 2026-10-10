import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';

export interface HoloPassProps {
  name: string;
  membershipId: string;
  expiryDate?: string;
  status?: string;
  className?: string;
}

export const HoloPass: React.FC<HoloPassProps> = ({
  name,
  membershipId,
  expiryDate,
  status = 'Active Member',
  className = '',
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-6 border border-white/20 bg-gradient-to-br from-crimson/40 via-night-surface to-amber-900/30 shadow-2xl backdrop-blur-xl ${className}`}
    >
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-crimson/20 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/10 border border-white/20 text-cream">
            <Sparkles className="w-3 h-3 text-amber-400" />
            {status}
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight pt-2">{name}</h3>
          <p className="text-xs font-mono text-text-secondary">ID: {membershipId}</p>
        </div>
        <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
          <ShieldCheck className="w-8 h-8 text-amber-400" />
        </div>
      </div>

      {expiryDate && (
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-text-secondary">
          <span>Valid Through:</span>
          <span className="font-semibold text-white">{expiryDate}</span>
        </div>
      )}
    </div>
  );
};
