import { Suspense, lazy, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Skeleton } from './components/EmptyState';
import { AppLayout } from './layouts/AppLayout';
import { RequireRole } from './auth/RequireRole';
import { useAuth } from './auth/AuthContext';
import { EventsPage } from './pages/public/EventsPage';
import { EventDetailPage } from './pages/public/EventDetailPage';
import { AnnouncementsPage } from './pages/public/AnnouncementsPage';
import { ShopPage } from './pages/public/ShopPage';
import { LoginPage, RegisterPage, ResetPasswordPage } from './pages/public/AuthPages';
import { MemberDashboard } from './pages/member/MemberDashboard';
import { TicketPage } from './pages/member/TicketPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HomePage } from './pages/HomePage';

// The Control Room is its own set of chunks: public pages on a phone never fetch it. The layout loads once; each
// section loads on first visit (the camera and chart libraries only with Check-in and Finance).
const page = <M,>(load: () => Promise<M>, name: keyof M) => lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
const AdminLayout = page(() => import('./layouts/AdminLayout'), 'AdminLayout');
const AdminHome = page(() => import('./pages/admin/AdminHome'), 'AdminHome');
const AdminEventsPage = page(() => import('./pages/admin/AdminEventsPage'), 'AdminEventsPage');
const AdminEventDetail = page(() => import('./pages/admin/AdminEventsPage'), 'AdminEventDetail');
const AdminFundraisersPage = page(() => import('./pages/admin/AdminFundraisersPage'), 'AdminFundraisersPage');
const AdminCheckin = page(() => import('./pages/admin/ScannerPage'), 'AdminCheckin');
const AdminMembersPage = page(() => import('./pages/admin/AdminMembersPage'), 'AdminMembersPage');
const AdminOrdersPanel = page(() => import('./pages/admin/AdminProductsPage'), 'AdminOrdersPanel');
const AdminProductsPage = page(() => import('./pages/admin/AdminProductsPage'), 'AdminProductsPage');
const AdminAnnouncementsPage = page(() => import('./pages/admin/AdminAnnouncementsPage'), 'AdminAnnouncementsPage');
const FinanceOverview = page(() => import('./pages/admin/FinanceOverview'), 'FinanceOverview');
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
  return <Navigate to={me?.user.role === 'admin' ? '/admin/finance' : me ? '/me' : '/'} replace />;
}

export function App() {
  return (
    <Routes>
      {/* Standalone: the landing page has its own nav and footer; login and register render with no app chrome. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* The Control Room: one layout (top bar + sidebar) stays mounted across every section. Old `/admin?tab=` links
          are redirected by AdminHome. */}
      <Route element={<RequireRole roles={['admin']} />}>
        <Route path="/admin" element={<Suspense fallback={<div className="p-6"><Fallback /></div>}><AdminLayout /></Suspense>}>
          <Route index element={<AdminHome />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="events/:id" element={<AdminEventDetail />} />
          <Route path="fundraisers" element={<AdminFundraisersPage />} />
          <Route path="checkin" element={<AdminCheckin />} />
          <Route path="members" element={<AdminMembersPage />} />
          <Route path="orders" element={<AdminOrdersPanel />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="announcements" element={<AdminAnnouncementsPage />} />
          <Route path="finance" element={<FinanceOverview />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
