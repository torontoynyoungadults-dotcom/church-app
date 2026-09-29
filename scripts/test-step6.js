/**
 * Step 6 서버 시험 — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step6.js
 *  A. 예전 신청서(객관식 · 복수선택 · 주관식 · 숫자 · 날짜 · 동의 · 안내글)가 그대로 저장 · 신청 · 집계 · 엑셀 되는가
 *  B. 별점 · 만족도 (설정 저장/보정 · 답 검증 · 필수 · 평균 · 점수별 인원 · 엑셀)
 *  C. 기타(직접 입력) (객관식 · 복수선택 · 빈 내용 거절 · 다듬기 · 집계 묶기 · 꺼져 있으면 예전 그대로)
 *  D. 서식 안내글 (굵게 · 주황 강조 · 스크립트 등 위험한 것 제거 · 예전 desc 호환 · 본보기)
 *  E. 유형 전환 (선택지 · 기타 · 범위 유지 · 옛 답이 남아 있어도 결과 · 엑셀이 멈추지 않음)
 *  F. 규모 (문항 60개 저장 · 신청 · 집계) · 권한
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;

['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림|노트 저장 실패)/.test(String(a[0]))) return; o.apply(console, a); }; });

const P정 = '4165551008', P최 = '4165551006';
const ADM = 'ADM';

function csvOf(res) {
  const s = Buffer.from(res.b64, 'base64').toString('utf8').replace(/^﻿/, '');
  return s.split(/\r?\n/).map((l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
}

(function main() {
  const env = newEnv();
  const run = env.run;
  const A정 = run((api) => api.포털토큰_('정일반', P정, ''));
  const A최 = run((api) => api.포털토큰_('최셀장', P최, ''));

  const base = (extra) => Object.assign({ title: '시험 신청서', status: '받는중', target: '모두', notify: false, mail: false, editable: true }, extra || {});
  const save = (data) => run((api) => api.formSave(ADM, data)).id;
  const get = (id) => run((api) => api.formGet(ADM, id)).form;
  const submit = (tok, id, ans) => run((api) => api.submitForm(tok, id, ans));
  const results = (id) => run((api) => api.formResults(ADM, id));
  const stat = (r, qid) => r.stats.filter((s) => s.id === qid)[0];

  /* ============================================================ A */
  section('A. 예전 신청서 그대로');
  const legacyQs = [
    { id: 'q1', type: 'choice', label: '사이즈', req: true, opts: ['S', 'M', 'L'] },
    { id: 'q2', type: 'checks', label: '가져올 것', opts: ['a', 'b', 'c'] },
    { id: 'q3', type: 'text', label: '한 줄' },
    { id: 'q4', type: 'long', label: '여러 줄' },
    { id: 'q5', type: 'number', label: '수량', min: 1, max: 10, unit: '장' },
    { id: 'q6', type: 'date', label: '날짜' },
    { id: 'q7', type: 'agree', label: '동의', req: true },
    { id: 'q8', type: 'section', label: '안내', help: '읽어 주세요' },
  ];
  const idA = save(base({ title: '예전 방식', desc: '첫 줄\n둘째 줄', questions: legacyQs }));
  const fA = get(idA);
  eq(fA.desc, '첫 줄\n둘째 줄', 'A. 서식 없는 안내글은 예전처럼 글 그대로');
  eq(fA.descHtml, '', 'A. 서식 없으면 descHtml 은 빈 값');
  eq(fA.questions.map((q) => q.type), legacyQs.map((q) => q.type), 'A. 문항 유형 순서 그대로');
  ok(fA.questions.every((q) => !('scale' in q) && !('variant' in q) && !('otherLabel' in q)), 'A. 옛 문항에는 새 칸(별점 · 기타 이름)이 생기지 않음');
  eq(fA.questions[7].help, '읽어 주세요', 'A. 안내글 문항 help 그대로');
  ok(!('helpHtml' in fA.questions[7]), 'A. 서식 없는 안내글 문항에는 helpHtml 이 없음');

  const o정 = run((api) => api.formOpen(A정, idA));
  eq(o정.open, true, 'A. formOpen 열림');
  eq(o정.form.descHtml, '', 'A. formOpen 이 descHtml 도 돌려줌');
  eq(submit(A정, idA, { q1: 'M', q2: ['a', 'b'], q3: 'hi', q4: 'long text', q5: 3, q6: '2026-10-01', q7: true }).ok, true, 'A. 정일반 신청');
  eq(submit(A최, idA, { q1: 'L', q2: ['b'], q3: '', q5: 2, q7: true }).count, 2, 'A. 최셀장 신청 → 2명');
  throws(() => submit(A정, idA, { q2: ['a'], q7: true }), /사이즈/, 'A. 필수 객관식 비면 거절');
  throws(() => submit(A정, idA, { q1: 'M', q7: false }), /동의/, 'A. 필수 동의 안 하면 거절');
  throws(() => submit(A정, idA, { q1: 'M', q5: 99, q7: true }), /10 이하/, 'A. 숫자 범위 거절');

  const rA = results(idA);
  eq(rA.count, 2, 'A. 결과 신청 2명');
  eq(rA.stats.map((s) => s.id), ['q1', 'q2', 'q5'], 'A. 집계 순서 = 객관식 · 복수선택 → 숫자 (예전과 같음)');
  eq(stat(rA, 'q1').items, [{ name: 'S', n: 0 }, { name: 'M', n: 1 }, { name: 'L', n: 1 }], 'A. 객관식 집계');
  eq(stat(rA, 'q2').items, [{ name: 'a', n: 1 }, { name: 'b', n: 2 }, { name: 'c', n: 0 }], 'A. 복수선택 집계');
  eq([stat(rA, 'q5').sum, stat(rA, 'q5').n, stat(rA, 'q5').unit], [5, 2, '장'], 'A. 숫자 합계');
  ok(!('others' in stat(rA, 'q1')), 'A. 기타를 안 쓰는 문항 집계에는 others 가 없음');
  eq(stat(rA, 'q1').none, 0, 'A. 답 없음 0');

  const xA = run((api) => api.formExport(ADM, idA));
  const cA = csvOf(xA);
  ok(xA.fallback === true || /xlsx/.test(xA.name), 'A. 엑셀(또는 CSV) 내보내기');
  if (xA.fallback) {
    const row = cA.filter((r) => r[0] === '정일반')[0] || [];
    ok(row.indexOf('a, b') !== -1, 'A. 엑셀: 복수선택은 ", " 로 이어짐');
    ok(row.indexOf('동의') !== -1, 'A. 엑셀: 동의는 "동의"');
    ok(row.indexOf('3') !== -1, 'A. 엑셀: 숫자');
  }
  const idOld = save(base({ title: '옛 줄 시험', questions: [{ id: 'q1', type: 'choice', label: '옛 문항', opts: ['가', '나'] }] }));
  eq(get(idOld).questions[0].opts, ['가', '나'], 'A. 저장된 옛 모양 문항 읽기');

  /* ============================================================ B */
  section('B. 별점 · 만족도');
  const idB = save(base({ title: '만족도', questions: [
    { id: 'r1', type: 'rating', label: '전반적 만족', req: true, scale: 5, variant: 'face', lowLabel: '매우 불만족', highLabel: '매우 만족' },
    { id: 'r2', type: 'rating', label: '10점 척도', scale: 10, variant: 'star' },
    { id: 'r3', type: 'rating', label: '엉뚱한 값', scale: 99, variant: 'face' },   // 보정: 10점 · 얼굴은 5점만 → 숫자
    { id: 'r4', type: 'rating', label: '설정 없음' },
  ] }));
  const fB = get(idB);
  const qB = (id) => fB.questions.filter((q) => q.id === id)[0];
  eq([qB('r1').scale, qB('r1').variant, qB('r1').lowLabel, qB('r1').highLabel], [5, 'face', '매우 불만족', '매우 만족'], 'B. 별점 설정 저장');
  eq([qB('r2').scale, qB('r2').variant], [10, 'star'], 'B. 10점 별');
  eq([qB('r3').scale, qB('r3').variant], [10, 'number'], 'B. 99점 → 10점, 5점이 아니면 얼굴 대신 숫자');
  eq([qB('r4').scale, qB('r4').variant], [5, 'star'], 'B. 설정이 없으면 5점 별');
  ok(run((api) => api.문항종류()).some((t) => t.key === 'rating'), 'B. 문항종류에 별점이 있음');

  eq(submit(A정, idB, { r1: 4, r2: 9 }).ok, true, 'B. 정일반 별점 신청');
  submit(A최, idB, { r1: '5', r3: 3 });
  throws(() => submit(A정, idB, { r2: 3 }), /전반적 만족.*점수/, 'B. 필수 별점 비면 거절');
  throws(() => submit(A정, idB, { r1: 6 }), /1점부터 5점/, 'B. 5점 넘으면 거절');
  throws(() => submit(A정, idB, { r1: 0 }), /1점부터 5점/, 'B. 0점 거절');
  throws(() => submit(A정, idB, { r1: 2.5 }), /1점부터 5점/, 'B. 소수 거절');
  throws(() => submit(A정, idB, { r1: 'abc' }), /1점부터 5점/, 'B. 글자 거절');
  eq(run((api) => api.formOpen(A정, idB)).mine.answers.r1, 4, 'B. 저장된 별점은 숫자로');

  const rB = results(idB);
  const s1 = stat(rB, 'r1');
  eq([s1.type, s1.scale, s1.n, s1.avg], ['rating', 5, 2, 4.5], 'B. 평균 4.5 (4 · 5)');
  eq(s1.items.map((x) => x.n), [0, 0, 0, 1, 1], 'B. 점수별 인원');
  eq(stat(rB, 'r2').items.length, 10, 'B. 10점 척도는 10칸');
  eq([stat(rB, 'r2').n, stat(rB, 'r2').none], [1, 1], 'B. 안 고른 사람은 답 없음');
  eq(stat(rB, 'r4').n, 0, 'B. 아무도 안 고르면 n=0');
  eq(stat(rB, 'r4').avg, 0, 'B. 아무도 안 고르면 평균 0');
  const xB = run((api) => api.formExport(ADM, idB));
  if (xB.fallback) {
    const row = csvOf(xB).filter((r) => r[0] === '정일반')[0] || [];
    ok(row.indexOf('4') !== -1 && row.indexOf('9') !== -1, 'B. 엑셀에 별점 숫자');
  }

  /* ============================================================ C */
  section('C. 기타(직접 입력)');
  const idC = save(base({ title: '기타 시험', questions: [
    { id: 'c1', type: 'choice', label: '교통', req: true, opts: ['버스', '지하철'], other: true },
    { id: 'c2', type: 'checks', label: '간식', opts: ['빵', '과일'], other: true, otherLabel: '그 밖에', max: 3 },
    { id: 'c3', type: 'choice', label: '기타 없음', opts: ['예', '아니오'] },
  ] }));
  const qC = (id) => get(idC).questions.filter((q) => q.id === id)[0];
  eq([qC('c1').other, qC('c2').other, qC('c2').otherLabel], [true, true, '그 밖에'], 'C. other · otherLabel 저장');
  ok(!('otherLabel' in qC('c1')), 'C. 이름을 안 정하면 otherLabel 이 저장되지 않음(기본 이름 사용)');

  submit(A정, idC, { c1: '기타: 자전거', c2: ['빵', '기타:   두  칸   공백 ', '기타: 또'], c3: '예' });
  const mine = run((api) => api.formOpen(A정, idC)).mine.answers;
  eq(mine.c1, '기타: 자전거', 'C. 객관식 기타 저장');
  eq(mine.c2, ['빵', '기타: 두 칸 공백'], 'C. 복수선택 기타: 공백 다듬고 두 번째 기타는 버림');
  throws(() => submit(A최, idC, { c1: '기타: ' }), /'기타' 내용을 입력/, 'C. 기타를 골랐는데 내용이 비면 거절(객관식)');
  throws(() => submit(A최, idC, { c1: '기타:' }), /'기타' 내용을 입력/, 'C. 공백 없는 "기타:" 도 거절');
  throws(() => submit(A최, idC, { c1: '버스', c2: ['기타:   '] }), /'기타' 내용을 입력/, 'C. 복수선택 빈 기타 거절');
  submit(A최, idC, { c1: '버스', c2: ['과일', '기타: ' + 'ㅎ'.repeat(300)] });
  eq(run((api) => api.formOpen(A최, idC)).mine.answers.c2[1].length, 4 + 100, 'C. 기타 내용은 100자까지');
  submit(A최, idC, { c1: '지하철', c2: ['과일'] });

  const rC = results(idC);
  const c1 = stat(rC, 'c1'), c2 = stat(rC, 'c2');
  eq(c1.items, [{ name: '버스', n: 0 }, { name: '지하철', n: 1 }, { name: '기타 (직접 입력)', n: 1 }], 'C. 객관식 집계: 기타는 한 줄로 묶음(기본 이름)');
  eq(c1.others, [{ name: '정일반', text: '자전거' }], 'C. 기타 내용 목록');
  eq(c2.items.map((x) => x.name), ['빵', '과일', '그 밖에'], 'C. 복수선택 집계: 정한 이름 사용');
  eq(c2.items.map((x) => x.n), [1, 1, 1], 'C. 복수선택 집계 값');
  eq(stat(rC, 'c3').items, [{ name: '예', n: 1 }, { name: '아니오', n: 0 }], 'C. 기타 없는 문항은 예전 그대로');
  ok(!('others' in stat(rC, 'c3')), 'C. 기타 없는 문항엔 others 없음');

  const idC2 = save(base({ title: '기타 꺼짐', questions: [{ id: 'c1', type: 'choice', label: 'x', opts: ['가'], other: false }] }));
  eq(submit(A정, idC2, { c1: '기타: ' }).ok, true, 'C. other=false 면 "기타: " 도 예전처럼 받아들임');

  /* ============================================================ D */
  section('D. 서식 안내글');
  const evil = '<b>굵게</b> 그리고 <mark class="hl">주황</mark><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(2)">링크</a><div onclick="x()">줄</div>';
  const idD = save(base({ title: '서식', desc: '무시됨', descHtml: evil, questions: [
    { id: 's1', type: 'section', label: '안내', help: '무시', helpHtml: '<b>꼭</b> 읽어주세요<br><mark class="hl">주황</mark>' },
    { id: 't1', type: 'text', label: '한 줄', help: '<b>이건 글자 그대로</b>' },
  ] }));
  const fD = get(idD);
  ok(/^<b>굵게<\/b> 그리고 <mark class="hl">주황<\/mark>/.test(fD.descHtml), 'D. 굵게 · 주황 강조는 남김: ' + fD.descHtml);
  ok(!/<script|onerror|onclick|javascript:|<a[ >]|<img/i.test(fD.descHtml), 'D. 위험한 태그 · 속성 제거: ' + fD.descHtml);
  ok(fD.desc.indexOf('굵게 그리고 주황') === 0 && fD.desc.indexOf('<') === -1, 'D. desc 는 서식을 뺀 글: ' + JSON.stringify(fD.desc));
  eq(fD.questions[0].help, '꼭 읽어주세요\n주황', 'D. 안내글 문항 help 는 서식을 뺀 글');
  eq(fD.questions[0].helpHtml, '<b>꼭</b> 읽어주세요<br><mark class="hl">주황</mark>', 'D. 안내글 문항 helpHtml');
  eq(fD.questions[1].help, '<b>이건 글자 그대로</b>', 'D. 일반 문항 도움말은 서식 처리 안 함(글 그대로)');
  ok(!('helpHtml' in fD.questions[1]), 'D. 일반 문항엔 helpHtml 없음');
  eq(run((api) => api.formOpen(A정, idD)).form.descHtml, fD.descHtml, 'D. 신청자 화면용 formOpen 에도 descHtml');
  const list = run((api) => api.myForms(A정)).list.filter((f) => f.id === idD)[0];
  eq(list.desc, fD.desc, 'D. 포털 목록에는 서식 뺀 글');
  const idD2 = save(base({ title: '긴 글', descHtml: '<b>' + '가'.repeat(5000) + '</b>' }));
  eq(get(idD2).desc.length, 3000, 'D. 안내글은 3000자까지');
  ok(/^<b>가+<\/b>$/.test(get(idD2).descHtml), 'D. 길어도 서식은 잘리지 않고 닫힘');
  const idD3 = save(base({ title: '서식 없음', descHtml: '<div>그냥</div><div>글</div>' }));
  eq([get(idD3).desc, get(idD3).descHtml], ['그냥\n글', ''], 'D. 서식이 없으면 descHtml 비우고 글만');
  run((api) => api.saveFormTemplate(ADM, idD, '서식 본보기', ''));
  const tpl = run((api) => api.formTemplatesAll(ADM)).mine.filter((t) => t.name === '서식 본보기')[0];
  eq(tpl.form.descHtml, fD.descHtml, 'D. 본보기에도 descHtml 이 실림');

  /* ============================================================ E */
  section('E. 유형 전환');
  const idE = save(base({ title: '유형 전환', questions: [{ id: 'e1', type: 'choice', label: '고르기', opts: ['x', 'y'], other: true, min: 2, max: 5, unit: '개' }] }));
  submit(A정, idE, { e1: 'x' });
  submit(A최, idE, { e1: '기타: 자전거' });
  const sw = (type, extra) => {
    const q = Object.assign({}, get(idE).questions[0], { type }, extra || {});
    return save(base({ id: idE, title: '유형 전환', questions: [q] }));
  };
  sw('text');
  let qE = get(idE).questions[0];
  eq([qE.type, qE.opts, qE.other, qE.min, qE.max, qE.unit], ['text', ['x', 'y'], true, 2, 5, '개'], 'E. 주관식으로 바꿔도 선택지 · 기타 · 범위가 남음');
  let rE = results(idE);
  eq(rE.stats.length, 0, 'E. 주관식으로 바꾼 뒤 결과가 멈추지 않음(집계 없음)');
  const xE = run((api) => api.formExport(ADM, idE));
  if (xE.fallback) ok(csvOf(xE).some((r) => r.indexOf('기타: 자전거') !== -1), 'E. 엑셀엔 옛 답이 그대로');

  sw('checks');
  rE = results(idE);
  eq(stat(rE, 'e1').items.map((x) => [x.name, x.n]), [['x', 1], ['y', 0], ['기타 (직접 입력)', 1]], 'E. 복수선택으로 바꾼 뒤에도 문자열 옛 답을 셈');
  eq(run((api) => api.formExport(ADM, idE)).count, 2, 'E. 복수선택 엑셀도 문자열 답에서 멈추지 않음');

  sw('rating');
  rE = results(idE);
  eq([stat(rE, 'e1').type, stat(rE, 'e1').n, stat(rE, 'e1').none], ['rating', 0, 2], 'E. 별점으로 바꾸면 글자 답은 "답 없음" 으로 셈(멈추지 않음)');
  throws(() => submit(A정, idE, { e1: 'x' }), /1점부터 5점/, 'E. 별점으로 바뀐 문항에 글자 답은 거절');
  eq(submit(A정, idE, { e1: 4 }).ok, true, 'E. 별점으로 바뀐 문항에 숫자 답');
  rE = results(idE);
  eq([stat(rE, 'e1').n, stat(rE, 'e1').avg], [1, 4], 'E. 새 별점 답 집계');

  sw('choice');
  qE = get(idE).questions[0];
  eq([qE.type, qE.opts, qE.other, qE.scale], ['choice', ['x', 'y'], true, 5], 'E. 객관식으로 돌아오면 선택지 그대로(별점 설정도 보존)');
  rE = results(idE);
  ok(stat(rE, 'e1').items.some((x) => x.name === '4' && x.n === 1), 'E. 다시 객관식: 목록에 없는 옛 값(4)도 사라지지 않고 따로 셈');

  sw('checks');
  eq(submit(A최, idE, { e1: 'y' }).ok, true, 'E. 복수선택에 문자열 답 → 한 개 선택으로 처리');
  eq(run((api) => api.formOpen(A최, idE)).mine.answers.e1, ['y'], 'E. 배열로 저장');
  eq(results(idE).count, 2, 'E. 신청한 사람 수 유지');

  /* ============================================================ F */
  section('F. 규모 · 권한');
  const many = [];
  const kinds = ['choice', 'checks', 'text', 'long', 'number', 'date', 'rating', 'agree'];
  for (let i = 0; i < 60; i++) {
    const type = kinds[i % kinds.length];
    many.push({ id: 'm' + i, type, label: '문항 ' + i, req: false, opts: ['가', '나', '다'], other: type === 'choice' || type === 'checks', scale: 5 });
  }
  const t0 = Date.now();
  const idF = save(base({ title: '문항 60개', questions: many }));
  eq(get(idF).questions.length, 60, 'F. 문항 60개 저장');
  const ans = {};
  many.forEach((q, i) => {
    ans[q.id] = q.type === 'choice' ? '기타: 값' + i : q.type === 'checks' ? ['가', '기타: 값' + i] : q.type === 'number' ? i : q.type === 'date' ? '2026-10-01' : q.type === 'rating' ? 1 + (i % 5) : q.type === 'agree' ? true : '글' + i;
  });
  eq(submit(A정, idF, ans).ok, true, 'F. 60문항 신청');
  eq(results(idF).stats.length, many.filter((q) => ['choice', 'checks', 'number', 'rating'].indexOf(q.type) !== -1).length, 'F. 집계 문항 수');
  ok(Date.now() - t0 < 5000, 'F. 60문항 저장 · 신청 · 집계가 5초 안 (' + (Date.now() - t0) + 'ms)');
  throws(() => run((api) => api.formSave(A정, base({ questions: [] }))), /팀장|권한|커미티/, 'F. 일반 교인은 신청서를 만들 수 없음');
  throws(() => run((api) => api.formResults(A정, idA)), /팀장|권한|커미티/, 'F. 일반 교인은 결과를 볼 수 없음');
  const idG = save(base({ title: '이상한 유형', questions: [{ id: 'z', type: 'nope', label: 'x' }] }));
  eq(get(idG).questions[0].type, 'text', 'F. 알 수 없는 유형은 주관식으로');
  const rt = require('../lib/runtime');
  ['서식정리2_', '별점답정리2_', '기타값정리2_', '결과집계2_', '답표시2_'].forEach((n) => ok(!rt.isCallable(n), 'F. ' + n + ' 는 화면에서 못 부름'));
  ok(rt.isCallable('formSave') && rt.isCallable('formResults'), 'F. 기존 화면 함수는 그대로 부를 수 있음');

  process.exit(T.summary() ? 0 : 1);
})();
