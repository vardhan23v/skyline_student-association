export function exportToCSV<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T; header: string }[]
): void {
  if (!rows || rows.length === 0) return;

  const headers = columns ? columns.map((c) => c.header) : Object.keys(rows[0]);
  const keys = columns ? columns.map((c) => c.key) : (Object.keys(rows[0]) as (keyof T)[]);

  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => keys.map((k) => escapeCSV(row[k])).join(',')),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename.replace(/\.csv$/i, '')}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
