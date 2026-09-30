/**
 * Step 13 — 악보 코드 인식 · 키 바꾸기 · 알토/테너 화음 · 손으로 고치기 · 미리듣기 (진짜 크롬)
 *   NODE_PATH=$(npm root -g) node scripts/browser/e2e-step13.js
 *   OCR 시험은 인터넷 대신 node_modules 의 tesseract.js 를 CDN 주소로 가로채 씁니다 (TESS_DIR 로 위치 지정, 없으면 OCR 시험은 건너뜀)
 */
const fs = require('fs'), path = require('path');
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const MK = require('./mksheet');
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 240, form: 'V1-C', team: 'T' }];
const LEAD = [{ id: 'FILEID_LEAD00001', name: 'Amazing Grace Lead.pdf' }];
const SCAN = [{ id: 'FILEID_SCAN00001', name: 'Amazing Grace Scan.png' }];
const TESS = process.env.TESS_DIR || '/home/claude/scratch/node_modules';
const OUT = process.env.OUT_DIR || path.join(require('os').tmpdir(), 'step13-shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1400, height: 950 }, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base + '/h.html?t=tokA');
  await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [LEAD, SONGS]);
  check('악보가 열림', await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000));
  await sleep(1200);

  const H = (fn, arg) => page.evaluate(fn, arg);
  const flip = (pg, sel, on) => pg.evaluate(([sel, on]) => { const i = document.querySelector(sel); if (i.checked !== on) i.closest('label').click(); }, [sel, on]);
  const ui = () => page.evaluate(() => { const u = window.YNHarmonyUI._last, s = u._state, pg = String(window.__pv.P.page()), d = s.data && s.data.pages[pg]; return { mode: s.mode, semis: s.semis, okey: s.okey && s.okey.name, tkey: s.tkey && s.tkey.name, busy: s.busy, chords: d ? d.chords.map((c) => ({ id: c.id, text: c.text, x: c.x, y: c.y, w: c.w, h: c.h, src: c.src })) : [], staves: d ? d.staves.length : 0, notes: d ? d.notes.length : 0, src: d && d.src, ovA: Object.keys(s.data.ov.alto).length, ovT: Object.keys(s.data.ov.tenor).length, model: s.model[pg] ? s.model[pg].notes.length : 0, hits: s.hits.length, undo: s.undo.length, playing: !!s.playing, playIdx: s.playIdx, stat: s.statMsg }; });
  const pxCount = (rect, pred) => page.evaluate(([rect, predSrc]) => { const c = document.querySelector('.pv-harm'), x = c.getContext('2d'), k = c.width / c.clientWidth, f = new Function('r', 'g', 'b', 'a', 'return ' + predSrc);
    const X = Math.max(0, Math.round(rect[0] * k)), Y = Math.max(0, Math.round(rect[1] * k)), W = Math.max(1, Math.round(rect[2] * k)), Hh = Math.max(1, Math.round(rect[3] * k)); const d = x.getImageData(X, Y, Math.min(W, c.width - X), Math.min(Hh, c.height - Y)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2], d[i + 3])) n++; return n; }, [rect, pred]);
  const full = () => page.evaluate(() => { const c = document.querySelector('.pv-harm'); return [0, 0, c.clientWidth, c.clientHeight]; });
  const isRed = 'a>200 && r>230 && g<110 && b<110', isBlue = 'a>200 && b>230 && r<110 && g>120 && g<180';
  const cssBox = () => page.evaluate(() => { const c = document.querySelector('.pv-harm'); return { w: c.clientWidth, h: c.clientHeight }; });
  async function shot(name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }
  const chordBox = (c, B) => [c.x * B.w - 6, c.y * B.h - 4, c.w * B.w + 12, c.h * B.h + 8];

  console.log('1. 화음 탭 · 분석 (PDF 글자층)');
  await H(() => window.__pv.P.showTab('harmony')); await sleep(400);
  check('"화음" 탭이 생기고 패널이 그려짐', await H(() => !!document.querySelector('.hm') && !!document.querySelector('.hm [data-a="an-page"]')));
  check('탭 버튼이 목록에 있음', await H(() => !!document.querySelector('.pv-tabbtn[data-tab="harmony"]')));
  check('악보 상자 안에 덧그림 캔버스(.pv-harm)가 필기 캔버스 위에 있음', await H(() => { const c = document.querySelector('.pv-harm'), a = document.querySelector('.pv-anno'); return !!c && c.parentNode === a.parentNode && +getComputedStyle(c).zIndex > +getComputedStyle(a).zIndex; }));
  check('보기 상태에서는 덧그림이 눌림을 가로채지 않음 (pointer-events none)', await H(() => getComputedStyle(document.querySelector('.pv-harm')).pointerEvents === 'none'));
  check('분석 전에는 "아직 분석하지 않은 쪽" 안내', /아직 분석/.test((await ui()).stat));
  await page.click('.hm [data-a="an-page"]');
  check('분석이 끝남', await L.waitTrue(page, () => { const u = window.YNHarmonyUI._last._state; return !u.busy && u.data.pages['1']; }, null, 20000));
  let u = await ui();
  check('코드 15개를 PDF 글자층에서 읽음', u.chords.length === 15 && u.src === 'text', [u.chords.length, u.src]);
  const truthTxt = MK.layout().truth.chords.map((c) => c.text).sort().join(' ');
  check('코드 글자가 실제 악보와 같음 (G C D Em7 … D/F# 15개)', u.chords.map((c) => c.text).sort().join(' ') === truthTxt, [u.chords.map((c) => c.text).sort().join(' '), truthTxt]);
  check('오선 4줄 · 멜로디 음 26개', u.staves === 4 && u.notes === 26, [u.staves, u.notes]);
  check('원래 조를 G 로 짐작함', u.okey === 'G', u.okey);
  check('화음 모델이 26음 모두에 만들어짐', u.model === 26, u.model);
  check('상태 안내에 코드 · 오선 · 멜로디 개수가 보임', /코드 15개/.test(u.stat) && /오선 4줄/.test(u.stat) && /멜로디 음 26개/.test(u.stat), u.stat);
  const B = await cssBox();

  console.log('2. 알토(빨강) · 테너(파랑) 덧그림');
  const red0 = await pxCount(await full(), isRed), blue0 = await pxCount(await full(), isBlue);
  check('빨강(#FF4D4D) 알토 표시가 그려짐', red0 > 300, red0);
  check('파랑(#4D94FF) 테너 표시가 그려짐', blue0 > 300, blue0);
  await shot('01-harmony-original');
  await page.uncheck('.hm [data-o="alto"]'); await sleep(200);
  check('알토를 끄면 빨강이 사라지고 파랑은 그대로', (await pxCount(await full(), isRed)) === 0 && (await pxCount(await full(), isBlue)) > 300);
  await page.check('.hm [data-o="alto"]'); await sleep(200);
  check('다시 켜면 돌아옴', (await pxCount(await full(), isRed)) > 300);

  console.log('3. 키 바꾸기 · 원래 코드 가리기');
  const c0 = u.chords.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0], box0 = chordBox(c0, B);
  const chipDark = 'a>240 && r<40 && g<40 && b<50', chipText = 'a>200 && r>200 && g>110 && g<200 && b<130';
  check('키를 바꾸기 전에는 코드 자리에 덧그림이 없음', (await pxCount(box0, 'a>0')) < 12, await pxCount(box0, 'a>0'));
  await page.selectOption('.hm [data-o="target"]', 'A'); await sleep(300); u = await ui();
  check('목표 A → +2 반음', u.semis === 2 && u.tkey === 'A', [u.semis, u.tkey]);
  check('"G ➔ A · +2 반음" 안내', /G ➔ A/.test(await H(() => document.querySelector('.hm-semis').textContent)) && /\+2/.test(await H(() => document.querySelector('.hm-semis').textContent)));
  const inner0 = [c0.x * B.w, c0.y * B.h, c0.w * B.w, c0.h * B.h];
  check('원래 코드 글자 자리를 칩이 빈틈없이 덮음 (불투명 픽셀 98% 이상)', (await pxCount(inner0, 'a>240')) >= inner0[2] * inner0[3] * 0.98 - 2, [await pxCount(inner0, 'a>240'), inner0[2] * inner0[3]]);
  check('칩 안에 주황색 새 코드 글자가 그려짐', (await pxCount(box0, chipText)) > 15, await pxCount(box0, chipText));
  await shot('02-transposed-A');
  await page.selectOption('.hm [data-o="target"]', 'Bb'); await sleep(300); u = await ui();
  check('Bb 로: +3 반음 · 플랫 표기', u.semis === 3 && u.tkey === 'Bb');
  await page.selectOption('.hm [data-o="target"]', 'Eb'); await sleep(300); u = await ui();
  check('Eb 로: 아래로 −4 반음 (가까운 방향)', u.semis === -4, u.semis);
  await flip(page, '.hm [data-o="showorig"]', true); await sleep(250);
  check('"원래 코드 그대로 보기" 를 켜면 칩이 사라짐', (await pxCount(box0, chipDark)) < 10);
  await flip(page, '.hm [data-o="showorig"]', false); await sleep(250);
  await page.selectOption('.hm [data-o="target"]', ''); await sleep(250); u = await ui();
  check('"그대로" 를 고르면 0 반음 · 코드 덮개 없음', u.semis === 0 && (await pxCount(box0, 'a>0')) < 12);
  await page.selectOption('.hm [data-o="target"]', 'A'); await sleep(250);

  console.log('4. 화음 끌어서 고치기 (마우스)');
  await page.click('.hm [data-mode="harmony"]'); await sleep(250);
  check('화음 모드: 덧그림이 눌림을 받음', await H(() => getComputedStyle(document.querySelector('.pv-harm')).pointerEvents === 'auto'));
  const pickVoice = (kind, idx) => H(([kind, idx]) => { const s = window.YNHarmonyUI._last._state, pg = String(window.__pv.P.page()), m = s.model[pg].notes[idx], q = s.hits.filter((h) => h.kind === kind && h.id === m.id)[0], r = document.querySelector('.pv-harm').getBoundingClientRect(); return q ? { x: r.left + q.x, y: r.top + q.y, id: m.id, midi: kind === 'alto' ? m.altoF : m.tenorF, staff: m.staff } : null; }, [kind, idx]);
  const spPx = await H(() => { const s = window.YNHarmonyUI._last._state, pd = s.data.pages['1'], c = document.querySelector('.pv-harm'); return pd.staves[0].sp * c.clientHeight; });
  let a3 = await pickVoice('alto', 3); check('알토 3번째 음의 머리를 찾음', !!a3, a3);
  await page.mouse.move(a3.x, a3.y); await page.mouse.down(); await page.mouse.move(a3.x, a3.y - spPx * 0.5, { steps: 3 }); await page.mouse.move(a3.x, a3.y - spPx * 1.0, { steps: 3 }); await page.mouse.move(a3.x, a3.y - spPx * 1.5, { steps: 3 });
  await sleep(120);
  check('끄는 동안 이름표(예: "알토 B4")가 그려짐 · 아직 저장 전', (await pxCount(await full(), 'a>200 && r>240 && g>240 && b>240')) > 30 && (await ui()).ovA === 0);
  await page.mouse.up(); await sleep(250); u = await ui();
  let a3b = await H((id) => { const s = window.YNHarmonyUI._last._state; return s.data.ov.alto[id]; }, a3.id);
  check('놓으면 그 음만 손으로 고친 값으로 저장됨 (오선 3칸 위 = 알토 음이 바뀜)', u.ovA === 1 && a3b !== undefined && a3b !== a3.midi, [u.ovA, a3b, a3.midi]);
  check('오선의 "칸" 단위로 옮겨짐 (원래 음과의 차이가 1~6 반음, 조 안의 음)', Math.abs(a3b - a3.midi) >= 2 && Math.abs(a3b - a3.midi) <= 6, [a3b, a3.midi]);
  check('되돌리기 버튼이 켜짐', u.undo === 1);
  await page.click('.hm [data-a="undo"]'); await sleep(200); u = await ui();
  check('되돌리기 → 자동값 · 저장에서 지워짐', u.ovA === 0 && u.undo === 0, u);
  const t5 = await pickVoice('tenor', 5);
  await page.mouse.move(t5.x, t5.y); await page.mouse.down(); await page.mouse.move(t5.x, t5.y + spPx * 1.0, { steps: 6 }); await page.mouse.up(); await sleep(250);
  check('테너도 끌어서 고침', (await ui()).ovT === 1);
  const t5v = await H((id) => window.YNHarmonyUI._last._state.data.ov.tenor[id], t5.id);
  check('테너를 아래로 끌면 음이 내려감', t5v < t5.midi, [t5v, t5.midi]);
  check('고친 음은 흰 테두리로 표시됨', await pxCount(await full(), 'a>200 && r>200 && g>200 && b>200') > 30);
  const t5b = await pickVoice('tenor', 5);
  await page.mouse.click(t5b.x, t5b.y); await sleep(80); await page.mouse.click(t5b.x, t5b.y); await sleep(250);
  check('같은 음을 두 번 누르면 자동값으로 돌아감', (await ui()).ovT === 0);
  await page.mouse.click(a3.x, a3.y); await sleep(200);
  check('음을 누르면 "선택한 음" 카드가 뜸 (알토 · 멜로디 대비 음정)', await H(() => { const e = document.querySelector('.hm-sel'); return e.style.display !== 'none' && /알토/.test(e.textContent) && /아래|위/.test(e.textContent); }));
  await page.click('.hm [data-a="nudge+"]'); await sleep(200);
  const nud = await H((id) => window.YNHarmonyUI._last._state.data.ov.alto[id], a3.id);
  check('♯ 반음↑ 버튼: 선택한 음이 반음 올라감 (임시표 ♯ 표시)', nud === a3.midi + 1, [nud, a3.midi]);
  await page.click('.hm [data-a="reset-sel"]'); await sleep(200);
  check('"자동값으로" 버튼', (await ui()).ovA === 0);
  await shot('03-harmony-edit');

  console.log('5. 손가락 · 애플 펜슬 (포인터 이벤트)');
  const fire = (type, x, y, o) => H(([type, x, y, o]) => { const c = document.querySelector('.pv-harm'); c.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, o))); }, [type, x, y, o]);
  a3 = await pickVoice('alto', 3);
  await fire('pointerdown', a3.x, a3.y, { pointerType: 'pen', pressure: 0.5, width: 1, height: 1 });
  for (let i = 1; i <= 6; i++) await fire('pointermove', a3.x, a3.y - spPx * 0.25 * i, { pointerType: 'pen', pressure: 0.5, width: 1, height: 1 });
  await fire('pointerup', a3.x, a3.y - spPx * 1.5, { pointerType: 'pen' }); await sleep(250);
  check('애플 펜슬(pen)로도 끌어서 고침', (await ui()).ovA === 1);
  await page.click('.hm [data-a="undo"]'); await sleep(150);
  a3 = await pickVoice('alto', 3);
  await fire('pointerdown', a3.x, a3.y, { pointerType: 'touch', width: 80, height: 80 }); await fire('pointermove', a3.x, a3.y - spPx, { pointerType: 'touch', width: 80, height: 80 }); await fire('pointerup', a3.x, a3.y - spPx, { pointerType: 'touch' }); await sleep(200);
  check('손바닥(넓게 닿은 손가락)은 무시함 — 화음이 바뀌지 않음', (await ui()).ovA === 0);
  await fire('pointerdown', a3.x, a3.y, { pointerType: 'touch', width: 12, height: 12 }); for (let i = 1; i <= 4; i++) await fire('pointermove', a3.x, a3.y - spPx * 0.3 * i, { pointerType: 'touch', width: 12, height: 12 }); await fire('pointerup', a3.x, a3.y - spPx * 1.2, { pointerType: 'touch' }); await sleep(250);
  check('손가락(작은 접촉)으로는 끌어서 고침', (await ui()).ovA === 1);
  await page.click('.hm [data-a="undo"]'); await sleep(150);
  check('화음 모드에서는 쪽 넘기기 · 확대 제스처가 덧그림 위에서 막힘 (touchstart 전파 중단)', await H(() => { let hit = false; document.querySelector('.pv-stage').addEventListener('touchstart', () => { hit = true; }, { once: true }); const c = document.querySelector('.pv-harm'); const t = new Touch({ identifier: 1, target: c, clientX: 100, clientY: 100 }); c.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] })); return !hit; }));

  console.log('6. 멜로디 · 코드 고치기');
  await page.click('.hm [data-mode="melody"]'); await sleep(250);
  const n0 = (await ui()).notes;
  check('멜로디 모드: 음표마다 점선 동그라미 (눌림 자리 26개+)', (await ui()).hits >= 26);
  await page.click('.hm .hm-sub[data-sub="melody"] [data-sub="add"]'); await sleep(150);
  const stv = await H(() => { const s = window.YNHarmonyUI._last._state, st = s.data.pages['1'].staves[0], c = document.querySelector('.pv-harm'), r = c.getBoundingClientRect(); return { x: r.left + 0.93 * c.clientWidth, y: r.top + (st.bottom - 3 * st.sp / 2) * c.clientHeight }; });
  await page.mouse.click(stv.x, stv.y); await sleep(300); u = await ui();
  check('오선 위를 누르면 새 음표가 생김 → 26 → 27개, 화음이 다시 계산됨', u.notes === n0 + 1 && u.model === 27, [u.notes, u.model]);
  await page.click('.hm [data-a="undo"]'); await sleep(200);
  check('되돌리기 → 다시 26개', (await ui()).notes === n0);
  await page.click('.hm .hm-sub[data-sub="melody"] [data-sub="del"]'); await sleep(100);
  const m2 = await H(() => { const s = window.YNHarmonyUI._last._state, q = s.hits.filter((h) => h.kind === 'melody')[2], r = document.querySelector('.pv-harm').getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; });
  await page.mouse.click(m2.x, m2.y); await sleep(250);
  check('지우기 도구: 음표를 누르면 삭제 → 25개', (await ui()).notes === n0 - 1);
  await page.click('.hm [data-a="undo"]'); await sleep(200);
  check('되돌리기 → 26개', (await ui()).notes === n0);
  await page.click('.hm .hm-sub[data-sub="melody"] [data-sub="move"]');
  const m4 = await H(() => { const s = window.YNHarmonyUI._last._state, pg = '1', q = s.hits.filter((h) => h.kind === 'melody')[4], m = s.model[pg].notes[4], r = document.querySelector('.pv-harm').getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y, step: m.step, midi: m.midi, alto: m.altoF }; });
  await page.mouse.move(m4.x, m4.y); await page.mouse.down(); await page.mouse.move(m4.x, m4.y - spPx * 0.5 * 2, { steps: 6 }); await page.mouse.up(); await sleep(300);
  const m4b = await H(() => { const m = window.YNHarmonyUI._last._state.model['1'].notes[4]; return { step: m.step, midi: m.midi, alto: m.altoF }; });
  check('멜로디 음표를 2칸 위로 끌면 step +2 · 음이 올라가고 화음도 다시 계산됨', m4b.step === m4.step + 2 && m4b.midi > m4.midi, [m4, m4b]);
  await page.click('.hm [data-a="undo"]'); await sleep(200);
  check('되돌리기 → 원래 음', (await H(() => window.YNHarmonyUI._last._state.model['1'].notes[4].step)) === m4.step);

  await page.click('.hm [data-mode="chord"]'); await sleep(250);
  await page.selectOption('.hm [data-o="target"]', 'A'); await sleep(200);
  const chp = await H((i) => { const s = window.YNHarmonyUI._last._state, pd = s.data.pages['1'], c = pd.chords.slice().sort((a, b) => a.y - b.y || a.x - b.x)[i], r = document.querySelector('.pv-harm').getBoundingClientRect(), cv = document.querySelector('.pv-harm'); return { x: r.left + (c.x + c.w / 2) * cv.clientWidth, y: r.top + (c.y + c.h / 2) * cv.clientHeight, text: c.text, id: c.id }; }, 0);
  await page.mouse.click(chp.x, chp.y); await sleep(250);
  check('코드 상자를 누르면 입력칸이 뜸 (원래 글자가 채워짐)', await H((t) => { const i = document.querySelector('.hm-edit'); return !!i && i.value === t; }, chp.text));
  await page.fill('.hm-edit', 'Am7'); await page.keyboard.press('Enter'); await sleep(300);
  const after = await H((id) => window.YNHarmonyUI._last._state.data.pages['1'].chords.filter((c) => c.id === id)[0].text, chp.id);
  check('Am7 로 고치면 저장됨 (입력칸 닫힘)', after === 'Am7' && await H(() => !document.querySelector('.hm-edit')), after);
  check('키 A 로 바뀐 칩에는 Bm7 (Am7 +2)', (await pxCount(chordBox(u.chords.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0], B), chipText)) > 10);
  await page.mouse.click(chp.x, chp.y); await sleep(200); await page.fill('.hm-edit', 'Hello'); await page.keyboard.press('Enter'); await sleep(250);
  check('코드가 아닌 글자("Hello")는 거절하고 원래대로 (안내 메시지)', (await H((id) => window.YNHarmonyUI._last._state.data.pages['1'].chords.filter((c) => c.id === id)[0].text, chp.id)) === 'Am7');
  await page.click('.hm [data-a="undo"]'); await sleep(200);
  check('되돌리기 → 원래 코드', (await H((id) => window.YNHarmonyUI._last._state.data.pages['1'].chords.filter((c) => c.id === id)[0].text, chp.id)) === chp.text);
  await page.click('.hm .hm-sub[data-sub="chord"] [data-sub="add"]'); await sleep(100);
  const nCh = (await ui()).chords.length;
  const empty = await H(() => { const r = document.querySelector('.pv-harm').getBoundingClientRect(); return { x: r.left + 0.5 * r.width, y: r.top + 0.445 * r.height }; });
  await page.mouse.click(empty.x, empty.y); await sleep(250); await page.fill('.hm-edit', 'F#m7'); await page.keyboard.press('Enter'); await sleep(300);
  check('빈 곳을 눌러 새 코드를 추가함', (await ui()).chords.length === nCh + 1);
  await page.click('.hm [data-a="undo"]'); await sleep(200);
  check('되돌리기 → 추가한 코드 사라짐', (await ui()).chords.length === nCh);
  await page.click('.hm [data-mode="view"]'); await sleep(200);
  check('보기로 돌아오면 다시 눌림을 가로채지 않음', await H(() => getComputedStyle(document.querySelector('.pv-harm')).pointerEvents === 'none'));

  console.log('7. 화음 미리듣기 (Web Audio)');
  await page.selectOption('.hm [data-o="target"]', 'A'); await sleep(200);
  await page.evaluate(() => { const AC = window.AudioContext; window.__nodes = 0; const orig = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__nodes++; return orig.apply(this, arguments); }; });
  await page.click('.hm [data-a="play"]'); await sleep(500); u = await ui();
  const snap = await H(() => { const s = window.YNHarmonyUI._last._state; return { playing: !!s.playing, ev: s.playing && s.playing.sch.events.length, first: s.playing && s.playing.sch.events[0].midi, txt: document.querySelector('.hm [data-a="play"]').textContent, ctx: window.__nodes }; });
  check('재생이 시작되고 버튼이 "■ 멈춤"으로 바뀜', snap.playing && /멈춤/.test(snap.txt), snap);
  check('26음 × 3성부 = 78개 소리가 예약됨', snap.ev === 78, snap.ev);
  check('소리가 실제로 만들어짐 (오실레이터 노드가 생김)', snap.ctx > 0, snap.ctx);
  check('목표 조(A)로 들림: 첫 멜로디 소리가 G4(67)+2 = 69', snap.first === 69, snap.first);
  check('재생 위치가 진행됨 (playIdx ≥ 0)', await L.waitTrue(page, () => window.YNHarmonyUI._last._state.playIdx >= 1, null, 4000));
  await shot('04-playing');
  check('재생 중인 음은 발광 효과로 강조 (흰 테두리)', (await pxCount(await full(), 'a>200 && r>240 && g>240 && b>240')) > 20);
  await page.click('.hm [data-a="play"]'); await sleep(250);
  check('멈춤 버튼 → 즉시 멈춤 · 버튼 복귀', await H(() => !window.YNHarmonyUI._last._state.playing && /미리듣기/.test(document.querySelector('.hm [data-a="play"]').textContent)));
  await page.uncheck('.hm [data-v="a"]'); await page.uncheck('.hm [data-v="t"]');
  await page.click('.hm [data-a="play"]'); await sleep(200);
  check('멜로디만 켜면 26개 소리', await H(() => window.YNHarmonyUI._last._state.playing.sch.events.length) === 26);
  await page.click('.hm [data-a="play"]'); await page.check('.hm [data-v="a"]'); await page.check('.hm [data-v="t"]'); await sleep(150);
  await page.fill('.hm [data-o="bpm"]', '480'); await page.keyboard.press('Enter'); await page.click('.hm [data-a="play"]');
  check('끝까지 재생하면 저절로 멈춤 (BPM 480)', await L.waitTrue(page, () => !window.YNHarmonyUI._last._state.playing, null, 12000));

  console.log('8. 기억 · 되살리기');
  await page.click('.hm [data-mode="harmony"]');
  const a2 = await pickVoice('alto', 6); await page.mouse.move(a2.x, a2.y); await page.mouse.down(); await page.mouse.move(a2.x, a2.y - spPx, { steps: 5 }); await page.mouse.up(); await sleep(700);
  const saved = await H(() => { const k = Object.keys(localStorage).filter((x) => /^yn\.pv\.harm\./.test(x)); return { keys: k, size: k.length ? localStorage.getItem(k[0]).length : 0, hasParsed: k.length ? /"parsed"/.test(localStorage.getItem(k[0])) : null }; });
  check('결과가 이 기기(localStorage)에 악보별로 저장됨', saved.keys.length === 1 && saved.size > 500, saved);
  check('저장에 계산용 임시값(parsed)은 들어가지 않음', saved.hasParsed === false);
  await page.reload(); await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [LEAD, SONGS]);
  await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000); await sleep(1000);
  await page.evaluate(() => window.__pv.P.showTab('harmony')); await sleep(600); u = await ui();
  check('다시 열어도 분석 결과 · 목표 키 · 고친 화음이 그대로 (분석 없이 바로 그려짐)', u.chords.length === 15 && u.notes === 26 && u.tkey === 'A' && u.ovA === 1 && (await pxCount(await full(), isRed)) > 300, u);
  await shot('05-restored');
  await page.click('.hm [data-a="reset-all"]'); await sleep(200);
  check('"수정 모두 자동값으로" 버튼', (await ui()).ovA === 0);

  console.log('9. 필기 도구와 함께 · 저장 그림');
  await page.click('.hm [data-mode="harmony"]'); await sleep(150);
  await H(() => { const P = window.__pv.P; if (P.anno().setTool) { const b = document.querySelector('[data-tool="pen"]'); b && b.click(); } }); await sleep(250);
  const toolNow = await H(() => window.__pv.P.anno().state().tool);
  if (toolNow && toolNow !== 'none') check('필기 도구를 고르면 화음 수정 모드는 "보기"로 돌아감 (필기와 충돌하지 않음)', (await ui()).mode === 'view', [toolNow, (await ui()).mode]);
  else console.log('  · 필기 도구 단추를 찾지 못해 건너뜀');
  await page.evaluate(() => { window.__dl = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); return o.apply(this, arguments); }; });
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.click('.hm [data-a="png"]'); const d = await dl;
  const dlName = await page.evaluate(() => window.__dl[0] || '');           // (헤드리스 크롬은 blob 다운로드의 제안 이름을 "download" 로 보고하므로, 앱이 붙인 download 속성을 확인)
  check('"그림 저장" 이 PNG 파일을 내려받음 (이름에 쪽 번호 · 목표 키가 들어감)', !!d && /1쪽-A\.png$/.test(dlName), [dlName, d && d.suggestedFilename()]);
  if (d) { const fp = path.join(OUT, 'export.png'); await d.saveAs(fp); const st = fs.statSync(fp); check('저장된 그림이 비어 있지 않음 (50KB 이상)', st.size > 50000, st.size); }

  console.log('10. 화면 크기');
  for (const vp of [{ width: 820, height: 1180, n: 'tablet' }, { width: 390, height: 844, n: 'phone' }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height }); await sleep(900);
    await page.evaluate(() => window.__pv.P.showTab('harmony')); await sleep(400);
    check(vp.n + ': 가로로 넘치지 않음', await H(() => document.documentElement.scrollWidth <= window.innerWidth + 2), await H(() => [document.documentElement.scrollWidth, window.innerWidth]));
    await shot('06-' + vp.n);
  }
  await page.setViewportSize({ width: 1400, height: 950 }); await sleep(600);

  console.log('11. OCR (사진 · 스캔 악보)');
  if (!fs.existsSync(path.join(TESS, 'tesseract.js/dist/tesseract.min.js'))) console.log('  · tesseract.js 가 없어 OCR 시험은 건너뜀 (TESS_DIR=' + TESS + ')');
  else {
    const png = await page.evaluate(async () => { const cv = document.createElement('canvas'); await window.__pv.P.renderPageTo(cv, 1, 3.6); return cv.toDataURL('image/png').split(',')[1]; });
    S.setScan(Buffer.from(png, 'base64'));
    const pg2 = await ctx.newPage(); const e2 = [];
    pg2.on('pageerror', (e) => e2.push('pageerror: ' + e.message)); pg2.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) e2.push('console: ' + m.text()); });
    const seen = [];
    await pg2.route(/cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|unpkg\.com/, (route) => {
      const url = route.request().url(); seen.push(url); let f = null;
      if (/tesseract\.min\.js/.test(url)) f = path.join(TESS, 'tesseract.js/dist/tesseract.min.js');
      else if (/worker\.min\.js/.test(url)) f = path.join(TESS, 'tesseract.js/dist/worker.min.js');
      else if (/tesseract-core[^/]*\.(wasm\.js|js|wasm)$/.test(url)) f = path.join(TESS, 'tesseract.js-core', url.split('/').pop());
      else if (/eng\.traineddata/.test(url)) f = path.join(TESS, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');
      if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      route.fulfill({ status: 200, path: f, headers: { 'access-control-allow-origin': '*', 'content-type': /\.wasm$/.test(f) ? 'application/wasm' : /\.gz$/.test(f) ? 'application/gzip' : 'text/javascript' } });
    });
    await pg2.goto(base + '/h.html?t=tokA');
    await pg2.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [SCAN, SONGS]);
    await L.waitTrue(pg2, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000); await sleep(1500);
    await pg2.evaluate(() => window.__pv.P.showTab('harmony')); await sleep(400);
    await pg2.click('.hm [data-a="an-page"]');
    const done = await L.waitTrue(pg2, () => { const s = window.YNHarmonyUI._last._state; return !s.busy && s.data.pages['1']; }, null, 120000);
    const r = await pg2.evaluate(() => { const s = window.YNHarmonyUI._last._state, d = s.data.pages['1']; return d ? { src: d.src, chords: d.chords.map((c) => c.text), staves: d.staves.length, notes: d.notes.length, stat: s.statMsg } : null; });
    check('OCR 분석이 끝남', done && !!r, seen.slice(0, 6));
    if (r) {
      const want = ['G', 'C', 'D', 'Em7', 'G', 'C', 'G', 'C', 'G', 'D', 'G', 'G', 'D/F#', 'C', 'G'];
      const truthChords = MK.layout().truth.chords.map((c) => c.text); const got = r.chords.slice(), miss = [];
      truthChords.forEach((t) => { const i = got.indexOf(t); if (i >= 0) got.splice(i, 1); else miss.push(t); });
      check('글자 없는 그림에서 OCR 로 코드를 읽음 (출처 ocr)', r.src === 'ocr', r.src);
      check('실제 코드 ' + truthChords.length + '개 중 14개 이상을 정확히 읽음', truthChords.length - miss.length >= 14, { miss, got: r.chords });
      check('엉뚱한 코드는 3개 이하', got.length <= 3, got);
      check('그림에서도 오선 4줄 · 멜로디 음 26개를 찾음', r.staves === 4 && r.notes >= 24 && r.notes <= 28, [r.staves, r.notes]);
    }
    const cvs = await pg2.evaluate(() => { const c = document.querySelector('.pv-harm'); return c.width > 0; });
    check('OCR 뒤에도 덧그림이 그려짐', cvs);
    await pg2.selectOption('.hm [data-o="target"]', 'A'); await sleep(400);
    await pg2.screenshot({ path: path.join(OUT, '07-ocr-transposed.png') });
    check('OCR 분석 중 오류 없음', e2.length === 0, e2);
    await pg2.close();
  }

  console.log('12. 오류 · 방어');
  check('페이지 오류 · 콘솔 오류 없음', errs.length === 0, errs);
  await br.close(); S.server.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
