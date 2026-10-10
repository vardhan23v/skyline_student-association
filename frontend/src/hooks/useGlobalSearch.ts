import { useState, useMemo } from 'react';

export interface SearchResultItem {
  id: string;
  type: 'event' | 'product' | 'announcement' | 'page';
  title: string;
  subtitle?: string;
  url: string;
}

export function useGlobalSearch(items: SearchResultItem[]) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.type.toLowerCase().includes(q)
    );
  }, [items, query]);

  return { query, setQuery, results };
}
