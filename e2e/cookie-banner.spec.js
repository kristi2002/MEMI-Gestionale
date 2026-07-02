/**
 * cookie-banner.spec.js — the GDPR consent banner works in a real browser.
 * --------------------------------------------------------------------------
 * Verifies (docs/PRODUCTION-ROADMAP.md Phase 4):
 *   • the banner appears on first visit (no memi_cookie_consent stored)
 *   • "Rifiuta non necessari" stores {statistics:false, marketing:false}
 *   • the banner does NOT reappear on reload once a choice is stored
 *   • "Accetta tutti" stores {statistics:true, marketing:true}
 *   • the footer legal links point at the real legal pages
 *   • window.MemiConsent.openPreferences() reopens the panel
 *
 * Requires the local stack up (storefront http://localhost:8080).
 * Run:  npm run test:e2e
 */
const { test, expect } = require('@playwright/test');

const SHOP = process.env.MEMI_SHOP || 'http://localhost:8080';

test.describe('cookie consent banner', () => {
  test('first visit shows banner; Rifiuta stores a negative choice and hides it', async ({ page }) => {
    await page.goto(`${SHOP}/`);
    const banner = page.locator('#memiConsentBanner');
    // The banner is shown/hidden by toggling an .open class that slides it in/out via
    // transform (it stays in the DOM as display:flex either way), so assert on the class,
    // not toBeVisible() — Playwright counts a translated-off-screen element as "visible".
    await expect(banner).toHaveClass(/\bopen\b/, { timeout: 10000 });

    await page.locator('#memiConsentRejectBtn').click();
    await expect(banner).not.toHaveClass(/\bopen\b/);

    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('memi_cookie_consent')));
    expect(consent.necessary).toBe(true);
    expect(consent.statistics).toBe(false);
    expect(consent.marketing).toBe(false);
    expect(consent.ts).toBeTruthy();

    // Reload: the stored choice must suppress the banner (it never gets the .open class).
    await page.reload();
    await page.waitForTimeout(500);
    await expect(page.locator('#memiConsentBanner')).not.toHaveClass(/\bopen\b/);
  });

  test('Accetta tutti stores a positive choice', async ({ page }) => {
    await page.goto(`${SHOP}/`);
    await page.locator('#memiConsentAcceptBtn').click();
    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('memi_cookie_consent')));
    expect(consent.statistics).toBe(true);
    expect(consent.marketing).toBe(true);
  });

  test('footer legal links exist and preferences can be reopened', async ({ page }) => {
    await page.goto(`${SHOP}/`);
    await page.locator('#memiConsentAcceptBtn').click();

    const legalNav = page.locator('.sf2-legal');
    await expect(legalNav.locator('a[href="cookie-policy.html"]')).toBeAttached();
    await expect(legalNav.locator('a[href="termini.html"]')).toBeAttached();
    await expect(legalNav.locator('a[href="diritto-recesso.html"]')).toBeAttached();

    // Reopen preferences via the public API (what the footer button calls).
    await page.evaluate(() => window.MemiConsent.openPreferences());
    await expect(page.locator('#memiConsentPrefs')).toBeVisible();

    // Toggles reflect the stored "accept all" choice.
    await expect(page.locator('#memiConsentToggleStatistics')).toBeChecked();
    await expect(page.locator('#memiConsentToggleMarketing')).toBeChecked();
  });
});
