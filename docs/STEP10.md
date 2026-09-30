# STEP 10 — 찬양 객원(교적 검색) · 주보 사용자 페이지 · 새가족 화면 보기/검색 · 포털 정리 — 구현 완료

> 2026-09-29. 백엔드는 GAS가 아니라 Node/Express(Render)가 GAS 스타일 코드를 실행하는 구조입니다(`lib/runtime.js`가 `logic/*.js`를 한 스코프로 합침). 따라서 "GAS 코드"는 `logic/step10.js`(신규)와 `logic/app.js`(2곳 수정)입니다. 이름이 `_`로 끝나는 함수는 브라우저에서 부를 수 없습니다.

## 1. 기존에 있던 것 (소스 확인 결과)
- 찬양 편성: `setWorshipSlot(token, date, pos, names[])` — 슬롯에는 **이름 문자열만** 저장. 객원은 이름 직접 입력(`addGuest`)으로만 가능. 권한은 `찬양권한_` → `{canEdit, admin, committee}`.
- 주보: 시트 `주보`의 내용 열 하나에 JSON 문자열. 고정 5구역(`SECTIONS`: 예배 순서 · 성경 본문 · 셀모임 나눔 · 소식 · 섬김이). `saveBulletin`은 허용 키 목록만 저장.
- 포털: `quickMemberSearch`(교인만, 커미티 전용) · `portalViewAs`(교인만) · `resolveDeepLink(token,'newcomer',이름)` → `?page=newfamily&t=…&open=이름`.
- 포털 CSS: `.hero` 와 `.todo .ti` 모두 `backdrop-filter` → 각자 별도의 stacking context. 뒤에 나오는 할 일 카드가 hero 안의 `.qsdrop`(z-index 30)을 덮음. 또 `.ti` 클래스가 할 일 카드와 메뉴 타일 아이콘에 겹쳐 쓰여, 타일 아이콘이 할 일 카드의 패딩·테두리·흐림을 물려받음.

## 2. 바뀐 것
| 요청 | 변경 |
|---|---|
| 1. 찬양/방송 객원을 교적에서 검색 | 신규 `worshipGuestSearch(token, q)` — 이름 · 영문이름 · 전화(3자리 이상) · 셀. 찬양권한 `canEdit` 필요. 이미 찬양/방송 명단에 있는 분은 후보에서 빼고 `hint`로 알림. 최대 12명. 전화는 **뒤 4자리만** 응답. 고른 분은 예전과 똑같이 **이름**으로 `setWorshipSlot`에 저장(저장 방식 불변). 두 선택창(주간 `picker` · 일정표 `drawStPicker`)에 "교적에서 찾기" 추가, "직접 입력"은 그대로. |
| 2. 주보 페이지 추가/삭제 | 주보 JSON에 `pages[]` 추가(최대 12). `kind`: fellowship(셀모임 교제) · column(목회칼럼) · custom. 필드 `id,title,eyebrow,subtitle,author,ref,body,link,linkLabel,keep`. 서버 `주보페이지정리_`가 길이·id·http(s) 링크를 검증. 편집기에 "＋ 추가 페이지" 탭(추가 · 삭제 · ▲▼ 순서 · 강조 툴바 · AI 편집). 보기/미리보기/PDF에서 **섬김이 앞**에 렌더, 위쪽 이동 메뉴에도 표시. `keep`이 켜진 페이지는 다음 주 새 주보에 **제목·꾸밈만** 이어받고 내용은 비움(`주보페이지이어받기_`). |
| 3. 다른 분 화면 보기에 새가족 | 신규 `portalViewTargets`(교인+새가족 목록, 펼칠 때 1회) · `portalViewAsNewcomer`(`portalViewAs`와 같은 모양 + `viewKind:'newcomer'`, 항상 보기 전용, 메뉴 링크·로그인 표 없음). 화면: 교인/새가족 토글. 새가족 화면은 히어로에 단계·상태·담당 표시. |
| 4. 포털 검색 | 신규 `quickSearchAll(token,q)` — 교인은 기존 `quickMemberSearch` 재사용, 새가족은 이름·전화·셀·담당자·단계·"새가족"으로 검색(전화 뒤 4자리만). 결과는 "교인 / 새가족" 묶음, 새가족 줄에 배지. 새가족을 누르면 `resolveDeepLink`로 그 새가족의 상세 화면(`?page=newfamily&open=…`)으로 이동. **z-index 수정**: `.hero{position:relative;z-index:40}`, `.qsdrop{position:absolute;z-index:9999}`(Portal.html 인라인 + portal-lux.css). 검색창 · 결과 · 상세 모달 · 카드에 럭셔리 다크 글래스(주황 글로우 테두리, 층층이 그림자). |
| 5. 내비게이션 | "내 설교 노트"를 프로필 카드에서 빼서 메인 메뉴 줄(오늘의 묵상 옆, 모든 교인)로 이동. `id="notesBtn"` 유지. 제목 "청년부 행정" → "청년부 아카이브 & 예배 관리". 아이콘: 메뉴 타일 · 커미티 관리 카드 · 큰 버튼 · 내 정보 버튼 모두 **상자 48px / 그림 26px**로 통일(이모지 아이콘 포함). 타일 아이콘 클래스 `.ti` → `.ticon`으로 분리해 충돌 제거. |

## 3. 영향받은 파일
- 신규: `logic/step10.js`, `public/portal/portal-lux.css`, `scripts/test-step10.js`, `scripts/browser/e2e-step10.js`, `docs/STEP10.md`
- 수정: `lib/runtime.js`(EXTRA_FILES에 `'step10.js'`), `logic/app.js`(`saveBulletin` 키 허용 + `pages` 정리 2줄, `주보새틀_` 이어받기 1줄), `views/Portal.html`, `views/Worship.html`, `views/Bulletin.html`, `package.json`(`test:step10`)
- **시트 열 · 기존 함수 · 권한 표 변경 없음.** 새 시트도 없음.

## 4. 기존 기능이 유지되는 방법
- 옛 함수(`quickMemberSearch`, `portalViewAs`, `setWorshipSlot`, `getBulletin`…)는 그대로. 새 검색이 실패하면 화면이 예전 `quickMemberSearch`로 되돌아감.
- `pages`가 없는 옛 주보는 그대로 읽히고 그려짐. `pages` 없이 저장하는 예전 화면은 예전 방식 그대로 저장.
- 객원 직접 입력 유지. 객원 검색 결과를 눌러도 시트에는 이름 문자열이 저장.
- `portal-lux.css`를 지우면 예전 모양(기능은 그대로). 정적 파일은 1시간 캐시라 `?v=9`를 붙임.

## 5. 검증
- 신규: `npm run test:step10` — 서버 100 + 브라우저 70 통과. 브라우저 시험은 검색 결과 각 줄에서 `elementFromPoint`가 결과 상자를 가리키는지 확인하고, **예전 CSS로 되돌리면 실제로 가려지는 것을 재현(음성 대조)**.
- 회귀: step1 160 · step3 198 · step4 134 · step6 99 · step7 111 · step8 97, 브라우저 e2e-portal 8 · step4 110 · contrast 12 · step5 39 · step6 86 · step7 72 · budget 37 · full 51 · a 54 · b 27 · c 17 — 모두 통과.

## 6. 참고 · 아직 확인하지 못한 것
- 설교 노트는 하단 탭 바가 아니라 **메인 메뉴 줄**에 넣었습니다(포털이 한 화면 스크롤 구조라 고정 하단 바는 기존 화면 전체에 영향). 하단 바가 필요하면 별도 작업으로 가능.
- 시험은 가짜 구글 + 진짜 server.js + Chromium(390px 모바일 폭)에서 했고, 실제 iOS Safari/Android 실기기와 실제 시트 데이터로는 확인하지 못했습니다. `backdrop-filter` 는 구형 기기에서 단색 배경으로 대체됩니다.
- 새가족 "화면 보기"는 보기 전용입니다(새가족은 포털에 로그인하지 않으므로 그분 이름으로 메뉴를 열 수 없음).
