import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { TOKENS_FILE } from './global-setup';

/**
 * Every key page at four viewports: no horizontal scroll, the key controls visible with a ≥44px hit area,
 * and a full-page screenshot in tests/screenshots/<page>-<width>.png.
 */
const VIEWPORTS = [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];
const data = () => JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as { member: string; admin: string; eventId: number };

type Check = { name: string; path: () => string; as?: 'member' | 'admin'; key: (page: Page, width: number) => Promise<string[]> };

/** The navbar control that matters at this width: the hamburger below md, the first route link above. */
const navKey = async (_p: Page, w: number) => [w < 768 ? '[aria-controls="mobile-menu"]' : 'nav[aria-label="Primary"] a[href]:visible >> nth=1'];
const PAGES: Check[] = [
  { name: 'home', path: () => '/', key: async (p, w) => [...(await navKey(p, w)), '#top a.btn-l-primary'] },
  { name: 'events', path: () => '/events', key: navKey },
  { name: 'event-detail', path: () => `/events/${data().eventId}`, as: 'member', key: async (p, w) => [...(await navKey(p, w)), w < 1024 ? '[role="region"][aria-label="Register"] :is(a,button)' : 'aside[aria-label="Registration"] :is(a,button):visible'] },
  { name: 'shop', path: () => '/shop', key: async (p, w) => [...(await navKey(p, w)), '[role="radio"] >> nth=0', 'button:has-text("View cart")'] },
  { name: 'login', path: () => '/login', key: async () => ['button[type="submit"]', 'input[type="email"]'] },
  { name: 'register', path: () => '/register', key: async () => ['button[type="submit"]', 'button[aria-label="Show password"]'] },
  { name: 'me', path: () => '/me', as: 'member', key: navKey },
  ...(['overview', 'orders', 'events', 'checkin'] as const).map((tab): Check => ({
    name: `admin-${tab}`, path: () => `/admin?tab=${tab}`, as: 'admin',
    key: async (p, w) => [...(await navKey(p, w)), `[role="tab"][aria-selected="true"]`, '[role="tab"] >> nth=1'],
  })),
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
    for (const pg of PAGES) {
      test(pg.name, async ({ page }) => {
        if (pg.as) { const token = data()[pg.as]; await page.addInitScript((t) => localStorage.setItem('ssa_token', t), token); }
        // Not 'networkidle': the Orders tab holds a live SSE stream open, so the network is never idle.
        await page.goto(pg.path(), { waitUntil: 'load' });
        await page.locator('main, #main').first().waitFor();
        await page.waitForTimeout(800); // queries settle

        // Scroll through once so in-view reveals run (and lazy images load), then back to the top.
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(400);

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(scrollWidth, 'no horizontal scroll').toBeLessThanOrEqual(innerWidth);

        for (const sel of await pg.key(page, vp.width)) {
          const el = page.locator(sel).first();
          await expect(el, sel).toBeVisible();
          const box = (await el.boundingBox())!;
          expect(box.height, `${sel} is at least 44px tall`).toBeGreaterThanOrEqual(44);
        }

        await page.screenshot({ path: `tests/screenshots/${pg.name}-${vp.width}.png`, fullPage: true });
      });
    }
  });
}
