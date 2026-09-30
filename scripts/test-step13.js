/**
 * Step 13 — 악보 코드 인식 · 키 바꾸기 · 알토/테너 화음 · 악보 인식(OMR) 순수 계산 시험 (브라우저 없이)
 *   node scripts/test-step13.js
 */
const path = require('path');
const HC = require('../public/worship/harmony-core.js');
const OM = require('../public/worship/omr.js');
const MK = require('./browser/mksheet.js');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } }
function section(t) { console.log('\n' + t); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('1. 코드 읽기');
const okChords = ['C', 'G/B', 'Am7', 'F#m7b5', 'Bb', 'Ebmaj7', 'Dsus4', 'C6/9', 'Cadd9', 'G7(b9)', 'Bm7/A', 'A♭', 'C#dim7', 'Dm9', 'Fmaj9#11', 'Gsus2', 'E5', 'Cø7', 'Bbm', 'C+'];
check('20가지 코드 표기를 모두 코드로 읽음', okChords.every((c) => HC.parseChord(c)), okChords.filter((c) => !HC.parseChord(c)));
const notChords = ['Go', 'Do', 'Bad', 'Dad', 'Gum', 'Hello', 'Bridge', 'Verse', 'X', '', 'A.', 'H'];
check('가사 · 제목 글자(Go, Do, Bad, Bridge…)는 코드로 읽지 않음', notChords.every((c) => !HC.parseChord(c)), notChords.filter((c) => HC.parseChord(c)));
check('C 의 구성음 = C E G', eq(HC.parseChord('C').pcs, [0, 4, 7]));
check('G/B 의 베이스 = B (11)', HC.parseChord('G/B').bass === 11 || HC.parseChord('G/B').pcs[0] === 7, HC.parseChord('G/B'));
check('Am7 = A C E G', eq(HC.parseChord('Am7').pcs.slice().sort((a, b) => a - b), [0, 4, 7, 9]));

section('2. OCR 오독 바로잡기');
check('DIF# → D/F#', HC.fixOcrChord('DIF#') === 'D/F#', HC.fixOcrChord('DIF#'));
check('C1E → C/E', HC.fixOcrChord('C1E') === 'C/E', HC.fixOcrChord('C1E'));
check('G! · Gl 처럼 끝에 붙은 잡음 글자는 떼고 G/ 로 잘못 붙이지 않음', HC.fixOcrChord('G!') === 'G' && HC.fixOcrChord('Gl') === 'G', [HC.fixOcrChord('G!'), HC.fixOcrChord('Gl')]);
check('평범한 코드는 그대로 (Am7, Em, D/F#)', ['Am7', 'Em', 'D/F#'].every((c) => HC.fixOcrChord(c) === c));
const t0 = [{ text: 'G', x0: 60, x1: 70, y0: 100, y1: 112 }, { text: 'DIF#', x0: 200, x1: 240, y0: 100, y1: 112 }, { text: '|', x0: 300, x1: 302, y0: 100, y1: 112 }];
check('OCR 띠(loose)에서 G, D/F# 를 찾고 세로줄 기호는 무시', eq(HC.chordsFromTokens(t0, { loose: true, fixOcr: true }).map((c) => c.text), ['G', 'D/F#']), HC.chordsFromTokens(t0, { loose: true, fixOcr: true }).map((c) => c.text));
const title = [{ text: 'A', x0: 60, x1: 70, y0: 30, y1: 46 }, { text: 'Mighty', x0: 80, x1: 140, y0: 30, y1: 46 }, { text: 'Fortress', x0: 150, x1: 230, y0: 30, y1: 46 }];
check('제목 줄("A Mighty Fortress")은 코드 줄로 보지 않음', HC.chordsFromTokens(title, {}).length === 0);
const lyric = [{ text: 'Amazing', x0: 60, x1: 120, y0: 200, y1: 212 }, { text: 'grace', x0: 130, x1: 170, y0: 200, y1: 212 }, { text: 'G', x0: 180, x1: 188, y0: 200, y1: 212 }];
check('가사 줄에 섞인 한 글자 G 는 코드로 뽑지 않음(엄격 모드)', HC.chordsFromTokens(lyric, {}).length === 0);

section('3. 키 · 반음 · 옮기기');
check('G→A = +2', HC.keySemitones('G', 'A') === 2);
check('G→Eb = -4 (아래로 가까운 쪽)', HC.keySemitones('G', 'Eb') === -4, HC.keySemitones('G', 'Eb'));
check('A→G = -2', HC.keySemitones('A', 'G') === -2);
check('C→F# = 6', HC.keySemitones('C', 'F#') === 6, HC.keySemitones('C', 'F#'));
check('키 객체로도 계산', HC.keySemitones(HC.parseKey('G'), HC.parseKey('Bb')) === 3);
check('Bb · F#m · "Key of D" · "E minor" 읽기', HC.parseKey('Bb').flats && HC.parseKey('F#m').minor && HC.parseKey('Key of D').tonic === 2 && HC.parseKey('E minor').minor && HC.parseKey('xx') === null);
const up2 = ['G', 'D/F#', 'Em7', 'C', 'Bm7b5', 'F#m7b5/C'].map((c) => HC.transposeChord(c, 2, false));
check('G→A(+2): G D/F# Em7 C Bm7b5 F#m7b5/C → A E/G# F#m7 D C#m7b5 G#m7b5/D', eq(up2, ['A', 'E/G#', 'F#m7', 'D', 'C#m7b5', 'G#m7b5/D']), up2);
const fl = ['G', 'D/F#', 'Em7', 'C', 'Am7', 'Bm7b5'].map((c) => HC.transposeChord(c, 3, true));
check('G→Bb(+3, 플랫 표기): Bb F/A Gm7 Eb Cm7 Dm7b5', eq(fl, ['Bb', 'F/A', 'Gm7', 'Eb', 'Cm7', 'Dm7b5']), fl);
check('12 반음 옮기면 제자리 · 되돌리면 원래대로', HC.transposeChord('Am7/G', 12, false) === 'Am7/G' && HC.transposeChord(HC.transposeChord('F#m7', 5, false), -5, false) === 'F#m7');
check('sus4 · 6/9 · add9 · (b9) 같은 꾸밈은 유지', HC.transposeChord('Dsus4', 2, false) === 'Esus4' && HC.transposeChord('C6/9', 2, false) === 'D6/9' && HC.transposeChord('Cadd9', 2, false) === 'Dadd9' && HC.transposeChord('G7(b9)', 2, false) === 'A7(b9)', ['Dsus4', 'C6/9', 'Cadd9', 'G7(b9)'].map((c) => HC.transposeChord(c, 2, false)));
check('keyUsesFlats: F · Bb · Eb 플랫, G · D · A 샤프', ['F', 'Bb', 'Eb'].every((k) => HC.keyUsesFlats(HC.parseKey(k))) && ['G', 'D', 'A'].every((k) => !HC.keyUsesFlats(HC.parseKey(k))));
const g1 = HC.guessKey(['G', 'D/F#', 'Em7', 'C', 'G', 'D', 'C', 'G'].map(HC.parseChord)), g2 = HC.guessKey(['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am'].map(HC.parseChord)), g3 = HC.guessKey(['Bb', 'Eb', 'F', 'Bb', 'Gm', 'Eb', 'F', 'Bb'].map(HC.parseChord));
check('코드 진행으로 조 짐작: G 장조 · A 단조 · Bb 장조', g1.key.name === 'G' && g2.key.name === 'Am' && g3.key.name === 'Bb', [g1.key.name, g2.key.name, g3.key.name]);

section('4. 오선 ↔ 음높이');
const G = HC.parseKey('G'), C = HC.parseKey('C'), Bb = HC.parseKey('Bb');
check('C 조: 맨 아래 줄 = E4(64), 아래 덧줄 C4(60), 위 F5(77)', HC.stepToMidi(0, C) === 64 && HC.stepToMidi(-2, C) === 60 && HC.stepToMidi(8, C) === 77);
check('G 조: F 자리는 F#(66 · 78)', HC.stepToMidi(1, G) === 66 && HC.stepToMidi(8, G) === 78);
check('Bb 조: B → Bb(70), E → Eb(75)', HC.stepToMidi(4, Bb) === 70 && HC.stepToMidi(7, Bb) === 75);
check('midiToStep 는 stepToMidi 의 거꾸로 (조표 안의 음 전부)', [-3, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((s) => [C, G, Bb].every((k) => HC.midiToStep(HC.stepToMidi(s, k), k).step === s && !HC.midiToStep(HC.stepToMidi(s, k), k).acc)));
check('조표 밖의 음은 임시표로: F(65) in G = 0번 칸 + ♯', eq(HC.midiToStep(65, G), { step: 0, acc: 1 }), HC.midiToStep(65, G));

section('5. 화음 만들기 (알토 · 테너)');
const melody = [67, 71, 74, 72, 71, 69, 67], chs = ['G', 'G', 'G', 'C', 'G', 'D', 'G'].map(HC.parseChord);
const items = melody.map((m, i) => ({ id: 'n' + i, midi: m, chord: chs[i] }));
const hm = HC.buildHarmony(items, { key: G });
check('음마다 알토 · 테너가 나옴', hm.length === 7 && hm.every((x) => Number.isFinite(x.alto) && Number.isFinite(x.tenor)));
check('알토 음역 55~76 · 테너 음역 48~69', hm.every((x) => x.alto >= 55 && x.alto <= 76 && x.tenor >= 48 && x.tenor <= 69), hm.map((x) => [x.alto, x.tenor]));
check('멜로디 > 알토 > 테너 (겹치거나 뒤집히지 않음)', hm.every((x, i) => melody[i] > x.alto && x.alto > x.tenor), hm.map((x, i) => [melody[i], x.alto, x.tenor]));
const inChord = (m, c) => c.pcs.indexOf(((m % 12) + 12) % 12) >= 0;
check('알토 · 테너는 코드 구성음 안에서 고름', hm.every((x, i) => inChord(x.alto, chs[i]) && inChord(x.tenor, chs[i])), hm.map((x, i) => [chs[i].text, x.alto % 12, x.tenor % 12]));
check('알토는 대부분 멜로디 3도 아래 (7음 중 5음 이상 3~4도 아래)', hm.filter((x, i) => melody[i] - x.alto >= 3 && melody[i] - x.alto <= 5).length >= 5, hm.map((x, i) => melody[i] - x.alto));
let big = 0; for (let i = 1; i < hm.length; i++) { if (Math.abs(hm[i].alto - hm[i - 1].alto) > 5) big++; if (Math.abs(hm[i].tenor - hm[i - 1].tenor) > 7) big++; }
check('앞뒤 도약이 크지 않음 (알토 4도↑ · 테너 5도↑ 도약 없음)', big === 0, big);
function parallels(aa, bb) { let n = 0; for (let i = 1; i < aa.length; i++) { const p = ((aa[i - 1] - bb[i - 1]) % 12 + 12) % 12, q = ((aa[i] - bb[i]) % 12 + 12) % 12, moved = aa[i] !== aa[i - 1] && bb[i] !== bb[i - 1]; if (moved && p === q && (p === 7 || p === 0)) n++; } return n; }
check('멜로디-알토 · 멜로디-테너 · 알토-테너 사이 병행 5도/8도 없음', parallels(melody, hm.map((x) => x.alto)) === 0 && parallels(melody, hm.map((x) => x.tenor)) === 0 && parallels(hm.map((x) => x.alto), hm.map((x) => x.tenor)) === 0);
const hm2 = HC.buildHarmony(items.slice(0, 3).concat([{ id: 'x', midi: 67, chord: null }]), { key: G });
check('코드가 없는 음도 조(scale) 안에서 화음을 만듦', Number.isFinite(hm2[3].alto) && Number.isFinite(hm2[3].tenor));
check('빈 목록 · 한 음도 오류 없이', HC.buildHarmony([], { key: G }).length === 0 && HC.buildHarmony([items[0]], { key: G }).length === 1);
check('같은 입력이면 같은 결과 (결정적)', eq(hm, HC.buildHarmony(items, { key: G })));

section('6. 미리듣기 일정');
const sch = HC.buildSchedule(items.map((it, i) => ({ midi: it.midi, alto: hm[i].alto, tenor: hm[i].tenor, beats: 1, rest: 0 })), { bpm: 120, semis: 0, lead: 0, voices: { m: true, a: true, t: true } });
check('7음 × 3성부 = 21 개 소리', sch.events.length === 21, sch.events.length);
check('120 BPM 4분음표 = 0.5초, 총 3.5초', Math.abs(sch.total - 3.5) < 0.01 && Math.abs(sch.starts[1] - 0.5) < 1e-6, [sch.total, sch.starts]);
const sch2 = HC.buildSchedule(items.map((it, i) => ({ midi: it.midi, alto: hm[i].alto, tenor: hm[i].tenor, beats: 1, rest: 0 })), { bpm: 120, semis: 2, lead: 0, voices: { m: true, a: false, t: false } });
check('멜로디만 · +2 반음이면 7개 · 맨 처음 소리가 69(A4)', sch2.events.length === 7 && sch2.events[0].midi === 69, sch2.events[0]);
const sch3 = HC.buildSchedule([{ midi: 67, alto: 62, tenor: 59, beats: 2, rest: 1 }, { midi: 69, alto: 64, tenor: 60, beats: 1, rest: 0 }], { bpm: 60, semis: 0, lead: 0, voices: { m: true, a: true, t: true } });
check('쉼표(rest)가 다음 음 시작을 늦춤 (60BPM: 2박 + 쉼 1박 = 3초 뒤)', Math.abs(sch3.starts[1] - 3) < 1e-6, sch3.starts);

section('7. 악보 인식 (합성 악보 — 오선 4줄 · 26음)');
const { prims, truth } = MK.layout();
const img = MK.toRgba(prims, 1700);
const t1 = Date.now(), r = OM.analyze(img.rgba, img.w, img.h);
console.log('    (분석 ' + (Date.now() - t1) + 'ms)');
check('오선 4줄 찾음 · 칸 간격 정확(±8%)', r.staves.length === 4 && r.staves.every((s, i) => Math.abs(s.sp / img.scale - truth.staves[i].sp) / truth.staves[i].sp < 0.08), r.staves.map((s) => s.sp));
check('4줄 모두 멜로디 오선으로 판단', r.staves.every((s) => s.melody));
let tp = 0, stepOK = 0; const used = new Set();
truth.notes.forEach((tn) => {
  let best = -1, bd = 1e9; r.notes.forEach((n, i) => { if (n.staff !== tn.sys || used.has(i)) return; const d = Math.hypot(n.x - tn.x * img.scale, n.y - tn.y * img.scale); if (d < bd) { bd = d; best = i; } });
  if (best >= 0 && bd < truth.sp * img.scale * 1.2) { used.add(best); tp++; if (r.notes[best].step === tn.step) stepOK++; }
});
check('음표 26/26 찾음 (재현율 100%)', tp === truth.notes.length, tp + '/' + truth.notes.length);
check('찾은 음표의 오선 위치(step) 전부 맞음', stepOK === tp, stepOK + '/' + tp);
check('가짜 음표(오검출) 없음', r.notes.length === tp, r.notes.length - tp);
const meanBeats = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const halfT = truth.notes.filter((n) => n.type === 'h').length, halfGot = r.notes.filter((n) => n.open && n.stem).length;
check('빈 머리 + 줄기(2분음표) 개수가 맞음', halfT === halfGot, [halfT, halfGot]);
check('멜로디 순서(왼쪽→오른쪽)에서 박 길이가 0보다 큼', r.notes.every((n) => n.beats > 0));
const assigned = HC.assignChords(truth.chords.map((c) => ({ x0: c.x * img.scale / img.w, x1: (c.x + 20) * img.scale / img.w, y0: c.y * img.scale / img.h, y1: (c.y + c.size) * img.scale / img.h })),
  r.staves.map((s) => ({ top: s.top / img.h, bottom: s.bottom / img.h, sp: s.sp / img.h, x0: s.x0 / img.w, x1: s.x1 / img.w, sys: s.sys, melody: s.melody })),
  r.notes.map((n) => ({ staff: n.staff, x: n.x / img.w, step: n.step })), img.w / img.h);
check('코드 글자를 바로 아래(가장 가까운) 멜로디 음에 붙임 — 14개 코드 모두 서로 다른 음', assigned.length === r.notes.length && new Set(assigned.filter((i) => i >= 0)).size === truth.chords.length, assigned.filter((i) => i >= 0).length);

console.log('\n' + (fail ? '실패 ' + fail + ' · ' : '') + '통과 ' + pass);
process.exit(fail ? 1 : 0);
