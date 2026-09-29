/**
 * 입력칸 글자 대비 시험 (Step 4) — "내 정보 수정" 에서 입력한 글씨가 흰색이라 안 보이던 문제가 다시 생기지 않게.
 * 실제로 화면에 그려진 글자색과 뒤 배경(겹친 투명도까지 합성)의 명암비를 재서, 입력 글씨 4.5:1 · 안내 글씨(placeholder) 3:1 미만이면 실패.
 * 진짜 server.js + 가짜 구글 + 진짜 크롬.
 */
process.env.PORT = '4196';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4196';
const AUDIT = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0,0,0,1]; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bot) => { const a = top[3]; return [top[0]*a + bot[0]*(1-a), top[1]*a + bot[1]*(1-a), top[2]*a + bot[2]*(1-a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }; return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const backdrop = (node) => { const chain = []; for (let n = node; n; n = n.parentElement) chain.push(getComputedStyle(n).backgroundColor); let base = [12,12,12,1]; for (let i = chain.length - 1; i >= 0; i--) { const c = parse(chain[i]); if (c[3] > 0) base = over(c, base); } return base; };
  const out = [];
  document.querySelectorAll('input, textarea, select').forEach((n) => {
    if (/checkbox|radio|hidden|file|range|button|submit/.test(n.type)) return;
    const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return;
    let anc = n, hidden = false; while (anc) { if (getComputedStyle(anc).display === 'none') hidden = true; anc = anc.parentElement; } if (hidden) return;
    const bg = backdrop(n); const txt = over(parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== 'rgba(0, 0, 0, 0)' ? cs.webkitTextFillColor : cs.color), bg);
    out.push({ id: n.id || n.name || n.placeholder || n.tagName, text: Math.round(ratio(txt, bg) * 10) / 10 });
    if (n.placeholder) { const ph = getComputedStyle(n, '::placeholder'); out[out.length-1].ph = Math.round(ratio(over(parse(ph.color), bg), bg) * 10) / 10; }
  });
  return out;
};

(async () => {
  await sleep(1200);
  const run = (fn) => global.__runtime.run((api) => fn(api)).result;
  const br = await L.launch();
  const report = async (label, page, mayBeEmpty) => {
    const r = await page.evaluate(AUDIT);
    const bad = r.filter((x) => x.text < 4.5 || (x.ph !== undefined && x.ph < 3));
    check(label + ' — 입력칸 ' + r.length + '개 모두 읽힘', (mayBeEmpty || r.length > 0) && bad.length === 0, bad);
  };
  for (const who of [['정일반', '4165551008'], ['김커미티', '4165551000']]) {
    const tok = run((api) => api.포털토큰_(who[0], who[1], ''));
    const ctx = await br.newContext({ viewport: { width: 420, height: 900 } }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
    await page.goto(BASE + '/?page=portal');
    await L.waitTrue(page, () => document.getElementById('main').style.display === 'block', null, 8000);
    await sleep(500);
    await page.evaluate(() => showProfile(true)); await sleep(500);
    await page.evaluate(() => openEdit()); await sleep(300);
    await report(who[0] + ' · 내 정보 수정', page);
    await page.fill('#e_engName', 'Typed Name 123');
    const shown = await page.evaluate(() => { const i = document.getElementById('e_engName'); const c = getComputedStyle(i); return { color: c.color, fill: c.webkitTextFillColor, bg: c.backgroundColor }; });
    check(who[0] + ' · 입력한 글씨색이 배경과 다름(흰 글씨 · 흰 배경 아님)', shown.fill !== shown.bg && !(/255, 255, 255/.test(shown.fill) && /^rgb\(2[45]\d/.test(shown.bg)), shown);
    await page.evaluate(() => { editing = false; showProfile(false); }); await sleep(300);
    try { await page.evaluate(() => openCellApp()); await sleep(600); await report(who[0] + ' · 셀 신청', page, true); } catch (e) { console.log('   (셀 신청 화면 건너뜀)'); }
    check(who[0] + ' · 페이지 오류 없음', errs.length === 0, errs);
    await ctx.close();
  }
  const tok = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } }); const page = await ctx.newPage();
  await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
  await page.goto(BASE + '/?page=notes&t=' + encodeURIComponent(tok));
  await L.waitTrue(page, () => !!document.getElementById('q'), null, 8000);
  await report('내 설교 노트 · 목록', page);
  await page.goto(BASE + '/?page=notes&new=1&t=' + encodeURIComponent(tok));
  await L.waitTrue(page, () => !!document.getElementById('ynTitle'), null, 8000);
  await page.fill('#ynTaBody', '글씨가 보이는지'); await sleep(200);
  await report('내 설교 노트 · 편집', page);
  await page.goto(BASE + '/?page=bulletin');
  await L.waitTrue(page, () => { const f = document.querySelector('.yn-dockfab'); return f && !f.hidden; }, null, 8000);
  await page.click('.yn-dockfab'); await sleep(500);
  await report('주보 필기 창', page);
  await page.goto(BASE + '/?page=devotion&t=' + encodeURIComponent(tok));
  await L.waitTrue(page, () => /내 설교 노트/.test(document.body.textContent), null, 8000);
  await report('오늘의 묵상', page);
  await br.close();
  const okAll = L.summary(); process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
