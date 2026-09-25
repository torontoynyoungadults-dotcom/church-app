# 토론토영락교회 청년1부 시스템 — Render 버전

Apps Script 웹앱을 Render(Node.js) 서버로 옮긴 버전입니다.
**데이터는 그대로 같은 구글 시트**에 있고, 사진 · 영수증 · 악보는 같은 드라이브 폴더, 일정은 같은 구글 캘린더를 씁니다.

## 무엇이 바뀌었나

| 예전 (Apps Script) | 지금 (Render) |
|---|---|
| `script.google.com/.../exec?page=portal` | `https://<앱이름>.onrender.com/?page=portal` (`?page=` 규칙은 같습니다) |
| 화면의 `google.script.run…` | `callServer('함수', [인자], 성공, 실패)` (`public/app.js`) |
| `Code.gs` | `logic/app.js` — 업무 로직은 그대로입니다 |
| SpreadsheetApp · DriveApp · CalendarApp · MailApp … | `lib/google.js` 가 구글 API로 똑같이 만들어 줍니다 |
| 메일 (MailApp) | Gmail SMTP (앱 비밀번호) |
| 시트 메뉴 '셀보고 관리' | `https://<앱>/tasks` 화면 |
| 트리거 (월 8:00 · 주일 16:30) | 서버 안 시계 + 바깥 알림(아래 5번) |
| `onEdit` 캐시 비우기 | 시트 수정 시각을 10초마다 확인해서 자동으로 |

## 폴더 구조

```
server.js            서버 입구 (화면 · /api · /tasks · /cron)
logic/app.js         업무 로직 (예전 Code.gs)
views/*.html         화면들 (Theme.html 은 모든 화면에 자동으로 들어갑니다)
public/app.js        화면 → 서버 호출 도우미
public/logo.png      로고 (예전 Logo.html)
lib/google.js        시트 · 드라이브 · 캘린더 · 메일 연결
lib/worker.js        구글 API를 실제로 부르는 작업자
lib/scheduler.js     자동 발송 시각
lib/tasks.js         관리 작업 화면
scripts/             리프레시 토큰 받기 · 설정 점검
```

기존 저장소의 `public/` 에 예전 HTML 파일들을 넣어 두셨다면 지워주세요 (이제 `views/` 에 있습니다).

---

## 설정 순서

### 1. 구글 클라우드 — API 켜기
[Google Cloud Console](https://console.cloud.google.com/) → 청년부 프로젝트 → **API 및 서비스 → 라이브러리** 에서
**Google Sheets API · Google Drive API · Google Calendar API** 세 개를 "사용"으로.

### 2. 청년부 계정 권한(리프레시 토큰) 받기 — 권장
서비스 계정은 드라이브에 파일을 **소유할 수 없어서** 사진 · 영수증 · 악보 올리기가 실패합니다.
그래서 예전 Apps Script 처럼 **청년부 구글 계정 권한**으로 돌게 합니다.

1. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 "외부", 앱 이름만 넣고 저장.
   그다음 **"앱 게시"(프로덕션으로)** 를 눌러주세요. "테스트" 상태로 두면 7일마다 토큰이 만료됩니다.
   (확인되지 않은 앱 경고가 떠도 청년부 계정 혼자 쓰는 것이라 괜찮습니다.)
2. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 유형 "데스크톱 앱"**. ID · 시크릿을 복사.
3. 내 컴퓨터의 이 폴더에서:
   ```
   npm install
   GOOGLE_CLIENT_ID=복사한ID GOOGLE_CLIENT_SECRET=복사한시크릿 npm run auth
   ```
   나오는 주소를 열고 **청년부 구글 계정**으로 로그인 → 허용. 터미널에 찍힌 토큰을 복사합니다.

### 3. Gmail 앱 비밀번호
청년부 구글 계정 → 보안 → **2단계 인증 켜기** → [앱 비밀번호](https://myaccount.google.com/apppasswords) 에서 하나 만들기 (16자리).

### 4. Render 설정
- **Build Command**: `npm install`  · **Start Command**: `npm start`
- **Environment** 에 넣을 값:

| 이름 | 값 |
|---|---|
| `SPREADSHEET_ID` | 구글 시트 주소의 `/d/` 와 `/edit` 사이 |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | 2번에서 만든 데스크톱 클라이언트 |
| `GOOGLE_REFRESH_TOKEN` | 2번에서 받은 토큰 |
| `GMAIL_USER` | 청년부 Gmail 주소 (예: torontoyn.youngadults@gmail.com) |
| `GMAIL_APP_PASSWORD` | 3번의 16자리 |
| `CRON_SECRET` | 아무도 모를 긴 글자 (자동 발송 · 처음 설정용) |
| `TZ` | `America/Toronto` (시트 시간대와 같아야 합니다) |
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | (선택) 도메인을 따로 붙였을 때만. 없으면 Render 주소를 자동으로 씁니다 |

예전에 넣어 둔 `GOOGLE_SERVICE_ACCOUNT` 는 리프레시 토큰이 있으면 쓰지 않으니 지워도 됩니다.

배포 후 Render 의 **Shell** 탭에서 `npm run check` 를 실행하면 연결 상태를 점검해 줍니다.

### 5. 자동 발송 (월요일 8시 리마인더 · 주일 4시 반 제출 안내)
서버가 깨어 있으면 알아서 보냅니다. 그런데 **Render 무료 요금제는 15분 동안 접속이 없으면 잠들어서** 시계도 멈춥니다.
[cron-job.org](https://cron-job.org) (무료) 에 아래 두 개를 등록해 두면 확실합니다. 시간대는 Toronto 로.

- 매주 **월요일 08:00**
  `https://<앱>.onrender.com/cron/%EB%AF%B8%EC%A0%9C%EC%B6%9C%EB%A6%AC%EB%A7%88%EC%9D%B8%EB%8D%94?secret=<CRON_SECRET>`
- 매주 **일요일 16:30**
  `https://<앱>.onrender.com/cron/%EC%A3%BC%EC%9D%BC%EB%8F%85%EB%A0%A4?secret=<CRON_SECRET>`

이미 보낸 셀에는 다시 보내지 않으니, 서버 시계와 겹쳐도 두 번 가지 않습니다.
끄고 켜기는 예전처럼 설정 시트의 `리마인더사용` (ON/OFF) 또는 관리 화면에서.

### 6. 포털 '구글 계정으로 들어가기'
설정 시트의 `구글클라이언트ID` 에 해당하는 **웹 클라이언트**의 "승인된 리디렉션 URI" 에 새 주소를 추가하세요:
```
https://<앱>.onrender.com/?page=portal
```
(끝의 `/?page=portal` 까지 정확히. 예전 script.google.com 주소는 지워도 됩니다.)

### 7. 새 링크 나눠주기
`https://<앱>/tasks` → 관리자키 입력 → **설정 · 링크 확인** 을 누르면 새 링크들이 나옵니다.
셀장 · 팀장님들께 포털 새 주소를 알려주세요. (브라우저에 저장된 로그인은 새 주소에서 한 번 다시 하셔야 합니다.)

---

## 알아두면 좋은 것
- **시트를 직접 고쳐도 됩니다.** 10초쯤 안에 화면에 반영됩니다 (`SHEET_CHECK_SECONDS` 로 조절).
- 요청은 한 번에 하나씩 처리합니다. 동시에 두 사람이 저장해도 꼬이지 않습니다 (예전 잠금과 같은 효과).
- 무료 요금제에서 잠든 뒤 첫 접속은 30초~1분 걸릴 수 있습니다. 느린 게 싫으면 Starter 요금제로.
- 캘린더는 예전처럼 설정 시트의 `공개캘린더ID · 리더캘린더ID · 커미티캘린더ID` 를 씁니다. 청년부 계정이 수정 권한을 가진 캘린더여야 합니다.
- 교적 카드 · 보고서 PDF 는 예전처럼 구글 문서 변환으로 만듭니다.
