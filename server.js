const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const app = express();

app.use(express.json());
// public 폴더 안의 HTML 파일들을 웹페이지로 연결
app.use(express.static(path.join(__dirname, 'public')));

// Render.com 서버 환경 변수에서 구글 인증 정보 로드
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // 구글 시트 ID

// Code.gs 에 있던 함수들을 API 경로로 변환하는 부분
// 예시: 예배 데이터 불러오기
app.get('/api/worship', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '예배!A2:E', // 시트 이름 및 범위에 맞춰 수정
    });
    res.json({ success: true, data: response.data.values || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: 포트 ${PORT}`));
