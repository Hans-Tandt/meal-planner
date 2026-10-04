// Takes the manual's screenshots of the real app in headless Chrome.
// Run:  node manual/figures/shoot.mjs      → manual/figures/raw/*.png + raw/meta.json
// Phone size 390×844 at 2× pixels, light mode, animations off, sample data only (no family data).
// "Today" is frozen to Tuesday 29 September 2026 so every run gives the same pictures.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..', 'app');
const OUT = join(HERE, 'raw');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8766, DBG = 9333;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Sample data ──
const SAMPLE = {
  days: {
    '2026-09-28': { isQuick: false, meals: { breakfast: m('Yogurt & granola'), lunch: m('Tomato soup'), dinner: m('Spaghetti Bolognese', 'Kids loved it!') } },
    '2026-09-29': { isQuick: false, meals: { breakfast: m('Pancakes'), lunch: m('Croque monsieur') } },
    '2026-09-30': { isQuick: true,  meals: { breakfast: m('Muesli'), dinner: m('Omelette & salad') } },
    '2026-10-01': { isQuick: false, meals: { breakfast: m('Toast & jam'), lunch: m('Quiche Lorraine'), dinner: m('Chicken curry with rice') } },
    '2026-10-02': { isQuick: false, meals: { dinner: m('Fish with mashed potatoes') } },
    '2026-10-03': { isQuick: false, meals: { breakfast: m('Croissants'), dinner: m('Moules-frites') } },
    '2026-10-04': { isQuick: false, meals: { lunch: m('Roast chicken'), dinner: m('Soup & bread') } }
  },
  shop: {
    delhaize: ['Minced beef 500 g', 'Tomatoes 1 kg', 'Milk 2 L', 'Gouda cheese 400 g', 'Fresh parsley'],
    lidl: ['Spaghetti 1 kg', 'Rice 1 kg'],
    aldi: ['Orange juice 2 L'],
    massen: ['Coffee beans 1 kg'],
    other: []
  },
  done: { 'delhaize|Milk 2 L': true },
  family: 'Tandt'
};
function m(name, notes) { return { name, notes: notes || '', photo: null }; }

// Injected into every page: frozen date, helpers and a stand-in for the AI server.
const INJECT = `
(() => {
  const F = new Date('2026-09-29T10:00:00').getTime();
  const R = Date;
  class D extends R { constructor(...a) { super(...(a.length ? a : [F])); } static now() { return F; } }
  window.Date = D;
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__closeAll = async () => {
    while (document.querySelector('.sheet.open')) { document.getElementById('overlay').click(); await __sleep(120); }
  };
  const PLAN = { days: [
    { breakfast: 'Yogurt with berries', lunch: 'Leek and potato soup', dinner: 'Chicken stew with carrots' },
    { breakfast: 'Pancakes', lunch: 'Ham and cheese sandwiches', dinner: 'Pasta with tomato sauce' },
    { breakfast: 'Muesli', lunch: 'Egg wraps', dinner: 'Tomato soup with bread' },
    { breakfast: 'Toast with jam', lunch: 'Quiche Lorraine', dinner: 'Meatballs in tomato sauce with fries' },
    { breakfast: 'Porridge', lunch: 'Salad niçoise', dinner: 'Baked salmon with rice' },
    { breakfast: 'Croissants', lunch: 'Croque monsieur', dinner: 'Carbonnade flamande with mash' },
    { breakfast: 'Waffles', lunch: 'Roast chicken with apple sauce', dinner: 'Vegetable soup' }
  ] };
  const ID = { name: 'Spaghetti Bolognese', description: 'Spaghetti with a slow-cooked tomato and minced beef sauce, topped with grated cheese.' };
  const SHOP = { delhaize: ['Chicken thighs 1 kg'], lidl: ['Pasta 500 g'], aldi: [], massen: [], other: [] };
  window.__stubAI = () => {
    window.fetch = async (url, opt) => {
      const body = JSON.parse(opt.body);
      const c = body.messages[0].content;
      const text = (typeof c === 'string' ? c : c.map(x => x.text || '').join(' ')).trim();
      const json = text.startsWith('Plan') ? PLAN : text.startsWith('Identify') ? ID : SHOP;
      await __sleep(150);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }], stop_reason: 'end_turn' }), { status: 200 });
    };
  };
  window.__pickPhoto = async (inputId) => {
    const c = document.createElement('canvas'); c.width = c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#C98A4B'; g.fillRect(0, 0, 300, 300);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'dish.jpg', { type: 'image/jpeg' }));
    const inp = document.getElementById(inputId); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    await __sleep(400);
  };
})();`;

// ── Chrome DevTools Protocol plumbing ──
mkdirSync(OUT, { recursive: true });
const server = spawn('py', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', APP], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'mp-shoot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function getJson(url) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error('No answer from ' + url);
}

let ws, seq = 0;
const pending = new Map(), waiters = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = method => new Promise(res => waiters.push({ method, res }));
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}
async function load(url) {
  const done = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await done;
  await sleep(500);
}

const meta = {};
// markers: [{n, sel} | {n, js}] → numbered boxes drawn later by annotate.py
// clip: JS returning {x,y,width,height} in CSS px, or omitted for the full phone screen
// crop: JS returning {top,bottom} in CSS px — annotate.py keeps only that band (e.g. just the open panel)
async function shot(name, setup, markers = [], clip = null, crop = null) {
  if (setup) await js(setup);
  await sleep(500);
  const rects = await js(`
    const specs = ${JSON.stringify(markers)};
    return specs.map(s => {
      const e = s.js ? (0, eval)(s.js) : document.querySelector(s.sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { n: s.n, x: b.left, y: b.top, w: b.width, h: b.height };
    });`);
  if (rects.some(r => r === null)) throw new Error(`${name}: a marker target was not found`);
  const box = clip ? await js(clip) : null;
  const params = { format: 'png' };
  if (box) params.clip = { ...box, scale: 1 };
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  meta[name] = { markers: rects, clip: box, crop: crop ? await js(crop) : null };
  console.log('shot', name);
}

try {
  const list = await getJson(`http://127.0.0.1:${DBG}/json/list`);
  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      const i = waiters.findIndex(w => w.method === msg.method);
      if (i !== -1) waiters.splice(i, 1)[0].res(msg.params);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' }
  ] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });

  // Seed the sample data, then reload so the app starts from it
  await load(BASE);
  await js(`
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('mptandt', ${JSON.stringify(JSON.stringify(SAMPLE))});
    localStorage.setItem('mp_lang', 'en');
    localStorage.setItem('mp_apikey', 'sk-ant-sample');
    localStorage.setItem('mp_pin', '1234');
    sessionStorage.setItem('mp_auth', '1');`);
  await load(BASE);

  await shot('week', null, [
    { n: 1, sel: '.wk-ctrl' },
    { n: 2, sel: '.daycard.today' },
    { n: 3, sel: '.tag-quick' },
    { n: 4, sel: '#nav' },
    { n: 5, sel: '#btnMenu' }
  ]);

  await shot('day-empty', `document.querySelector('.daycard.today').click();`, [
    { n: 1, sel: '#daySlots .slot-add' }
  ], null, `const b = document.getElementById('daySheet').getBoundingClientRect(); return { top: b.top, bottom: b.bottom };`);

  await shot('editor', `
    document.querySelector('#daySlots .slot-add').click(); await __sleep(200);
    document.getElementById('mName').value = 'Chicken curry';`, [
    { n: 2, sel: '#mName' },
    { n: 3, sel: '#mPZ' },
    { n: 4, sel: '#btnSaveMeal' }
  ], null, `const b = document.getElementById('mealSheet').getBoundingClientRect(); return { top: b.top, bottom: b.bottom };`);

  await shot('day-quick', `
    await __closeAll();
    document.querySelectorAll('.daycard')[2].click();`, [
    { n: 1, sel: '#qtRow' },
    { n: 2, sel: '#daySlots .icon-btn:not(.danger)' },
    { n: 3, sel: '#daySlots .icon-btn.danger' },
    { n: 4, sel: '#daySlots .slot-add' }
  ], null, `const b = document.getElementById('daySheet').getBoundingClientRect(); return { top: b.top, bottom: b.bottom };`);

  await shot('plan', `
    await __closeAll();
    __stubAI();
    document.getElementById('t-ai').click(); await __sleep(100);
    document.getElementById('planBtn').click(); await __sleep(900);
    const apply = document.querySelector('#planRes .btn');
    apply.scrollIntoView({ block: 'end' });`, [
    { n: 1, js: `[...document.querySelectorAll('.sug-day')].find(e => e.getBoundingClientRect().top > 140)` },
    { n: 2, sel: '#planRes .btn' }
  ]);

  await shot('confirm', `document.querySelector('#planRes .btn').click(); await __sleep(200);`, [
    { n: 3, sel: '#cfOk' },
    { n: 4, sel: '#cfCancel' }
  ]);

  await shot('shop', `
    document.getElementById('cfCancel').click(); await __sleep(150);
    document.getElementById('t-shop').click();`, [
    { n: 1, sel: '#storeRow' },
    { n: 2, sel: '#shopInp' },
    { n: 3, sel: '#shopList .schk' },
    { n: 4, sel: '#shopList .icon-btn' },
    { n: 5, sel: '#btnAiShop' }
  ]);

  await shot('identify', `
    document.getElementById('t-ai').click(); await __sleep(100);
    await __pickPhoto('aiPhInp');
    document.getElementById('idBtn').click(); await __sleep(700);
    document.getElementById('idBtn').scrollIntoView({ block: 'center' });`, [
    { n: 1, sel: '#idBtn' },
    { n: 2, sel: '#idName' },
    { n: 3, sel: '#btnIdShop' }
  ], `
    const card = document.getElementById('idBtn').closest('.ai-card').getBoundingClientRect();
    const a = document.getElementById('idBtn').getBoundingClientRect();
    const b = document.getElementById('idRes').getBoundingClientRect();
    return { x: card.left - 8, y: a.top - 18, width: card.width + 16, height: b.bottom - a.top + 36 };`);

  await shot('menu', `document.getElementById('btnMenu').click();`, [
    { n: 1, sel: '#btnExport' },
    { n: 2, sel: '#btnImportTrigger' },
    { n: 3, sel: '#langSeg' },
    { n: 4, sel: '#famInp' }
  ], null, `const a = document.getElementById('menuSheet').getBoundingClientRect(); const b = document.getElementById('btnSaveFamily').getBoundingClientRect(); return { top: a.top, bottom: b.bottom + 18 };`);

  await js(`await __closeAll(); sessionStorage.removeItem('mp_auth'); localStorage.removeItem('mp_pin');`);
  await load(BASE);
  await shot('lock', null, [{ n: 1, sel: '.keypad' }]);

  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('done:', Object.keys(meta).length, 'screenshots');
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  server.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
