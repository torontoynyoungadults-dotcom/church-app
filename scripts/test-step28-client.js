/**
 * Step 2.8 시험 (브라우저 없이 · 순수 함수) — public/worship/hubtools.js
 *   node scripts/test-step28-client.js
 */
const T = require('../public/worship/hubtools.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const section = (t) => console.log('\n■ ' + t);

section('쪽 범위 읽기 · 쓰기');
eq(T.parseRanges('2-3', 5), { pages: [2, 3], bad: [] }, '2-3');
eq(T.parseRanges('1, 4', 5).pages, [1, 4], '쉼표');
eq(T.parseRanges('3-', 5).pages, [3, 4, 5], '3- = 3쪽부터 끝까지');
eq(T.parseRanges('2~4', 5).pages, [2, 3, 4], '물결표');
eq(T.parseRanges('2–3쪽', 5).pages, [2, 3], '긴 줄표 · "쪽"');
eq(T.parseRanges('3-2', 5).pages, [2, 3], '거꾸로 적어도 됨');
eq(T.parseRanges('전체', 3).pages, [1, 2, 3], '전체');
eq(T.parseRanges('', 3), { pages: [], bad: [] }, '빈 값');
eq(T.parseRanges('4-9', 5), { pages: [4, 5], bad: ['4-9'] }, '범위를 넘으면 가능한 만큼 + 알림');
eq(T.parseRanges('9', 5), { pages: [], bad: ['9'] }, '없는 쪽');
eq(T.parseRanges('0', 5).bad, ['0'], '0쪽은 없음');
eq(T.parseRanges('abc, 2', 5), { pages: [2], bad: ['abc'] }, '이상한 글은 bad');
eq(T.parseRanges('2,2,2-3', 5).pages, [2, 3], '중복 제거');
eq(T.formatRanges([1, 2, 3, 5]), '1-3, 5', '범위로 묶기'); eq(T.formatRanges([]), '', '빈 목록'); eq(T.formatRanges([4, 2]), '2, 4', '정렬');

section('base64 (큰 파일)');
const big = new Uint8Array(300000); for (let i = 0; i < big.length; i++) big[i] = i % 251;
ok(Buffer.from(T.b64(big), 'base64').equals(Buffer.from(big)), '30만 바이트를 나누어 변환해도 그대로');

section('가사 정리 (붙여넣은 글)');
const paste = `Way Maker
Lyrics
공유
[Verse 1]
G       D
You are here, moving in our midst
Em      C
I worship You (Am7)

Chorus
Way maker, miracle worker [G] promise keeper
© 2016 Integrity Music
CCLI 7115744
https://example.com/lyrics
더보기`;
const c1 = T.cleanLyrics(paste);
ok(!/CCLI|©|https|더보기|공유/.test(c1), '저작권 · 주소 · 웹 잡글이 지워짐: ' + JSON.stringify(c1));
ok(!/^\s*G\s+D\s*$/m.test(c1) && !/\[G\]|\(Am7\)/.test(c1), '코드 줄 · 끼워 넣은 코드가 지워짐');
ok(/\[Verse 1\]\nYou are here, moving in our midst\nI worship You/.test(c1), '[Verse 1] 아래에 가사가 이어짐');
ok(/\[Chorus\]\nWay maker, miracle worker\s+promise keeper/.test(c1) || /\[Chorus\]\nWay maker, miracle worker promise keeper/.test(c1), '"Chorus" 줄이 [Chorus] 로 정리됨');
ok(T.cleanLyrics(paste, { keepChords: true }).indexOf('G       D') >= 0 || /G\s+D/.test(T.cleanLyrics(paste, { keepChords: true })), '코드 포함 옵션');
ok(!/\[Verse/.test(T.cleanLyrics(paste, { labels: false })), '[절] 표시 끄기');
eq(T.cleanLyrics('   \n\n  '), '', '빈 글');
eq(T.cleanLyrics('1절\n주님은 나의 목자\n나는 부족함이 없네\n\n후렴\n할렐루야').split('\n')[0], '[Verse 1]', '1절 → [Verse 1]');
ok(T.isJunk('© 2020 abc') && T.isJunk('https://a.b/c') && !T.isJunk('사랑합니다 주님'), '잡글 판별');

eq(T.cleanLyrics('Way Maker\n[Verse 1]\nYou are here', { title: 'Way Maker' }), '[Verse 1]\nYou are here', '맨 위 곡 제목 줄은 지움');
eq(T.cleanLyrics('Way Maker\nWay Maker', { title: 'way maker' }).split('\n').length, 1, '제목 줄은 맨 위 것만(최대 2줄까지) 지움 — 가사 속 같은 줄은 남을 수 있음');
ok(/Way Maker/.test(T.cleanLyrics('You are here\nWay Maker', { title: 'Way Maker' })), '가사 중간의 같은 줄은 지우지 않음');

section('방송 화면 슬라이드');
const sl = T.slidesFrom('[Verse 1]\nline1\nline2\nline3\nline4\nline5\n\n[Chorus]\nc1\nc2', { maxLines: 4 });
eq(sl.map((x) => x.label + ':' + x.lines.length), ['Verse 1:3', ':2', 'Chorus:2'], '5줄은 3+2 로 고르게, 절 이름은 첫 슬라이드에');
eq(T.slidesFrom('a\nb\nc\nd', { maxLines: 2 }).map((x) => x.text), ['a\nb', 'c\nd'], '2줄씩');
eq(T.slidesFrom('a\n\n\nb').length, 2, '빈 줄로 덩어리 나눔'); eq(T.slidesFrom('').length, 0, '빈 가사는 슬라이드 없음');
eq(T.slidesFrom('x\ny\nz', { maxLines: 1 }).length, 3, '1줄씩'); eq(T.slidesFrom('a\r\nb', { maxLines: 4 })[0].lines, ['a', 'b'], 'CRLF');
eq(T.slidesFrom('l1\nl2\nl3\nl4\nl5\nl6\nl7', { maxLines: 4 }).map((x) => x.lines.length), [4, 3], '7줄 = 4+3');

section('검색 링크 (가사를 대신 가져오지 않음)');
const lk = T.searchLinks('주님은 나의 목자');
ok(lk.length >= 2 && lk.every((x) => /^https:\/\//.test(x.url) && x.url.indexOf(encodeURIComponent('주님은 나의 목자')) > 0), '제목이 인코딩되어 검색 주소에 들어감');

console.log(`\n${fail ? '✗ 실패 ' + fail + '건' : '✓ 모두 통과 (통과 ' + pass + ')'}`);
process.exit(fail ? 1 : 0);
