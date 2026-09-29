/**
 * Step 2 추가 시험 (Node, 브라우저 없이) — 음정 · 가사 추출 · 필기 계산
 *   node scripts/test-step2-more.js
 * (화면 · 소리 · 실시간은 scripts/browser/README.md 의 브라우저 시험이 진짜 크롬으로 확인합니다)
 */
const path = require('path');
const W = (f) => require(path.join(__dirname, '..', 'public', 'worship', f));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' → ' + a + ' vs ' + b);
const section = (t) => console.log('\n■ ' + t);

function testPitch() {
  section('시작음 피아노 (pitch.js)');
  const P = W('pitch.js');
  near(P.midiToFreq(69), 440, 1e-9, 'A4 = 440Hz'); eq(P.freqToMidi(440), 69, '440Hz → 69'); eq(P.noteName(60), 'C4', '60 = C4');
  near(P.freqToMidi(P.midiToFreq(50.3)), 50.3, 1e-9, '주파수 ↔ 음 왕복');
  eq(P.parseKey('Bb').tonic, 10, 'Bb 의 으뜸음'); eq(P.parseKey('Am').minor, true, 'Am 은 단조'); eq(P.parseKey(''), null, '빈 키'); eq(P.parseKey('F#m').name, 'F#m', 'F#m 이름');
  eq(P.scalePcs(P.parseKey('G')).slice().sort((a, b) => a - b), [0, 2, 4, 6, 7, 9, 11], 'G 장음계');
  eq(P.startMidi('G'), 67, 'G 곡의 시작음 = G4'); eq(P.startMidi('C'), 60, 'C 곡의 시작음 = C4'); eq(P.startMidi(''), null, 'Key 가 없으면 시작음 없음');
  ok(P.detectPitch === undefined && P.scoreNotes === undefined && P.medianSmooth === undefined, '옛 음정 검출 · 점수 기능은 제거됨');
  // 건반 배치
  { const L = P.layout(48, 72); eq(L.nWhite, 15, '두 옥타브 + 도 = 흰 건반 15'); eq(L.blacks.length, 10, '검은 건반 10'); ok(L.blacks.every((b) => b.after >= 0 && b.after < L.nWhite - 1), '검은 건반은 흰 건반 사이');
    eq(L.blacks[0], { midi: 49, pc: 1, after: 0 }, '첫 검은 건반은 C 와 D 사이'); ok(P.layout(49, 71).lo === 50 && P.layout(49, 71).hi === 71, '검은 건반 시작은 안쪽 흰 건반으로'); }
  // ADSR
  { const lo = P.adsr(40, .8), hi = P.adsr(90, .8);
    ok(lo.attack < 0.02 && lo.attack > 0, '어택은 아주 짧음'); ok(lo.sustain > 0 && lo.sustain < 1, '서스테인은 0~1 비율'); ok(lo.decay > hi.decay && lo.release > hi.release && lo.hold > hi.hold, '높은 음일수록 빨리 잦아듦');
    ok(P.adsr(60, 1).peak > P.adsr(60, .2).peak, '세게 칠수록 큼'); ok(P.adsr(60, 1).cutoffStart > P.adsr(60, .2).cutoffStart, '세게 칠수록 밝음'); ok(lo.peak < 0.8, '최고 음량은 여유 있게 (깨짐 방지)'); }
  // 가짜 AudioContext 로 합성 구조 확인
  { const log = []; const param = (n) => ({ value: 0, setValueAtTime(v, t) { log.push([n, 'set', v, t]); }, linearRampToValueAtTime(v, t) { log.push([n, 'lin', v, t]); }, exponentialRampToValueAtTime(v, t) { log.push([n, 'exp', v, t]); }, setTargetAtTime(v, t, k) { log.push([n, 'target', v, t, k]); }, cancelScheduledValues() { log.push([n, 'cancel']); } });
    const node = (kind) => ({ kind, connect() {}, disconnect() {}, gain: param('gain'), frequency: param('freq'), Q: { value: 0 }, start() { log.push([kind, 'start']); }, stop(t) { log.push([kind, 'stop', t]); } });
    const ctx = { currentTime: 1, createGain: () => node('gain'), createOscillator: () => node('osc'), createBiquadFilter: () => node('filter') };
    const syn = P.createSynth(ctx, node('dest')); const v = syn.on(60, .8, 1);
    eq(log.filter((l) => l[0] === 'osc' && l[1] === 'start').length, P.PARTIALS.length, '배음 개수만큼 오실레이터'); eq(syn.count(), 1, '음 1개 재생 중');
    ok(log.some((l) => l[0] === 'gain' && l[1] === 'lin'), 'Attack 램프'); ok(log.filter((l) => l[0] === 'gain' && l[1] === 'target').length >= 2, 'Decay · Sustain 감쇠');
    ok(log.some((l) => l[0] === 'freq' && l[1] === 'exp'), '필터 열림이 점점 닫힘 (밝음 → 부드러움)');
    v.off(2); ok(log.some((l) => l[0] === 'gain' && l[1] === 'cancel'), 'Release: 예약된 곡선 취소'); ok(log.filter((l) => l[0] === 'osc' && l[1] === 'stop').length === 6, 'Release 뒤 오실레이터 정지'); eq(syn.count(), 0, '뗀 뒤 목록에서 빠짐');
    for (let i = 0; i < 20; i++) syn.on(48 + i, .8); ok(syn.count() <= 12, '동시 음 수 제한 (' + syn.count() + ')'); syn.allOff(); eq(syn.count(), 0, 'allOff'); }
}

function testLyrics() {
  section('가사 추출 (lyrics.js)');
  const Ly = W('lyrics.js');
  eq(Ly.classify('G   D/F#').kind, 'chord', '코드 줄'); eq(Ly.classify('Em7  C  Am7  Dsus4').kind, 'chord', '여러 코드'); eq(Ly.classify('G/B  C2  D').kind, 'chord', '슬래시 · 숫자 코드');
  eq(Ly.classify('Verse 1').kind, 'section', '절 표시'); eq(Ly.classify('[Chorus]').kind, 'section', '대괄호 표시'); eq(Ly.classify('Pre-Chorus').kind, 'section', 'Pre-Chorus');
  eq(Ly.classify('1절').kind, 'section', '한글 1절'); eq(Ly.classify('후렴').kind, 'section', '한글 후렴'); eq(Ly.classify('브릿지').kind, 'section', '브릿지');
  eq(Ly.classify('Amazing grace how sweet the sound').kind, 'lyric', '가사'); eq(Ly.classify('주님 사랑해요').kind, 'lyric', '한글 가사'); eq(Ly.classify('').kind, 'blank', '빈 줄');
  eq(Ly.classify('A man and a dog').kind, 'lyric', '"A" 가 들어 있어도 문장은 가사');
  eq(Ly.canonSection('후렴'), 'Chorus', '후렴 → Chorus'); eq(Ly.canonSection('1절'), 'Verse 1', '1절 → Verse 1'); eq(Ly.canonSection('PRE-CHORUS'), 'Pre-chorus', '대소문자 무시');
  eq(Ly.stripInlineChords('A[G]mazing [D]grace').replace(/\s+/g, ' '), 'Amazing grace', '문장 안 코드 [G] 제거');
  const b = Ly.build([{ text: 'Verse 1' }, { text: 'G D' }, { text: 'Amazing grace' }, { text: '' }, { text: 'Chorus' }, { text: 'How great' }]);
  eq(b.text, '[Verse 1]\nAmazing grace\n\n[Chorus]\nHow great', '코드 줄 빼고 [절] 표시로 정리');
  const b2 = Ly.build([{ text: 'Verse 1' }, { text: 'G D' }, { text: 'Amazing grace' }], { keepChords: true }); ok(/G D/.test(b2.text), '"코드 포함"이면 코드 줄 유지');
  const b3 = Ly.build([{ text: 'Amazing grace' }], { labels: false }); ok(!/\[/.test(b3.text), '"[절] 표시" 끄면 대괄호 없음');
  eq(Ly.build([]).text, '', '빈 입력');
  // pdf.js 글자 조각 → 줄
  const items = [{ str: 'Amazing', transform: [1, 0, 0, 1, 50, 700], width: 40, height: 12 }, { str: 'grace', transform: [1, 0, 0, 1, 95, 700], width: 30, height: 12 }, { str: 'G', transform: [1, 0, 0, 1, 50, 715], width: 8, height: 12 }];
  const lines = Ly.linesFromItems(items); ok(lines.length === 2, '같은 높이 조각은 한 줄로 → ' + lines.length); ok(lines[0].text.trim() === 'G', '위쪽(y 큰) 줄이 먼저'); ok(/Amazing\s+grace/.test(lines[1].text), '가로로 이어 붙임 → ' + lines[1].text);
}

function testAnno() {
  section('필기 계산 (anno.js)');
  const A = W('anno.js');
  eq(A.SYMBOLS.length, 35, '악보 기호 35개 (음표 도장 4개 포함)');
  // 서버가 받아 주는 기호와 화면 기호가 같은 목록
  const RT = require(path.join(__dirname, '..', 'lib', 'realtime.js'));
  if (RT.SYMBOLS) eq(A.SYMBOLS.map((s) => s.k || s), Array.from(RT.SYMBOLS), '화면 기호 = 서버 허용 기호');
  ok(A.newId() !== A.newId() && A.newId().length >= 10, '항목 번호는 겹치지 않음');
  const line = []; for (let i = 0; i <= 200; i++) line.push(i / 200, 0.5 + (i % 2) * 0.0002);
  const sp = A.simplify(line, 0.002); ok(sp.length < 12, '거의 곧은 선은 몇 점으로 줄임 → ' + sp.length / 2); eq([sp[0], sp[sp.length - 2]], [0, 1], '처음과 끝은 그대로');
  const curve = []; for (let i = 0; i <= 100; i++) curve.push(i / 100, 0.5 + 0.3 * Math.sin(i / 100 * 6.28)); const sc = A.simplify(curve, 0.002); ok(sc.length > 20, '굽은 선은 모양을 유지 → ' + sc.length / 2);
  const lim = A.limitPoints(line, 50); ok(lim.length <= 100 + 2 && lim.length % 2 === 0, '점 개수 상한 → ' + lim.length / 2);
  const pen = { id: 'a', t: 'pen', pg: 1, c: '#f00', w: 0.003, p: [0.1, 0.1, 0.5, 0.1] };
  ok(A.hit(pen, 300, 100, 1000, 1000, 6), '선 위를 누르면 잡힘'); ok(!A.hit(pen, 300, 300, 1000, 1000, 6), '멀리 누르면 안 잡힘');
  const tx = { id: 'b', t: 'text', pg: 1, c: '#000', x: 0.2, y: 0.2, sz: 0.02, s: 'Hello' }; ok(A.hit(tx, 210, 200, 1000, 1000, 4) || A.hit(tx, 215, 195, 1000, 1000, 4), '글자 상자 안을 누르면 잡힘');
}


function testAnnoNew() {
  section('필기 개선 (색 · 글꼴 · 음표 도장)');
  const A = W('anno.js'), RT = require(path.join(__dirname, '..', 'lib', 'realtime.js'));
  eq(A.PALETTE.length, 6, '색은 6개'); eq(A.PALETTE.map((c) => A.COLOR_NAMES[c]).map((n) => n.split(' ')[0]), ['빨강', '파랑', '초록', '보라', '검정', '흰색'], '빨강 · 파랑 · 초록 · 보라 · 검정 · 흰색');
  ok(A.PALETTE.every((c) => /^#[0-9a-f]{6}$/i.test(c)) && A.PALETTE[5] === '#ffffff', '흰색(수정액)이 있음');
  eq(A.FONT_KEYS, ['sans', 'serif', 'hand', 'pen', 'dodum'], '글꼴 5가지 (고딕 · 명조 · 기기 손글씨 · 나눔 펜 · 고운돋움)'); ok(A.FONT_KEYS.every((k) => A.FONTS[k] && A.FONT_NAMES[k]), '글꼴마다 이름 · 글꼴 목록');
  eq(['g:quarter', 'g:eighth', 'g:sharp', 'g:flat'].map((k) => A.GLYPHS[k.slice(2)]), ['\u2669', '\u266a', '\u266f', '\u266d'], '♩ ♪ ♯ ♭');
  ok(['g:quarter', 'g:eighth', 'g:sharp', 'g:flat'].every((k) => A.SYMBOLS.some((s) => s.k === k) && RT.SYMBOLS.indexOf(k) >= 0), '음표 도장이 화면과 서버 목록에 모두 있음');
  // 그리기: 기록용 가짜 캔버스
  const calls = []; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; if (k === 'font') calls.push(['font', v]); return true; } });
  A.drawItem(ctx, { t: 'sym', k: 'g:quarter', c: '#2563eb', x: .5, y: .5, sz: .04, f: 'hand' }, 1000, 1000);
  ok(calls.some((c) => c[0] === 'fillText' && c[1] === '\u2669'), '♩ 를 글자로 그림'); ok(calls.some((c) => c[0] === 'font' && /Segoe Print|cursive/.test(c[1])), '손글씨 글꼴 적용');
  calls.length = 0; A.drawItem(ctx, { t: 'text', s: 'Verse', c: '#fff', x: .1, y: .1, sz: .03, f: 'serif' }, 1000, 1000);
  ok(calls.some((c) => c[0] === 'font' && /Times New Roman/.test(c[1])), '명조 글꼴로 글자'); calls.length = 0;
  A.drawItem(ctx, { t: 'text', s: 'Old', c: '#ff5a1f', x: .1, y: .1, sz: .03 }, 1000, 1000); ok(calls.some((c) => c[0] === 'font' && /Segoe UI/.test(c[1])), 'f 가 없는 예전 글자는 고딕');
  const b = A.symBox('g:flat', { x: .5, y: .5, sz: .04 }, 1000, 1000); ok(b.x2 > b.x1 && b.y2 > b.y1, '도장 판정 상자');
  ok(A.hit({ t: 'sym', k: 'g:sharp', x: .5, y: .5, sz: .04 }, 500, 500, 1000, 1000, 4), '도장을 누르면 잡힘(지우개)');
  // 서버 정리
  const U = { name: 'T' }, base = { id: 'abcdef12', pg: 1, c: '#e53935', x: .3, y: .3, sz: .03 };
  eq(RT.cleanItem(Object.assign({}, base, { t: 'text', s: 'hi', f: 'serif' }), U, 1).f, 'serif', '글자 글꼴 저장 (명조)');
  eq(RT.cleanItem(Object.assign({}, base, { t: 'text', s: 'hi', f: 'hand', chord: 1 }), U, 1).f, 'hand', '코드 글꼴 저장 (손글씨)');
  ok(RT.cleanItem(Object.assign({}, base, { t: 'text', s: 'hi', f: 'sans' }), U, 1).f === undefined, '고딕은 기본이라 저장 안 함');
  ok(RT.cleanItem(Object.assign({}, base, { t: 'text', s: 'hi', f: '<script>' }), U, 1).f === undefined, '이상한 글꼴 값은 버림');
  eq(RT.cleanItem(Object.assign({}, base, { t: 'sym', k: 'g:eighth', f: 'serif' }), U, 1).k, 'g:eighth', '♪ 도장 저장'); eq(RT.cleanItem(Object.assign({}, base, { t: 'sym', k: 'g:eighth', f: 'serif' }), U, 1).f, 'serif', '도장 글꼴 저장');
  ok(RT.cleanItem(Object.assign({}, base, { t: 'sym', k: 'tie', f: 'serif' }), U, 1).f === undefined, '그림 기호에는 글꼴을 붙이지 않음');
  eq(RT.cleanItem(Object.assign({}, base, { t: 'sym', k: 'g:nope' }), U, 1), null, '없는 도장은 거절');
  eq(RT.cleanItem(Object.assign({}, base, { t: 'text', s: 'x', c: '#ffffff' }), U, 1).c, '#ffffff', '흰색 저장');
}
function testYt() {
  section('유튜브 (ytplayer.js)');
  const Y = W('ytplayer.js');
  eq(Y.RATES, [0.5, 0.75, 1, 1.25], '속도 4가지'); eq(Y.fmtTime(75.34), '1:15.3', '시간 표시'); eq(Y.fmtTime(-3), '0:00.0', '음수는 0');
  eq(Y.normLoop(10, 20), { a: 10, b: 20 }, '정상 구간'); eq(Y.normLoop(10, null), { a: 10, b: null }, 'A 만'); eq(Y.normLoop(10, 10.2), null, '너무 짧은 구간 거절'); eq(Y.normLoop(10, 5), null, 'B < A 거절'); eq(Y.normLoop(-1, 5), null, '음수 A 거절');
  eq(Y.loopStep(19.95, 10, 20), 10, 'B 근처 → A 로'); eq(Y.loopStep(15, 10, 20), null, '구간 안 → 그대로'); eq(Y.loopStep(21, 10, 20), 10, 'B 를 살짝 넘겼으면 A 로'); eq(Y.loopStep(60, 10, 20), null, '한참 뒤로 직접 넘겼으면 건드리지 않음'); eq(Y.loopStep(19.95, 10, null), null, 'B 가 없으면 반복 안 함');
}

testPitch(); testLyrics(); testAnno(); testAnnoNew(); testYt();
console.log(fail ? `\n✗ 실패 ${fail} (통과 ${pass})` : `\n✓ 모두 통과 (통과 ${pass})`);
process.exit(fail ? 1 : 0);
