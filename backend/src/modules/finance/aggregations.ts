import { getDb } from '../../config/db';

export interface MonthlyFinancialSummary {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  order_count: number;
}

export async function getMonthlyFinancialRollup(monthsBack = 6): Promise<MonthlyFinancialSummary[]> {
  const db = getDb();
  
  const payments = await db('payments')
    .where('status', 'succeeded')
    .select('amount', 'created_at');

  const expenses = await db('expenses')
    .where('status', 'approved')
    .select('amount', 'created_at');

  const monthlyMap = new Map<string, { revenue: number; expenses: number; count: number }>();

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, { revenue: 0, expenses: 0, count: 0 });
  }

  for (const p of payments) {
    const date = new Date(p.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap.has(key)) {
      const entry = monthlyMap.get(key)!;
      entry.revenue += Number(p.amount || 0);
      entry.count += 1;
    }
  }

  for (const e of expenses) {
    const date = new Date(e.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap.has(key)) {
      const entry = monthlyMap.get(key)!;
      entry.expenses += Number(e.amount || 0);
    }
  }

  return Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    expenses: data.expenses,
    net: data.revenue - data.expenses,
    order_count: data.count,
  }));
}
