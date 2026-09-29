/**
 * Step 2 화면 모듈 시험 (Node) — 브라우저 없이 시험할 수 있는 순수한 계산 부분
 *   node scripts/test-step2-client.js
 *   · 송폼 (formb.js)   · 메트로놈 시간 계산 + 큐 예약 (metro.js)
 * (소리 · 화면 · 실시간 동기화는 scripts/test-step2-browser.js 가 진짜 브라우저로 시험합니다)
 */
const path = require('path');
const W = (f) => require(path.join(__dirname, '..', 'public', 'worship', f));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' → ' + a + ' vs ' + b);
const section = (t) => console.log('\n■ ' + t);

/* 재현 가능한 난수 */
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function testForm() {
  section('송폼 (formb.js)');
  const F = W('formb.js');
  eq(F.stringify(F.parse('V1-C-V2-C-B-C')), 'V1-C-V2-C-B-C', '예전 형식 그대로 읽고 씀');
  eq(F.stringify(F.parse('Verse 1 > Chorus x2 > 간주 > Tag2')), 'V1-C×2-Itld-Tag2', '표기가 달라도 표준으로 (모르는 것은 보관)');
  eq(F.parse('V1 C V2 C B').length, 5, '공백으로만 나눈 것도 읽음');
  eq(F.parse('').length, 0, '빈 값');
  eq(F.parse('1절-후렴-2절').map((t) => t.k), ['V1', 'C', 'V2'], '한글 표기');
  eq(F.parse('Tag2')[0].custom, true, '모르는 표기는 custom 으로 표시');
  eq(F.cueFor('C2'), 'Chorus 2', '음성 큐(영어)');
  eq(F.cueFor('V1', 'ko'), '1절', '음성 큐(한국어)');
  eq(F.numbered(F.parse('V-C-V-C-B-C-C')).map((t) => t.cueKey), ['V1', 'C', 'V2', 'C2', 'B', 'C3', 'C'], '번호 없는 V · C 는 등장 순서로 번호를 붙여 안내 (후렴 2·3번째는 C2 · C3)');
  const need = ['V', 'C', 'PC', 'V1', 'V2', 'V3', 'C2', 'C3', 'B1', 'B2', 'Intro', 'Itld', 'Out', 'Vamp'];
  ok(need.every((k) => F.info(k)), '요청하신 버튼(V, C, PC, V1~3, C2~3, B1~2, Intro, Itld, Out, Vamp)이 모두 있음');
  const rt = 'V1-PC-C-V2×2-Vamp-Out';
  eq(F.stringify(F.parse(rt)), rt, '왕복 변환이 같음');
}

/** 시계를 손으로 움직이며 스케줄러를 돌립니다 */
function drive(s, clock, steps, jitter) {
  const ev = [];
  for (let i = 0; i < steps; i++) {
    clock.t += 0.025 + (jitter ? rnd() * jitter : 0);
    ev.push(...s.tick());
  }
  return ev;
}
function testMetro() {
  section('메트로놈 시간 계산 (metro.js)');
  const M = W('metro.js');

  // 1) 타이머가 늦게 깨어나도 박은 빠지지 않고, 간격이 흔들리지 않음
  let clock = { t: 100 };
  let s = new M.Sched({ now: () => clock.t, bpm: 90, num: 4 });
  s.start(0, 0.05);
  const t0 = s.nextTime;
  let ev = drive(s, clock, 400, 0.09);                          // 매번 최대 90ms 늦게 (lookahead 120ms 안쪽)
  const itv = 60 / 90;
  ok(ev.length > 30, '박이 충분히 나옴 (' + ev.length + ')');
  ev.forEach((e, i) => near(e.time, t0 + i * itv, 1e-9, 'n번째 박은 시작 + n×간격 정확히 (' + i + ')'));
  eq(ev.map((e) => e.count).slice(0, 5), [0, 1, 2, 3, 4], '박 번호가 빠짐없이 이어짐');
  eq(ev.slice(0, 8).map((e) => e.beat), [0, 1, 2, 3, 0, 1, 2, 3], '4/4 박 위치');
  eq(ev.slice(0, 4).map((e) => e.accent), [2, 0, 0, 0], '4/4 강세');

  // 2) 템포를 바꿔도 위상이 튀지 않음 (이미 정한 박은 그대로, 다음 박부터 새 간격)
  clock = { t: 0 };
  s = new M.Sched({ now: () => clock.t, bpm: 60, num: 4 });
  s.start(0, 0);
  let a = drive(s, clock, 100, 0);
  s.setBpm(120);
  let b = drive(s, clock, 100, 0);
  const all = a.concat(b);
  let gaps = all.slice(1).map((e, i) => e.time - all[i].time);
  ok(gaps.every((g) => g > 0.49 && g < 1.01), '템포를 바꿔도 박 사이가 끊기거나 겹치지 않음');
  ok(gaps.some((g) => Math.abs(g - 1) < 1e-9) && gaps.some((g) => Math.abs(g - 0.5) < 1e-9), '바꾼 뒤에는 새 간격 (1초 → 0.5초)');
  ok(gaps.filter((g) => Math.abs(g - 1) > 1e-9 && Math.abs(g - 0.5) > 1e-9).length === 0, '중간에 어중간한 간격이 없음');

  // 3) 박자표 · 강세
  clock = { t: 0 };
  s = new M.Sched({ now: () => clock.t, bpm: 100, num: 6, den: 8 });
  s.start(0, 0);
  eq(drive(s, clock, 200, 0).slice(0, 6).map((e) => e.accent), [2, 0, 0, 1, 0, 0], '6/8 은 3박 묶음 강세');
  s.setSig(3, 4);
  ok(s.num === 3 && s.den === 4, '3/4 로 바꿈');

  // 4) 카운트인
  clock = { t: 0 };
  s = new M.Sched({ now: () => clock.t, bpm: 120, num: 4 });
  s.start(1, 0);
  ev = drive(s, clock, 200, 0);
  eq(ev.slice(0, 6).map((e) => e.countIn), [true, true, true, true, false, false], '카운트인 1마디');

  section('큐 예약 — 박에 맞춰 말하기 (planCue)');
  // 예약 계획은 실제로 나올 박과 일치해야 합니다 — 시계를 끝까지 돌려 확인
  function verify(mode, o, label) {
    clock = { t: 50 + rnd() * 3 };
    const sc = new M.Sched({ now: () => clock.t, bpm: 60 + Math.floor(rnd() * 120), num: rnd() < 0.3 ? 3 : 4 });
    sc.start(0, 0.02);
    drive(sc, clock, Math.floor(rnd() * 60), 0.05);             // 임의의 시점
    const now = clock.t;
    const plan = sc.planCue(mode, o);
    ok(plan.ok, label + ' 계획이 만들어짐');
    ok(plan.speakAt >= now + 0.03 - 1e-9, label + ' 말하기 시작 시각이 지금보다 뒤 (늦지 않음)');
    const future = drive(sc, clock, 400, 0);
    const hit = future.filter((e) => Math.abs(e.time - plan.landAt) < 1e-6)[0];
    ok(!!hit, label + ' 계획한 시각에 실제로 박이 옴');
    if (hit) {
      if (mode === 'downbeat') ok(hit.beat === 0, label + ' 마디 첫 박에 떨어짐');
      if (mode === 'lead') ok(((sc.num - hit.beat) % sc.num) === (o.leadBeats == null ? 2 : o.leadBeats) % sc.num || plan.k >= 0, label + ' 첫 박 N박 전');
      ok(Math.abs(plan.speakAt - (hit.time - (o.latency == null ? 0.18 : o.latency))) < 1e-9, label + ' 지연만큼 일찍 시작');
    }
  }
  for (let i = 0; i < 40; i++) {
    verify('downbeat', { latency: 0.05 + rnd() * 0.5 }, 'downbeat#' + i);
    verify('lead', { latency: 0.05 + rnd() * 0.5, leadBeats: 1 + Math.floor(rnd() * 3) }, 'lead#' + i);
    verify('now', { latency: 0.05 + rnd() * 0.3 }, 'now#' + i);
  }
  // 손으로 계산한 경우
  clock = { t: 0 };
  s = new M.Sched({ now: () => clock.t, bpm: 120, num: 4 });     // 간격 0.5초
  s.start(0, 0);
  drive(s, clock, 0, 0);
  clock.t = 0; s.nextTime = 10; s.beat = 1; s.bar = 3;           // 다음 박 = 10초에 2번째 박(beat 1)
  let p = s.planCue('downbeat', { latency: 0.2 });
  near(p.landAt, 10 + 3 * 0.5, 1e-9, '2번째 박에서 다음 첫 박까지 3박 뒤');
  near(p.speakAt, 11.5 - 0.2, 1e-9, '지연 0.2초만큼 앞당겨 시작');
  eq(p.bar, 4, '다음 마디 번호');
  p = s.planCue('lead', { latency: 0.2, leadBeats: 2 });
  near(p.landAt, 10 + 1 * 0.5, 1e-9, '첫 박 2박 전에 안내 시작 (다음 박+1)');
  s.nextTime = 10; s.beat = 0; clock.t = 9.85;                    // 다음 박이 곧 첫 박 — 지연 0.2 로는 이미 늦음
  p = s.planCue('downbeat', { latency: 0.2 });
  near(p.landAt, 10 + 4 * 0.5, 1e-9, '이미 늦었으면 그 다음 마디 첫 박으로 미룸');
  s.beat = 0; s.nextTime = 10; clock.t = 9.0;
  p = s.planCue('downbeat', { latency: 0.2 });
  near(p.landAt, 10, 1e-9, '충분히 여유 있으면 바로 다음 첫 박에 떨어짐');
  s.setBpm(60); s.beat = 2; s.nextTime = 20; clock.t = 19.9;
  p = s.planCue('downbeat', { latency: 1.5 });                   // 지연이 한 박(1초)보다 길어도 안전
  ok(p.speakAt >= clock.t + 0.03 && p.beat === 0, '지연이 한 박보다 길어도 첫 박에 맞춰 (다음 마디로 미룸)');
  s.stop();
  eq(s.planCue('now', {}).ok, false, '멈춰 있으면 계획하지 않음');

  section('탭 템포 · 한계값');
  const tt = new M.TapTempo();
  let r = null;
  [0, 500, 1000, 1500, 2000].forEach((ms) => { r = tt.tap(ms); });
  eq(r, 120, '0.5초 간격 탭 = 120 BPM');
  eq(tt.tap(9000), null, '오래 쉬면 새로 시작');
  s = new M.Sched({ now: () => 0, bpm: 9999 }); eq(s.bpm, 300, 'BPM 상한 300');
  s.setBpm(-5); eq(s.bpm, 30, 'BPM 하한 30');
  s.setBpm('abc'); eq(s.bpm, 30, '숫자가 아닌 BPM 은 하한으로');
  eq(M.CUES.length, 24, '음성 큐 24개 (기본 18 + 반복 · 콜아웃 6: Repeat Chorus · Half Chorus · Tag the last line · Last line again · One more time · One more bar)');
  const want = ['Verse 1', 'Verse 2', 'Verse 3', 'Chorus', 'Bridge', 'Pre-chorus', 'Vamp', 'Interlude', 'Ending', 'Intro', 'Voice', 'Break', 'Die down', 'Fermata', 'Session in', 'Alto in', 'Tenor in', 'Solo'];
  eq(want.filter((w) => !M.CUES.some((c) => c.en === w)), [], '큐 목록: 요청하신 이름이 모두 있음');
  ok(M.CUES.every((c) => c.ko), '모든 큐에 한국어 안내가 있음');
}

const tests = [testForm, testMetro];
try { tests.forEach((t) => t()); } catch (e) { fail++; console.log('  ✗ 시험 중 오류: ' + (e.stack || e.message)); }
console.log('\n' + (fail ? '✗ 실패 ' + fail + '건' : '✓ 모두 통과') + ' (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
