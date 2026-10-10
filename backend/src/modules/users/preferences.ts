import { getDb } from '../../config/db';
import { nanoid } from 'nanoid';

export interface UserPreferences {
  id: string;
  user_id: string;
  email_announcements: boolean;
  event_reminders: boolean;
  renewal_alerts: boolean;
  theme_preference: string;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const db = getDb();
  let prefs = await db<UserPreferences>('user_preferences').where({ user_id: userId }).first();
  if (!prefs) {
    const id = nanoid();
    await db('user_preferences').insert({
      id,
      user_id: userId,
      email_announcements: true,
      event_reminders: true,
      renewal_alerts: true,
      theme_preference: 'midnight',
    });
    prefs = await db<UserPreferences>('user_preferences').where({ user_id: userId }).first();
  }
  return prefs!;
}

export async function updateUserPreferences(userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences> {
  const db = getDb();
  await getUserPreferences(userId);
  await db('user_preferences').where({ user_id: userId }).update({
    ...updates,
    updated_at: new Date(),
  });
  return (await db<UserPreferences>('user_preferences').where({ user_id: userId }).first())!;
}
