import type { Announcement, Event } from '@/api/types';
import { datetime, money } from '@/components/format';

/**
 * Share-to-WhatsApp: the admin posts once on the site, then sends the same text to as many groups as they like from
 * WhatsApp's own picker. No WhatsApp API and no phone numbers: wa.me/?text= opens WhatsApp (app or Web) with the
 * message filled in, and on phones the native share sheet offers WhatsApp alongside every other app.
 */

/** The club's time zone (the backend's APP_TIMEZONE default), so a shared time reads the same for every recipient. */
export const CLUB_TZ = 'Asia/Kolkata';
/** WhatsApp shows long messages fine, but keep a forward short enough to read in a group without "Read more". */
export const MAX_SHARE_LENGTH = 1000;
const BODY_LIMIT = 300;
const TITLE_LIMIT = 200;

/** Absolute link on this site. The API is served from the same origin, so this is also the public URL. */
export const siteUrl = (path: string) => window.location.origin + path;

/** Cut to `max` characters at the last word boundary, adding … when anything was dropped. */
export function clip(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const free = (n: number | string) => (Number(n) === 0 ? 'Free' : money(n));

/** WhatsApp bold is *text*; an asterisk inside the title would end it early, so drop those. */
const bold = (s: string) => `*${clip(s.replace(/\*/g, ''), TITLE_LIMIT)}*`;

export function announcementText(a: Pick<Announcement, 'id' | 'title' | 'body'>) {
  const text = `📢 SKYLINE STUDENT ASSOCIATION\n${bold(a.title)}\n\n${clip(a.body, BODY_LIMIT)}\n\nRead more: ${siteUrl(`/announcements#a-${a.id}`)}`;
  return text.slice(0, MAX_SHARE_LENGTH);
}

export function eventText(e: Pick<Event, 'id' | 'title' | 'starts_at' | 'venue' | 'member_price' | 'non_member_price' | 'members_only'>) {
  const when = `🗓 ${datetime(e.starts_at, CLUB_TZ)}${e.venue ? ` · 📍 ${clip(e.venue, 120)}` : ''}`;
  const price = e.members_only ? `Members only · ${free(e.member_price)}` : `${free(e.non_member_price)} · Members ${free(e.member_price)}`;
  const text = `🎟 ${bold(e.title)}\n${when}\n${price}\nRegister: ${siteUrl(`/events/${e.id}`)}`;
  return text.slice(0, MAX_SHARE_LENGTH);
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

const isTouch = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** Phones: the native share sheet (WhatsApp, Instagram, Telegram...). Desktop: WhatsApp Web in a new tab. */
export async function share({ title, text }: { title: string; text: string; url?: string }) {
  if (typeof navigator.share === 'function' && isTouch()) {
    try { await navigator.share({ title, text }); return; } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // the user closed the sheet
    }
  }
  window.open(whatsappUrl(text), '_blank', 'noopener');
}

/** For apps without a share link (Instagram, Telegram desktop): copy and paste. Resolves false when blocked. */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
