# STEP 11 — Teva Apps 메뉴 정리 · 포털 UI/UX · 새가족 포털 편집 · 알림/이메일 미리보기 — 구현 완료

> 2026-09-29. 백엔드는 GAS가 아니라 Node/Express(Render)가 GAS 스타일 코드를 실행하는 구조입니다(`lib/runtime.js`가 `logic/*.js`를 한 스코프로 합침). "GAS 코드"는 `logic/step11.js`(신규)와 `logic/app.js`/`step10.js`/`permissions.js`(수정)입니다. 이름이 `_`로 끝나는 함수는 브라우저에서 부를 수 없습니다.

## 1. 기존에 있던 것 (소스 확인 결과)
- 찬양 허브(`Worship.html`)에 **팀원 관리** 탭(`worshipTeams` 등 서버 API + 화면).
- 포털 제목 "청년부 아카이브 & 예배 관리", 메뉴 타일(`포털메뉴_`: leader/team/expense/budget/forms …), 관리 첫 화면(카드 대시보드, Admin.html `sec_home`).
- 푸시 켜기 배너(`#pushBox`), 신청서 목록 상자(`#formsBox`), "내 할 일" 카드.
- `portalViewAs`(교인)은 일부 데이터만, `portalViewAsNewcomer`(step10)는 요약만 반환.
- 알림 이메일은 `알림메일본문_` 한 줄짜리 HTML, 푸시에 안내 문구가 붙음. 미리보기 없음.

## 2. 바뀐 것
| 요청 | 변경 |
|---|---|
| §1-1 찬양 허브 팀원 관리 삭제 | `Worship.html`에서 탭·버튼·스타일·JS 전부 제거. **서버 API(`worshipTeams` 등)는 그대로 둠**(되돌리기 쉽도록). |
| §1-2 제목 | 포털 메뉴 제목 → **Teva Apps**, 관리 화면 제목 → "Teva Apps · 관리". |
| §1-3 하위 메뉴 | `logic/step11.js` `메뉴묶기11_`: **셀모임**(셀 보고서 · 셀원 정보 `?sub=members` · 대리 제출 `?sub=proxy`), **사역팀**(팀 보고서 · 팀원 관리 `?sub=members` · 지출환급신청 → `?page=expense` 바로 이동), **수련회 · 선교 예산/정산**, **일반 신청서 관리**. 메뉴 key는 그대로라 권한·순서 저장값이 유지됨. 지출환급 타일은 사역팀 타일이 있을 때 사역팀 안으로 합쳐짐. |
| §1-4 옛 "관리자 청년부 부분 관리 시스템" | "옛 Admin 첫 화면(카드 대시보드)"으로 해석해 제거. `?page=admin&key=…`를 `#` 없이 열면 포털로 이동. 각 섹션은 독립 메뉴. |
| §2-1 로고/제목 → 포털 홈 | `Theme.html` 위임 클릭 처리 + `goPortalHome()`(프로필·신청서·셀 신청 닫기). 키보드(role=link, tabindex) 지원. |
| §2-2 푸시 배너 → 벨 | `#pushBox` 삭제. 새로고침 버튼 옆 🔔 + 팝오버(상태 · 켜기/끄기). 남의 화면 보기·미지원 브라우저에서는 숨김. **팝오버가 다시 그려질 때 "바깥 클릭"으로 닫히던 버그 수정.** |
| §2-3 배치 | 내 할 일 → 접이식 **알림**(급한 알림이 있으면 기본 펼침). 주보 + 설교 영상 한 줄(같은 높이, 설교 없으면 주보가 전체 폭). 오늘의 묵상 + 내 설교 노트 균형(좁은 폭에서 줄바꿈으로 화살표 겹침 해결). 신청서는 Teva Apps 격자 안 타일. 청년 일정은 그대로. |
| §2-4 화면 보기 1:1 | `portalViewAs`가 `포털자료_`를 그대로 사용(me·todos·forms·cellApp·myCell·badges·sermon). 새가족은 `newcomerHome` 결과 + 같은 렌더러 `nfHomeHtml`(보기 전용 `inert`). **내 정보 관리**·**알림** 포함. |
| §2-5 새가족 포털 편집기 | 새가족 관리 › **포털 화면** 탭: 위젯 8개(환영 고정 · 안내 카드 · 셀 신청 · 내 셀 · 알림 · 신청서 · 바로가기 · 등록정보 고치기) 켜기/끄기·순서·제목·문구·링크 편집, 실제 포털을 iframe으로 실시간 미리보기, 저장/기본값. 설정은 `설정값_('새가족포털설정')` JSON 한 칸. API: `newcomerPortalAdminInit`, `saveNewcomerPortalConfig`, `resetNewcomerPortalConfig`. |
| §3 셀 신청 UI | 객관식 글자 흰색·대비 4.5:1 이상, 테두리·hover·active·선택(주황 + ✓) 상태, 터치 48px. **헌금봉투 신청 버튼**: 라벨 전체가 클릭 영역(투명 input z-index), 48px 이상, 켜짐/꺼짐·비활성(점선 회색) 구분. |
| §4-1 앱 기능 관리 | 탭: **메뉴 순서 · AI 설정 · 일정 관리 · 권한 관리**. |
| §4-2 독립 메뉴 | **설교 · 말씀 관리**(`#word`), **알림 · 이메일 관리**(`#push`)를 관리 카드/권한(`admin.app`)에 독립 항목으로 추가. |
| §4-3 알림/이메일 | 푸시는 제목 40자 · 본문 100자 이내(여러 줄은 " · "로 연결). 이메일은 표 기반 HTML(어두운 헤더 · 주황 띠 · 카드 본문 · 안내 박스 · CTA 버튼 · 교회 꼬리말). 신규 `notificationPreview` — **아무것도 보내지 않고** 앱 푸시 UI + HTML 이메일을 나란히 미리보기(모달에서 고치면 350ms 뒤 갱신, 위 폼에도 반영). |

## 3. 영향받은 파일
- 신규: `logic/step11.js`, `public/portal/portal-step11.css`, `scripts/test-step11.js`, `scripts/browser/e2e-step11.js`, `docs/STEP11.md`
- 수정: `lib/runtime.js`(EXTRA_FILES), `logic/app.js`, `logic/step10.js`, `logic/permissions.js`, `views/Admin.html`, `Portal.html`, `Theme.html`, `Worship.html`, `Leader.html`, `Team.html`, `Forms.html`, `Budget.html`, `NewFamily.html`, `package.json`(`test:step11`), `scripts/browser/e2e-step10.js`·`e2e-step5.js`(의도된 변경 반영)
- **시트 열 · 새 시트 없음.** 기존 API 삭제 없음.

## 4. 기존 기능이 유지되는 방법
- 메뉴 key · 권한 key · 메뉴 순서 저장값 불변(이름과 하위 메뉴만 변경).
- 찬양 허브 팀원 관리는 화면만 제거, 서버 API 보존.
- 새가족 포털 설정이 없으면 기본값(예전 화면과 같은 구성)으로 그려짐. 편집기 "기본값으로" 버튼 제공.
- 알림 종류별 저장 키(`알림_`, `알림메일_`, `알림문구_`)와 발송 함수 시그니처 불변.
- `portal-step11.css`를 지우면 예전 모양(기능은 유지). 정적 파일 1시간 캐시 → `?v=2`.

## 5. 검증
- 신규 `npm run test:step11` — 서버 107 + 브라우저 106 통과.
- 회귀(전부 통과): step1 160 · step2 103 · step3 198 · step4 134 · step6 99 · step7 111 · step8 97 · step9 82 · step10 100 · step28 · step29 · step210 · step211 · step212 · step214 · silent, 브라우저 e2e 전체.
- 이번 작업 중 발견·수정: 벨 팝오버 "켜기" 클릭 직후 닫힘, 묵상/노트 버튼 화살표 겹침.

## 6. 참고 · 아직 확인하지 못한 것
- 시험은 가짜 구글 + 진짜 server.js + Chromium(390px · 1000px · 1280px)에서 했고 iOS Safari / 실기기 / 실제 시트로는 확인하지 못했습니다. 벨(웹 푸시)은 시험용 YNPush로 검증했고 실제 구독은 실기기 확인이 필요합니다.
- 의도적 차이: 다른 분 화면 보기에서 빠른 검색창과 내 설교 노트 버튼은 숨김(비공개 노트 · 기존 시험 기대).
- "관리자 청년부 부분 관리 시스템"은 옛 Admin 첫 화면으로 해석했습니다. 다른 것을 뜻했다면 알려주세요.
- 한글 표기는 임의로 정했습니다(셀모임 · 사역팀 · 수련회 · 선교 예산/정산 · 일반 신청서 관리). 원하시는 표현이 있으면 `logic/step11.js` `메뉴묶기11_` 한 곳에서 바꿉니다.
