import React, { useState } from 'react';
import { Bell, Mail, Shield, Save } from 'lucide-react';
import { useToast } from './Toast';

export const UserPreferencesForm: React.FC = () => {
  const [emailAnnounce, setEmailAnnounce] = useState(true);
  const [eventReminders, setEventReminders] = useState(true);
  const { success } = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    success('Preferences saved', 'Your notification settings have been updated.');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-6">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <Bell className="w-4 h-4 text-crimson" />
          Communication Channels
        </h3>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-text-secondary" />
                Official Announcements
              </span>
              <p className="text-xs text-text-secondary">Receive newsletter and major student association announcements</p>
            </div>
            <input
              type="checkbox"
              checked={emailAnnounce}
              onChange={(e) => setEmailAnnounce(e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-crimson focus:ring-crimson h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-text-secondary" />
                Event Day Reminders & Ticket QR
              </span>
              <p className="text-xs text-text-secondary">Get notified 24 hours prior to registered events with QR passes</p>
            </div>
            <input
              type="checkbox"
              checked={eventReminders}
              onChange={(e) => setEventReminders(e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-crimson focus:ring-crimson h-4 w-4"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-crimson hover:bg-crimson-dark text-white text-sm font-medium shadow-lg shadow-crimson/20 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Save Preferences</span>
        </button>
      </div>
    </form>
  );
};
