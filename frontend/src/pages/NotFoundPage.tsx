import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export function NotFoundPage() {
  return <EmptyState icon={<Compass className="size-5" aria-hidden />} title="Page not found" description="That link doesn't go anywhere. Head back to events or your dashboard." action={<Link to="/" className="btn-primary">Go home</Link>} className="mt-10" />;
}
