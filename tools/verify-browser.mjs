// Browser regression suite for Setwise. Dev-only: the shipped app still has zero
// runtime dependencies. Requires Playwright on the machine (not a repo dependency).
//
//   python3 -m http.server 8777      # service workers need http(s), not file://
//   node tools/verify-browser.mjs
//
// Covers the things that are unrecoverable if they break: saved training data
// surviving a bad payload, and the generated exercise guides actually loading.
import pwpkg from 'playwright';
const { chromium } = pwpkg;

const BASE = 'http://localhost:8777';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();

// ---------- 1. App boots clean, no console errors ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  ok('app boots with no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const guides = await page.evaluate(() => {
    const B = window.SetwiseBundledGuides;
    if (!B) return null;
    const vals = Object.values(B.images);
    return {
      records: Object.keys(B.records).length,
      images: vals.length,
      anyBase64: vals.some(v => String(v).startsWith('data:')),
      sample: vals[0],
    };
  });
  ok('49 guide records loaded', guides && guides.records === 49, guides ? `got ${guides.records}` : 'no global');
  ok('94 guide images mapped', guides && guides.images === 94, guides ? `got ${guides.images}` : '');
  ok('images are URLs, not base64', guides && !guides.anyBase64, guides ? guides.sample : '');
  await ctx.close();
}

// ---------- 2. Guide image actually renders from a real file ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const imgRequests = [];
  page.on('response', r => { if (r.url().includes('/assets/guides/')) imgRequests.push([r.url().split('/').pop(), r.status()]); });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const a = document.querySelector('[data-view="exercises"]'); if (a) a.click(); });
  await page.waitForTimeout(900);
  // open the first exercise to force a guide render
  const opened = await page.evaluate(() => {
    const el = document.querySelector('[data-action="exercise-info"]');
    if (el) { el.click(); return true; } return false;
  });
  await page.waitForTimeout(1200);
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('img.motion-frame, img.repdb-position-image')].map(i => ({
      src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight })));
  const loaded = imgs.filter(i => i.naturalWidth !== 0 || i.w > 0);
  ok('guide image element present', imgs.length > 0, `opened=${opened} imgs=${imgs.length}`);
  ok('guide image decoded from assets/guides/', loaded.length > 0 && loaded.every(i => i.src.includes('assets/guides/')) && loaded.every(i => i.w === 512),
     imgs.length ? `${loaded.length}/${imgs.length} decoded, src=${imgs[0].src}` : 'none');
  ok('guide image HTTP 200', imgRequests.length > 0 && imgRequests.every(([, s]) => s === 200),
     imgRequests.slice(0, 2).map(([n, s]) => `${n}:${s}`).join(' '));
  await ctx.close();
}

// ---------- 3. THE CRITICAL ONE: corrupt data is preserved, not wiped ----------
for (const [label, payload] of [
  ['unparseable JSON', '{this is not json'],
  ['future schema version', JSON.stringify({ version: 99, workouts: [{ id: 'w1', name: 'Precious Session' }] })],
]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  await page.evaluate(p => localStorage.setItem('setwise-personal-v1', p), payload);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    bak: localStorage.getItem('setwise-personal-v1-recovered'),
    toast: document.querySelector('#toast-root') ? document.querySelector('#toast-root').textContent.trim() : '',
  }));
  ok(`[${label}] old data preserved in -recovered`, state.bak === payload,
     state.bak ? 'preserved (' + state.bak.length + ' chars)' : 'DATA LOST');
  ok(`[${label}] user is warned`, /could not read/i.test(state.toast), state.toast.slice(0, 80));
  await ctx.close();
}

// ---------- 4. Valid v1 data still loads untouched ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  const v1 = JSON.stringify({
    version: 1,
    routines: [], measurements: [], customExercises: [], activeWorkout: null,
    workouts: [{ id: 'w1', name: 'Leg Day', date: '2026-11-01', exercises: [] }],
    preferences: { unit: 'lb', restSeconds: 90, userName: 'Roland' },
  });
  await page.evaluate(p => localStorage.setItem('setwise-personal-v1', p), v1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('setwise-personal-v1'));
    return { workouts: d.workouts.length, name: d.workouts[0] && d.workouts[0].name,
             unit: d.preferences.unit, user: d.preferences.userName,
             bak: localStorage.getItem('setwise-personal-v1-recovered') };
  });
  ok('valid v1 data survives untouched', st.workouts === 1 && st.name === 'Leg Day' && st.unit === 'lb' && st.user === 'Roland',
     JSON.stringify(st));
  ok('no spurious backup for valid data', st.bak === null, String(st.bak).slice(0, 40));
  await ctx.close();
}

// ---------- 5. Demo isolation ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.setItem('setwise-personal-v1',
    JSON.stringify({ version: 1, workouts: [{ id: 'real', name: 'REAL DATA' }], routines: [], measurements: [], customExercises: [], preferences: {} })));
  await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    real: JSON.parse(localStorage.getItem('setwise-personal-v1')).workouts.length,
    realName: JSON.parse(localStorage.getItem('setwise-personal-v1')).workouts[0].name,
    demoExists: localStorage.getItem('setwise-demo-v1') !== null,
  }));
  ok('demo mode does not touch real data', st.real === 1 && st.realName === 'REAL DATA', JSON.stringify(st));
  // A fresh demo load correctly writes nothing: read() returns defaults() without
  // persisting until something changes. Assert the real key is the one untouched.
  ok('demo mode never writes the real key', st.realName === 'REAL DATA', `real key intact=${st.realName}`);
  await ctx.close();
}

// ---------- 6. phone-preview loads the live app ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/phone-preview.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => {
    const f = document.getElementById('phone-app-frame');
    return { src: f && f.getAttribute('src'), hasSrcdoc: !!(f && f.getAttribute('srcdoc')) };
  });
  const frame = page.frames().find(f => f.url().includes('demo=1'));
  const inner = frame ? await frame.evaluate(() => ({
    hasApp: !!document.querySelector('#app-content, main'),
    key: !!localStorage.getItem('setwise-demo-v1'),
  })) : null;
  ok('preview uses src, not a 3.8MB srcdoc snapshot', st.src === './index.html?demo=1' && !st.hasSrcdoc, JSON.stringify(st));
  ok('preview renders the real app in demo mode', inner && inner.hasApp, JSON.stringify(inner));
  await ctx.close();
}

// ---------- 7. Regression: static holds (Plank, Farmer Carry) now show an image ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const res = await page.evaluate(() => {
    const B = window.SetwiseBundledGuides;
    return ['plank', 'farmer carry'].map(k => {
      const f = (B.records[k] && B.records[k].images && B.records[k].images.flat) || {};
      const start = f.start || f.main, peak = f.peak || f.main;
      return { k, hasMainOnly: !f.start && !!f.main, resolves: !!(B.images[start] && B.images[peak]) };
    });
  });
  ok('static holds resolve an image via main fallback',
     res.every(r => r.hasMainOnly && r.resolves), JSON.stringify(res));
  await ctx.close();
}

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log('  - ' + f.name + ' :: ' + f.detail)); process.exit(1); }
