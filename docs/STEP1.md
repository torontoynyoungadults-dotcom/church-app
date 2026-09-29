# Step 1 — DB 분리 · 개인 권한 · 딥링크 알림

## 0. 먼저 바로잡을 점
프로젝트 지침에는 "Google Apps Script 백엔드"라고 되어 있지만, 실제 코드는 **Node/Express(Render)** 이고
`lib/google.js` 가 Apps Script 의 `SpreadsheetApp/DriveApp/…` 를 googleapis 위에서 흉내 내며 `logic/app.js`(옛 Code.gs)를 그대로 실행합니다.
그래서 Apps Script 를 새로 만들지 않고 이 구조 위에 얹었습니다.

## 1. 지금 있던 것 → 바뀐 것
| 영역 | 있던 것 | 바뀐 것 |
|---|---|---|
| DB | `SPREADSHEET_ID` 시트 1개에 탭 약 60개 | `DB_FOLDER_ID` 가 있으면 폴더 안 **11개 시트**로 라우팅 (탭 이름 → 시트 지도: `lib/db.js`). 없으면 예전과 완전히 동일 |
| 권한 | 역할(셀장·팀장·커미티…)만. 커미티 = 전부 | 역할 위에 **개인 허용/차단 · 위원회 범위 · 셀/팀 범위 · 만료일** (`사용자권한` 탭). 행이 없는 사람은 예전 계산 그대로 |
| 알림 | 푸시/메일 링크 = 메뉴 첫 화면(또는 로그인 없는 페이지) | `?page=portal&go=<종류>&id=<번호>` → 포털이 본인 확인·권한 확인 후 해당 항목(예: 새가족 상세)으로 이동 |

## 2. 11개 시트
DB01 셀 사역 및 관리 · DB02 사역 보고 및 관리 · DB03 재정 · DB04 새가족 · DB05 찬양·방송 허브 · DB06 선교 · DB07 포토앨범 · DB08 회의록 · DB09 신청서 · DB10 주보 · DB11 기타 시스템 자료
파일 이름 앞의 `[DBnn]` 표식으로 찾습니다 (예: `[DB04] 새가족 · Newcomers`). 이름만 비슷해도 찾지만, 표식이 가장 확실합니다.
**확인이 필요한 배정**: `교적` → DB11(시스템), 제자훈련 탭들 → DB02. 바꾸려면 `lib/db.js` 의 `TABS` 한 줄만 옮기면 됩니다.

## 3. 바뀐 파일
- 새 파일: `lib/db.js`, `logic/permissions.js`, `logic/deeplink.js`, `scripts/db-setup.js`, `scripts/fake-google.js`, `scripts/test-step1.js`
- 고친 파일: `lib/google.js`(다중 시트 저장소 · MultiSpreadsheet), `lib/runtime.js`(확장 파일 이어 붙이기 · 쓴 시트 추적), `logic/app.js`(20곳, 아래), `views/NewFamily.html`, `views/Portal.html`, `public/sw.js`, `package.json`, `render.yaml`, `scripts/check-setup.js`
- `logic/app.js` 는 기존 함수를 지우지 않고 **끼워 넣기**만 했습니다: `포털권한_`(예전 계산은 `포털권한예전_` 로 보존), `커미티토큰_`, `포털메뉴_`/`포털관리메뉴_` 반환, `찬양권한_`, `주보등급_`, 알림 URL 생성부, `캐시비움_`.
- 전체 차이: `docs/STEP1-changes.diff`

## 4. 예전 기능이 그대로 유지되는 이유
1. `DB_FOLDER_ID` 가 없으면 새 코드 경로는 전혀 실행되지 않습니다.
2. 새 방식에서도 `SPREADSHEET_ID` 를 남겨 두면 아직 옮기지 않은 탭은 옛 시트에서 읽고 씁니다 (데이터가 갈라지지 않음). 같은 탭이 양쪽에 있으면 새 시트가 우선.
3. `사용자권한` 탭에 행이 없는 사람의 판정은 예전 코드와 같은 결과입니다 (`개인권한적용_` 이 `!p.n` 이면 예전 값을 그대로 반환).
4. 옛 알림 링크는 그대로 동작합니다 (딥링크는 새 URL 형식을 추가할 뿐).

## 5. 전환 순서
```
npm run db:status                 # 현재 상태 · 지도에 없는 탭 · 다른 탭을 참조하는 수식 점검 (아무것도 안 바꿈)
npm run db:create                 # 폴더에 빠진 시트 만들기
npm run db:migrate                # 미리보기
npm run db:migrate -- --apply     # 복사 + 값 비교 검증 (옛 시트는 지우지 않음)
# Render 환경 변수에 DB_FOLDER_ID 추가 → 재배포. SPREADSHEET_ID 는 확인이 끝날 때까지 유지
npm run db:migrate -- --apply --overwrite   # 전환 전 옛 시트가 또 수정됐다면 다시 복사
```
※ 시트 안에서 **다른 탭을 참조하는 수식**은 시트가 나뉘면 깨집니다. `db:status` 가 찾아 줍니다.

## 6. 권한 모델
판정 순서: 관리자키/마스터 → 개인 **차단** → 역할로 열림(커미티라서 열린 경우, 위원회 범위 회원은 자기 위원회 메뉴만) → 개인 **허용**(범위 있으면 그 셀/팀만) → 막음.
- 서버가 실제로 지키는 메뉴: `leader, team, newfamily, worship, bulletinEdit`, 그리고 `admin.app`(차단만).
- 메뉴 표시에만 반영(다음 단계에서 서버 강제): `album, expense, mission, forms, minutes, acct, admin.*`.
- 위원회 = 사역팀 시트의 `부서`. 기본 묶음은 **제안값**이며 `설정` 시트의 `위원회메뉴_<이름>` / `위원회공통메뉴` 로 바꿉니다:
  예배영성부: worship, bulletinEdit, team · 선교행정부: team · 양육부: newfamily, leader, team · 회계: acct, expense · 공통: album, minutes, expense
- 관리 API: `permissionAdminInit / savePermission / deletePermission / explainPermission / myPermissions`

## 7. 딥링크
`딥링크주소_(type,id,x)` 로 만들고 `resolveDeepLink(token,type,id,x)` 가 검증합니다. 종류: `newcomer, minutes, album, mission, cell`.
푸시 payload 에는 토큰이 들어가지 않습니다 (포털이 저장된 로그인으로 라우팅). 공지/알림 직접 입력 칸에서는 `newcomer:홍길동`, `cell:1셀@2026-09-27` 같은 줄임 표기도 됩니다.
서비스워커는 알림 URL 이 같은 출처인지 확인합니다.

## 8. 알려진 한계 (솔직하게)
1. **관리자키 우회**: 커미티에게 주는 관리 링크에 관리자키가 들어 있어, 링크를 아는 사람은 위원회 제한을 우회할 수 있습니다. 위원회 범위 회원에게는 관리자키를 아예 싣지 않도록 막았지만, 근본 해결은 Step 2(Admin 화면/API 를 토큰 기반으로) 입니다.
2. 미션/신청서/회의록/앨범/지출/회계에 있는 직접 `커미티` 검사는 아직 엔진을 거치지 않습니다 (Step 2).
3. 위 "서버 강제" 목록 밖 메뉴는 개인 허용을 받지 않습니다 (저장 시 거절).
4. 구글에 실제로 붙는 코드(`db-setup.js`, `lib/google.js` 다중 시트)는 **가짜 구글로만** 시험했습니다. 실제 전환 전 `db:migrate` 미리보기부터 확인해 주세요.

## 9. 시험
`npm run test:step1` — 가짜 구글 위에서 160개 항목 (지도 · 함수 중복 · 예전/새 방식 라우팅 · 옛 시트 예비 · 외부 수정 감지 · 권한 · 딥링크 · db-setup).
