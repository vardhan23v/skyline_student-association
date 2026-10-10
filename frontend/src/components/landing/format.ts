const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit' });
const mon = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const full = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
export const dateParts = (iso: string) => ({ day: day.format(parse(iso)), month: mon.format(parse(iso)).toUpperCase() });
export const fullDate = (iso: string) => full.format(parse(iso));
