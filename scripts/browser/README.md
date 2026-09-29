# 브라우저 시험 (진짜 크롬)
Playwright 가 필요합니다: `npm i -D playwright socket.io-client` 후 `npx playwright install chromium`.
`e2e-lib.js` 맨 위의 `require('.../playwright')` 경로를 본인 환경에 맞게 바꾸세요.
- `node scripts/browser/e2e-a.js`  — 레이아웃 · 리더/따라가기 · 실시간 필기 · 나만 보기/팀 · 오프라인 재연결
- `node scripts/browser/e2e-b.js`  — 메트로놈 박자 안정성 · 큐 타이밍 · 리더 큐 전달 · 송폼 큐
- `node scripts/browser/e2e-c.js`  — 음정 피아노롤(마이크) · 가사 추출 · PNG/PDF 내보내기
- `node scripts/browser/e2e-full.js` — 실제 server.js + Worship 화면 통합 (`PORT=4188`)
