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

// A fresh browser context is a genuine first run, so the app opens with onboarding.
// Checks that are about the app itself dismiss it through the real "Skip for now"
// button rather than a test-only flag.
async function skipOnboarding(page) {
  const skip = await page.$('[data-ob="skip"]');
  if (skip) { await skip.click(); await page.waitForTimeout(100); }
}

const browser = await chromium.launch();

// ---------- 1. App boots clean, no console errors ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
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
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
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
  await page.goto(BASE + '/app.html');
  await skipOnboarding(page);
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
  await page.goto(BASE + '/app.html');
  await skipOnboarding(page);
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
  await page.goto(BASE + '/app.html');
  await skipOnboarding(page);
  await page.evaluate(() => localStorage.setItem('setwise-personal-v1',
    JSON.stringify({ version: 1, workouts: [{ id: 'real', name: 'REAL DATA' }], routines: [], measurements: [], customExercises: [], preferences: {} })));
  await page.goto(BASE + '/app.html?demo=1', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
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
  ok('preview uses src, not a 3.8MB srcdoc snapshot', st.src === './app.html?demo=1' && !st.hasSrcdoc, JSON.stringify(st));
  ok('preview renders the real app in demo mode', inner && inner.hasApp, JSON.stringify(inner));
  await ctx.close();
}

// ---------- 7. Regression: static holds (Plank, Farmer Carry) now show an image ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
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

// ---------- 8. Typography is self-hosted, with no third-party requests ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const woff = [], thirdParty = [];
  page.on('response', r => {
    const u = r.url();
    if (u.endsWith('.woff2')) woff.push([u.split('/').pop(), r.status(), new URL(u).origin]);
    if (!u.startsWith(BASE) && !u.startsWith('data:')) thirdParty.push(u);
  });
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.waitForTimeout(600);
  // document.fonts.check() is NOT usable here: it returns true when no @font-face
  // matches at all, which is exactly the failure it should catch (it passed for weeks
  // while no @font-face rule existed). fonts.load() resolves to the faces it actually
  // loaded, so an empty array means the family is not defined.
  const fonts = await page.evaluate(async () => {
    const got = async (spec) => (await document.fonts.load(spec)).some((f) => f.status === 'loaded');
    return { manrope: await got('700 20px Manrope'),
             sans: await got('400 14px "DM Sans"'),
             mono: await got('500 10px "DM Mono"') };
  });
  // Fonts may be served from the service worker cache rather than the network, and
  // unicode-range means a weight whose glyphs are unused is never fetched. So assert
  // the files are reachable and same-origin, not that a request happened.
  const reachable = [];
  for (const f of ['dm-sans-var', 'manrope-var', 'dm-mono-400', 'dm-mono-500']) {
    const r = await page.request.get(`${BASE}/assets/fonts/${f}.woff2`);
    reachable.push([f, r.status()]);
  }
  ok('all four webfont files are served from this origin', reachable.every(([, s]) => s === 200),
     reachable.map(([n, s]) => `${n}:${s}`).join(' '));
  ok('no webfont is fetched from another origin', woff.every(([, , o]) => o === BASE),
     woff.length ? woff.map(([n, , o]) => `${n}@${o}`).join(' ') : 'none requested (served from cache)');
  ok('Manrope, DM Sans and DM Mono are all available', fonts.manrope && fonts.sans && fonts.mono, JSON.stringify(fonts));
  // The app fetches the RepDB catalog from raw.githubusercontent.com at startup.
  // That is documented in the README, but it does expose the user's IP to GitHub,
  // so it must stay the ONLY off-origin request. Anything else is a regression.
  const KNOWN_OFF_ORIGIN = 'raw.githubusercontent.com';
  const unexpected = thirdParty.filter(u => !u.includes(KNOWN_OFF_ORIGIN));
  ok('the RepDB catalog is the only off-origin request', unexpected.length === 0,
     unexpected.slice(0, 3).join(' ') || `only ${KNOWN_OFF_ORIGIN}`);
  await ctx.close();
}

// ---------- 9. Theme: dark by default, light persists, no flash ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  const def = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok('dark is the default theme', def === 'dark', `got ${def}`);

  await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-theme-pref="light"]').click());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    stored: JSON.parse(localStorage.getItem('setwise-personal-v1')).preferences.theme,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  ok('switching to light applies and is saved', after.attr === 'light' && after.stored === 'light', JSON.stringify(after));

  await page.reload({ waitUntil: 'networkidle' });
  // The inline head script must set the attribute before first paint, so the
  // value is already correct without waiting for app.js to boot.
  const onLoad = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok('light theme survives a reload with no dark flash', onLoad === 'light', `got ${onLoad}`);
  await ctx.close();
}

// ---------- 10. Every colour resolves; no unresolved custom properties ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  const res = await page.evaluate(() => {
    const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch { return []; } }).join('');
    const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]));
    const undef = [...used].filter(u => !defined.has(u));
    let unresolved = 0;
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      for (const prop of ['color', 'background-color', 'border-top-color'])
        if (c[prop] && !c[prop].startsWith('rgb')) unresolved++;
    }
    return { undef, unresolved, tokens: defined.size };
  });
  ok('every var() referenced in CSS is defined', res.undef.length === 0, res.undef.slice(0, 5).join(' '));
  ok('no element has an unresolved colour', res.unresolved === 0, `${res.unresolved} unresolved`);
  await ctx.close();
}

// ---------- 11. WCAG AA contrast across every view, in both themes ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  const VIEWS = ['overview', 'train', 'routines', 'exercises', 'progress', 'body', 'tools', 'settings'];
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    const fails = [];
    for (const v of VIEWS) {
      await page.evaluate(x => { const el = document.querySelector(`[data-view="${x}"]`); if (el) el.click(); }, v);
      await page.waitForTimeout(250);
      fails.push(...await page.evaluate((view) => {
        const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number)
          .map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return .2126 * r + .7152 * g + .0722 * b; };
        const bgOf = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)$/.test(c)) return c; e = e.parentElement; } return 'rgb(255,255,255)'; };
        const out = [];
        for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,small,strong,button,a,label,li,td,th')) {
          const t = (el.textContent || '').trim();
          if (!t || el.children.length) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent) continue;
          if (!cs.color.startsWith('rgb')) continue;
          const L1 = lum(cs.color), L2 = lum(bgOf(el));
          const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
          const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
          const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
          if (ratio < need) out.push(`${view}: "${t.slice(0, 24)}" ${ratio.toFixed(2)}<${need}`);
        }
        return out;
      }, v));
    }
    ok(`${theme} theme passes WCAG AA on all 8 views`, fails.length === 0,
       fails.length ? `${fails.length} failures, e.g. ${fails.slice(0, 2).join(' | ')}` : 'all text passes');
  }
  await ctx.close();
}

// ---------- 11b. Sidebar icons are filled from the inline map, and legible ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const offOrigin = [];
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) offOrigin.push(r.url()); });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const icons = await page.evaluate(() => {
    const nav = [...document.querySelectorAll('.nav-icon')];
    const all = [...document.querySelectorAll('[data-icon]')];
    return {
      nav: nav.length,
      navEmpty: nav.filter(el => !el.querySelector(':scope > svg')).map(el => el.dataset.icon),
      all: all.length,
      allEmpty: all.filter(el => !el.querySelector(':scope > svg')).map(el => el.dataset.icon),
    };
  });
  ok('every .nav-icon contains an <svg>', icons.nav >= 8 && icons.navEmpty.length === 0,
     icons.navEmpty.length ? `empty: ${icons.navEmpty.join(', ')}` : `${icons.nav} nav icons`);
  ok('every [data-icon] placeholder is filled', icons.allEmpty.length === 0,
     icons.allEmpty.length ? `empty: ${icons.allEmpty.join(', ')}` : `${icons.all} icons`);
  ok('icons add no off-origin request', !offOrigin.some(u => /\.svg|icon/i.test(u)), offOrigin.filter(u => /\.svg|icon/i.test(u)).join(' '));
  // WCAG 1.4.11: meaningful graphics need 3:1 against their background.
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    const fails = await page.evaluate(() => {
      const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number)
        .map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
        return .2126 * r + .7152 * g + .0722 * b; };
      const bgOf = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)$/.test(c)) return c; e = e.parentElement; } return 'rgb(255,255,255)'; };
      const out = [];
      for (const el of document.querySelectorAll('.nav-icon svg')) {
        if (!el.closest('.nav-icon').offsetParent) continue;
        const L1 = lum(getComputedStyle(el).stroke.startsWith('rgb') ? getComputedStyle(el).stroke : getComputedStyle(el).color), L2 = lum(bgOf(el));
        const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
        if (ratio < 3) out.push(`${el.closest('.nav-icon').dataset.icon} ${ratio.toFixed(2)}<3`);
      }
      return out;
    });
    ok(`${theme} theme: nav icons meet 3:1 non-text contrast`, fails.length === 0, fails.join(' | ') || 'all pass');
  }
  await ctx.close();
}

// ---------- 12. Movement stage: one presentation for every state ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.waitForTimeout(1500);

  const probe = async (id) => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('[data-view="exercises"]').click());
    await page.waitForTimeout(200);
    await page.evaluate((i) => document.querySelector(`[data-action="exercise-info"][data-id="${i}"]`).click(), id);
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const scene = document.querySelector('[data-movement-scene]');
      const stage = scene.querySelector('.movement-stage').getBoundingClientRect();
      const root = document.querySelector('[data-guide-root]');
      const badge = root.querySelector('.demo-badge');
      return {
        kind: scene.dataset.mediaKind, w: Math.round(stage.width), h: Math.round(stage.height),
        hasVideo: !!scene.querySelector('video'), hasImg: !!scene.querySelector('img'),
        controls: !!scene.querySelector('video[controls]'),
        badge: badge.hidden ? '' : badge.textContent,
        disclaimer: root.querySelector('.demo-disclaimer').textContent,
      };
    });
  };

  const video = await probe('pec-deck');
  const loop = await probe('barbell-bench-press');
  const hold = await probe('plank');
  const empty = await probe('cable-wood-chop');

  // The four states used to be 198 / 224 / 200 / 198px tall.
  const sizes = [video, loop, hold, empty].map((r) => r.w + 'x' + r.h);
  ok('video, pose loop, hold and empty states share one stage size',
     new Set(sizes).size === 1 && video.w === video.h, sizes.join(' | '));
  ok('the kinds under test are the ones intended',
     video.kind === 'video' && loop.kind === 'illustration' && hold.kind === 'illustration' && empty.kind === 'empty',
     [video, loop, hold, empty].map((r) => r.kind).join(' '));
  ok('no video uses the native browser controls', !video.controls);
  ok('badges are VIDEO / ILLUSTRATION / none and match the media shown',
     video.badge === 'VIDEO' && video.hasVideo && loop.badge === 'ILLUSTRATION' && loop.hasImg
       && hold.badge === 'ILLUSTRATION' && hold.hasImg && empty.badge === '' && !empty.hasVideo && !empty.hasImg,
     [video, loop, hold, empty].map((r) => r.badge || '(none)').join(' | '));
  ok('an empty state does not claim to show a position guide',
     !/position|illustrat|demonstration/i.test(empty.disclaimer), empty.disclaimer);

  // The two pose frames must crossfade, not animate in step. A later `animation`
  // shorthand once reset the peak frame to the start animation, so both faded
  // together and the stage went blank; sizes and badges all still looked right.
  await probe('barbell-bench-press');
  const fade = await page.evaluate(() => {
    const at = (ms) => {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });
      const op = (sel) => Number(getComputedStyle(document.querySelector(sel)).opacity);
      return { start: op('.motion-frame-start'), peak: op('.motion-frame-peak'),
               startLabel: op('.motion-state-start'), peakLabel: op('.motion-state-peak') };
    };
    const names = ['.motion-frame-start', '.motion-frame-peak', '.motion-state-start', '.motion-state-peak']
      .map((s) => getComputedStyle(document.querySelector(s)).animationName);
    return { names, t0: at(0), t1400: at(1400) };
  });
  ok('start and peak frames use different animations',
     fade.names[0] !== fade.names[1] && fade.names[2] !== fade.names[3], fade.names.join(' / '));
  ok('start frame is shown at the start of the cycle and peak is not',
     fade.t0.start === 1 && fade.t0.peak === 0 && fade.t0.startLabel === 1 && fade.t0.peakLabel === 0, JSON.stringify(fade.t0));
  ok('peak frame replaces the start frame later in the cycle',
     fade.t1400.start === 0 && fade.t1400.peak === 1 && fade.t1400.startLabel === 0 && fade.t1400.peakLabel === 1,
     JSON.stringify(fade.t1400));
  await ctx.close();
}

// ---------- 13. Video control: one Play/Pause, honours reduced motion ----------
{
  const open = async (page) => {
    await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
    await skipOnboarding(page);
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('[data-view="exercises"]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-action="exercise-info"][data-id="pec-deck"]').click());
    await page.waitForTimeout(900);
  };
  const state = (page) => page.evaluate(() => {
    const v = document.querySelector('video.vital-animation');
    const b = document.querySelector('[data-movement-scene] [data-motion-toggle]');
    return { paused: v.paused, userPaused: v.dataset.userPaused || null, autoplay: v.hasAttribute('autoplay'),
             pressed: b.getAttribute('aria-pressed'), label: b.textContent, sceneClass: document.querySelector('[data-movement-scene]').classList.contains('is-paused') };
  });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  await page.click('[data-movement-scene] [data-motion-toggle]');
  await page.waitForTimeout(250);
  const paused = await state(page);
  ok('pressing Pause stops the video and updates the control',
     paused.paused && paused.userPaused === 'true' && paused.pressed === 'true' && paused.label === 'Play' && paused.sceneClass, JSON.stringify(paused));
  await page.click('[data-movement-scene] [data-motion-toggle]');
  await page.waitForTimeout(500);
  const resumed = await state(page);
  ok('pressing Play resumes it and clears the user-paused flag',
     !resumed.paused && resumed.userPaused === null && resumed.pressed === 'false' && resumed.label === 'Pause', JSON.stringify(resumed));
  await ctx.close();

  // Stills already honoured prefers-reduced-motion; the video did not.
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const rpage = await rctx.newPage();
  await open(rpage);
  const reduced = await state(rpage);
  ok('with reduced motion the video starts paused, not autoplaying',
     reduced.paused && !reduced.autoplay && reduced.userPaused === 'true' && reduced.label === 'Play' && reduced.sceneClass, JSON.stringify(reduced));
  await rctx.close();

  // A browser that refuses autoplay outright (e.g. iOS Low Power Mode) must still leave
  // an honest, one-tap Play button. Codex review on PR #2 found the control said "Pause"
  // over a stopped video and needed two taps. Playback is allowed here ONLY from a tap
  // on the control: Playwright's evaluate() carries a user gesture, so plain "user
  // activation" would wrongly let autoplay through and hide the bug.
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(() => {
    let allowed = false;
    document.addEventListener('pointerdown', (e) => {
      allowed = !!(e.target.closest && e.target.closest('[data-motion-toggle]'));
    }, true);
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!allowed) return Promise.reject(new DOMException('Autoplay blocked (simulated)', 'NotAllowedError'));
      return original.call(this);
    };
    document.addEventListener('play', (e) => { if (!allowed) e.target.pause(); }, true);
  });
  const bpage = await bctx.newPage();
  await open(bpage);
  const blocked = await state(bpage);
  ok('when autoplay is blocked the control offers Play, not Pause',
     blocked.paused && blocked.label === 'Play' && blocked.pressed === 'true', JSON.stringify(blocked));
  await bpage.click('[data-movement-scene] [data-motion-toggle]');
  await bpage.waitForTimeout(600);
  const started = await state(bpage);
  ok('one tap on Play starts a video whose autoplay was blocked',
     !started.paused && started.label === 'Pause' && started.pressed === 'false', JSON.stringify(started));
  await bctx.close();
}

// ---------- 14. Female mode tells the truth about what is on screen ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-demo-model="female"]').click());
  await page.waitForTimeout(300);

  const read = async (id) => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('[data-view="exercises"]').click());
    await page.waitForTimeout(200);
    await page.evaluate((i) => document.querySelector(`[data-action="exercise-info"][data-id="${i}"]`).click(), id);
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const scene = document.querySelector('[data-movement-scene]');
      const root = document.querySelector('[data-guide-root]');
      const badge = root.querySelector('.demo-badge');
      return { kind: scene.dataset.mediaKind, key: scene.dataset.mediaKey, badge: badge.hidden ? '' : badge.textContent,
               disclaimer: root.querySelector('.demo-disclaimer').textContent };
    });
  };

  // Pec Deck has only a MALE clip. It used to say "...The available position guide is
  // shown below" while that male video was playing.
  const maleOnly = await read('pec-deck');
  ok('male-only clip in female mode says the male one is shown',
     maleOnly.kind === 'video' && /male one is shown/i.test(maleOnly.disclaimer) && !/position guide|illustrated/i.test(maleOnly.disclaimer),
     maleOnly.disclaimer);
  const hasFemale = await read('hack-squat');
  ok('a movement with a female clip says it is a female demonstration',
     hasFemale.kind === 'video' && /^Female demonstration/.test(hasFemale.disclaimer) && hasFemale.key.includes('video:female'),
     hasFemale.key + ' / ' + hasFemale.disclaimer.slice(0, 40));
  const stills = await read('barbell-bench-press');
  ok('a stills-only movement says the illustrated guide is shown',
     stills.kind === 'illustration' && /illustrated guide is shown/i.test(stills.disclaimer), stills.disclaimer);
  ok('the badge describes the media, never "NO FEMALE CLIP"',
     [maleOnly, hasFemale, stills].every((r) => /^(VIDEO|ILLUSTRATION)$/.test(r.badge)),
     [maleOnly, hasFemale, stills].map((r) => r.badge).join(' | '));
  await ctx.close();
}

// ---------- 15. No layout shift when the catalog loads, and failures update the chrome ----------
{
  // Hold the RepDB catalog request open so a guide renders in its loading state, then
  // release it. Stub the body so the check does not depend on the network.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/RepDB/exercise-dataset/main/exercises.json', async (route) => {
    await new Promise((r) => setTimeout(r, 1800));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exercises: [] }) });
  });
  await page.goto(BASE + '/app.html', { waitUntil: 'domcontentloaded' });
  await skipOnboarding(page);
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-view="exercises"]').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-action="exercise-info"][data-id="cable-wood-chop"]').click());
  await page.waitForTimeout(300);
  const rect = () => page.evaluate(() => {
    const scene = document.querySelector('[data-movement-scene]');
    const r = scene.querySelector('.movement-stage').getBoundingClientRect();
    const steps = document.querySelector('.form-steps').getBoundingClientRect();
    return { kind: scene.dataset.mediaKind, h: Math.round(r.height), stepsTop: Math.round(steps.top) };
  });
  const before = await rect();
  await page.waitForTimeout(2200);
  const after = await rect();
  ok('the guide hydrates from "loading" to "empty" with nothing below it moving',
     before.kind === 'loading' && after.kind === 'empty' && before.h === after.h && before.stepsTop === after.stepsTop,
     JSON.stringify({ before, after }));
  await ctx.close();

  // A clip that fails to load falls back to stills, and the badge and wording follow it.
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const fpage = await fctx.newPage();
  await fpage.route('**/assets/vital-free/0051.mp4', (route) => route.abort());
  await fpage.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(fpage);
  await fpage.waitForTimeout(1200);
  await fpage.evaluate(() => document.querySelector('[data-view="exercises"]').click());
  await fpage.waitForTimeout(200);
  await fpage.evaluate(() => document.querySelector('[data-action="exercise-info"][data-id="pec-deck"]').click());
  await fpage.waitForTimeout(1200);
  const failed = await fpage.evaluate(() => {
    const scene = document.querySelector('[data-movement-scene]');
    const root = document.querySelector('[data-guide-root]');
    const badge = root.querySelector('.demo-badge');
    return { kind: scene.dataset.mediaKind, hasVideo: !!scene.querySelector('video'), badge: badge.hidden ? '' : badge.textContent,
             disclaimer: root.querySelector('.demo-disclaimer').textContent };
  });
  ok('a clip that fails to load stops claiming to be a video',
     failed.kind !== 'video' && !failed.hasVideo && failed.badge !== 'VIDEO' && !/(Male|Female) demonstration/.test(failed.disclaimer),
     JSON.stringify(failed));
  await fctx.close();
}

// ---------- 16. Landing page ----------
// WCAG AA check reused below for the landing page and each onboarding step.
const contrastFailures = (page) => page.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number)
    .map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b; };
  // Composite every background from the root down on a 1x1 canvas, so translucent
  // layers (e.g. a color-mix() tint, which Chrome reports as `color(srgb ... / 0.12)`)
  // are measured as the colour actually on screen rather than misparsed.
  const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') layers.push(c);
    }
    px.fillStyle = '#ffffff'; px.fillRect(0, 0, 1, 1);
    for (let i = layers.length - 1; i >= 0; i--) { px.fillStyle = layers[i]; px.fillRect(0, 0, 1, 1); }
    const [r, g, b] = px.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  };
  const out = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,small,strong,button,a,label,li,summary,em')) {
    const t = (el.textContent || '').trim();
    if (!t || el.children.length) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    if (el.closest('[inert]')) continue;                  // hidden behind a modal overlay
    if (!cs.color.startsWith('rgb')) continue;
    const L1 = lum(cs.color), L2 = lum(bgOf(el));
    const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    if (ratio < need) out.push(`"${t.slice(0, 24)}" ${ratio.toFixed(2)}<${need}`);
  }
  return out;
});

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const offOrigin = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) offOrigin.push(r.url()); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const landing = await page.evaluate(() => ({
    isLanding: document.body.classList.contains('landing'),
    ctas: [...document.querySelectorAll('a.button-primary')].map((a) => a.getAttribute('href')),
    scripts: [...document.scripts].filter((s) => s.src).length,
  }));
  ok('a new visitor at / sees the landing page', landing.isLanding && page.url() === BASE + '/', page.url());
  ok('the landing page makes zero off-origin requests', offOrigin.length === 0, offOrigin.slice(0, 3).join(' ') || 'none');
  ok('the landing page loads no external script files at all', landing.scripts === 0, `${landing.scripts} script src`);
  ok('every primary call to action opens the app', landing.ctas.length >= 2 && landing.ctas.every((h) => h === './app.html'), landing.ctas.join(' '));
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await page.waitForTimeout(350);   // let the .18s colour transitions finish
    const fails = await contrastFailures(page);
    ok(`landing page passes WCAG AA in the ${theme} theme`, fails.length === 0, fails.slice(0, 3).join(' | ') || 'all text passes');
  }
  await ctx.close();
}

// ---------- 17. Returning users skip the landing page ----------
{
  const ctx = await browser.newContext();
  const seed = await ctx.newPage();
  await seed.goto(BASE + '/?landing=1', { waitUntil: 'networkidle' });
  await seed.evaluate(() => localStorage.setItem('setwise-personal-v1', JSON.stringify({
    version: 1, preferences: {}, routines: [], workouts: [], measurements: [], customExercises: [] })));
  await seed.close();
  // A fresh page each time: a hash-only change on an open page is same-document
  // navigation, which never re-runs the forwarding script and would fake a failure.
  const visit = async (path) => {
    const p = await ctx.newPage();
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    const url = p.url().replace(BASE, '');
    await p.close();
    return url;
  };
  const root = await visit('/');
  const hash = await visit('/#progress');
  const bypass = await visit('/?landing=1');
  ok('a returning user at / goes straight to the app', root === '/app.html', root);
  ok('the forward keeps the #view from the URL', hash === '/app.html#progress', hash);
  ok('?landing=1 shows the landing page even with stored data', bypass === '/?landing=1', bypass);
  await ctx.close();
}

// ---------- 18. First-run onboarding ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  const first = await page.evaluate(() => ({
    shown: !!document.querySelector('.onboarding[role="dialog"]'),
    appInert: document.querySelector('.app-shell').inert,
  }));
  ok('a genuine first run of the app shows onboarding', first.shown, JSON.stringify(first));
  ok('the app behind onboarding is inert (no tabbing into it)', first.appInert === true);

  // Every step must be readable in both themes.
  const stepFails = [];
  for (let step = 0; step < 5; step++) {
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(350);   // let the .18s colour transitions finish
      (await contrastFailures(page)).forEach((f) => stepFails.push(`step ${step + 1} ${theme}: ${f}`));
    }
    if (step === 0) { await page.fill('#ob-name', 'Alex'); await page.click('[data-ob-set="unit"][data-value="lb"]'); }
    if (step === 1) await page.click('[data-ob-set="experience"][data-value="advanced"]');
    if (step === 2) await page.click('[data-ob-set="goal"][data-value="strength"]');
    if (step === 3) await page.click('[data-ob-set="equipment"][data-value="gym"]');
    if (step === 4) await page.click('[data-ob-set="days"][data-value="4"]');
    await page.click(step < 4 ? '[data-ob="next"]' : '[data-ob="finish"]');
    await page.waitForTimeout(120);
  }
  ok('every onboarding step passes WCAG AA in both themes', stepFails.length === 0, stepFails.slice(0, 3).join(' | ') || 'all text passes');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  const done = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('setwise-personal-v1'));
    return {
      prefs: d.preferences, overlay: !!document.querySelector('.onboarding'),
      inert: document.querySelector('.app-shell').inert,
      routines: d.routines.map((r) => ({ name: r.name, sets: r.exercises.map((x) => x.sets) })),
      sidebar: document.querySelector('#profile-name').textContent,
    };
  });
  const p = done.prefs;
  ok('finishing onboarding stores every answer',
     p.userName === 'Alex' && p.unit === 'lb' && p.experience === 'advanced' && p.goal === 'strength'
       && p.equipment === 'gym' && p.weeklyTarget === 4 && !!p.onboardedAt && !p.onboardingSkipped,
     JSON.stringify({ userName: p.userName, unit: p.unit, experience: p.experience, goal: p.goal, equipment: p.equipment, weeklyTarget: p.weeklyTarget }));
  ok('it replaces the sample routines with a plan matching the answers',
     done.routines.length === 4 && done.routines.every((r) => r.name.startsWith('Strength ·')),
     done.routines.map((r) => r.name).join(', '));
  // Advanced + strength: 5 sets on main lifts, 3 on accessories.
  const setCounts = [...new Set(done.routines.flatMap((r) => r.sets))].sort();
  ok('Advanced strength plans use 5 sets on main lifts and 3 on accessories', JSON.stringify(setCounts) === '[3,5]', JSON.stringify(setCounts));
  ok('the overlay closes and the app becomes usable again', !done.overlay && done.inert === false);
  ok('the profile name appears in the app', done.sidebar === 'Alex', done.sidebar);
  await page.reload({ waitUntil: 'networkidle' });
  ok('onboarding does not come back after a reload', !(await page.$('.onboarding')));
  await ctx.close();
}

{
  // Skip keeps the sample routines and never shows onboarding again.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await page.click('[data-ob="skip"]');
  await page.waitForTimeout(150);
  const skipped = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('setwise-personal-v1'));
    return { onboardedAt: !!d.preferences.onboardedAt, skipped: d.preferences.onboardingSkipped, routines: d.routines.length };
  });
  ok('Skip saves the profile and keeps the sample routines',
     skipped.onboardedAt && skipped.skipped === true && skipped.routines === 3, JSON.stringify(skipped));
  await page.reload({ waitUntil: 'networkidle' });
  ok('a skipped onboarding does not reappear', !(await page.$('.onboarding')));
  await ctx.close();
}

{
  // The guard that matters most: people who already use Setwise have data but no
  // onboardedAt (it did not exist before). They must never be pushed through setup.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/?landing=1');
  await page.evaluate(() => localStorage.setItem('setwise-personal-v1', JSON.stringify({
    version: 1, preferences: { unit: 'kg' }, routines: [], measurements: [], customExercises: [],
    workouts: [{ id: 'w1', name: 'Old session', date: '2026-10-01', exercises: [] }] })));
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  const existing = await page.evaluate(() => ({
    overlay: !!document.querySelector('.onboarding'),
    workouts: JSON.parse(localStorage.getItem('setwise-personal-v1')).workouts.length,
  }));
  ok('an existing user without onboardedAt never sees onboarding', !existing.overlay && existing.workouts === 1, JSON.stringify(existing));
  await ctx.close();
}

// ---------- 19. Install, offline and the experience tiers ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const manifest = await (await page.request.get(BASE + '/manifest.webmanifest')).json();
  ok('the manifest launches the app and keeps the installed identity',
     manifest.start_url === './app.html' && manifest.id === './', JSON.stringify({ start_url: manifest.start_url, id: manifest.id }));

  // Offline: once the service worker is installed, the app still opens, and so does an
  // older install that launches "./" (landing page forwards from cache).
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });      // let the worker control the page
  await page.waitForTimeout(400);
  await ctx.setOffline(true);
  const offlineApp = await ctx.newPage();
  await offlineApp.goto(BASE + '/app.html', { waitUntil: 'domcontentloaded' });
  await offlineApp.waitForTimeout(800);
  const appOk = await offlineApp.evaluate(() => (document.querySelector('#app-content') || {}).textContent?.length > 50);
  const oldStart = await ctx.newPage();
  await oldStart.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await oldStart.waitForTimeout(800);
  ok('offline, the installed app still opens', appOk === true);
  ok('offline, an old "./" launch still reaches the app', oldStart.url().endsWith('/app.html'), oldStart.url().replace(BASE, ''));
  await ctx.setOffline(false);
  await ctx.close();
}

{
  // The modal generator offers all three tiers, and Advanced adds a set on main lifts.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  const build = async (experience) => {
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('setwise-personal-v1')); d.routines = [];
      localStorage.setItem('setwise-personal-v1', JSON.stringify(d));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'build-program'; document.body.appendChild(b); b.click(); });
    await page.waitForTimeout(120);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#program-form select[name="experience"] option')].map((o) => o.value + ':' + o.textContent));
    await page.evaluate((exp) => {
      const f = document.querySelector('#program-form');
      f.goal.value = 'muscle'; f.days.value = '3'; f.experience.value = exp; f.equipment.value = 'gym';
      document.querySelector('[data-action="save-program"]').click();
    }, experience);
    await page.waitForTimeout(120);
    const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('setwise-personal-v1')).routines.flatMap((r) => r.exercises.map((x) => x.sets)));
    return { opts, sets: [...new Set(sets)].sort() };
  };
  const beginner = await build('new'), intermediate = await build('regular'), advanced = await build('advanced');
  ok('the plan builder offers Beginner, Intermediate and Advanced',
     JSON.stringify(advanced.opts) === JSON.stringify(['new:Beginner', 'regular:Intermediate', 'advanced:Advanced']), advanced.opts.join(' '));
  ok('Beginner and Intermediate plans are unchanged by the refactor',
     JSON.stringify(beginner.sets) === '[2,3]' && JSON.stringify(intermediate.sets) === '[3]',
     `beginner ${JSON.stringify(beginner.sets)} · intermediate ${JSON.stringify(intermediate.sets)}`);
  ok('Advanced adds one set on main lifts', JSON.stringify(advanced.sets) === '[3,4]', JSON.stringify(advanced.sets));
  await ctx.close();
}

// ---------- 20. Mobile: every section is reachable ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app.html', { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  const dock = await page.evaluate(() => [...document.querySelectorAll('#mobile-dock .dock-link span')].map((s) => s.textContent));
  ok('the mobile dock is Home / Train / Plans / Progress / More',
     JSON.stringify(dock) === JSON.stringify(['Home', 'Train', 'Plans', 'Progress', 'More']), dock.join(' | '));
  const reached = [];
  for (const [view, heading] of [['exercises', 'Exercises'], ['body', 'Body metrics'], ['tools', 'Calculators'], ['settings', 'Settings & backup']]) {
    await page.click('#mobile-dock [data-action="dock-more"]');
    await page.click(`.more-sheet [data-view="${view}"]`);
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => ({ h: document.querySelector('#page-heading').textContent, open: !!document.querySelector('.more-sheet') }));
    if (st.h === heading && !st.open) reached.push(view);
  }
  ok('More reaches Exercises, Body metrics, Calculators and Settings, and closes after',
     reached.length === 4, reached.join(', '));
  await ctx.close();
}

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log('  - ' + f.name + ' :: ' + f.detail)); process.exit(1); }
