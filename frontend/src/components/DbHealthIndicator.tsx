import React from 'react';
import { Database, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export interface DbHealthIndicatorProps {
  status?: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  className?: string;
}

export const DbHealthIndicator: React.FC<DbHealthIndicatorProps> = ({
  status = 'healthy',
  latencyMs = 12,
  className = '',
}) => {
  const config = {
    healthy: {
      icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      text: 'Database Operational',
    },
    degraded: {
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
      color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      text: 'Database Degraded',
    },
    unhealthy: {
      icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
      color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      text: 'Database Unreachable',
    },
  }[status];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${config.color} ${className}`}>
      <Database className="w-3.5 h-3.5" />
      <span>{config.text}</span>
      {latencyMs !== undefined && <span className="opacity-60 font-mono text-[10px]">({latencyMs}ms)</span>}
    </div>
  );
};
