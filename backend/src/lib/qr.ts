import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { env } from '../config/env';

export type TicketQr = { tid: number; eid: number };
export type MemberQr = { uid: number };

/** QR token is a signed JWT, so the door check is a signature verify + one conditional UPDATE. */
export const signTicketQr = (p: TicketQr, expiresAt: Date) =>
  jwt.sign({ ...p, kind: 'ticket' }, env.QR_SECRET, { expiresIn: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) });

export const signMemberQr = (p: MemberQr) => jwt.sign({ ...p, kind: 'member' }, env.QR_SECRET, { expiresIn: '1d' });

export function verifyQr<T extends object>(token: string, kind: 'ticket' | 'member'): T | null {
  try {
    const payload = jwt.verify(token, env.QR_SECRET) as any;
    return payload.kind === kind ? (payload as T) : null;
  } catch {
    return null;
  }
}

export const qrDataUrl = (text: string) => QRCode.toDataURL(text, { margin: 1, width: 256 });
