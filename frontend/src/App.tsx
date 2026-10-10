import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Skeleton } from './components/EmptyState';
import { AppLayout } from './layouts/AppLayout';
import { RequireRole } from './auth/RequireRole';
import { EventsPage } from './pages/public/EventsPage';
import { EventDetailPage } from './pages/public/EventDetailPage';
import { AnnouncementsPage } from './pages/public/AnnouncementsPage';
import { ShopPage } from './pages/public/ShopPage';
import { LoginPage, RegisterPage } from './pages/public/AuthPages';
import { MemberDashboard } from './pages/member/MemberDashboard';
import { TicketPage } from './pages/member/TicketPage';
import { VolunteerHome } from './pages/volunteer/VolunteerHome';
import { VerifyMemberPage } from './pages/volunteer/VerifyMemberPage';
import { TaskBoardPage } from './pages/volunteer/TaskBoardPage';
import { SubmitExpensePage } from './pages/volunteer/SubmitExpensePage';
import { AdminHome } from './pages/admin/AdminHome';
import { AdminMembersPage } from './pages/admin/AdminMembersPage';
import { AdminEventsPage } from './pages/admin/AdminEventsPage';
import { EventReportPage } from './pages/admin/EventReportPage';
import { AdminAnnouncementsPage } from './pages/admin/AdminAnnouncementsPage';
import { AdminProductsPage } from './pages/admin/AdminProductsPage';
import { AdminFundraisersPage } from './pages/admin/AdminFundraisersPage';
import { LedgerPage } from './pages/treasurer/LedgerPage';
import { ExpenseQueuePage } from './pages/treasurer/ExpenseQueuePage';
import { RecordCashPage } from './pages/treasurer/RecordCashPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HomePage } from './pages/HomePage';

// Chart and camera libraries are heavy; load these routes on demand (see vite.config manualChunks).
const FinancePublicPage = lazy(() => import('./pages/public/FinancePublicPage').then((m) => ({ default: m.FinancePublicPage })));
const ScannerPage = lazy(() => import('./pages/volunteer/ScannerPage').then((m) => ({ default: m.ScannerPage })));
const TreasurerHome = lazy(() => import('./pages/treasurer/TreasurerHome').then((m) => ({ default: m.TreasurerHome })));
const Fallback = () => <div className="card"><Skeleton rows={6} /></div>;

export function App() {
  return (
    <Routes>
      {/* Public landing page has its own minimal header/footer; everything else lives in the app shell. */}
      <Route path="/" element={<HomePage />} />
      <Route element={<AppLayout />}>
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/finance" element={<Suspense fallback={<Fallback />}><FinancePublicPage /></Suspense>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<RequireRole roles={['member']} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/me" element={<MemberDashboard />} />
          <Route path="/tickets/:id" element={<TicketPage />} />
        </Route>
        <Route element={<RequireRole roles={['volunteer', 'treasurer']} />}>
          <Route path="/volunteer" element={<VolunteerHome />} />
          <Route path="/volunteer/scan" element={<Suspense fallback={<Fallback />}><ScannerPage /></Suspense>} />
          <Route path="/volunteer/verify" element={<VerifyMemberPage />} />
          <Route path="/volunteer/tasks" element={<TaskBoardPage />} />
          <Route path="/volunteer/expenses/new" element={<SubmitExpensePage />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/members" element={<AdminMembersPage />} />
          <Route path="/admin/events" element={<AdminEventsPage />} />
          <Route path="/admin/events/:id/report" element={<EventReportPage />} />
          <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
          <Route path="/admin/products" element={<AdminProductsPage />} />
          <Route path="/admin/fundraisers" element={<AdminFundraisersPage />} />
        </Route>
        <Route element={<RequireRole roles={['treasurer']} />}>
          <Route path="/treasurer" element={<Suspense fallback={<Fallback />}><TreasurerHome /></Suspense>} />
          <Route path="/treasurer/ledger" element={<LedgerPage />} />
          <Route path="/treasurer/expenses" element={<ExpenseQueuePage />} />
          <Route path="/treasurer/cash" element={<RecordCashPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
