const { chromium } = require('playwright');
let pass = 0, fail = 0; const fails = [];
function check(name, cond, detail) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name); console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function launch() {
  return chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'] });
}
async function waitTrue(page, fn, arg, ms) { try { await page.waitForFunction(fn, arg, { timeout: ms || 3000 }); return true; } catch (e) { return false; } }
async function opened(browser, base, tok, viewport, ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ viewport: viewport || { width: 1280, height: 800 }, acceptDownloads: true }, ctxOpts || {}));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base + '/h.html?t=' + tok);
  await page.click('#go');
  return { ctx, page, errs };
}
const overlayPx = (page) => page.evaluate(() => { const c = document.querySelector('.pv-anno'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const pdfInk = (page) => page.evaluate(() => { const c = document.querySelector('.pv-pdf'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; });
const teamCount = (page) => page.evaluate(() => (window.__pv = window.__pv && window.__pv.P ? window.__pv : window.YNPractice.current()).P.anno().items('team').length);
const mineCount = (page) => page.evaluate(() => (window.__pv = window.__pv && window.__pv.P ? window.__pv : window.YNPractice.current()).P.anno().items('mine').length);
/** 악보가 화면보다 크게 확대될 수 있으므로(자동 여백 맞춤) 실제로 보이는 부분(악보 칸 ∩ 화면)만 돌려줍니다 */
async function vis(page) {
  const b = await page.locator('.pv-anno').boundingBox(), st = await page.locator('.pv-stage').boundingBox(), vp = page.viewportSize();
  const x0 = Math.max(b.x, st.x, 0), y0 = Math.max(b.y, st.y, 0), x1 = Math.min(b.x + b.width, st.x + st.width, vp.width), y1 = Math.min(b.y + b.height, st.y + st.height, vp.height);
  return { x: x0 + 6, y: y0 + 6, width: Math.max(10, x1 - x0 - 12), height: Math.max(10, y1 - y0 - 12) };
}
async function drag(page, pts) {
  const b = await vis(page);
  await page.mouse.move(b.x + pts[0][0] * b.width, b.y + pts[0][1] * b.height); await page.mouse.down();
  for (let i = 1; i < pts.length; i++) await page.mouse.move(b.x + pts[i][0] * b.width, b.y + pts[i][1] * b.height, { steps: 4 });
  await page.mouse.up();
}
async function clickAt(page, fx, fy) { const b = await vis(page); await page.mouse.click(b.x + fx * b.width, b.y + fy * b.height); }
async function ensureTool(page, t) { const cur = await page.evaluate(() => (window.__pv = window.__pv && window.__pv.P ? window.__pv : window.YNPractice.current()).P.anno().state().tool); if (cur !== t) await page.click('.pv-tool[data-tool="' + t + '"]'); }
function summary() { console.log(`\n통과 ${pass} · 실패 ${fail}`); if (fail) console.log('실패:', fails.join(' | ')); return fail === 0; }
module.exports = { vis, ensureTool, check, sleep, launch, waitTrue, opened, overlayPx, pdfInk, teamCount, mineCount, drag, clickAt, summary };
