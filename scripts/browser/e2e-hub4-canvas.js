/**
 * Hub v4 §3 — 캔버스 조작 시험 (진짜 크롬): 방금 만든 항목 자동 선택 · 빈 곳을 끌어도 따라오는 이동 · 크기 · 지우기 손잡이 ·
 *  기호 · 송폼 라벨 · 필기 200개 위에서 끌 때 저장해 둔 그림 사용 여부
 *   node scripts/browser/e2e-hub4-canvas.js            (Playwright 필요: npm i -D playwright · npx playwright install chromium)
 *   PW_CHROMIUM=/경로/chromium 로 크롬 위치를 지정할 수 있습니다.
 */
const path = require('path'), fs = require('fs');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require((process.env.NPM_GLOBAL || require('child_process').execSync('npm root -g').toString().trim()) + '/playwright').chromium; }
const SRC = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../public/worship/anno.js'), 'utf8');
let pass = 0, fail = [];
function ok(c, m) { if (c) pass++; else { fail.push(m); console.log('  ✗ ' + m); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); }
(async () => {
  const br = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : (fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}));
  const pg = await br.newPage({ viewport: { width: 900, height: 700 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.setContent('<style>body{margin:0}#host{position:relative;width:800px;height:600px;margin:20px;background:#fff}#cv{position:absolute;left:0;top:0}.an-editor{position:absolute}</style><div id="host"><canvas id="cv"></canvas></div>');
  await pg.addScriptTag({ content: SRC });
  await pg.evaluate(() => {
    window.LOG = { add: [], del: [] };
    window.A = YNAnno.create({ canvas: document.getElementById('cv'), host: document.getElementById('host'), me: 'me', canEdit: true, sawPen: false,
      onAdd: (l, it) => LOG.add.push(JSON.parse(JSON.stringify(it))), onDel: (l, id) => LOG.del.push(id) });
    A.resize(800, 600); A.setPerms('me', true); A.setLayer('mine');
  });
  const box0 = await pg.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const X = (v) => box0.x + v, Y = (v) => box0.y + v;
  const settle = () => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const st = () => pg.evaluate(() => A.state());
  const items = () => pg.evaluate(() => A.items('mine').map((i) => ({ t: i.t, x: i.x, y: i.y, sz: i.sz, s: i.s, k: i.k, id: i.id })));
  const tap = async (x, y) => { await pg.mouse.move(X(x), Y(y)); await pg.mouse.down(); await pg.mouse.up(); };
  const drag = async (x1, y1, x2, y2, steps) => { await pg.mouse.move(X(x1), Y(y1)); await pg.mouse.down(); await pg.mouse.move(X(x2), Y(y2), { steps: steps || 8 }); await pg.mouse.up(); };

  console.log('■ 글자: 만들기 → 자동 선택');
  await pg.evaluate(() => A.setTool('text'));
  await tap(100, 100);
  ok((await st()).ed === true, '빈 곳을 누르면 입력칸이 열림');
  await pg.keyboard.type('Hello'); await pg.keyboard.press('Enter');
  let s = await st(); let it = await items();
  eq(it.length, 1, '글자 1개'); ok(s.sel && s.sel.id === it[0].id, '만든 글자가 바로 선택됨 (테두리 + 손잡이)');
  const t0 = it[0];

  console.log('■ 이동 상태: 빈 곳을 끌어도 따라옴');
  await drag(400, 400, 450, 430);
  it = await items();
  ok(Math.abs(it[0].x - (t0.x + 50 / 800)) < 0.002 && Math.abs(it[0].y - (t0.y + 30 / 600)) < 0.002, '빈 곳을 (50,30)만큼 끌면 글자도 (50,30)만큼 이동: ' + JSON.stringify([t0.x, t0.y, it[0].x, it[0].y]));
  s = await st(); ok(s.sel && s.sel.id === t0.id, '이동 뒤에도 선택 유지');
  eq((await pg.evaluate(() => LOG.add.filter((a) => a.id === (A.items('mine')[0].id)).length)) >= 2, true, '이동이 서버 알림(onAdd)으로 나감');
  await pg.evaluate(() => A.undo()); it = await items();
  ok(Math.abs(it[0].x - t0.x) < 0.002, '되돌리기로 원위치');
  // 다시 이동해 두고
  await drag(400, 400, 450, 430); it = await items(); const moved = it[0];

  console.log('■ 톡 치면: 선택 해제 + 새 글자 입력칸');
  await tap(600, 300);
  s = await st(); ok(s.ed === true && !s.sel, '빈 곳을 톡 → 선택은 풀리고 새 글자 입력칸');
  await pg.keyboard.type('Two'); await pg.keyboard.press('Enter');
  it = await items(); eq(it.length, 2, '글자 2개'); ok((await st()).sel.id === it[1].id, '새 글자가 선택됨');
  ok(Math.abs(it[0].x - moved.x) < 1e-6, '첫 글자는 그대로');

  console.log('■ 손잡이: 크기 조절');
  // 선택된 글자(Two)의 오른쪽 아래 손잡이 자리 = 상자 오른쪽 아래. 글자 x,y 로 계산하지 않고 앱이 그린 픽셀에서 찾는다
  const two = it[1];
  // 상자를 화면 픽셀로 측정: 선택 표시 주황색(#ff8a2a) 손잡이 원 중심을 캔버스에서 찾기
  await settle();
  const handles = await pg.evaluate(() => { const c = document.getElementById('cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height, dpr = W / 800;
    const pts = { red: [], org: [] };
    for (let yy = 0; yy < H; yy += 1) for (let xx = 0; xx < W; xx += 1) { const o = (yy * W + xx) * 4, r = d.data[o], g = d.data[o + 1], b = d.data[o + 2], a = d.data[o + 3]; if (a < 250) continue;
      if (Math.abs(r - 0xe5) < 6 && Math.abs(g - 0x48) < 6 && Math.abs(b - 0x4d) < 6) pts.red.push([xx / dpr, yy / dpr]);
      else if (Math.abs(r - 0xff) < 4 && Math.abs(g - 0x8a) < 6 && Math.abs(b - 0x2a) < 6) pts.org.push([xx / dpr, yy / dpr]); }
    const cen = (a) => a.length ? [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length] : null;
    // 주황: 손잡이(원) 여러 개 + 점선 상자. 원만 뽑기 위해 밀집한 픽셀만: 빨간 삭제 손잡이 중심을 기준으로 상자를 유추
    return { red: cen(pts.red), nred: pts.red.length, norg: pts.org.length }; });
  ok(handles.red && handles.nred > 40, '빨간 삭제 손잡이가 그려짐 (' + handles.nred + 'px)');
  const del = handles.red;                                        // 오른쪽 위
  // 크기 손잡이는 오른쪽 아래: 삭제 손잡이 바로 아래, 상자 높이만큼. 상자 높이는 글자 크기로부터 (px*1.3+4+10)
  const px2 = Math.max(8, two.sz * 800), boxH = px2 * 1.3 + 4 + 10;
  const sizeH = [del[0], del[1] + boxH];
  const sz0 = two.sz;
  await drag(sizeH[0], sizeH[1], sizeH[0] + 60, sizeH[1] + 40, 6);
  it = await items(); ok(it[1].sz > sz0 * 1.15, '크기 손잡이를 끌면 글자가 커짐: ' + sz0 + ' → ' + it[1].sz);
  await pg.evaluate(() => A.undo()); it = await items(); ok(Math.abs(it[1].sz - sz0) < 1e-6, '되돌리기로 원래 크기');
  ok((await st()).sel && (await st()).sel.id === two.id, '크기 조절 뒤에도 선택 유지');

  console.log('■ 손잡이: 지우기');
  const before = (await items()).length;
  await settle();
  const delH = await pg.evaluate(() => { const c = document.getElementById('cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height, dpr = W / 800; let sx = 0, sy = 0, n = 0;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const o = (yy * W + xx) * 4; if (d.data[o + 3] > 250 && Math.abs(d.data[o] - 0xe5) < 6 && Math.abs(d.data[o + 1] - 0x48) < 6 && Math.abs(d.data[o + 2] - 0x4d) < 6) { sx += xx; sy += yy; n++; } } return [sx / n / dpr, sy / n / dpr]; });
  await tap(delH[0], delH[1]);
  it = await items(); eq(it.length, before - 1, '삭제 손잡이를 톡 치면 선택한 글자가 지워짐');
  ok(!(await st()).sel, '지운 뒤 선택 없음');
  await pg.evaluate(() => A.undo()); eq((await items()).length, before, '되돌리기로 복구');

  console.log('■ 기호: 놓으면 선택 → 다시 눌러 끌기');
  await pg.evaluate(() => { A.deselect(); A.setTool('sym'); A.setSymbol('sharp'); });
  await tap(200, 300);
  it = await items(); const sy = it.find((q) => q.t === 'sym'); ok(!!sy, '기호가 놓임'); ok((await st()).sel && (await st()).sel.id === sy.id, '놓은 기호가 선택됨');
  await drag(200, 300, 260, 340, 6);
  const sy2 = (await items()).find((q) => q.t === 'sym');
  ok(Math.abs(sy2.x - (sy.x + 60 / 800)) < 0.003 && Math.abs(sy2.y - (sy.y + 40 / 600)) < 0.003, '선택된 기호를 눌러 끌면 이동');
  await tap(500, 500);
  const syms = (await items()).filter((q) => q.t === 'sym'); eq(syms.length, 2, '떨어진 곳을 누르면 새 기호가 놓임 (연속 찍기 유지)');
  ok((await st()).sel.id === syms.find((q) => q.id !== sy.id).id, '새 기호가 선택됨');
  const before2 = (await items()).length;
  await pg.evaluate(() => { A.setSymbol('cresc'); });
  await drag(300, 100, 380, 100, 5);
  const cr = (await items()).filter((q) => q.k === 'cresc'); eq(cr.length, 1, '늘어나는 기호(크레셴도)는 선택된 다른 기호가 있어도 그대로 그려짐');
  eq((await items()).length, before2 + 1, '기존 기호가 딸려 움직이지 않음');

  console.log('■ 송폼 라벨');
  await pg.evaluate(() => { A.deselect(); A.setTool('fbox'); A.setFboxTag('V'); });
  await tap(150, 450);
  const fb = (await items()).find((q) => q.t === 'fbox'); ok(!!fb, '송폼 라벨이 놓임'); ok((await st()).sel && (await st()).sel.id === fb.id, '라벨이 선택됨');

  console.log('■ 선택 도구 · 도구 전환');
  await pg.evaluate(() => A.setTool('select')); ok(!!(await st()).sel, '선택 도구로 바꿔도 선택 유지');
  await pg.evaluate(() => A.setTool('pen')); ok(!(await st()).sel, '펜으로 바꾸면 선택 해제');
  await pg.evaluate(() => { A.setTool('text'); });
  // 다른 사람이 쓴 것은 못 만짐
  await pg.evaluate(() => { A.setPerms('me', false); A.remoteAdd('team', { id: 'X1', t: 'text', pg: 1, c: '#111111', x: 0.7, y: 0.8, sz: 0.03, s: 'Other', by: 'zed' }); A.select('team', 'X1'); });
  const oth = await items(); await drag(300, 200, 350, 240, 4);
  const other = await pg.evaluate(() => A.items('team').find((q) => q.id === 'X1'));
  ok(Math.abs(other.x - 0.7) < 1e-6, '남의 글자는 (권한 없으면) 끌어도 안 움직임');
  await pg.evaluate(() => { A.setPerms('me', true); });

  console.log('■ 성능: 필기 200개 위에서 글자 끌기');
  await pg.evaluate(() => { A.deselect(); for (let i = 0; i < 200; i++) A.remoteAdd('team', { id: 'S' + i, t: 'text', pg: 1, c: '#111111', x: (i % 20) / 22 + 0.02, y: Math.floor(i / 20) / 12 + 0.05, sz: 0.02, s: 'Sample' + i, by: 'zed' }); A.setTool('select'); });
  const res = await pg.evaluate(() => new Promise((resolve) => {
    const c = document.getElementById('cv'), x = c.getContext('2d'); let fill = 0, blit = 0;
    const of = x.fillText.bind(x), od = x.drawImage.bind(x); x.fillText = function () { fill++; return of.apply(null, arguments); }; x.drawImage = function () { blit++; return od.apply(null, arguments); };
    const it0 = A.items('mine').find((q) => q.t === 'text'); A.select('mine', it0.id);
    const r = c.getBoundingClientRect(); let frames = 0, t0 = performance.now(), maxF = 0, last = t0;
    const ptr = (type, cx, cy) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + cx, clientY: r.top + cy, buttons: type === 'pointerup' ? 0 : 1, button: 0, width: 4, height: 4, bubbles: true, cancelable: true }));
    ptr('pointerdown', 700, 560); fill = 0; blit = 0;
    let n = 0; const tick = () => { const now = performance.now(); maxF = Math.max(maxF, now - last); last = now; frames++; n++; ptr('pointermove', 700 - n * 4, 560 - n * 3); if (n < 60) requestAnimationFrame(tick); else { ptr('pointerup', 700 - n * 4, 560 - n * 3); resolve({ fill, blit, frames, ms: performance.now() - t0, maxF }); } };
    requestAnimationFrame(tick);
  }));
  console.log('    60프레임 끌기: fillText ' + res.fill + '회 · 저장 그림 붙이기 ' + res.blit + '회 · 최대 프레임 ' + res.maxF.toFixed(1) + 'ms');
  ok(res.blit >= 50, '끄는 동안 대부분 프레임이 저장해 둔 그림을 붙임 (' + res.blit + '/60)');
  ok(res.fill < 60 * 8, '프레임마다 200개를 다시 그리지 않음 (fillText ' + res.fill + ' < 480; 전부 다시 그리면 12000)');
  const fin = await pg.evaluate(() => { const i = A.items('mine').find((q) => q.t === 'text'); return { x: i.x, y: i.y }; });
  ok(fin.x < 0.7, '끌기가 실제로 반영됨');

  ok(errs.length === 0, '페이지 오류 없음 ' + errs.join(' | '));
  await br.close();
  console.log(fail.length ? '\n✗ 실패 ' + fail.length + '건' : '\n✓ 모두 통과 (' + pass + ')'); process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
