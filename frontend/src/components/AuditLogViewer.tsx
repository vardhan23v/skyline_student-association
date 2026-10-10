import React from 'react';
import { ShieldAlert, FileText } from 'lucide-react';
import type { AuditLogItem } from '../api/audit';

export interface AuditLogViewerProps {
  logs: AuditLogItem[];
  loading?: boolean;
  className?: string;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs, loading, className = '' }) => {
  if (loading) {
    return <div className="p-8 text-center text-xs text-text-secondary">Loading audit trail...</div>;
  }

  if (!logs.length) {
    return (
      <div className="py-12 text-center text-text-secondary">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No audit records logged yet</p>
      </div>
    );
  }

  return (
    <div className={`divide-y divide-white/5 ${className}`}>
      {logs.map((log) => (
        <div key={log.id} className="py-3 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-crimson/15 text-crimson-light border border-crimson/20">
              <ShieldAlert className="w-3 h-3" />
              {log.action}
            </span>
            <span className="text-white font-medium">{log.entity_type} {log.entity_id ? `(#${log.entity_id.slice(0, 8)})` : ''}</span>
          </div>
          <span className="text-text-secondary/60 font-mono">{log.created_at}</span>
        </div>
      ))}
    </div>
  );
};
