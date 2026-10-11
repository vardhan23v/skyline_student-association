import { describe, expect, it } from 'vitest';
import { checkNewPassword, loadCommonPasswords } from './password';

describe('client password checklist (same rules file as the API)', () => {
  it('marks what is missing for a weak password', async () => {
    await loadCommonPasswords();
    const r = checkNewPassword('12345678');
    expect(r.ok).toBe(false);
    expect(r.strength).toBe('weak');
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.ok]));
    expect(by).toMatchObject({ upper: false, lower: false, number: true, special: false, length: false, common: false });
  });

  it('uses the bundled common list once loaded', async () => {
    await loadCommonPasswords();
    expect(checkNewPassword('Sunshine#2026').errors).toContain('Too common, choose something less predictable');
  });

  it('accepts a strong password and rates it', async () => {
    await loadCommonPasswords();
    expect(checkNewPassword('Gala#Night7River')).toMatchObject({ ok: true, strength: 'strong' });
    expect(checkNewPassword('Gala#Night26')).toMatchObject({ ok: true, strength: 'okay' });
    expect(checkNewPassword('Priya#Gala2026x', { email: 'priya@x.edu' }).errors).toEqual(["Don't use your email name"]);
  });
});
