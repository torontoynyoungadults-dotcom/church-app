/**
 * Step 2.12 시험 (순수 로직) — node scripts/test-step212.js
 *  송폼 표기: 마디 수(:8) · 반복(×2) · 직접 입력 · 기도/키 업 · 옛 형식 호환
 */
const T = require('./test-step3'); const { ok, eq, section } = T;
const F = require('../public/worship/formb.js'); const M = require('../public/worship/metro.js');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'worship', 'practice.js'), 'utf8');
const CUE_MAP = {}; (/var CUE_MAP = \{([^}]*)\}/.exec(src)[1].match(/(\w+): '(\w+)'/g) || []).forEach((m) => { const x = /(\w+): '(\w+)'/.exec(m); CUE_MAP[x[1]] = x[2]; });
section('A. 송폼 표기 — 마디 수 · 반복 · 직접 입력');
{
  eq(F.parse('V1:8-C(4)×2-Prayer-키 업:2').map((t) => [t.k, t.rep, t.bars || 0]), [['V1', 1, 8], ['C', 2, 4], ['Prayer', 1, 0], ['KeyUp', 1, 2]], '마디 수 · 반복 · 기도 · 키 업');
  eq(F.stringify(F.parse('V1:8-C:4×2-기도')), 'V1:8-C:4×2-Prayer', '저장 표기 = 마디 수 다음에 반복');
  eq(F.stringify(F.parse('Intro-V1-C-V2×2-B')), 'Intro-V1-C-V2×2-B', '옛 형식(마디 수 없음)은 그대로');
  ok(F.parse('V1-C').every((t) => !t.bars), '옛 형식엔 bars 없음');
  eq(F.parse('C:99')[0].bars, undefined, '범위(1~64) 밖 마디 수는 버림'); eq(F.parse('C:64')[0].bars, 64, '64 는 허용');
  const c = F.parse('마지막 줄 한 번 더:4'); eq([c[0].k, c[0].custom, c[0].bars], ['마지막 줄 한 번 더', true, 4], '직접 입력 글 + 마디 수');
  ok(F.info('Prayer') && F.info('KeyUp'), '기도 · 키 업이 표준 칸'); eq(F.cueFor('Prayer', 'ko'), '기도', '기도 음성(한국어)'); eq(F.cueFor('KeyUp', 'en'), 'Key Up', '키 업 음성(영어)');
  eq(F.pretty('V1:8-C×2'), 'V1 (8마디) › C ×2', '보기 좋은 글');
  eq(F.numbered(F.parse('V-V:4-C')).map((x) => x.bars), [0, 4, 0], 'numbered 가 마디 수를 유지');
  eq(F.parse('Verse 1 > Chorus ×2').map((t) => t.k + t.rep).join(), 'V11,C2', '옛 자유 표기도 그대로');
}
section('B. 큐 연결');
{
  eq(CUE_MAP.Prayer, 'prayer', '기도 칸 → prayer 큐'); eq(CUE_MAP.KeyUp, 'keyup', '키 업 칸 → keyup 큐');
  ok(M.CUE_BY[CUE_MAP.Prayer] && M.CUE_BY[CUE_MAP.KeyUp], '두 큐가 실제로 있음');
}
process.exit(T.summary() ? 0 : 1);
