import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, HandCoins, ListChecks, Pencil, Plus, Wallet } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { AdminUser, Fundraiser, FundraiserHealth, FundraiserStatus, Task } from '@/api/types';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { LabeledInput, LabeledSelect, LabeledTextarea, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { date, money } from '@/components/format';

const HEALTH: Record<FundraiserHealth, string> = { on_track: 'On track', behind: 'Behind', no_data: 'No data', completed: 'Completed', cancelled: 'Cancelled' };
const STATUSES: { value: FundraiserStatus; label: string }[] = [{ value: 'planned', label: 'Planned' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }];
const TASK_STATUSES: { value: Task['status']; label: string }[] = [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }];
const ymd = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const daysLeft = (d: number | null) => (d == null ? 'No end date' : d > 0 ? `${d} day${d === 1 ? '' : 's'} left` : d === 0 ? 'Ends today' : `Ended ${-d} day${d === -1 ? '' : 's'} ago`);

/** Every fundraiser query starts with ['fundraisers'] (list, detail, tasks), so one invalidate refreshes them all. */
function useRefresh() {
  const qc = useQueryClient();
  return (money = false) => {
    qc.invalidateQueries({ queryKey: ['fundraisers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    if (money) { qc.invalidateQueries({ queryKey: ['ledger'] }); qc.invalidateQueries({ queryKey: ['finance'] }); }
  };
}

/**
 * Admin › Fundraisers: each fundraiser split into tasks with an owner and a due date, and whether it's on track.
 * Raised comes from the ledger and health from the server; nothing here is computed from client-side numbers.
 * The list is `/admin/fundraisers`; one fundraiser is `/admin/fundraisers?id=…`.
 */
export function AdminFundraisersPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('id')) || null;
  return id ? <FundraiserDetail id={id} /> : <FundraiserList />;
}

function HealthBadge({ health }: { health: FundraiserHealth }) {
  return <StatusBadge status={health}>{HEALTH[health]}</StatusBadge>;
}

/** Raised against target: the bar is capped at 100%, the label shows the real amount and percentage. */
function RaisedBar({ f }: { f: Fundraiser }) {
  const pct = f.progress_pct ?? 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span><span className="t-num text-base font-semibold">{money(f.raised)}</span>{f.target_amount > 0 && <span className="text-text-secondary"> of {money(f.target_amount)}</span>}</span>
        <span className="t-num t-caption">{f.progress_pct != null ? `${f.progress_pct}%` : 'No target'}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label={f.progress_pct != null ? `${money(f.raised)} raised of ${money(f.target_amount)}, ${f.progress_pct}%` : `${money(f.raised)} raised, no target`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

function Figures({ f }: { f: Fundraiser }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      <div><dt className="t-label">Tasks done</dt><dd className="mt-0.5 t-num">{f.tasks_done} / {f.tasks_total}</dd></div>
      <div><dt className="t-label">Overdue</dt><dd className={`mt-0.5 t-num ${f.tasks_overdue > 0 ? 'font-semibold text-danger' : ''}`}>{f.tasks_overdue}</dd></div>
      <div><dt className="t-label">Timeline</dt><dd className={`mt-0.5 ${f.days_left != null && f.days_left < 0 && f.status === 'active' ? 'text-danger' : ''}`}>{daysLeft(f.days_left)}</dd></div>
      <div className="min-w-0"><dt className="t-label">Assignees</dt><dd className="mt-0.5 truncate">{f.assignees.length ? f.assignees.join(', ') : '—'}</dd></div>
    </dl>
  );
}

function FundraiserList() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/admin/fundraisers') });
  return (
    <>
      <PageHeader script="fund" title="Raisers" description="Split each fundraiser into tasks, see who is doing each one, and whether it's on track."
        actions={<Button onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>New fundraiser</Button>} />
      <ErrorState error={q.error} onRetry={() => q.refetch()} className="mb-4" />
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="card"><Skeleton rows={4} /></div>)}</div>
      ) : q.data && !q.data.length ? (
        <EmptyState icon={<HandCoins className="size-5" aria-hidden />} title="No fundraisers yet" description="Create one, then split the work into tasks."
          action={<Button onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>New fundraiser</Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data?.map((f) => (
            <li key={f.id}>
              <Link to={`/admin/fundraisers?id=${f.id}`} className="card card-hover interactive flex h-full flex-col gap-4 focus-ring">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-lg font-semibold">{f.name}</h2>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5"><StatusBadge status={f.status} />{f.health !== f.status && <HealthBadge health={f.health} />}</div>
                </div>
                <RaisedBar f={f} />
                <Figures f={f} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <FundraiserForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/** New or edit fundraiser. The raised amount is never entered here: it comes from the ledger. */
function FundraiserForm({ open, onClose, fundraiser }: { open: boolean; onClose: () => void; fundraiser?: Fundraiser }) {
  const toast = useToast(); const refresh = useRefresh();
  const [, setParams] = useSearchParams();
  const blank = { name: '', description: '', target_amount: '', starts_on: '', ends_on: '', status: 'planned' as FundraiserStatus };
  const fromF = (f: Fundraiser) => ({ name: f.name, description: f.description ?? '', target_amount: String(f.target_amount), starts_on: ymd(f.starts_on), ends_on: ymd(f.ends_on), status: f.status });
  const [v, setV] = useState(blank);
  const [seen, setSeen] = useState<boolean>(false);
  // Reset the fields each time the dialog opens.
  if (open !== seen) { setSeen(open); if (open) setV(fundraiser ? fromF(fundraiser) : blank); }
  const save = useMutation({
    mutationFn: () => {
      const body = { name: v.name, description: v.description || undefined, target_amount: Number(v.target_amount || 0), starts_on: v.starts_on || null, ends_on: v.ends_on || null, status: v.status };
      return fundraiser ? patch<Fundraiser>(`/admin/fundraisers/${fundraiser.id}`, body) : post<Fundraiser>('/admin/fundraisers', body);
    },
    onSuccess: (f) => {
      refresh(); onClose();
      toast.success(fundraiser ? 'Fundraiser updated' : 'Fundraiser created', fundraiser ? undefined : 'Now split the work into tasks.');
      if (!fundraiser) setParams({ id: String(f.id) });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open={open} onClose={onClose} title={fundraiser ? 'Edit fundraiser' : 'New fundraiser'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="fundraiser-form" type="submit" loading={save.isPending}>{fundraiser ? 'Save' : 'Create'}</Button></>}>
      <form id="fundraiser-form" className="space-y-4" onSubmit={submit}>
        <LabeledInput label="Name" required maxLength={200} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <LabeledTextarea label="Description" rows={3} maxLength={5000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledInput label="Target ₹" type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={v.target_amount} onChange={(e) => setV({ ...v, target_amount: e.target.value })} />
          <LabeledSelect label="Status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as FundraiserStatus })}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</LabeledSelect>
          <LabeledInput label="Starts" type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} />
          <LabeledInput label="Ends" type="date" min={v.starts_on || undefined} value={v.ends_on} onChange={(e) => setV({ ...v, ends_on: e.target.value })} />
        </div>
        <ErrorState error={save.error} />
      </form>
    </Modal>
  );
}

function FundraiserDetail({ id }: { id: number }) {
  const qc = useQueryClient(); const toast = useToast(); const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<Task | 'new' | null>(null);
  const [filter, setFilter] = useState({ status: '', assignee_id: '', overdue: false });
  const f = useQuery({ queryKey: ['fundraisers', id], queryFn: () => get<Fundraiser>(`/admin/fundraisers/${id}`) });
  const admins = useQuery({ queryKey: ['admin', 'users', 'admin'], queryFn: () => get<AdminUser[]>('/admin/users?role=admin'), staleTime: 5 * 60_000 });
  const qs = new URLSearchParams({ fundraiser_id: String(id), ...(filter.status ? { status: filter.status } : {}), ...(filter.assignee_id ? { assignee_id: filter.assignee_id } : {}), ...(filter.overdue ? { overdue: 'true' } : {}) }).toString();
  const tasksKey = ['fundraisers', id, 'tasks'];
  const tasks = useQuery({ queryKey: [...tasksKey, qs], queryFn: () => get<Task[]>(`/admin/tasks?${qs}`), placeholderData: (prev) => prev });
  const filtered = !!(filter.status || filter.assignee_id || filter.overdue);

  // Inline status and assignee changes show at once; the server's answer (and the fundraiser's figures) follow.
  const update = useMutation({
    mutationFn: ({ task, ...body }: { task: Task; status?: Task['status']; assignee_id?: number | null }) => patch<Task>(`/admin/tasks/${task.id}`, body),
    onMutate: async ({ task, ...body }) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const prev = qc.getQueriesData<Task[]>({ queryKey: tasksKey });
      const assignee = body.assignee_id === undefined ? task.assignee : body.assignee_id === null ? null : { id: body.assignee_id, name: admins.data?.find((a) => a.id === body.assignee_id)?.name ?? '' };
      qc.setQueriesData<Task[]>({ queryKey: tasksKey }, (rows) => rows?.map((t) => (t.id === task.id ? { ...t, ...body, assignee, overdue: body.status === 'done' ? false : t.overdue } : t)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => { ctx?.prev.forEach(([k, d]) => qc.setQueryData(k, d)); toast.error('Could not update the task', e.message); },
    onSettled: () => refresh(),
  });

  if (f.error) return <><BackLink /><ErrorState error={f.error} onRetry={() => f.refetch()} /></>;
  if (!f.data) return <><BackLink /><div className="card"><Skeleton rows={6} /></div></>;
  const fr = f.data;
  const assigneeOptions = (t?: Task) => {
    const list = admins.data ?? [];
    // Keep a former admin visible on tasks they already hold, so the select shows the real value.
    const extra = t?.assignee && !list.some((a) => a.id === t.assignee!.id) ? [{ id: t.assignee.id, name: t.assignee.name }] : [];
    return [...list, ...extra].map((a) => <option key={a.id} value={a.id}>{a.name}</option>);
  };

  return (
    <>
      <BackLink />
      <PageHeader script="fund" title={fr.name} description={fr.description || undefined}
        actions={<><Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden />}>Edit</Button><Button onClick={() => setCashOpen(true)} icon={<Wallet className="size-4" aria-hidden />}>Record cash</Button></>} />
      <section className="card mb-8 space-y-5" aria-label="Progress">
        <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={fr.status} />{fr.health !== fr.status && <HealthBadge health={fr.health} />}
          <span className="t-caption ml-1">{fr.starts_on || fr.ends_on ? `${date(fr.starts_on)} – ${date(fr.ends_on)}` : 'No dates set'}</span></div>
        <RaisedBar f={fr} />
        <Figures f={fr} />
        {fr.spent > 0 && <p className="t-caption">Spent so far (reimbursements): {money(fr.spent)}</p>}
      </section>

      <SectionHeader title="Tasks" meta={tasks.data ? `${tasks.data.length} shown` : undefined}
        actions={<Button size="sm" onClick={() => setTaskForm('new')} icon={<Plus className="size-4" aria-hidden />}>Add task</Button>} />
      <div className="card mb-4 flex flex-wrap items-center gap-2 !p-3 sm:!py-3" role="search" aria-label="Filter tasks">
        <label htmlFor="tf-status" className="sr-only">Task status</label>
        <Select id="tf-status" className="!w-auto flex-1 sm:flex-none" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Any status</option>{TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <label htmlFor="tf-assignee" className="sr-only">Assignee</label>
        <Select id="tf-assignee" className="!w-auto flex-1 sm:flex-none" value={filter.assignee_id} onChange={(e) => setFilter({ ...filter, assignee_id: e.target.value })}>
          <option value="">Anyone</option>{assigneeOptions()}
        </Select>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-border-strong px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} />Overdue only</label>
      </div>
      <DataTable rows={tasks.data} loading={tasks.isLoading} error={tasks.error} onRetry={() => tasks.refetch()} rowKey={(t) => t.id} caption="Tasks"
        rowClassName={(t) => (t.overdue ? '!bg-danger-soft' : '')}
        empty={filtered
          ? <EmptyState icon={<ListChecks className="size-5" aria-hidden />} title="No tasks match" description="Try different filters." action={<Button variant="secondary" onClick={() => setFilter({ status: '', assignee_id: '', overdue: false })}>Clear filters</Button>} />
          : <EmptyState icon={<ListChecks className="size-5" aria-hidden />} title="No tasks yet" description="Split the work into tasks." action={<Button onClick={() => setTaskForm('new')} icon={<Plus className="size-4" aria-hidden />}>Add task</Button>} />}
        columns={[
          { key: 'title', header: 'Task', mobile: 'primary', render: (t) => <span className="font-medium">{t.title}{t.overdue && <span className="ml-2 align-middle"><StatusBadge status="expired">Overdue</StatusBadge></span>}</span> },
          { key: 'assignee', header: 'Assignee', render: (t) => (
            <Select aria-label={`Assignee for ${t.title}`} className="min-w-36" value={t.assignee?.id ?? ''} disabled={admins.isLoading}
              onChange={(e) => update.mutate({ task: t, assignee_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Unassigned</option>{assigneeOptions(t)}
            </Select>
          ) },
          { key: 'due', header: 'Due', render: (t) => <span className={`whitespace-nowrap ${t.overdue ? 'font-semibold text-danger' : ''}`}>{date(t.due_on)}</span> },
          { key: 'status', header: 'Status', render: (t) => (
            <Select aria-label={`Status of ${t.title}`} className="min-w-28" value={t.status} onChange={(e) => update.mutate({ task: t, status: e.target.value as Task['status'] })}>
              {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          ) },
          { key: 'actions', header: <span className="sr-only">Actions</span>, mobile: 'actions', align: 'right', render: (t) => <Button size="sm" variant="ghost" onClick={() => setTaskForm(t)} icon={<Pencil className="size-4" aria-hidden />}>Edit<span className="sr-only"> {t.title}</span></Button> },
        ]} />

      <FundraiserForm open={editing} onClose={() => setEditing(false)} fundraiser={fr} />
      <TaskForm fundraiserId={id} task={taskForm} onClose={() => setTaskForm(null)} options={assigneeOptions} />
      <CashForm fundraiser={fr} open={cashOpen} onClose={() => setCashOpen(false)} />
    </>
  );
}

function BackLink() {
  return <Link to="/admin/fundraisers" className="interactive mb-4 inline-flex min-h-11 items-center gap-2 rounded text-sm text-text-secondary hover:text-cream focus-ring"><ArrowLeft className="size-4" aria-hidden />All fundraisers</Link>;
}

/** Add a task, or edit one's title, assignee and due date (status changes inline in the table). */
function TaskForm({ fundraiserId, task, onClose, options }: { fundraiserId: number; task: Task | 'new' | null; onClose: () => void; options: (t?: Task) => ReactNode }) {
  const toast = useToast(); const refresh = useRefresh();
  const editing = task && task !== 'new' ? task : undefined;
  const [v, setV] = useState({ title: '', assignee_id: '', due_on: '' });
  const [seen, setSeen] = useState<Task | 'new' | null>(null);
  if (task !== seen) { setSeen(task); if (task) setV(editing ? { title: editing.title, assignee_id: editing.assignee ? String(editing.assignee.id) : '', due_on: ymd(editing.due_on) } : { title: '', assignee_id: '', due_on: '' }); }
  const save = useMutation({
    mutationFn: () => {
      const body = { title: v.title, assignee_id: v.assignee_id ? Number(v.assignee_id) : null, due_on: v.due_on || null };
      return editing ? patch<Task>(`/admin/tasks/${editing.id}`, body) : post<Task>(`/admin/fundraisers/${fundraiserId}/tasks`, body);
    },
    onSuccess: (t) => { refresh(); onClose(); toast.success(editing ? 'Task updated' : 'Task added', t.assignee ? `Assigned to ${t.assignee.name}.` : undefined); },
  });
  return (
    <Modal open={!!task} onClose={onClose} title={editing ? 'Edit task' : 'Add task'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="task-form" type="submit" loading={save.isPending}>{editing ? 'Save' : 'Add task'}</Button></>}>
      <form id="task-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <LabeledInput label="Task" required maxLength={200} placeholder="e.g. Buy supplies" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledSelect label="Assignee" hint="Admins only" value={v.assignee_id} onChange={(e) => setV({ ...v, assignee_id: e.target.value })}><option value="">Unassigned</option>{options(editing)}</LabeledSelect>
          <LabeledInput label="Due date" type="date" value={v.due_on} onChange={(e) => setV({ ...v, due_on: e.target.value })} />
        </div>
        <ErrorState error={save.error} />
      </form>
    </Modal>
  );
}

/** Cash taken for this fundraiser: one ledger entry (and a cash receipt), which then counts towards raised. */
function CashForm({ fundraiser, open, onClose }: { fundraiser: Fundraiser; open: boolean; onClose: () => void }) {
  const toast = useToast(); const refresh = useRefresh();
  const [v, setV] = useState({ amount: '', memo: '' });
  const save = useMutation({
    mutationFn: () => post(`/admin/fundraisers/${fundraiser.id}/cash-income`, { amount: Number(v.amount), memo: v.memo || undefined }),
    onSuccess: () => { refresh(true); toast.success(`${money(v.amount)} recorded`, 'Ledger entry written.'); setV({ amount: '', memo: '' }); onClose(); },
  });
  return (
    <Modal open={open} onClose={() => { save.reset(); onClose(); }} title="Record cash" description={fundraiser.name}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="cash-form" type="submit" loading={save.isPending} icon={<Wallet className="size-4" aria-hidden />}>Record{v.amount ? ` ${money(v.amount)}` : ''}</Button></>}>
      <form id="cash-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <LabeledInput label="Amount ₹" type="number" inputMode="decimal" min="1" step="0.01" required value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        <LabeledInput label="Memo (optional)" maxLength={400} placeholder="e.g. Bake sale day 3" value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} />
        <p className="t-caption">Appears once in the Finance ledger as fundraiser income. Mistakes are corrected with a reversal there.</p>
        <ErrorState error={save.error} />
      </form>
    </Modal>
  );
}
