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
  section('음정 (pitch.js)');
  const P = W('pitch.js');
  near(P.midiToFreq(69), 440, 1e-9, 'A4 = 440Hz'); eq(P.freqToMidi(440), 69, '440Hz → 69'); eq(P.noteName(60), 'C4', '60 = C4');
  near(P.freqToMidi(P.midiToFreq(50.3)), 50.3, 1e-9, '주파수 ↔ 음 왕복');
  eq(P.parseKey('Bb').tonic, 10, 'Bb 의 으뜸음'); eq(P.parseKey('Am').minor, true, 'Am 은 단조'); eq(P.parseKey(''), null, '빈 키');
  eq(P.scalePcs(P.parseKey('G')).slice().sort((a, b) => a - b), [0, 2, 4, 6, 7, 9, 11], 'G 장음계');
  eq(P.centsBetween(60, 72, true), 0, '옥타브 무관이면 도 = 높은 도'); eq(P.centsBetween(60, 72, false), -1200, '옥타브 구분이면 1200¢ 차이');
  // 순음 → 음높이 (여러 높이 · 표본율)
  for (const sr of [44100, 48000]) for (const f of [110, 196, 261.63, 330, 440, 660, 880]) {
    const buf = new Float32Array(2048); for (let i = 0; i < buf.length; i++) buf[i] = 0.6 * Math.sin(2 * Math.PI * f * i / sr);
    const r = P.detectPitch(buf, sr); ok(r && Math.abs(1200 * Math.log2(r.freq / f)) < 8 && r.prob > 0.9, `${f}Hz @${sr} 를 찾음 → ${r && r.freq}`);
  }
  // 배음이 섞인 소리 · 잡음 섞임
  { const sr = 48000, f = 220, buf = new Float32Array(2048); let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - .5; };
    for (let i = 0; i < buf.length; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr) + 0.3 * Math.sin(2 * Math.PI * 2 * f * i / sr) + 0.15 * Math.sin(2 * Math.PI * 3 * f * i / sr) + 0.05 * rnd();
    const r = P.detectPitch(buf, sr); ok(r && Math.abs(1200 * Math.log2(r.freq / f)) < 15, '배음 + 잡음에서도 기본음 220Hz → ' + (r && r.freq)); }
  ok(P.detectPitch(new Float32Array(2048), 48000) === null, '무음은 null');
  { const buf = new Float32Array(2048); let s = 3; for (let i = 0; i < buf.length; i++) { s = (s * 1664525 + 1013904223) % 4294967296; buf[i] = (s / 4294967296 - .5) * 0.8; } const r = P.detectPitch(buf, 48000); ok(r === null || r.prob < 0.7, '순수 잡음은 음으로 오인하지 않음'); }
  // 점수
  const notes = [{ beat: 0, len: 2, midi: 60 }, { beat: 2, len: 2, midi: 64 }];
  const frames = [{ beat: .2, midi: 60 }, { beat: .6, midi: 60.1 }, { beat: 1.2, midi: 60 }, { beat: 2.2, midi: 60 }, { beat: 2.8, midi: 60 }];
  const sc = P.scoreNotes(notes, frames, { octave: true });
  eq(sc.length, 2, '음마다 결과'); ok(sc[0].pct === 100, '맞게 부른 음 100%'); ok(sc[1].pct === 0, '엉뚱한 음 0%');
  const none = P.scoreNotes(notes, [], { octave: true }); ok(none.every((r) => r.frames === 0), '부른 소리가 없으면 frames 0');
  const sm = []; const out = [60, 60, 72, 60, 60].map((m) => P.medianSmooth(sm, m, 5)); ok(out.every((v) => Math.abs(v - 60) < 1) || out[2] < 72, '튀는 값을 중앙값으로 눌러 줌');
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
  eq(A.SYMBOLS.length, 31, '악보 기호 31개');
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

testPitch(); testLyrics(); testAnno();
console.log(fail ? `\n✗ 실패 ${fail} (통과 ${pass})` : `\n✓ 모두 통과 (통과 ${pass})`);
process.exit(fail ? 1 : 0);
