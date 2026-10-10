import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs text-text-secondary ${className}`}>
      <Link to="/" className="inline-flex items-center hover:text-white transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3 h-3 text-text-secondary/50 shrink-0" />
          {item.href && !item.active ? (
            <Link to={item.href} className="hover:text-white transition-colors truncate max-w-[150px]">
              {item.label}
            </Link>
          ) : (
            <span className="text-white font-medium truncate max-w-[180px]" aria-current={item.active ? 'page' : undefined}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
