/**
 * account.spec.js — END-TO-END proof that the Area Personale persists to the DB.
 * --------------------------------------------------------------------------
 * Registers a throwaway customer via the API, then exercises every new
 * customer-scoped endpoint and asserts the data round-trips through MySQL:
 *   • wishlist            PUT/GET /api/auth/wishlist
 *   • sizes/prefs/lang    PUT/GET /api/auth/me
 *   • addresses           POST/GET/PUT/DELETE /api/auth/addresses (+ default rules)
 *   • newsletter          PUT/GET /api/auth/newsletter
 *
 * Pure API test (no browser needed). Requires the local stack up:
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
 * API http://localhost:3000 (override via env MEMI_API).
 *
 * Run:  npx playwright test e2e/account.spec.js
 */
const { test, expect, request } = require('@playwright/test');

const API = process.env.MEMI_API || 'http://localhost:3000';
const TS    = Date.now();
const EMAIL = `e2e-account-${TS}@example.com`;
const PASS  = 'e2ePassw0rd!';

let ctx, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

test.describe.serial('Area Personale → DB persistence', () => {
  test.beforeAll(async () => {
    ctx = await request.newContext();
    const reg = await ctx.post(`${API}/api/auth/register`, { data: { nome: 'E2E', email: EMAIL, password: PASS } });
    expect(reg.status(), 'register').toBe(201);
    token = (await reg.json()).token;
    expect(token, 'jwt returned').toBeTruthy();
  });

  test.afterAll(async () => { await ctx.dispose(); });

  test('wishlist round-trips', async () => {
    const items = [{ id: 'p1', name: 'Vestito' }, { id: 'p2', name: 'Top' }];
    const put = await ctx.put(`${API}/api/auth/wishlist`, { headers: auth(), data: { items } });
    expect(put.ok(), 'save wishlist').toBeTruthy();
    const got = await (await ctx.get(`${API}/api/auth/wishlist`, { headers: auth() })).json();
    expect(got.items.length).toBe(2);
    expect(got.items.map(i => i.id).sort()).toEqual(['p1', 'p2']);
  });

  test('sizes, preferences and language persist via /me', async () => {
    const put = await ctx.put(`${API}/api/auth/me`, {
      headers: auth(),
      data: { sizes: { top: 'M', shoe: '38', notes: 'morbida' }, preferences: { categories: ['top'], colors: ['rosa'], email: true }, lang: 'en' },
    });
    expect(put.ok(), 'save /me').toBeTruthy();
    const me = await (await ctx.get(`${API}/api/auth/me`, { headers: auth() })).json();
    expect(me.sizes.top).toBe('M');
    expect(me.sizes.shoe).toBe('38');
    expect(me.preferences.categories).toContain('top');
    expect(me.lang).toBe('en');
  });

  test('addresses: first is default, set-default, delete promotes next', async () => {
    const a1 = await (await ctx.post(`${API}/api/auth/addresses`, { headers: auth(), data: { label: 'Casa', indirizzo: 'Via Roma 1', citta: 'Milano', cap: '20100' } })).json();
    const a2 = await (await ctx.post(`${API}/api/auth/addresses`, { headers: auth(), data: { label: 'Ufficio', indirizzo: 'Via B 2', citta: 'Torino', cap: '10100' } })).json();
    let list = (await (await ctx.get(`${API}/api/auth/addresses`, { headers: auth() })).json()).addresses;
    expect(list.length).toBe(2);
    expect(list.find(a => a.id === a1.id).is_default).toBe(1);       // first auto-default

    await ctx.put(`${API}/api/auth/addresses/${a2.id}/default`, { headers: auth() });
    list = (await (await ctx.get(`${API}/api/auth/addresses`, { headers: auth() })).json()).addresses;
    expect(list.find(a => a.id === a2.id).is_default).toBe(1);
    expect(list.find(a => a.id === a1.id).is_default).toBe(0);

    await ctx.delete(`${API}/api/auth/addresses/${a2.id}`, { headers: auth() });
    list = (await (await ctx.get(`${API}/api/auth/addresses`, { headers: auth() })).json()).addresses;
    expect(list.length).toBe(1);
    expect(list[0].is_default).toBe(1);                              // remaining promoted to default
  });

  test('newsletter subscription persists', async () => {
    await ctx.put(`${API}/api/auth/newsletter`, { headers: auth(), data: { subscribed: true, frequenza: 'weekly', topics: ['novita', 'saldi'] } });
    let nl = await (await ctx.get(`${API}/api/auth/newsletter`, { headers: auth() })).json();
    expect(nl.subscribed).toBe(true);
    expect(nl.frequenza).toBe('weekly');
    expect(nl.topics.sort()).toEqual(['novita', 'saldi']);

    await ctx.put(`${API}/api/auth/newsletter`, { headers: auth(), data: { subscribed: false } });
    nl = await (await ctx.get(`${API}/api/auth/newsletter`, { headers: auth() })).json();
    expect(nl.subscribed).toBe(false);
  });

  test('admin customer detail exposes the new data', async () => {
    const email = process.env.ADMIN_EMAIL || 'admin@memi.it';
    const pass  = process.env.ADMIN_PASS  || 'memi2026admin';
    const login = await ctx.post(`${API}/api/admin/auth/login`, { data: { email, password: pass } });
    test.skip(!login.ok(), 'admin login unavailable in this environment');
    const adminToken = (await login.json()).token;
    // find our customer id via the admin list (search by email)
    const listRes = await ctx.get(`${API}/api/admin/customers?q=${encodeURIComponent(EMAIL)}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const found = (await listRes.json()).customers.find(c => c.email === EMAIL);
    expect(found, 'customer visible to admin').toBeTruthy();
    const detail = await (await ctx.get(`${API}/api/admin/customers/${found.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    expect(Array.isArray(detail.addresses)).toBeTruthy();
    expect(detail).toHaveProperty('sizes');
    expect(detail).toHaveProperty('preferences');
    expect(detail).toHaveProperty('wishlist');
  });
});
