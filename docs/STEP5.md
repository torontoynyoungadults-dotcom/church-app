# Step 5 — 교적 검색 결과 UI (Dark Glassmorphism) + 빠른 그리기

> 원칙: 운영 중인 앱이므로 **기존 기능은 그대로 두고 덧붙였습니다.** 새 파일 2개 + `Admin.html` 2줄. 새 스크립트가 실패하면 예전 목록으로 자동 복귀합니다.

## 1. 무엇이 있었고 · 무엇이 바뀌나
| | 있던 것 | 바뀐 것 |
|---|---|---|
| 위치 | 관리자 화면 **교적 관리**(`sec_dir`) — `#dirList` 에 흰색 줄(`pRow`)을 HTML 문자열로 한꺼번에 그림 | 같은 자리에 **어두운 유리 카드**. 카드 = 머리(사진 · 이름 · 셀/팀 칩 · 출석률) + 펼치면 기존 `personDetail` |
| 검색 | 키를 칠 때마다 전체 다시 그림, `더 보기`를 누르면 지금까지 것을 전부 다시 그림 | 검색 색인 + 24명만 먼저 + 스크롤하면 40명씩 이어 붙임 |
| 그대로인 것 | API(`getDirectory`, `saveDirectoryEntry`…), 시트, 열, 필터(셀 소속 · 소속 셀 없음 · 사역팀 · 분류 · 소속별), 정보 수정 · 사진 · PDF, `OPEN.dir`(펼침 기억) | — |
| Portal 빠른 검색(`qsDrop`) | 이미 어두운 화면 | 손대지 않음 |

## 2. 바뀐 파일
- 새 파일: `public/directory/dir-glass.css`, `public/directory/dir-glass.js`, `scripts/browser/e2e-step5.js`, `docs/STEP5.md`
- 고친 파일: `views/Admin.html` (`</head>` 앞에 `<link>` 1줄 + `<script defer>` 1줄), `package.json` (`test:step5`)

## 3. 빠르게 하는 방법
1. **검색 색인** — 사람마다 검색용 글자를 한 번만 만들어 `WeakMap` 에 보관(`matchPerson` 을 같은 규칙으로 교체). 키 입력은 `indexOf` 만.
2. **조각 그리기** — 처음 24명을 `DocumentFragment` 로 만들어 `replaceChildren` 한 번으로 교체. 나머지는 `IntersectionObserver` 가 700px 앞에서 40명씩 이어 붙임 (`더 보기` 버튼은 예비).
3. **복제 그리기** — `<template>` 한 장을 `cloneNode` + `textContent` (HTML 파싱 · `esc()` 불필요, XSS 안전).
4. **화면 밖 건너뛰기** — 카드에 `content-visibility:auto` + `contain-intrinsic-size: auto 82px`.
5. **프레임당 1번** — `oninput` 을 `requestAnimationFrame` 으로 묶음.
6. **이벤트 위임** — 목록에 리스너 1개 (카드마다 `onclick` 없음). 키보드(Enter/Space) · `aria-expanded` 지원.

> "DOM 가상화" 대신 이 방식을 고른 이유: 펼친 카드의 높이가 제각각이고 화면 전체가 스크롤이라, 윈도잉(위아래 빈 칸 계산)은 스크롤 튐 위험이 큽니다. 조각 그리기 + `content-visibility` 가 같은 효과를 훨씬 안전하게 냅니다.

## 4. 디자인
반투명 어두운 패널 위에 카드 = `backdrop-filter: blur(14px) saturate(150%)` + 얇은 유리 테두리 + 안쪽 상단 하이라이트 + 부드러운 그림자, 주황(`#F07A4E`) 강조. 셀=주황 · 사역팀=초록 · 선교=청록 · 셀 없음=회색 · 배정 대기=노랑 칩. 출석률 80%↑ 초록 / 60%↑ 노랑 / 미만 빨강. 찾은 글자는 `<mark>`. 펼친 정보와 수정 칸도 같은 어두운 톤. `prefers-reduced-motion` · `prefers-reduced-transparency` 와 `backdrop-filter` 미지원 브라우저용 대체 바탕 포함. 카드 안에서 블러가 겹치지 않도록 **패널에는 블러를 주지 않았습니다**(카드만).

## 5. 예전 기능 보존
- `dir-glass.js` 는 `renderDirectory` 만 교체하고 원본을 보관 → 새 그리기에서 오류가 나면 `__dirGlassOff` 를 켜고 원본으로 복귀(화면이 비지 않음).
- `.js`/`.css` 파일이 아예 없거나 막혀도 `Admin.html` 은 예전 그대로 동작(`defer`).
- 검색 규칙은 예전 `matchPerson` 과 동일 (이름 · 영문 · 이메일 · 카톡 · 주소 부분 일치 / 헌금번호 일치 / 전화 숫자 3자리 이상). 필터는 예전 `dirFiltered()` 를 그대로 호출.
- 저장 뒤 `rerenderCtx('dir')` 로 다시 그려도 펼친 사람 · 보던 스크롤 길이 유지. 검색 결과가 한 명이면 자동으로 펼침(예전과 같음).
- 검색 색인 교체는 `matchPerson` 을 쓰는 셀원 검색(`renderCellSearch`)에도 같은 결과로 적용됩니다.

## 6. 시험 · 측정
`npm run test:step5` — 진짜 크롬 + 가짜 구글, 교적 1,500명 (39개 항목: 첫 그리기 24명 · 스크롤 이어 붙이기 · 검색 규칙 7종 · 자동 펼침 · 펼치기/접기/키보드 · 저장 뒤 유지 · 필터 · 사진 · 안전장치 · 성능).
같은 12개 검색어의 가운데값(클라우드 크롬): 예전 약 5.6ms → 새 약 1.3ms, 그리는 카드는 60명 → 24명. `test:step1`(160) · `test-step3`(198) 그대로 통과.
※ 스마트폰 실기기 수치는 아닙니다(느린 기기에서는 배수로 커짐 — 그래서 첫 화면 분량을 24명으로 제한).

## 7. 알아 둘 점
- `backdrop-filter` 는 오래된 안드로이드에서 무거울 수 있어 `prefers-reduced-transparency` 와 미지원 대체를 넣었습니다. 아주 느린 기기가 있으면 `.dg-card` 의 `backdrop-filter` 한 줄만 지우면 됩니다.
- 스크롤바 길이는 화면 밖 카드를 82px 로 추정해 조금 달라질 수 있습니다(접힌 카드는 보통 80~86px).
- 이 단계에서는 Portal 빠른 검색과 Leader 화면의 별도 `renderDirectory` 는 바꾸지 않았습니다.
