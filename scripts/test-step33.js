/**
 * Step 3.3 시험 (Node) — 키 · 템포 바꿔 듣기 순수 함수 · 연습 키 이동 ↔ 화음 목표 조 계산 · 음높이 변환 DSP(WSOLA) 정확도
 *   node scripts/test-step33.js
 * (AudioContext · 유튜브 카드 · 악보 위 코드 다시 그리기는 브라우저 시험: scripts/browser/e2e-step33.js)
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' → 실제 ' + a + ' / 기대 ' + b + ' ± ' + tol);
const section = (t) => console.log('\n■ ' + t);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const AS = require('../public/worship/audio-shift.js');
const HC = require('../public/worship/harmony-core.js');
const UI = require('../public/worship/harmony-ui.js').YNHarmonyUI;
const Y = require('../public/worship/ytplayer.js');
const { WsolaShifter } = require('../public/worship/pitch-worklet.js');
const mod = (a, n) => ((a % n) + n) % n;

section('범위 · 자르기 (clampKey / clampTempo)');
eq([AS.KEY_MIN, AS.KEY_MAX, AS.TEMPO_MIN, AS.TEMPO_MAX, AS.TEMPO_STEP], [-3, 3, 0.75, 1.25, 0.05], '상수: 키 −3~+3 · 템포 0.75~1.25 · 0.05 단위');
eq([-9, -4, -3, -2.4, -0.4, 0, 0.5, 1.49, 3, 4, 100].map(AS.clampKey), [-3, -3, -3, -2, -0, 0, 1, 1, 3, 3, 3].map((x) => x + 0), '키는 정수로 반올림하고 −3~+3 로 자름');
eq([NaN, undefined, null, 'x', Infinity].map(AS.clampKey), [0, 0, 0, 0, 0], '숫자가 아니면 키 0');
eq([0.5, 0.74, 0.75, 0.78, 0.8, 0.999, 1, 1.02, 1.07, 1.25, 1.3, 2].map(AS.clampTempo), [0.75, 0.75, 0.75, 0.8, 0.8, 1, 1, 1, 1.05, 1.25, 1.25, 1.25], '템포는 0.05 단위로 맞추고 0.75~1.25 로 자름');
eq([NaN, undefined, 'a'].map(AS.clampTempo), [1, 1, 1], '숫자가 아니면 템포 1');
ok(AS.clampTempo(0.85) === 0.85 && AS.clampTempo(1.15) === 1.15 && AS.clampTempo(0.9) === 0.9, '부동소수 잔재 없이 0.85 · 0.9 · 1.15 그대로');

section('반음 ↔ 배수 (semitoneToRatio)');
eq(AS.semitoneToRatio(0), 1, '0 반음 = 1배');
near(AS.semitoneToRatio(12), 2, 1e-12, '+12 반음 = 2배'); near(AS.semitoneToRatio(-12), 0.5, 1e-12, '-12 반음 = 0.5배');
near(AS.semitoneToRatio(2), 1.122462, 1e-6, '+2 반음 ≈ 1.12246배'); near(AS.semitoneToRatio(-3), 0.840896, 1e-6, '-3 반음 ≈ 0.84090배');
for (let n = -3; n <= 3; n++) near(AS.ratioToSemitone(AS.semitoneToRatio(n)), n, 1e-9, '왕복 ' + n);
near(AS.ratioToCents(AS.semitoneToRatio(1)), 100, 1e-9, '1 반음 = 100 센트');
eq([AS.fmtShift(2), AS.fmtShift(-1), AS.fmtShift(0), AS.fmtShift(3.4)], ['+2', '-1', '0', '+3'], 'fmtShift');
eq([AS.fmtTempo(1), AS.fmtTempo(0.85), AS.fmtTempo(1.25)], ['1.00x', '0.85x', '1.25x'], 'fmtTempo');
eq([AS.fmtClock(0), AS.fmtClock(65.9), AS.fmtClock(3599), AS.fmtClock(NaN), AS.fmtClock(-4)], ['0:00', '1:05', '59:59', '0:00', '0:00'], 'fmtClock');

section('키 이름 옮기기 (transposeKeyName) · 표시 문구 (keyLabel)');
eq([AS.transposeKeyName('G', 2), AS.transposeKeyName('G', 0), AS.transposeKeyName('G', -3), AS.transposeKeyName('G', 3)], ['A', 'G', 'E', 'Bb'], 'G ±');
eq([AS.transposeKeyName('C', -1), AS.transposeKeyName('C', -3), AS.transposeKeyName('B', 1), AS.transposeKeyName('B', 3), AS.transposeKeyName('A', 3), AS.transposeKeyName('F#', -3)], ['B', 'A', 'C', 'D', 'C', 'Eb'], '한 바퀴 돌아 넘어가는 경우 (wraparound)');
eq([AS.transposeKeyName('Em', 3), AS.transposeKeyName('Am', -3), AS.transposeKeyName('F#m', 2), AS.transposeKeyName('C minor', 1), AS.transposeKeyName('Bbm', 1)], ['Gm', 'F#m', 'G#m', 'C#m', 'Bm'], '단조는 단조로');
eq([AS.transposeKeyName('Bb', 2), AS.transposeKeyName('A♭', 1), AS.transposeKeyName('c#', 2), AS.transposeKeyName('Key of G', 2), AS.transposeKeyName('G (남)', 1)], ['C', 'A', 'Eb', 'A', 'Ab'], '♭ ♯ 소문자 · "Key of" · 괄호 설명 읽기');
eq([AS.transposeKeyName('', 2), AS.transposeKeyName('H', 2), AS.transposeKeyName(null, 1), AS.transposeKeyName('원래키', 1)], [null, null, null, null], '못 읽으면 null');
eq(AS.keyLabel('G', 2), 'G → A (+2)', '문구: G → A (+2)');
eq(AS.keyLabel('G', -3), 'G → E (-3)', '문구: 내림');
eq(AS.keyLabel('G', 0), 'G (원래 키)', '문구: 0 이면 원래 키');
eq(AS.keyLabel('Em', 3), 'Em → Gm (+3)', '문구: 단조');
eq(AS.keyLabel('', 2), '+2 반음', '곡 키가 없으면 반음 수만');
eq(AS.keyLabel('', 0), '원래 키', '곡 키가 없고 0 이면 원래 키');
eq(AS.keyLabel('Db', 1), 'Db → D (+1)', '문구: 플랫 이름 유지');

section('키 사이 반음 (semitonesBetween · shiftFromKeys)');
eq([AS.semitonesBetween('G', 'A'), AS.semitonesBetween('G', 'E'), AS.semitonesBetween('C', 'F#'), AS.semitonesBetween('C', 'B'), AS.semitonesBetween('Bb', 'D')], [2, -3, 6, -1, 4], '가까운 방향 (−5~+6)');
eq([AS.shiftFromKeys('G', 'A'), AS.shiftFromKeys('G', 'B'), AS.shiftFromKeys('G', 'C'), AS.shiftFromKeys('C', 'Ab'), AS.shiftFromKeys('C', 'F#'), AS.shiftFromKeys('x', 'A')], [2, null, null, null, null, null], '±3 반음 안이면 값, 밖이면 null');
eq(AS.shiftFromKeys('C', 'A'), -3, 'C → A = −3 (돌아 넘어감)');

section('이 곡에 맞는 녹음 고르기 (rankRecs)');
{
  const recs = [{ title: '주일 예배 전체', kind: '예배', play: '/audio/a' }, { title: 'Amazing Grace 2번 브릿지', kind: '연습', play: '/audio/b' }, { title: '링크뿐', kind: '연습', play: '' }, { title: 'amazing grace', kind: '예배', play: '/audio/c' }, { title: '다른 곡', kind: '연습', play: '/audio/d' }];
  const r = AS.rankRecs(recs, 'Amazing Grace');
  eq(r.map((x) => x.play), ['/audio/c', '/audio/b', '/audio/d', '/audio/a'], '제목이 같은 것 ▸ 포함하는 것 ▸ 나머지(연습 우선), 재생 주소 없는 링크는 뺌');
  eq(r.map((x) => !!x.match), [true, true, false, false], '맞는 녹음에만 match 표시');
  eq(AS.rankRecs(recs, '').map((x) => x.play), ['/audio/b', '/audio/d', '/audio/a', '/audio/c'], '곡 제목이 없으면 연습 녹음이 먼저, 나머지는 원래 순서');
  eq(AS.rankRecs(null, 'x'), [], 'null 안전');
}

section('연습 키 이동 → 화음 탭 목표 조 (YNHarmonyUI.keyMath ↔ YNHarmony)');
{
  const KM = UI.keyMath(HC);
  let allOk = true, roundOk = true, namesOk = true, audioOk = true;
  for (let tonic = 0; tonic < 12; tonic++) for (const minor of [false, true]) {
    const okey = HC.parseKey(HC.KEY_CHOICES[tonic] + (minor ? 'm' : ''));
    for (let n = -3; n <= 3; n++) {
      const t = KM.targetFor(okey, n);
      if (n === 0) { if (t !== '') allOk = false; continue; }
      const tk = HC.parseKey(t + (minor ? 'm' : ''));
      if (!tk || tk.tonic !== mod(okey.tonic + n, 12)) allOk = false;                      // 으뜸음이 정확히 n 반음 옮겨짐 (한 바퀴 돌아도)
      if (HC.keySemitones(okey, tk) !== n) roundOk = false;                                // 화음 탭의 반음 계산(−5~+6) 이 그대로 n 을 돌려줌
      if (KM.shiftFor(okey, tk) !== n) roundOk = false;
      if (HC.KEY_CHOICES.indexOf(t) < 0) namesOk = false;                                  // 목표 조 선택 목록에 있는 이름
      const nm = AS.transposeKeyName(HC.keyName(okey), n);                                 // 재생 카드의 표시 이름과 같은 조
      if (AS.parseKeyName(nm).pc !== tk.tonic || AS.parseKeyName(nm).minor !== minor) audioOk = false;
    }
  }
  ok(allOk, '12개 으뜸음 × 장/단조 × −3~+3: 목표 조 = 원래 조를 정확히 n 반음 옮긴 조 (wraparound 포함)');
  ok(roundOk, '목표 조 ➔ HC.keySemitones · shiftFor 가 다시 n 을 돌려줌 (되먹임 시 값이 흔들리지 않음)');
  ok(namesOk, '목표 조 이름은 화음 탭 선택 목록(KEY_CHOICES) 안에 있음');
  ok(audioOk, '재생 카드 표시 조(transposeKeyName) 와 화음 탭 목표 조가 같은 음');
  const G = HC.parseKey('G');
  eq([KM.targetFor(G, 2), KM.targetFor(G, -3), KM.targetFor(G, 3), KM.targetFor(G, 0), KM.targetFor(G, 9), KM.targetFor(G, -9)], ['A', 'E', 'Bb', '', 'Bb', 'E'], 'G 기준 예 (범위 밖 값은 ±3 으로 자름)');
  eq([KM.shiftFor(G, HC.parseKey('A')), KM.shiftFor(G, HC.parseKey('Bb')), KM.shiftFor(G, HC.parseKey('B')), KM.shiftFor(G, HC.parseKey('C')), KM.shiftFor(G, HC.parseKey('Eb')), KM.shiftFor(G, HC.parseKey('Db'))], [2, 3, null, null, null, null], '손으로 고른 목표 조가 ±3 반음 안일 때만 값 (Eb = −4 · Db = −6/+6 은 null)');
  eq(KM.shiftFor(HC.parseKey('F#'), HC.parseKey('Eb')), -3, 'F# → Eb = −3 (한 바퀴 돌아감)');
  eq(KM.shiftFor(null, G), null, 'null 안전'); eq(KM.targetFor(null, 2), '', 'null 안전 (원래 조 없음)');
  eq([UI.clampShift(5), UI.clampShift(-5), UI.clampShift(1.6), UI.clampShift('z')], [3, -3, 2, 0], 'clampShift');
  // 코드 이름: 화음 탭이 실제로 쓰는 코드 변환 (G 장조 코드를 +2)
  eq(['G', 'C', 'D', 'Em7', 'D/F#'].map((c) => HC.transposeChord(c, 2, HC.keyUsesFlats(HC.parseKey('A')))), ['A', 'D', 'E', 'F#m7', 'E/G#'], '연습 키 +2 일 때 악보 코드 변환 (G C D Em7 D/F# → A D E F#m7 E/G#)');
}

section('음높이 변환 DSP (WSOLA · pitch-worklet.js) — 440 Hz 사인파');
{
  function zc(x, sr, from, to) { let first = -1, last = -1, cnt = 0; for (let i = from + 1; i < to; i++) { if (x[i - 1] < 0 && x[i] >= 0) { const t = i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]); if (first < 0) first = t; last = t; cnt++; } } return (cnt - 1) * sr / (last - first); }
  for (const sr of [44100, 48000]) {
    const N = sr * 3; const inp = new Float32Array(N); for (let i = 0; i < N; i++) inp[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr);
    for (let n = -3; n <= 3; n++) {
      const r = WsolaShifter.run(sr, AS.semitoneToRatio(n), inp), from = sr, to = Math.round(sr * 2.8), exp = 440 * Math.pow(2, n / 12), f = zc(r.out, sr, from, to);
      let rms = 0, peak = 0, md = 0, nan = 0; for (let i = from; i < to; i++) { const v = r.out[i]; if (!isFinite(v)) nan++; rms += v * v; peak = Math.max(peak, Math.abs(v)); if (i > from) md = Math.max(md, Math.abs(v - r.out[i - 1])); }
      rms = Math.sqrt(rms / (to - from));
      const cents = 1200 * Math.log2(f / exp);
      ok(Math.abs(cents) <= 15, sr + ' Hz · ' + n + ' 반음: 출력 ' + f.toFixed(2) + ' Hz 는 기대 ' + exp.toFixed(2) + ' Hz 에서 ' + cents.toFixed(2) + ' 센트 (허용 ±15)');
      ok(Math.abs(cents) <= 2, sr + ' Hz · ' + n + ' 반음: 실제로는 ±2 센트 안 (' + cents.toFixed(2) + ')');
      ok(nan === 0 && peak <= 0.51 && Math.abs(rms - 0.3536) < 0.02, sr + ' Hz · ' + n + ' 반음: 크기 정상 (rms ' + rms.toFixed(3) + ' · peak ' + peak.toFixed(3) + ' · NaN ' + nan + ')');
      ok(md <= 0.5 * 2 * Math.PI * exp / sr * 1.6 + 0.01, sr + ' Hz · ' + n + ' 반음: 뚝 끊기는 소리(클릭) 없음 (최대 표본 차 ' + md.toFixed(3) + ')');
      ok(r.underruns === 0, sr + ' Hz · ' + n + ' 반음: 출력 부족 없음');
    }
  }
  // 이동 중 바꾸기 · 조용함 · 입력 끊김
  const sr = 48000, N = sr * 4, s = new WsolaShifter(sr, { ratio: 1 }), oL = new Float32Array(128), oR = new Float32Array(128), out = new Float32Array(N);
  const sine = new Float32Array(N); for (let i = 0; i < N; i++) sine[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr);
  for (let o = 0; o < N; o += 128) { if (o === 128 * 600) s.setRatio(AS.semitoneToRatio(2)); if (o === 128 * 1200) s.setRatio(AS.semitoneToRatio(-3)); s.process(sine.subarray(o, o + 128), sine.subarray(o, o + 128), oL, oR, 128); out.set(oL, o); }
  let bad = 0, pk = 0; for (let i = sr; i < N; i++) { if (!isFinite(out[i])) bad++; pk = Math.max(pk, Math.abs(out[i])); }
  ok(bad === 0 && pk <= 0.55, '재생 중에 키를 바꿔도 NaN · 폭주 없음 (peak ' + pk.toFixed(3) + ')');
  { const z = new WsolaShifter(sr, { ratio: 1.1 }); let mx = 0; for (let k = 0; k < 400; k++) { z.process(null, null, oL, oR, 128); for (let i = 0; i < 128; i++) mx = Math.max(mx, Math.abs(oL[i]), Math.abs(oR[i])); } eq(mx, 0, '입력이 없으면(일시정지) 무음'); }
  { const z = new WsolaShifter(sr, { ratio: 1.1 }); z.setRatio(NaN); ok(z.ratio >= 0.5 && z.ratio <= 2, '이상한 배수는 0.5~2 로 보정'); z.setRatio(99); eq(z.ratio, 2, '배수 상한 2'); }
}

section('유튜브 카드 · 연결 파일 정적 점검');
{
  eq(Y.RATES, [0.5, 0.75, 1, 1.25], '기존 RATES 그대로 (예전 시험 호환)');
  eq(Y.TEMPO_RATES, [0.75, 1, 1.25], '주된 템포 단계 0.75 · 1 · 1.25');
  eq(Y.KEY_STEPS, [-3, -2, -1, 0, 1, 2, 3], '키 −3 ~ +3');
  const ws = read('views/Worship.html'), sw = read('public/sw.js'), pk = JSON.parse(read('package.json'));
  ok(ws.indexOf('<script defer src="/worship/audio-shift.js"></script>') > ws.indexOf('<script defer src="/worship/pitch.js"></script>') && ws.indexOf('/worship/audio-shift.js') > 0, 'Worship.html: audio-shift.js 가 pitch.js 바로 뒤에 defer 로');
  ok(ws.indexOf('/worship/audio-shift.js') < ws.indexOf('/worship/practice.js'), 'Worship.html: practice.js 보다 먼저 불러옴');
  ok(/recs:\s*\(W\.recs/.test(ws), 'Worship.html: 연습 화면에 팀 녹음 목록(recs)을 넘김');
  ok(sw.indexOf("'/worship/audio-shift.js'") > 0 && sw.indexOf("'/worship/pitch-worklet.js'") > 0, 'sw.js: 두 파일이 PRE 에 있음');
  ok(fs.existsSync(path.join(ROOT, 'public/worship/pitch-worklet.js')) && fs.existsSync(path.join(ROOT, 'public/worship/audio-shift.js')), '두 파일이 public/worship 에 있음');
  ok(/test-step33\.js/.test(pk.scripts['test:step33'] || '') && /e2e-step33\.js/.test(pk.scripts['test:step33'] || ''), 'package.json: test:step33');
  const pr = read('public/worship/practice.js');
  ok(/P\.keyShift = function/.test(pr) && /P\.setKeyShift = function/.test(pr) && /P\.ensureTab = function/.test(pr) && /function ensureTab\(id\)/.test(pr), 'practice.js: P.keyShift · setKeyShift · ensureTab 이 있음');
  ok(/P\.emit\('keyshift'/.test(pr), "practice.js: 'keyshift' 이벤트");
}

console.log('\n' + (fail ? '✗ 실패 ' + fail + ' (통과 ' + pass + ')' : '✓ 모두 통과 (통과 ' + pass + ')'));
process.exit(fail ? 1 : 0);
