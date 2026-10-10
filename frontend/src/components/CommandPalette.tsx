import React, { useState, useEffect, useRef } from 'react';
import { Search, Calendar, ShoppingBag, Bell, Shield, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface PaletteItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Events' | 'Shop' | 'Actions';
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const defaultItems: PaletteItem[] = [
    { id: 'home', title: 'Home Page', category: 'Navigation', icon: <Search className="w-4 h-4" />, action: () => navigate('/') },
    { id: 'events', title: 'Browse Events', category: 'Events', icon: <Calendar className="w-4 h-4" />, action: () => navigate('/events') },
    { id: 'shop', title: 'Merchandise Shop', category: 'Shop', icon: <ShoppingBag className="w-4 h-4" />, action: () => navigate('/shop') },
    { id: 'announcements', title: 'Announcements & Updates', category: 'Navigation', icon: <Bell className="w-4 h-4" />, action: () => navigate('/announcements') },
    { id: 'admin', title: 'Admin Command Center', category: 'Actions', icon: <Shield className="w-4 h-4" />, action: () => navigate('/admin') },
  ];

  const filteredItems = defaultItems.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-night/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-night-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden holo-card-shine">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          <Search className="w-5 h-5 text-cream/40" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands, pages, events... (Esc to exit)"
            className="flex-1 bg-transparent text-cream placeholder-cream/30 text-sm focus:outline-none"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-cream/40 hover:text-cream hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-cream/40">No matching commands found</div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-150 ${
                  index === selectedIndex
                    ? 'bg-crimson/20 text-white border border-crimson/30'
                    : 'text-cream/80 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="p-1.5 rounded-lg bg-white/5 text-crimson-light">{item.icon}</span>
                  <span className="font-medium">{item.title}</span>
                </div>
                <span className="text-xs text-cream/30 uppercase tracking-wider">{item.category}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
