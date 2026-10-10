import bcrypt from 'bcryptjs';
import { getDb } from '../../config/db';
import { conflict, unauthorized } from '../../lib/errors';
import { signToken, type Role } from '../../middleware/auth';
import { todayYmd } from '../../lib/dates';

/** Compared against when the email is unknown, so a failed login takes as long whether or not the account exists. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export type UserRow = { id: number; name: string; email: string; password_hash: string; role: Role; is_active: number | boolean };

export async function register(input: { name: string; email: string; password: string; student_id?: string; phone?: string }, role: Role = 'user') {
  const db = getDb();
  const existing = await db('users').where({ email: input.email.toLowerCase() }).first();
  if (existing) throw conflict('Email already registered');
  const password_hash = await bcrypt.hash(input.password, 10);
  return db.transaction(async (trx) => {
    const [id] = await trx('users').insert({ name: input.name, email: input.email.toLowerCase(), password_hash, role });
    if (input.student_id) {
      const dup = await trx('members').where({ student_id: input.student_id }).first();
      if (dup) throw conflict('Student ID already registered');
      await trx('members').insert({ user_id: id, student_id: input.student_id, phone: input.phone ?? null, joined_at: todayYmd() }); // DATE column: a calendar day, not a timestamp
    }
    const user = (await trx('users').where({ id }).first()) as UserRow;
    return { user: publicUser(user), token: signToken({ id: user.id, role: user.role, email: user.email }) };
  });
}

export async function login(email: string, password: string) {
  const user = (await getDb()('users').where({ email: email.toLowerCase() }).first()) as UserRow | undefined;
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.is_active || !ok) throw unauthorized('Invalid credentials');
  return { user: publicUser(user), token: signToken({ id: user.id, role: user.role, email: user.email }) };
}

export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
