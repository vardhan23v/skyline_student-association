import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export interface MonthlyBreakdownItem {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface MonthlyBreakdownChartProps {
  data: MonthlyBreakdownItem[];
  height?: number;
  className?: string;
}

export const MonthlyBreakdownChart: React.FC<MonthlyBreakdownChartProps> = ({
  data,
  height = 280,
  className = '',
}) => {
  return (
    <div className={`p-4 rounded-2xl bg-white/[0.02] border border-white/10 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-4">
        Monthly Revenue & Expense Comparison
      </h4>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#12121a',
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#fff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }} />
            <Bar dataKey="revenue" name="Revenue ($)" fill="#e11d48" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
