/**
 * Step 2.9 — 필기 이동 · 손글씨 글꼴 · 음성 콜아웃(남성) · BPM 숫자 키패드 · 손가락 제스처 · touch-action (진짜 크롬)
 *   NODE_PATH=... node scripts/browser/e2e-step29.js
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C', team: 'T' }, { title: 'Second Song', key: 'Bb', bpm: 90, form: 'Intro-V-C', team: '' }];
const MULTI = [{ id: 'FILEID_MULTI0001', name: 'Sunday All Songs.pdf' }];
const INIT = `(() => {
  window.__said = [];
  const V = (name, lang, local) => ({ name, lang, localService: !!local, default: false, voiceURI: name });
  const voices = [V('Samantha', 'en-US', 1), V('Daniel', 'en-GB', 1), V('Yuna', 'ko-KR', 1), V('Microsoft InJoon Online (Natural) - Korean (Korea)', 'ko-KR')];
  const fake = { speaking: false, getVoices() { return voices; }, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    speak(u) { if (!String(u.text).trim()) return; window.__said.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, pitch: u.pitch }); setTimeout(() => { u.onstart && u.onstart({}); u.onend && u.onend({}); }, 10); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.pitch = 1; this.rate = 1; this.volume = 1; };
})();`;
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const mk = async (tok, touch) => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, hasTouch: !!touch }); await ctx.addInitScript(INIT); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '/h.html?t=' + tok); await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [MULTI, SONGS]);
    await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 9000); await sleep(1200);
    return { ctx, page, errs };
  };
  const A = await mk('tokA', true), B = await mk('tokB'); const pa = A.page, pb = B.page;
  const items = (p, ly) => p.evaluate((l) => window.__pv.P.anno().items(l || 'team'), ly);
  const sel = (p) => p.evaluate(() => window.__pv.P.anno().selected());
  const findOn = async (p, pred) => (await items(p)).filter(pred)[0];
  /** 항목이 있는 화면 위치 (글자는 기준선 위쪽) */
  const where = (p, it) => p.evaluate((i) => { const r = document.querySelector('.pv-anno').getBoundingClientRect(); const px = (i.sz || .024) * r.width; return { x: r.x + i.x * r.width + (i.t === 'text' ? Math.min(30, px) : 0), y: r.y + i.y * r.height - (i.t === 'text' ? px * 0.35 : 0), w: r.width, h: r.height }; }, it);
  const clk = (p, sel) => p.evaluate((q) => document.querySelector(q).click(), sel);
  const mouseDrag = async (p, from, to) => { await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await p.mouse.move(to.x, to.y, { steps: 6 }); await p.mouse.up(); };

  console.log('1. 손가락 · 터치 설정 (touch-action · 선택 방지)');
  check('필기 캔버스 touch-action: none', await pa.evaluate(() => getComputedStyle(document.querySelector('.pv-anno')).touchAction === 'none'));
  check('필기 캔버스에서만 none — 악보 · 도구줄 · 캔버스 아래 PDF 는 none 이 아님', await pa.evaluate(() => ['.pv-pdf', '.pv-tools', '.pv-top', '.pv-stage'].every((s) => { const e = document.querySelector(s); return e && getComputedStyle(e).touchAction !== 'none'; })));
  check('필기 캔버스: 글자 선택 · 길게 누르기 메뉴 방지', await pa.evaluate(() => { const c = getComputedStyle(document.querySelector('.pv-anno')); return c.userSelect === 'none' && (c.webkitUserSelect || 'none') === 'none'; }));
  await pa.click('.pv-tool[data-tool="pen"]'); await sleep(350);
  check('펜 도구 중에도 touch-action: none (펜슬 · 손가락 모두)', await pa.evaluate(() => getComputedStyle(document.querySelector('.pv-anno')).touchAction === 'none' && document.querySelector('.pv-anno').style.touchAction === 'none'));
  // touchstart · touchmove · touchend 가 preventDefault 되는지 — 진짜 터치 (CDP)
  const cdp = await A.ctx.newCDPSession(pa);
  await pa.evaluate(() => { window.__tp = { start: [], move: [], end: [] }; const c = document.querySelector('.pv-anno'); const rec = (k) => (e) => window.__tp[k].push(e.defaultPrevented); ['start', 'move', 'end'].forEach((k) => document.addEventListener('touch' + k, rec(k))); });
  const box = async (p) => p.evaluate(() => { const r = document.querySelector('.pv-anno').getBoundingClientRect(), s = document.querySelector('.pv-stage').getBoundingClientRect(); return { x: Math.max(r.x, s.x) + 40, y: Math.max(r.y, s.y) + 40, w: Math.min(r.width, s.width) - 80, h: Math.min(r.height, s.height) - 80 }; });
  const tch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
  let bx = await box(pa); const n0 = (await items(pa)).length;
  await tch('touchStart', [[bx.x + 100, bx.y + 100]]);
  for (let i = 1; i <= 8; i++) await tch('touchMove', [[bx.x + 100 + i * 25, bx.y + 100 + Math.sin(i) * 20]]);
  await tch('touchEnd', []); await sleep(300);
  const tp = await pa.evaluate(() => window.__tp);
  check('손가락으로 그은 획이 끊기지 않고 하나로 저장됨', (await items(pa)).length === n0 + 1 && (await findOn(pa, (i) => i.t === 'pen' && i.p.length >= 10)) !== undefined, (await items(pa)).length);
  check('touchstart · touchmove · touchend 가 모두 preventDefault 됨 (글자 선택 · 스크롤 끼어듦 방지)', tp.start.length > 0 && tp.move.length > 0 && tp.end.length > 0 && tp.start.every(Boolean) && tp.move.every(Boolean) && tp.end.every(Boolean), tp);
  check('그리는 동안 페이지 글자가 선택되지 않음', await pa.evaluate(() => String(getSelection()).length === 0));
  check('그리는 동안 화면이 스크롤 · 쪽 넘김되지 않음', await pa.evaluate(() => document.querySelector('.pv-pg').textContent === '1 / 4'));
  // 펜 도구에서 옆으로 쓸기 = 그리기 (쪽 넘김 아님)
  await pa.evaluate(() => window.__pv.P.anno().clearPage('team', false));

  console.log('2. 쓸어 넘기기 · 두 손가락 확대 (손가락 제스처)');
  await pa.click('.pv-tool[data-tool="none"]'); await sleep(350);
  bx = await box(pa); const pageNo = () => pa.evaluate(() => document.querySelector('.pv-pg').textContent);
  const swipe = async (x0, x1, y) => { await tch('touchStart', [[x0, y]]); for (let i = 1; i <= 8; i++) await tch('touchMove', [[x0 + (x1 - x0) * i / 8, y + i]]); await tch('touchEnd', []); await sleep(500); };
  await swipe(bx.x + bx.w * .8, bx.x + bx.w * .2, bx.y + 200);
  check('왼쪽으로 쓸기 → 다음 쪽 (2 / 4)', await pageNo() === '2 / 4', await pageNo());
  await swipe(bx.x + bx.w * .2, bx.x + bx.w * .8, bx.y + 200);
  check('오른쪽으로 쓸기 → 이전 쪽 (1 / 4)', await pageNo() === '1 / 4', await pageNo());
  await swipe(bx.x + bx.w * .55, bx.x + bx.w * .5, bx.y + 200);
  check('조금만 움직이면 쪽이 넘어가지 않음', await pageNo() === '1 / 4', await pageNo());
  await tch('touchStart', [[bx.x + 200, bx.y + 100]]); for (let i = 1; i <= 8; i++) await tch('touchMove', [[bx.x + 200 + i * 5, bx.y + 100 + i * 40]]); await tch('touchEnd', []); await sleep(400);
  check('세로로 쓸면 쪽이 넘어가지 않음 (스크롤)', await pageNo() === '1 / 4', await pageNo());
  const wPdf = () => pa.evaluate(() => document.querySelector('.pv-pdf').getBoundingClientRect().width);
  const w0 = await wPdf(); const cx = bx.x + bx.w / 2, cy = bx.y + bx.h / 2;
  await tch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 8; i++) await tch('touchMove', [[cx - 40 - i * 20, cy], [cx + 40 + i * 20, cy]]);
  const during = await pa.evaluate(() => document.querySelector('.pv-pagebox').style.transform);
  await tch('touchEnd', []); await sleep(900);
  const w1 = await wPdf();
  check('두 손가락을 벌리는 동안 화면이 커지는 미리보기', /scale\(/.test(during), during);
  check('두 손가락 벌리기 → 확대됨', w1 > w0 * 1.4, { w0, w1 });
  check('손을 떼면 미리보기 변형이 사라지고 실제로 다시 그려짐', await pa.evaluate(() => !document.querySelector('.pv-pagebox').style.transform));
  await swipe(bx.x + bx.w * .8, bx.x + bx.w * .2, bx.y + 200);
  check('확대해서 보는 중에는 쓸어도 쪽이 넘어가지 않음 (화면을 옮기는 용도)', await pageNo() === '1 / 4', await pageNo());
  await tch('touchStart', [[cx - 200, cy], [cx + 200, cy]]);
  for (let i = 1; i <= 8; i++) await tch('touchMove', [[cx - 200 + i * 22, cy], [cx + 200 - i * 22, cy]]);
  await tch('touchEnd', []); await sleep(900);
  const w2 = await wPdf();
  check('두 손가락 좁히기 → 축소됨', w2 < w1 * 0.8, { w1, w2 });
  await pa.evaluate(() => { window.__pv.P.el.querySelector('[data-a="zfit"]') && 0; }); 
  // 펜 도구에서 두 손가락 = 확대 (그리던 획은 버림)
  await pa.click('.pv-tool[data-tool="pen"]'); await sleep(350); bx = await box(pa);
  const nPen = (await items(pa)).length;
  await tch('touchStart', [[bx.x + 150, bx.y + 150]]); await tch('touchMove', [[bx.x + 200, bx.y + 160]]);
  await tch('touchStart', [[bx.x + 200, bx.y + 160], [bx.x + 400, bx.y + 160]]);
  for (let i = 1; i <= 5; i++) await tch('touchMove', [[bx.x + 200 - i * 10, bx.y + 160], [bx.x + 400 + i * 10, bx.y + 160]]);
  await tch('touchEnd', []); await sleep(700);
  check('필기 중 두 손가락을 대면 그리던 획은 버려지고 확대로 넘어감 (점 · 선이 안 남음)', (await items(pa)).length === nPen, [(await items(pa)).length, nPen]);
  await pa.click('.pv-tool[data-tool="none"]'); await pa.click('[data-a="zfit"]'); await sleep(600);

  console.log('3. 글자 · 코드 · 기호 선택 → 끌어서 옮기기 (팀에 실시간 · 되돌리기)');
  await pa.evaluate(() => window.__pv.P.anno().clearPage('team', true)); await sleep(200);
  await pa.click('.pv-tool[data-tool="text"]'); await sleep(350);
  await L.clickAt(pa, .3, .25); await pa.waitForSelector('.an-input'); await pa.keyboard.type('Hello'); await pa.keyboard.press('Enter'); await sleep(300);
  await pa.click('.pv-tool[data-tool="chord"]'); await sleep(300);
  await L.clickAt(pa, .3, .5); await pa.waitForSelector('.an-input'); await pa.keyboard.type('Am7'); await pa.keyboard.press('Enter'); await sleep(300);
  await pa.click('.pv-tool[data-tool="sym"]'); await sleep(300); await pa.click('.pv-sym[data-k="fermata"]'); await L.clickAt(pa, .7, .7); await sleep(300);
  check('선택·이동 도구가 도구줄에 있음', await pa.evaluate(() => !!document.querySelector('.pv-tool[data-tool="select"]')));
  check('글자 · 코드 · 기호 세 항목이 B 에게도 보임', await L.waitTrue(pb, () => window.__pv.P.anno().items('team').length === 3, null, 3000));
  await pa.click('.pv-tool[data-tool="select"]'); await sleep(400);
  check('선택 도구 안내(선택 전)', await pa.evaluate(() => /눌러 선택/.test(document.querySelector('.pv-tools').textContent)));
  const hello = await findOn(pa, (i) => i.t === 'text' && i.s === 'Hello');
  let p1 = await where(pa, hello);
  await pa.mouse.click(p1.x, p1.y); await sleep(250);
  let s1 = await sel(pa);
  check('글자를 한 번 누르면 선택됨 (선택 정보)', !!s1 && s1.t === 'text' && s1.id === hello.id, s1);
  const shotBox = await pa.evaluate(() => { const c = document.querySelector('.pv-anno'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 120 && d[i + 1] < 160 && d[i + 2] < 70 && d[i + 3] > 200) n++; return n; });
  check('선택한 글자 둘레에 주황 점선 테두리가 그려짐', shotBox > 100, shotBox);
  const to = { x: p1.x + 260, y: p1.y + 160 };
  await mouseDrag(pa, p1, to); await sleep(500);
  const moved = await findOn(pa, (i) => i.id === hello.id);
  const dxn = 260 / p1.w, dyn = 160 / p1.h;
  check('끌어서 옮기면 글자 위치가 바뀜 (같은 항목 · 새 위치)', Math.abs(moved.x - (hello.x + dxn)) < 0.012 && Math.abs(moved.y - (hello.y + dyn)) < 0.012 && moved.s === 'Hello', { hello, moved });
  check('옮겨도 글자 · 색 · 크기는 그대로', moved.c === hello.c && moved.sz === hello.sz);
  check('옮긴 자리가 B 에게 실시간으로 도착', await L.waitTrue(pb, ([id, x, y]) => { const i = window.__pv.P.anno().items('team').filter((z) => z.id === id)[0]; return i && Math.abs(i.x - x) < 0.001 && Math.abs(i.y - y) < 0.001; }, [hello.id, moved.x, moved.y], 3000));
  check('옮기는 동안 항목이 늘어나지 않음 (새로 만들지 않고 옮김)', (await items(pa)).length === 3);
  await pa.keyboard.press('Control+z'); await sleep(400);
  const undone = await findOn(pa, (i) => i.id === hello.id);
  check('Ctrl+Z 로 원래 자리로 돌아감', Math.abs(undone.x - hello.x) < 0.0001 && Math.abs(undone.y - hello.y) < 0.0001, undone);
  check('되돌린 자리도 B 에 반영', await L.waitTrue(pb, ([id, x]) => { const i = window.__pv.P.anno().items('team').filter((z) => z.id === id)[0]; return i && Math.abs(i.x - x) < 0.0001; }, [hello.id, hello.x], 3000));
  await pa.keyboard.press('Control+Shift+z'); await sleep(300);
  check('다시 실행하면 옮긴 자리로', Math.abs((await findOn(pa, (i) => i.id === hello.id)).x - moved.x) < 0.0001);
  // 코드 · 기호도 옮김
  const chord = await findOn(pa, (i) => i.chord === 1); let pc = await where(pa, chord);
  await mouseDrag(pa, pc, { x: pc.x + 120, y: pc.y - 90 }); await sleep(400);
  const chord2 = await findOn(pa, (i) => i.id === chord.id);
  check('코드(Am7)도 끌어서 옮길 수 있음', chord2.x > chord.x + 0.03 && chord2.y < chord.y - 0.02, { chord, chord2 });
  const sym = await findOn(pa, (i) => i.t === 'sym'); let ps = await where(pa, sym);
  await mouseDrag(pa, ps, { x: ps.x - 150, y: ps.y - 60 }); await sleep(400);
  const sym2 = await findOn(pa, (i) => i.id === sym.id);
  check('기호(늘임표)도 끌어서 옮길 수 있음', sym2.x < sym.x - 0.03 && sym2.y < sym.y - 0.01, { sym, sym2 });
  // 크기 ▲▼ · 글꼴
  s1 = await sel(pa);
  check('기호를 옮긴 뒤에는 기호가 선택된 상태', s1 && s1.t === 'sym', s1);
  await pa.mouse.click(...(await (async () => { const q = await where(pa, await findOn(pa, (i) => i.id === hello.id)); return [q.x, q.y]; })())); await sleep(300);
  s1 = await sel(pa);
  check('선택 후 도구줄에 글꼴 · 크기(▲▼) · 지우기가 나타남', s1 && s1.id === hello.id && await pa.evaluate(() => !!document.querySelector('.pv-tools [data-font]') && document.querySelectorAll('.pv-tools .pv-nb').length === 2 && !!document.querySelector('.pv-tools [data-a="delsel"]')), s1);
  const sz0 = (await findOn(pa, (i) => i.id === hello.id)).sz;
  await pa.click('.pv-tools .pv-nb[data-step="1"]'); await sleep(200); await pa.click('.pv-tools .pv-nb[data-step="1"]'); await sleep(300);
  const sz1 = (await findOn(pa, (i) => i.id === hello.id)).sz;
  check('▲ 두 번 → 선택한 글자 크기가 +0.002', Math.abs(sz1 - sz0 - 0.002) < 0.0003, { sz0, sz1 });
  check('크기 변경이 B 에도 반영', await L.waitTrue(pb, ([id, z]) => { const i = window.__pv.P.anno().items('team').filter((q) => q.id === id)[0]; return i && Math.abs(i.sz - z) < 0.0002; }, [hello.id, sz1], 3000));
  await pa.selectOption('.pv-tools [data-font]', 'pen'); await sleep(300);
  check('선택한 글자에 "나눔 펜 손글씨" 글꼴 적용 → 저장 · B 반영', (await findOn(pa, (i) => i.id === hello.id)).f === 'pen' && await L.waitTrue(pb, (id) => { const i = window.__pv.P.anno().items('team').filter((q) => q.id === id)[0]; return i && i.f === 'pen'; }, hello.id, 3000));
  await pa.selectOption('.pv-tools [data-font]', 'dodum'); await sleep(300);
  check('"고운돋움" 글꼴도 적용', (await findOn(pa, (i) => i.id === hello.id)).f === 'dodum');
  check('두 글꼴이 캔버스 글꼴 목록(FONTS)에 있고 구글 폰트 링크가 붙음', await pa.evaluate(() => /Nanum Pen Script/.test(YNAnno.FONTS.pen) && /Gowun Dodum/.test(YNAnno.FONTS.dodum) && !!document.getElementById('yn-anno-fonts') && /fonts\.googleapis\.com\/css2\?family=Nanum\+Pen\+Script&family=Gowun\+Dodum/.test(document.getElementById('yn-anno-fonts').href)));
  if (await pa.evaluate(() => { const b = document.querySelector('.pv-tools [data-a="dockmore"]'); return !!b && b.offsetWidth > 0 && b.getAttribute('aria-pressed') !== 'true'; })) await pa.click('.pv-tools [data-a="dockmore"]');   // 태블릿 도크: 색은 ⋯ 를 눌러야 펼쳐짐 (Step 2.14)
  await pa.click('.pv-tools .pv-col[title="파랑"]'); await sleep(300);
  check('선택한 글자의 색 바꾸기', (await findOn(pa, (i) => i.id === hello.id)).c === '#2563eb' || (await findOn(pa, (i) => i.id === hello.id)).c !== hello.c);
  // 새 글자를 쓸 때 손글씨 글꼴이 그대로 쓰임 (글자 도구 · 코드 도구)
  await pa.click('.pv-tool[data-tool="text"]'); await sleep(300); await pa.selectOption('.pv-tools [data-font]', 'pen'); await sleep(200);
  await L.clickAt(pa, .6, .15); await pa.waitForSelector('.an-input'); await pa.keyboard.type('한글 필기'); await pa.keyboard.press('Enter'); await sleep(300);
  check('새 글자: 손글씨(pen) 글꼴로 저장', !!(await findOn(pa, (i) => i.s === '한글 필기' && i.f === 'pen')));
  await pa.click('.pv-tool[data-tool="chord"]'); await sleep(300); await pa.selectOption('.pv-tools [data-font]', 'dodum'); await sleep(200);
  await L.clickAt(pa, .8, .75); await pa.waitForSelector('.an-input'); await pa.keyboard.type('D/F#'); await pa.keyboard.press('Enter'); await sleep(300);
  check('코드도 고운돋움 글꼴로 저장', !!(await findOn(pa, (i) => i.s === 'D/F#' && i.f === 'dodum' && i.chord === 1)));
  // 삭제
  await pa.click('.pv-tool[data-tool="select"]'); await sleep(300);
  const nBefore = (await items(pa)).length; const hh = await findOn(pa, (i) => i.id === hello.id); const ph = await where(pa, hh);
  await pa.mouse.click(ph.x, ph.y); await sleep(250); await pa.keyboard.press('Delete'); await sleep(400);
  check('Delete 키로 선택한 글자 삭제 (팀에도)', (await items(pa)).length === nBefore - 1 && await L.waitTrue(pb, (id) => !window.__pv.P.anno().items('team').some((q) => q.id === id), hello.id, 3000));
  await pa.keyboard.press('Control+z'); await sleep(300);
  check('삭제도 Ctrl+Z 로 복구', !!(await findOn(pa, (i) => i.id === hello.id)));
  // 다른 사람 필기는 옮길 수 없음 (권한 없는 B)
  await pb.click('.pv-tool[data-tool="select"]'); await sleep(400);
  const h2 = await findOn(pb, (i) => i.id === hello.id); const pbp = await where(pb, h2);
  await mouseDrag(pb, pbp, { x: pbp.x + 100, y: pbp.y + 100 }); await sleep(500);
  const h3 = await findOn(pa, (i) => i.id === hello.id);
  check('B(권한 없음)는 A 의 글자를 옮길 수 없음 (위치 그대로)', Math.abs(h3.x - h2.x) < 0.0001 && Math.abs(h3.y - h2.y) < 0.0001, { h2, h3 });
  check('안내 메시지가 뜸', await pb.evaluate(() => /옮길 수 없습니다/.test(document.querySelector('.pv-toast').textContent)), await pb.evaluate(() => document.querySelector('.pv-toast').textContent));
  // 내 것만 (나만 보기)
  await pb.click('.pv-tool[data-tool="text"]'); await pb.evaluate(() => window.__pv.P.setLayer('mine')); await sleep(200);
  await L.clickAt(pb, .2, .8); await pb.waitForSelector('.an-input'); await pb.keyboard.type('mine'); await pb.keyboard.press('Enter'); await sleep(300);
  await pb.click('.pv-tool[data-tool="select"]'); await sleep(300);
  const mn = (await items(pb, 'mine'))[0]; const pm = await where(pb, mn);
  await mouseDrag(pb, pm, { x: pm.x + 90, y: pm.y - 50 }); await sleep(400);
  const mn2 = (await items(pb, 'mine'))[0];
  check('내 필기(나만 보기)는 B 도 옮길 수 있음', mn2.x > mn.x + 0.02, { mn, mn2 });
  check('나만 보기 필기는 A 에게 안 보임', !(await items(pa)).some((i) => i.s === 'mine'));

  console.log('4. 음성 콜아웃 · 남성 목소리 · BPM 숫자 키패드');
  await pa.click('.pv-tool[data-tool="none"]'); await pa.evaluate(() => window.__pv.P.showTab('metro')); await sleep(500);
  const bpm = await pa.evaluate(() => { const i = document.querySelector('.pv-bpm'); return { type: i.type, im: i.inputMode, pat: i.getAttribute('pattern'), eh: i.getAttribute('enterkeyhint') }; });
  check('BPM 칸: type=number · inputmode=numeric · pattern=[0-9]*', bpm.type === 'number' && bpm.im === 'numeric' && bpm.pat === '[0-9]*', bpm);
  const CUE = { repc: 'Repeat Chorus', halfc: 'Half Chorus', tag: 'Tag the last line', lastl: 'Last line again', once: 'One more time', onebar: 'One more bar' };
  check('세션 · 메트로놈 패널에 콜아웃 버튼 6개', await pa.evaluate((c) => Object.keys(c).every((id) => { const b = document.querySelector('[data-cue="' + id + '"]'); return b && b.textContent === c[id]; }), CUE));
  check('콜아웃이 "반복 · 콜아웃" 묶음에 모여 있음', await pa.evaluate(() => [...document.querySelectorAll('.pv-cuegrp span')].some((s) => /반복/.test(s.textContent))));
  check('음성 선택: 남성 목소리가 기본 · 사용 음성 안내', await pa.evaluate(() => document.querySelector('[data-o="gender"]').value === 'male' && /Daniel/.test(document.querySelector('[data-role="voiceinfo"]').textContent) && /남성/.test(document.querySelector('[data-role="voiceinfo"]').textContent)), await pa.evaluate(() => document.querySelector('[data-role="voiceinfo"]').textContent));
  await pa.evaluate(() => { window.__said.length = 0; });
  for (const id of Object.keys(CUE)) { await clk(pa, '[data-cue="' + id + '"]'); await sleep(200); }
  const said = await pa.evaluate(() => window.__said.filter((s) => s.text.trim()));
  check('버튼 6개를 누르면 각 문장을 말함', JSON.stringify(said.map((s) => s.text)) === JSON.stringify(Object.values(CUE)), said.map((s) => s.text));
  check('모두 남성 음성(Daniel)으로 · 음높이는 그대로', said.every((s) => s.voice === 'Daniel' && s.pitch === 1), said.map((s) => [s.voice, s.pitch]));
  await pa.selectOption('[data-o="lang"]', 'ko'); await sleep(200); await pa.evaluate(() => { window.__said.length = 0; }); await clk(pa, '[data-cue="repc"]'); await sleep(250);
  const ko = await pa.evaluate(() => window.__said.filter((s) => s.text.trim()));
  check('한국어 큐: 코러스 반복 · 한국어 남성 음성(InJoon)', ko.length === 1 && ko[0].text === '코러스 반복' && /InJoon/.test(ko[0].voice), ko);
  await pa.selectOption('[data-o="gender"]', 'female'); await sleep(200); await pa.evaluate(() => { window.__said.length = 0; }); await clk(pa, '[data-cue="repc"]'); await sleep(250);
  const fe = await pa.evaluate(() => window.__said.filter((s) => s.text.trim()));
  check('여성으로 바꾸면 여성 음성(Yuna)', fe.length === 1 && fe[0].voice === 'Yuna', fe);
  await pa.selectOption('[data-o="gender"]', 'male'); await pa.selectOption('[data-o="lang"]', 'en'); await sleep(200);
  await pb.evaluate(() => window.__pv.P.showTab('metro')); await sleep(400);
  check('B 화면 BPM 칸도 같은 숫자 키패드 속성', await pb.evaluate(() => { const i = document.querySelector('.pv-bpm'); return i.type === 'number' && i.inputMode === 'numeric' && i.getAttribute('pattern') === '[0-9]*'; }));
  await pa.evaluate(() => window.__pv.P.showTab('form')); await sleep(400);
  check('송폼 탭의 곡 정보 BPM 칸도 숫자 키패드', await pa.evaluate(() => { const i = document.querySelector('[data-e="bpm"]'); return !!i && i.inputMode === 'numeric' && i.getAttribute('pattern') === '[0-9]*'; }));

  const errs = A.errs.concat(B.errs);
  check('브라우저 오류 없음', errs.length === 0, errs.slice(0, 4));
  await br.close(); await new Promise((r) => S.server.close(r)); if (S.rt) await S.rt.close().catch(() => {});
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
