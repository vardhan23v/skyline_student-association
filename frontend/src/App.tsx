import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Skeleton } from './components/EmptyState';
import { AppLayout } from './layouts/AppLayout';
import { RequireRole } from './auth/RequireRole';
import { useAuth } from './auth/AuthContext';
import { EventsPage } from './pages/public/EventsPage';
import { EventDetailPage } from './pages/public/EventDetailPage';
import { AnnouncementsPage } from './pages/public/AnnouncementsPage';
import { ShopPage } from './pages/public/ShopPage';
import { LoginPage, RegisterPage } from './pages/public/AuthPages';
import { MemberDashboard } from './pages/member/MemberDashboard';
import { TicketPage } from './pages/member/TicketPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HomePage } from './pages/HomePage';

// The admin dashboard (and the scanner and charts inside it) is its own chunk: public pages on a phone never fetch it.
const AdminHome = lazy(() => import('./pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })));
const Fallback = () => <div className="card"><Skeleton rows={6} /></div>;

/** /dashboard is only a redirect now: admin → /admin, user → /me, signed out → /login. */
function DashboardRedirect() {
  const { me, loading } = useAuth();
  if (loading) return <Fallback />;
  return <Navigate to={!me ? '/login?next=%2Fdashboard' : me.user.role === 'admin' ? '/admin' : '/me'} replace />;
}

/** Finance is admin-only: /finance opens the admin Finance tab for admins; everyone else goes to their own page. */
function FinanceRedirect() {
  const { me, loading } = useAuth();
  if (loading) return <Fallback />;
  return <Navigate to={me?.user.role === 'admin' ? '/admin?tab=finance' : me ? '/me' : '/'} replace />;
}

/** Old admin URLs (/admin/events, /admin/members, …) open the matching tab. */
function AdminTabRedirect() {
  const { tab } = useParams();
  return <Navigate to={`/admin?tab=${encodeURIComponent(tab ?? '')}`} replace />;
}

export function App() {
  return (
    <Routes>
      {/* Standalone: the landing page has its own nav and footer; login and register render with no app chrome. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardRedirect />} />

      <Route element={<AppLayout />}>
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/finance" element={<FinanceRedirect />} />

        <Route element={<RequireRole roles={['user']} />}>
          <Route path="/me" element={<MemberDashboard />} />
          <Route path="/tickets/:id" element={<TicketPage />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<Suspense fallback={<Fallback />}><AdminHome /></Suspense>} />
          <Route path="/admin/:tab/*" element={<AdminTabRedirect />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
