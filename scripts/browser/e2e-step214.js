/**
 * Step 2.14 — 쪽 넘기기 스와이프 축 고정 (제자리 고정 + 슬라이드) · 태블릿 위 캡슐 도크 (진짜 크롬)
 *   NODE_PATH=... node scripts/browser/e2e-step214.js
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C', team: 'T' }];
const MULTI = [{ id: 'FILEID_MULTI0001', name: 'Sunday All Songs.pdf' }];
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base + '/h.html?t=tokA'); await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [MULTI, SONGS]);
  await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 9000); await sleep(1200);
  const cdp = await ctx.newCDPSession(page);
  const tch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
  const pageNo = () => page.evaluate(() => document.querySelector('.pv-pg').textContent);
  const boxRect = () => page.evaluate(() => { const r = document.querySelector('.pv-pagebox').getBoundingClientRect(); const st = document.querySelector('.pv-stage'); return { x: Math.round(r.x), y: Math.round(r.y), sl: st.scrollLeft, st: st.scrollTop }; });
  const swipe = async (dx, dy, opts) => {
    opts = opts || {}; const bx = await page.evaluate(() => { const r = document.querySelector('.pv-stage').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.evaluate(() => { window.__mv = []; const st = document.querySelector('.pv-stage'); if (!window.__mvOn) { window.__mvOn = 1; st.addEventListener('touchmove', (e) => window.__mv.push(e.defaultPrevented), { passive: true }); } });
    const x0 = bx.x - dx / 2, y0 = bx.y - dy / 2; await tch('touchStart', [[x0, y0]]); let mid = null;
    for (let i = 1; i <= 10; i++) { await tch('touchMove', [[x0 + dx * i / 10, y0 + dy * i / 10]]); if (i === 6) mid = await boxRect(); }
    await tch('touchEnd', []); await sleep(opts.wait == null ? 60 : opts.wait);
    return { mid, moves: await page.evaluate(() => window.__mv.slice()) };
  };
  const flipped = async (from) => (await pageNo()) !== from;

  console.log('1. 스와이프 축 고정');
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-stage')).touchAction);
  check('한 쪽이 다 보이면(확대 전) 악보 칸의 브라우저 터치 스크롤이 꺼짐 (touch-action none / pan-y)', ta === 'none' || ta === 'pan-y', ta);
  check('악보 칸 overscroll-behavior: contain (가로는 none)', await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.pv-stage')); return c.overscrollBehaviorY === 'contain' && c.overscrollBehaviorX === 'none'; }));
  const r0 = await boxRect();
  let r = await swipe(-300, 10); 
  check('가로 쓸기 → 다음 쪽 (2 / 4)', (await pageNo()) === '2 / 4', await pageNo());
  check('쓰는 동안 touchmove 가 preventDefault 됨 (가로로 정해진 뒤)', r.moves.length > 0 && r.moves.filter(Boolean).length >= r.moves.length - 2, r.moves);
  check('쓰는 동안 악보 위치가 제자리 (손가락을 따라 끌려다니지 않음)', r.mid && Math.abs(r.mid.x - r0.x) <= 1 && Math.abs(r.mid.y - r0.y) <= 1 && r.mid.sl === r0.sl && r.mid.st === r0.st, { r0, mid: r.mid });
  check('넘어간 뒤 새 쪽이 슬라이드로 들어옴 (pv-slide-n)', await page.evaluate(() => document.querySelector('.pv-pagebox').classList.contains('pv-slide-n')));
  await sleep(450);
  check('슬라이드가 끝나면 클래스가 사라지고 위치가 그대로', await page.evaluate(() => !document.querySelector('.pv-pagebox').classList.contains('pv-slide-n')) && Math.abs((await boxRect()).x - r0.x) <= 1);
  await swipe(300, -10, { wait: 500 });
  check('반대로 쓸기 → 이전 쪽 (1 / 4) · pv-slide-p', (await pageNo()) === '1 / 4', await pageNo());
  await sleep(400);

  const from = await pageNo();
  await swipe(-50, 0, { wait: 500 }); check('가로 50px 는 60px 기준 미만 → 넘어가지 않음', !(await flipped(from)), await pageNo());
  await swipe(-200, 120, { wait: 500 }); check('비스듬히(세로/가로 = 0.6) → 넘어가지 않음', !(await flipped(from)), await pageNo());
  await swipe(-100, 55, { wait: 500 }); check('세로/가로 = 0.55 → 넘어가지 않음', !(await flipped(from)), await pageNo());
  await swipe(-30, 200, { wait: 500 }); check('세로로 쓸기 → 넘어가지 않음', !(await flipped(from)), await pageNo());
  await swipe(-100, 45, { wait: 500 }); check('세로/가로 = 0.45 (기준 안) → 넘어감', await flipped(from), await pageNo());
  await sleep(400); await page.evaluate(() => { window.__pv.P.goPage ? window.__pv.P.goPage(1) : 0; });
  if ((await pageNo()) !== '1 / 4') { await swipe(300, 0, { wait: 500 }); }

  console.log('2. 확대해서 보는 중에는 원래대로');
  await page.click('.pv-b[data-a="zin"]'); await sleep(200); await page.click('.pv-b[data-a="zin"]'); await sleep(900);
  check('확대하면 터치 스크롤이 다시 켜짐 (pan-x pan-y)', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-stage')).touchAction) === 'pan-x pan-y');
  const z0 = await pageNo(); await swipe(-300, 0, { wait: 500 }); check('확대 중에는 쓸어도 쪽이 안 넘어감', (await pageNo()) === z0, await pageNo());
  await page.click('.pv-b[data-a="zout"]'); await sleep(200); await page.click('.pv-b[data-a="zout"]'); await sleep(900);   // 확대를 원래대로 (맞춤 버튼은 가로 폭 ↔ 한 쪽 전환이라 누르지 않음)

  console.log('3. 캡슐 도크 (태블릿 · 넓은 화면)');
  const geo = () => page.evaluate(() => {
    const t = document.querySelector('.pv-tools'), r = t.getBoundingClientRect(), c = getComputedStyle(t), vis = (s) => { const e = document.querySelector(s); return !!e && e.offsetWidth > 0 && e.offsetHeight > 0; };
    const mq = document.querySelector('.pv-mq'), m = mq ? mq.getBoundingClientRect() : null, pb = document.querySelector('.pv-pagebox').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight, dir: c.flexDirection, blur: c.backdropFilter || c.webkitBackdropFilter, radius: parseFloat(c.borderTopLeftRadius),
      col: vis('.pv-tools .pv-col'), tool: vis('.pv-tools .pv-tool[data-tool="pen"]'), more: vis('.pv-tools [data-a="dockmore"]'), hide: vis('.pv-tools [data-a="dockhide"]'), pill: vis('.pv-toolsbtn'), mqRight: m ? m.right : 0, mqLeft: m ? m.left : 0, pbTop: pb.top, mainTop: document.querySelector('.pv-main').getBoundingClientRect().top, padTop: parseFloat(getComputedStyle(document.querySelector('.pv-stage')).paddingTop), fit: document.querySelector('.pv-stage').scrollHeight <= document.querySelector('.pv-stage').clientHeight + 2 }; });
  await page.evaluate(() => { try { localStorage.removeItem('yn.pv.dockmore'); } catch (e) {} });
  let g = await geo();
  check('도크가 위 가운데 (가로 중앙 ±2px, 악보 영역 맨 위 12px 이내)', Math.abs(g.x + g.w / 2 - g.vw / 2) <= 2 && g.y - g.mainTop <= 12, g);
  check('높이 36 ~ 44px · 한 줄(row) · 알약 모양', g.h >= 36 && g.h <= 44.5 && g.dir === 'row' && g.radius >= 20, g);
  check('배경 블러 (backdrop-filter: blur)', /blur/.test(g.blur || ''), g.blur);
  check('화면의 5% 미만만 차지 (95% 이상이 악보)', g.w * g.h < g.vw * g.vh * 0.05, { area: (g.w * g.h) / (g.vw * g.vh) });
  check('도구 아이콘 · ⋯ · ▴ 는 보이고 색 · 굵기(보조 옵션)는 접혀 있음', g.tool && g.more && g.hide && !g.col, g);
  check('접기 알약은 도크가 열려 있는 동안 숨김', !g.pill, g);
  check('메트로놈 버튼(.pv-mq)과 겹치지 않음', !g.mqRight || g.mqRight <= g.x || g.mqLeft >= g.right, { mqRight: g.mqRight, x: g.x });
  const first = await page.evaluate(() => { const c = document.querySelector('.pv-pdf'), x = c.getContext('2d'), w = c.width, h = c.height, d = x.getImageData(0, 0, w, h).data; for (let y = 0; y < h; y++) for (let i = 0; i < w; i += 3) { const k = (y * w + i) * 4; if (d[k] < 200 || d[k + 1] < 200 || d[k + 2] < 200) return c.getBoundingClientRect().top + y * c.getBoundingClientRect().height / h; } return null; });
  check('악보 칸 위 여백 54px · 악보의 첫 글자가 도크 밑에서 시작 (가려지지 않음)', g.padTop >= 54 && first !== null && first >= g.bottom - 2, { first, bottom: g.bottom, padTop: g.padTop });
  await page.screenshot({ path: '/tmp/shot-dock-closed.png' });

  await page.click('.pv-tools [data-a="dockmore"]'); await sleep(200); g = await geo();
  check('⋯ 를 누르면 색 · 굵기가 펼쳐지고 높이는 그대로', g.col && g.h <= 44.5, g);
  check('펼침 상태가 저장됨', await page.evaluate(() => localStorage.getItem('yn.pv.dockmore')) === '1');
  check('⋯ 버튼 aria-pressed=true', await page.evaluate(() => document.querySelector('.pv-tools [data-a="dockmore"]').getAttribute('aria-pressed')) === 'true');
  await page.click('.pv-tools .pv-tool[data-tool="pen"]'); await sleep(300); g = await geo();
  check('펜을 골라 도구줄이 다시 그려져도 펼침 유지', g.col && g.h <= 44.5, g);
  await page.screenshot({ path: '/tmp/shot-dock-open.png' });
  await page.click('.pv-tools .pv-tool[data-tool="pen"]'); await sleep(200);
  await page.click('.pv-tools [data-a="dockmore"]'); await sleep(150);
  check('⋯ 를 다시 누르면 접힘', !(await geo()).col);

  await page.click('.pv-tools [data-a="dockhide"]'); await sleep(500); g = await geo();
  const pill = await page.evaluate(() => { const r = document.querySelector('.pv-toolsbtn').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  check('▴ 를 누르면 도크 전체가 접히고 작은 알약만 남음', !g.tool && g.pill, g);
  check('알약: 위 가운데 · 높이 44px 이하', Math.abs(pill.x + pill.w / 2 - g.vw / 2) <= 2 && pill.y - g.mainTop <= 12 && pill.h <= 44, pill);
  await page.screenshot({ path: '/tmp/shot-dock-hidden.png' });
  await page.click('.pv-toolsbtn'); await sleep(500); g = await geo();
  check('알약을 누르면 도크가 다시 열림', g.tool && !g.pill, g);

  console.log('4. 좁은 화면(폰 · 아이패드 세로)은 예전 그대로');
  await page.setViewportSize({ width: 1024, height: 768 }); await sleep(700);
  check('1024px 에서는 도구가 서랍 안 · 도크 버튼은 숨김', await page.evaluate(() => !!document.querySelector('.pv-drawer .pv-tools') && [...document.querySelectorAll('.pv-tools .pv-dk')].every((b) => b.offsetWidth === 0)));
  await page.click('.pv-menubtn'); await sleep(450);
  check('서랍을 열면 도구가 보임', await page.evaluate(() => { const r = document.querySelector('.pv-drawer .pv-tool').getBoundingClientRect(); return r.width > 0 && r.height > 0; }));
  await page.screenshot({ path: '/tmp/shot-dock-compact.png' });

  check('잔여 오류 없음', errs.length === 0, errs);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
