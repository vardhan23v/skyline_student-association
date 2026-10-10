let memory: string | null = null;
const KEY = 'ssa_token';
export const getToken = () => memory ?? (() => { try { return (memory = localStorage.getItem(KEY)); } catch { return null; } })();
export const setToken = (t: string) => { memory = t; try { localStorage.setItem(KEY, t); } catch {} };
export const clearToken = () => { memory = null; try { localStorage.removeItem(KEY); } catch {} };
