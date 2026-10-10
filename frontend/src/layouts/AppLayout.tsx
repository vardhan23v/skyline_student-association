import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { SecretaryDrawer } from '@/components/SecretaryDrawer';

const link = ({ isActive }: { isActive: boolean }) => `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

export function AppLayout() {
  const { me, logout, has } = useAuth();
  const [ai, setAi] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <Link to="/" className="font-semibold text-indigo-700 mr-4">SSA Portal</Link>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/events" className={link}>Events</NavLink>
            <NavLink to="/announcements" className={link}>Announcements</NavLink>
            <NavLink to="/shop" className={link}>Shop</NavLink>
            <NavLink to="/finance" className={link}>Finances</NavLink>
            {me && <NavLink to="/me" className={link}>My dashboard</NavLink>}
            {has('volunteer') && <NavLink to="/volunteer" className={link}>Volunteer</NavLink>}
            {has('admin') && <NavLink to="/admin" className={link}>Admin</NavLink>}
            {has('treasurer') && <NavLink to="/treasurer" className={link}>Treasurer</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {me ? (<>
              <button className="btn-secondary !py-1" onClick={() => setAi(true)}>✨ Secretary</button>
              <span className="text-slate-600 hidden sm:inline">{me.user.name} · <span className="badge bg-slate-100">{me.user.role}</span></span>
              <button className="text-slate-500 hover:text-slate-800" onClick={logout}>Log out</button>
            </>) : (<><Link to="/login" className="btn-secondary !py-1">Log in</Link><Link to="/register" className="btn-primary !py-1">Join</Link></>)}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6"><Outlet /></main>
      <footer className="text-center text-xs text-slate-400 py-4">Skyline Student Association</footer>
      {me && <SecretaryDrawer open={ai} onClose={() => setAi(false)} />}
    </div>
  );
}
