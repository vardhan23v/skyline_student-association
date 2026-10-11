import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, legacyAdminPath } from './AdminTabs';

describe('legacyAdminPath (old /admin?tab= links)', () => {
  it('leaves URLs without tab alone', () => {
    expect(legacyAdminPath('')).toBeNull();
    expect(legacyAdminPath('?view=dues')).toBeNull();
  });

  it('maps every section to its own path', () => {
    for (const s of ADMIN_SECTIONS) expect(legacyAdminPath(`?tab=${s.key}`)).toBe(s.to);
  });

  it('keeps the section params and drops tab', () => {
    expect(legacyAdminPath('?tab=finance&view=dues')).toBe('/admin/finance?view=dues');
    expect(legacyAdminPath('?tab=fundraisers&id=4')).toBe('/admin/fundraisers?id=4');
  });

  it('turns an event report link into /admin/events/:id', () => {
    expect(legacyAdminPath('?tab=events&event=12')).toBe('/admin/events/12');
    expect(legacyAdminPath('?tab=events&event=abc')).toBe('/admin/events?event=abc');
  });

  it('sends unknown tabs to the overview without their params', () => {
    expect(legacyAdminPath('?tab=nope&x=1')).toBe('/admin');
  });

  it('gives every section a unique path under /admin', () => {
    const paths = ADMIN_SECTIONS.map((s) => s.to);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p === '/admin' || p.startsWith('/admin/'))).toBe(true);
  });
});
