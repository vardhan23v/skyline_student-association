import { api } from './client';

export interface UserPreferencesDto {
  id?: string;
  user_id?: string;
  email_announcements: boolean;
  event_reminders: boolean;
  renewal_alerts: boolean;
  theme_preference: string;
}

export async function fetchUserPreferences(): Promise<UserPreferencesDto> {
  return api<UserPreferencesDto>('/me/preferences');
}

export async function updateUserPreferences(updates: Partial<UserPreferencesDto>): Promise<UserPreferencesDto> {
  return api<UserPreferencesDto>('/me/preferences', { method: 'PATCH', json: updates });
}
