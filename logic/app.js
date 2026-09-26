/**
 * 토론토영락교회 청년부 — 셀모임 보고서 시스템
 * ============================================
 * Render(Node.js) 서버에서 도는 업무 로직입니다. 데이터는 그대로 구글 시트에 있습니다.
 *
 * SpreadsheetApp · DriveApp · CalendarApp · MailApp 같은 이름은 lib/google.js 가
 * 구글 API(시트 · 드라이브 · 캘린더)와 Gmail SMTP 로 똑같이 만들어 넣어 줍니다.
 * 그래서 아래 로직은 예전과 같은 코드 그대로 동작합니다.
 *
 * 서버가 따로 넣어 주는 것 (HOST)
 *  - HOST.baseUrl()      : 이 앱의 주소 (예: https://church-app.onrender.com/)
 *  - HOST.alert(msg)     : 관리 작업(/tasks) 화면에 보여줄 안내
 *  - HOST.schedules()    : 자동 발송 일정 (lib/scheduler.js)
 *  - HOST.accessToken()  : 구글 API 접근 토큰 (엑셀 내보내기용)
 *  - HOST.page(...)      : 화면(views/*.html) 그리기
 *
 * 관리자 인증
 *  - 설정 시트의 `관리자키` 값을 주소에 붙여 접속하거나, 관리자 비밀번호로 로그인합니다.
 *      https://…/?page=admin&key=발급한키
 */

function 앱주소_() { return HOST.baseUrl(); }

var SHEET_설정 = '설정';
var SHEET_셀목록 = '셀목록';
var SHEET_셀원명단 = '셀원명단';
var SHEET_응답원본 = '응답원본';
var SHEET_출결기록 = '출결기록';
var SHEET_명단변경 = '명단변경기록';
var SHEET_리마인더 = '리마인더기록';
var SHEET_주일독려 = '주일독려기록';
var SHEET_교적 = '교적';
var SHEET_새가족 = '새가족';
var SHEET_새가족과정 = '새가족과정';
var SHEET_새가족추적 = '새가족추적';
var SHEET_새가족팀원 = '새가족팀원';
var SHEET_새가족연락 = '새가족연락';
var SHEET_배정알림 = '배정알림기록';
var SHEET_사역팀 = '사역팀';
var SHEET_사역팀원 = '사역팀원';
var SHEET_사역보고서 = '사역보고서';
var SHEET_사역팀원상태 = '사역팀원상태';
var SHEET_제자훈련 = '제자훈련명단';
var SHEET_제자훈련출결 = '제자훈련출결';
var SHEET_지출 = '지출신청';
var SHEET_지출항목 = '지출항목';
var SHEET_지출이력 = '지출처리이력';
var SHEET_예산 = '예산';
var SHEET_헌금신청 = '헌금번호신청';
var SHEET_선교팀 = '선교팀';
var SHEET_선교팀원 = '선교팀원';
var SHEET_선교일정 = '선교팀일정';
var SHEET_선교첨부 = '선교팀자료';
var SHEET_찬양편성 = '찬양편성';
var SHEET_찬양불가 = '찬양불가';
var SHEET_찬양콘티 = '찬양콘티';
var SHEET_찬양악보 = '찬양악보';
var SHEET_찬양주보 = '찬양주보';
var SHEET_찬양댓글 = '찬양댓글';
var SHEET_찬양행사 = '찬양행사';
var SHEET_찬양공지 = '찬양공지';
var SHEET_셀대리 = '셀대리작성자';
var SHEET_찬양녹음 = '찬양녹음';

var HEAD_응답 = ['보고서ID', '타임스탬프', '모임날짜', '셀이름', '제출자', '셀장컨디션', '모임분위기',
                 '출석', '전체', '출석률', '기도제목및특이사항', '양육팀코멘트', '코멘트작성자', '코멘트시각'];
var HEAD_출결 = ['보고서ID', '타임스탬프', '모임날짜', '셀이름', '셀원이름', '상태', '사유', '기타사유'];

var HEAD_교적 = ['이름', '전화번호', '카카오톡', '이메일', '생년월일', '세례여부', '섬기는사역',
                 '성별', '제자훈련', '사진', '제자훈련출석',
                 '영문이름', '주소', '등록일', '멤버십등록일', '헌금번호', '역할', '셀상태', '체류신분', '부모님성함'];

var HEAD_지출 = ['신청번호', '제출시각', '상태', '이메일', '신청자', '연락처', '부서/팀',
                 '지출일', '지출내역', '세전금액', 'HST/GST', '총액', 'Payable To',
                 '식사인원', '식사참석자', '지출사유', '영수증파일', '영수증폴더', '코멘트',
                 '체크번호', '체크발행일', '회계메모', '처리자', '최종수정', '예산', '입력경로'];

var EX_번호 = 0, EX_제출 = 1, EX_상태 = 2, EX_이메일 = 3, EX_신청자 = 4, EX_연락처 = 5, EX_부서 = 6,
    EX_지출일 = 7, EX_내역 = 8, EX_세전 = 9, EX_세금 = 10, EX_총액 = 11, EX_수령인 = 12,
    EX_식사인원 = 13, EX_식사명단 = 14, EX_사유 = 15, EX_영수증 = 16, EX_폴더 = 17, EX_코멘트 = 18,
    EX_체크번호 = 19, EX_체크일 = 20, EX_회계메모 = 21, EX_처리자 = 22, EX_수정 = 23,
    EX_예산 = 24, EX_경로 = 25;

/** 영수증 한 장(또는 한 건)마다 한 줄 — 신청번호로 묶입니다 */
var HEAD_지출항목 = ['신청번호', '순번', '지출내역', '세전금액', 'HST/GST', '합계', '영수증파일'];
var XI_번호 = 0, XI_순번 = 1, XI_내역 = 2, XI_세전 = 3, XI_세금 = 4, XI_합계 = 5, XI_영수증 = 6;

var HEAD_예산 = ['구분', '이름', '연도', '예산액', '메모', '등록시각'];
var BG_구분 = 0, BG_이름 = 1, BG_연도 = 2, BG_금액 = 3, BG_메모 = 4, BG_시각 = 5;

var HEAD_헌금신청 = ['신청시각', '이름', '영문이름', '전화번호', '이메일', '주소',
                     '상태', '헌금번호', '처리시각', '처리자', '메모', '발급조건동의'];
var EV_시각 = 0, EV_이름 = 1, EV_영문 = 2, EV_전화 = 3, EV_이메일 = 4, EV_주소 = 5,
    EV_상태 = 6, EV_번호 = 7, EV_처리시각 = 8, EV_처리자 = 9, EV_메모 = 10, EV_동의 = 11;

var HEAD_선교팀 = ['팀이름', '나라', '시작일', '종료일', '상태', '티케팅', '예산안', '결산안',
                   '핸드북', '보고서', '노트', '등록시각'];
var MT_이름 = 0, MT_나라 = 1, MT_시작 = 2, MT_종료 = 3, MT_상태 = 4, MT_티케팅 = 5,
    MT_예산 = 6, MT_결산 = 7, MT_핸드북 = 8, MT_보고서 = 9, MT_노트 = 10, MT_시각 = 11;

var HEAD_선교팀원 = ['팀이름', '이름', '역할', 'Waiver', '여권사본', '셀출석확인', '세례확인', '메모'];
var MM_팀 = 0, MM_이름 = 1, MM_역할 = 2, MM_waiver = 3, MM_여권 = 4, MM_셀출석 = 5, MM_세례 = 6, MM_메모 = 7;

var HEAD_선교일정 = ['팀이름', '구분', '일시', '편명', '메모'];
var MF_팀 = 0, MF_구분 = 1, MF_일시 = 2, MF_편명 = 3, MF_메모 = 4;
/* 제출 현황마다 붙이는 자료 — 파일(드라이브) 또는 링크(구글시트 등) */
var HEAD_선교첨부 = ['팀이름', '항목', 'ID', '종류', '이름', '주소', '분류', '올린이', '등록시각'];
var MX_팀 = 0, MX_항목 = 1, MX_ID = 2, MX_종류 = 3, MX_이름 = 4, MX_주소 = 5, MX_분류 = 6, MX_올린이 = 7, MX_시각 = 8;

var HEAD_찬양편성 = ['날짜', '포지션', '이름'];
var WA_날짜 = 0, WA_포지션 = 1, WA_이름 = 2;

var HEAD_찬양불가 = ['이름', '날짜', '사유', '등록시각'];
var WB_이름 = 0, WB_날짜 = 1, WB_사유 = 2, WB_시각 = 3;

var HEAD_찬양콘티 = ['날짜', '순서', '찬양제목', '팀', 'Key', '유튜브', '설명', '구분', 'BPM', '송폼', '솔로'];
var WS_날짜 = 0, WS_순서 = 1, WS_제목 = 2, WS_팀 = 3, WS_키 = 4, WS_링크 = 5, WS_설명 = 6,
    WS_구분 = 7, WS_BPM = 8, WS_송폼 = 9, WS_솔로 = 10;

var HEAD_찬양악보 = ['날짜', '파일ID', '파일명', '올린이', '등록시각', '구분'];
var WF_날짜 = 0, WF_파일 = 1, WF_이름 = 2, WF_올린이 = 3, WF_시각 = 4, WF_구분 = 5;

var HEAD_찬양주보 = ['날짜', '토요연습시간', '이주의말씀', '말씀설명', '유튜브재생목록', '방송팀요청', '말씀제목'];
var WW_날짜 = 0, WW_연습 = 1, WW_말씀 = 2, WW_설명 = 3, WW_재생목록 = 4, WW_방송 = 5, WW_제목 = 6;

var HEAD_찬양댓글 = ['날짜', '작성자', '내용', '등록시각', 'ID'];

/* 찬양 화면이 한 번 실행되는 동안만 쓰는 임시값 (캐시비움_ 에서 함께 비웁니다) */
var 찬양명단캐시_ = null;
var 찬양권한캐시_ = {};
var WC_날짜 = 0, WC_작성자 = 1, WC_내용 = 2, WC_시각 = 3, WC_아이디 = 4;

/* 공지사항 · 회의록 */
var HEAD_찬양공지 = ['ID', '구분', '제목', '내용', '작성자', '작성시각', '수정시각', '고정'];
var HEAD_셀대리 = ['셀', '이름', '까지', '지정한사람', '등록시각'];
var HEAD_찬양녹음 = ['날짜', 'ID', '제목', '파일ID', '링크', '올린이', '등록시각', '구분'];
var WR_날짜 = 0, WR_ID = 1, WR_제목 = 2, WR_파일 = 3, WR_링크 = 4, WR_올린이 = 5, WR_시각 = 6, WR_구분 = 7;
var WN_ID = 0, WN_구분 = 1, WN_제목 = 2, WN_내용 = 3, WN_작성자 = 4, WN_작성 = 5, WN_수정 = 6, WN_고정 = 7;

/* 수련회 · 부흥회 · 집회 — 주일이 아닌 예배. ID(ev-…)가 다른 시트의 '날짜' 칸에 들어갑니다 */
var HEAD_찬양행사 = ['ID', '이름', '종류', '날짜', '끝날짜', '연습날짜', '연습시간', '장소', '메모', '만든이', '등록시각', '세션'];
var WE_ID = 0, WE_이름 = 1, WE_종류 = 2, WE_날짜 = 3, WE_끝 = 4, WE_연습날짜 = 5, WE_연습시간 = 6,
    WE_장소 = 7, WE_메모 = 8, WE_만든이 = 9, WE_시각 = 10, WE_세션 = 11;

/** 지출 사유를 반드시 받아야 하는 금액 (청년부 담당 장로님 승인 기준) */
var 지출사유기준액 = 500;

var R_ID = 0, R_TS = 1, R_DATE = 2, R_CELL = 3, R_BY = 4, R_COND = 5, R_MOOD = 6,
    R_PRESENT = 7, R_TOTAL = 8, R_RATE = 9, R_NOTES = 10, R_COMMENT = 11, R_CBY = 12, R_CAT = 13;
var A_ID = 0, A_TS = 1, A_DATE = 2, A_CELL = 3, A_NAME = 4, A_STATUS = 5, A_REASON = 6, A_OTHER = 7;

var FACE_COND = { '충만함': '🕊️', '평안함': '🌿', '지침/지체됨': '🌧️', 'SOS/기도 필요': '🆘',
                 '좋음': '😀', '보통': '🙂', '힘듦': '😔' };
var FACE_MOOD = { '깊고 진솔': '✨', '소소하고 평안': '🌱', '수동적': '💬', '무거움/어려움': '🌧️',
                 '활발': '🔥', '보통': '🙂', '무거움': '🌧️' };

var CHURCH_FOOTER =
  '해외한인장로회 토론토영락교회 &nbsp;|&nbsp; 담임목사 : 전대혁 &nbsp;|&nbsp; 청년1부 목사: 강산<br>' +
  '650 McNicoll Ave. Toronto, ON M2H 2E1<br>' +
  '<a href="https://www.ynchurch.com" style="color:#6A655E;text-decoration:none;">www.ynchurch.com</a>';

/* =========================================================
   1. 최초 설정
   ========================================================= */

function 최초설정__원래() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  createSheet_(ss, SHEET_설정, ['항목', '값', '설명']);
  var 설정 = ss.getSheetByName(SHEET_설정);
  if (설정.getLastRow() < 2) {
    설정.getRange(2, 1, 15, 3).setValues([
      ['알림받을이메일', 'torontoyn.youngadults@gmail.com', '보고서 제출·리마인더 CC 주소 (쉼표로 여러 개)'],
      ['관리자이메일', 'torontoyn.youngadults@gmail.com', '관리 페이지 접근 허용 계정 (쉼표로 여러 개)'],
      ['관리자키', 'yn-' + Utilities.getUuid().slice(0, 8), '관리 페이지 접속용 키. ?page=admin&key=이값'],
      ['관리자비밀번호', '20262027', '관리 페이지 로그인 비밀번호 (숫자로 지정해주세요)'],
      ['모임요일', '0', '0=일 1=월 2=화 3=수 4=목 5=금 6=토'],
      ['리마인더사용', 'ON', 'ON=자동 발송, OFF=중단. 방학 기간에는 OFF'],
      ['리마인더시간', '8', '(참고용) 월요일 발송 시각. 변경은 리마인더트리거설치 함수에서'],
      ['셀시작일', '2026-09-13', '셀모임 시작 주일. 보고서 날짜 목록이 이 날짜부터 표시됩니다'],
      ['마스터비밀번호', '0191', '모든 셀에 접근 가능한 양육팀용 비밀번호 (셀장에게 공유하지 마세요)'],
      ['새가족팀비밀번호', '2024', '새가족팀 페이지 로그인 (?page=newfamily)'],
      ['사역팀마스터비밀번호', '0192', '모든 사역팀에 접근 가능한 커미티용 비밀번호'],
      ['아이콘:leader', '', '셀장 페이지 탭 아이콘 주소 (선택)'],
      ['아이콘:admin', '', '커미티 페이지 탭 아이콘 주소 (선택)'],
      ['아이콘:newfamily', '', '새가족 페이지 탭 아이콘 주소 (선택)'],
      ['아이콘:team', '', '사역팀 페이지 탭 아이콘 주소 (선택)']
    ]);
  }

  createSheet_(ss, SHEET_셀목록, ['셀이름', '셀장이름', '셀장이메일', '셀방번호']);
  createSheet_(ss, SHEET_셀원명단, ['셀이름', '셀원이름']);
  createSheet_(ss, SHEET_응답원본, HEAD_응답);
  createSheet_(ss, SHEET_출결기록, HEAD_출결);
  createSheet_(ss, SHEET_명단변경, ['타임스탬프', '셀이름', '셀원이름', '구분', '사유', '처리자']);
  createSheet_(ss, SHEET_리마인더, ['주차키', '셀이름', '발송시각']);
  createSheet_(ss, SHEET_주일독려, ['주차키', '셀이름', '발송시각']);
  createSheet_(ss, SHEET_교적, HEAD_교적);
  for (var g = 1; g <= HEAD_교적.length; g++) ensureColumn_(ss, SHEET_교적, g, HEAD_교적[g - 1]);
  try {
    ss.getSheetByName(SHEET_교적).getRange(1, D_역할 + 1).setNote(
      '포털 역할 보정 칸입니다. 비워두면 사역팀 시트에서 자동으로 판단합니다.\n' +
      '쉼표로 구분해 적어주세요.\n' +
      '  커미티        → 커미티 권한을 줍니다\n' +
      '  회계팀, 새가족팀 → 해당 권한을 줍니다\n' +
      '  -커미티       → 자동으로 잡힌 권한을 뺍니다\n' +
      '셀장 · 팀장은 셀목록 · 사역팀 시트에서 자동으로 정해집니다.');
  } catch (e) {}

  createSheet_(ss, SHEET_새가족, ['이름', '성별', '생년월일', '연락처',
    '수세여부', '이전출석교회', '직업', '활동계획', '특징', '전담담당자', '등록일', '상태', '배정셀', '배정일', '사진']);
  ensureColumn_(ss, SHEET_새가족, 15, '사진');
  ensureColumn_(ss, SHEET_새가족, 16, '이메일');
  ensureColumn_(ss, SHEET_새가족, 17, '셀신청허용');
  ensureColumn_(ss, SHEET_새가족, 18, '카카오톡');
  createSheet_(ss, SHEET_새가족팀원, ['이름', '기본주차', '순서']);
  createSheet_(ss, SHEET_새가족연락, ['이름', '일자', '담당자', '내용', '작성시각']);
  기본새가족팀원_(ss);
  createSheet_(ss, SHEET_새가족과정, NP_헤더);
  for (var c = 14; c <= NP_헤더.length; c++) ensureColumn_(ss, SHEET_새가족과정, c, NP_헤더[c - 1]);
  createSheet_(ss, SHEET_새가족추적, ['이름', '확인월', '정착상태', '메모', '작성자', '작성시각']);
  createSheet_(ss, SHEET_배정알림, ['이름', '발송시각']);

  createSheet_(ss, SHEET_사역팀, ['팀이름', '부서', '담당커미티', '팀장이름', '팀장이메일']);
  createSheet_(ss, SHEET_사역팀원, ['팀이름', '팀원이름', '팀내역할']);
  createSheet_(ss, SHEET_사역보고서, ['보고서ID', '타임스탬프', '팀이름', '보고기준일', '제출자',
    '팀분위기', '분위기메모', '팀원변동', '최근사역', '향후사역', '지출필요', '지출내용',
    '기도제목및요청', '커미티코멘트', '코멘트작성자', '코멘트시각', '팀장컨디션']);
  ensureColumn_(ss, SHEET_사역보고서, 17, '팀장컨디션');
  createSheet_(ss, SHEET_사역팀원상태, ['보고서ID', '팀이름', '팀원이름', '상태']);
  createSheet_(ss, SHEET_제자훈련, ['이름', '등록일', '메모', '회비', '회비일', '회비메모']);
  ensureColumn_(ss, SHEET_제자훈련, 4, '회비');
  ensureColumn_(ss, SHEET_제자훈련, 5, '회비일');
  ensureColumn_(ss, SHEET_제자훈련, 6, '회비메모');
  createSheet_(ss, SHEET_제자훈련출결, ['이름', '날짜', '출결', '기록시각']);
  ensureColumn_(ss, SHEET_셀목록, 4, '셀방번호');

  createSheet_(ss, SHEET_지출, HEAD_지출);
  for (var e = 1; e <= HEAD_지출.length; e++) ensureColumn_(ss, SHEET_지출, e, HEAD_지출[e - 1]);
  createSheet_(ss, SHEET_지출항목, HEAD_지출항목);
  createSheet_(ss, SHEET_지출이력, ['신청번호', '시각', '상태', '처리자', '메모']);
  createSheet_(ss, SHEET_예산, HEAD_예산);
  createSheet_(ss, SHEET_헌금신청, HEAD_헌금신청);
  createSheet_(ss, SHEET_선교팀, HEAD_선교팀);
  createSheet_(ss, SHEET_선교팀원, HEAD_선교팀원);
  createSheet_(ss, SHEET_선교일정, HEAD_선교일정);
  createSheet_(ss, SHEET_선교첨부, HEAD_선교첨부);
  createSheet_(ss, SHEET_찬양편성, HEAD_찬양편성);
  createSheet_(ss, SHEET_찬양불가, HEAD_찬양불가);
  createSheet_(ss, SHEET_찬양콘티, HEAD_찬양콘티);
  createSheet_(ss, SHEET_찬양악보, HEAD_찬양악보);
  createSheet_(ss, SHEET_찬양주보, HEAD_찬양주보);
  createSheet_(ss, SHEET_찬양댓글, HEAD_찬양댓글);
  createSheet_(ss, SHEET_찬양행사, HEAD_찬양행사);
  createSheet_(ss, SHEET_찬양공지, HEAD_찬양공지);
  createSheet_(ss, SHEET_셀대리, HEAD_셀대리);
  createSheet_(ss, SHEET_찬양녹음, HEAD_찬양녹음);
  for (var w1 = 1; w1 <= HEAD_찬양콘티.length; w1++) ensureColumn_(ss, SHEET_찬양콘티, w1, HEAD_찬양콘티[w1 - 1]);
  for (var w2 = 1; w2 <= HEAD_찬양악보.length; w2++) ensureColumn_(ss, SHEET_찬양악보, w2, HEAD_찬양악보[w2 - 1]);

  기본사역팀_(ss);
  회계설정_();

  HOST.alert(
    '시트 구조가 준비됐습니다.\n\n설정 탭에서 이메일 주소와 모임 요일을 확인해주세요.\n' +
    '관리자키가 자동 생성되어 있습니다 — 관리 페이지 링크에 사용하세요.');
}

/** 기존 시트에 헤더가 없는 컬럼을 안전하게 추가합니다 (배포 후 스키마 확장용) */
var _칸확인 = {};
function ensureColumn_(ss, sheetName, colIndex, header) {
  var ck = '칸|' + sheetName + '|' + colIndex + '|' + header;
  if (_칸확인[ck]) return;
  var c = 캐시_();
  try { if (c && c.get(ck)) { _칸확인[ck] = 1; return; } } catch (e) {}
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return;
  // 시트 폭이 모자라면 먼저 늘립니다 (칸이 늘어난 시트를 안전하게 따라잡기 위해)
  try {
    var max = sh.getMaxColumns();
    if (max < colIndex) sh.insertColumnsAfter(max, colIndex - max);
  } catch (e) {}
  var cell = sh.getRange(1, colIndex);
  if (!String(cell.getValue()).trim()) cell.setValue(header).setFontWeight('bold');
  _칸확인[ck] = 1;
  try { if (c) c.put(ck, '1', 21600); } catch (e) {}
}

/** 최초 1회만 — 사역팀 기본 목록을 채웁니다 */
function 기본사역팀_(ss) {
  var sh = ss.getSheetByName(SHEET_사역팀);
  if (!sh || sh.getLastRow() > 1) return;
  sh.getRange(2, 1, 9, 5).setValues([
    ['Kairos 찬양팀', '예배영성부', '한윤종', '신진우', ''],
    ['HOPE 방송팀', '예배영성부', '한윤종', '김예은', ''],
    ['예배준비팀', '예배영성부', '한윤종', '전선하', ''],
    ['원주민장기팀', '선교행정부', '최지혜', '전선우', ''],
    ['새가족팀', '양육부', '오세희', '최지혜', ''],
    ['회계팀', '회계', '이규원', '이규원', ''],
    ['양육팀', '양육부', '오세희', '오세희', ''],
    ['미디어팀', '선교행정부', '최지혜', '조동휘', ''],
    ['홍보팀', '선교행정부', '최지혜', '박셰리', '']
  ]);
}

/** 최초 1회 — 새가족팀원 기본 명단 */
function 기본새가족팀원_(ss) {
  var sh = ss.getSheetByName(SHEET_새가족팀원);
  if (!sh || sh.getLastRow() > 1) return;
  sh.getRange(2, 1, 4, 3).setValues([
    ['강산 목사', 1, 1],
    ['서지수', 2, 2],
    ['한윤종', 3, 3],
    ['최지혜', 4, 4]
  ]);
}

function createSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); _rowsCache = {}; 캐시판갈기_(); }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

var _rowsCache = {};

/* =========================================================
   빠르게 — 시트를 한 번 읽으면 6시간 동안 구글 캐시에 둡니다.
   어디서든 시트를 고치면 캐시비움_() 이 '판'을 새로 바꿔 모두 다시 읽게 합니다.
   (시트를 직접 고친 경우는 서버가 파일 수정 시각을 보고 알아채 판을 바꿉니다)
   ========================================================= */
var _캐시판 = null;

function 캐시_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }

function 캐시판_() {
  if (_캐시판) return _캐시판;
  var c = 캐시_();
  if (!c) return (_캐시판 = 'x');
  var v = c.get('판');
  if (!v) { v = 'p' + Date.now().toString(36); c.put('판', v, 21600); }
  return (_캐시판 = v);
}

function 캐시판갈기_() {
  _캐시판 = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var c = 캐시_();
  if (c) { try { c.put('판', _캐시판, 21600); } catch (e) {} }
}

/** 날짜는 JSON 을 거치면 글자가 되므로 다시 날짜로 되돌립니다 */
function 날짜되살림_(k, v) {
  return (typeof v === 'string' && v.length === 24 && v.charAt(10) === 'T' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) ? new Date(v) : v;
}

/** 큰 값은 조각내어 넣고 꺼냅니다 (한 칸 100KB 제한) */
function 캐시읽기_(key) {
  var c = 캐시_();
  if (!c) return null;
  try {
    var k = 캐시판_() + '|' + key, head = c.get(k);
    if (!head) return null;
    if (head.charAt(0) !== '#') return JSON.parse(head, 날짜되살림_);
    var n = Number(head.slice(1)), keys = [];
    for (var i = 0; i < n; i++) keys.push(k + '|' + i);
    var got = c.getAll(keys), parts = [];
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; parts.push(got[keys[j]]); }
    return JSON.parse(parts.join(''), 날짜되살림_);
  } catch (e) { return null; }
}

function 캐시쓰기_(key, val, ttl) {
  var c = 캐시_();
  if (!c) return;
  try {
    var k = 캐시판_() + '|' + key, str = JSON.stringify(val), SIZE = 30000;   // 한글은 3바이트라 넉넉히
    if (str.length <= SIZE) { c.put(k, str, ttl || 21600); return; }
    var n = Math.ceil(str.length / SIZE);
    if (n > 60) return;                                      // 너무 큰 시트는 캐시하지 않습니다
    var o = {};
    for (var i = 0; i < n; i++) o[k + '|' + i] = str.slice(i * SIZE, (i + 1) * SIZE);
    c.putAll(o, ttl || 21600);
    c.put(k, '#' + n, ttl || 21600);
  } catch (e) {}
}

function rows_(name) {
  if (_rowsCache[name]) return _rowsCache[name];
  var hit = 캐시읽기_('r:' + name);
  if (hit) return (_rowsCache[name] = hit);
  var sh = sheet_(name);
  var v = [];
  if (sh) {
    var last = sh.getLastRow();
    if (last >= 2) v = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  }
  _rowsCache[name] = v;
  캐시쓰기_('r:' + name, v);
  return v;
}


/** 시트를 수정한 뒤에는 반드시 호출해서 캐시를 버립니다 */
function 캐시비움_() {
  try { SpreadsheetApp.flush(); } catch (e) {}   // 쓴 내용을 먼저 확정한 뒤 판을 바꿉니다
  캐시판갈기_();
  _rowsCache = {};
  _포털역할캐시 = {};
  _교적캐시 = null;
  _출석통계캐시 = null;
  _설정캐시 = null;
  찬양명단캐시_ = null;      // 사역팀 명단에서 뽑아 둔 값이라 함께 비웁니다
  찬양권한캐시_ = {};
  try { CacheService.getScriptCache().remove('찬양멤버v2'); } catch (e) {}   // 명단 · 사진이 바뀌었을 수 있습니다
}

var _설정캐시 = null;

function 설정맵_() {
  if (_설정캐시) return _설정캐시;
  var v = [[]].concat(rows_(SHEET_설정));      // 첫 줄(머리)을 건너뛰던 예전 방식과 맞춥니다
  _설정캐시 = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0]).trim();
    if (k && !(k in _설정캐시)) _설정캐시[k] = String(v[i][1]).trim();
  }
  return _설정캐시;
}

function 설정값_(key) {
  var m = 설정맵_();
  return (key in m) ? m[key] : '';
}

/** 시트 셀 값을 yyyy-MM-dd 문자열로 정규화 (Date 객체든 문자열이든 안전하게 처리) */
function 날짜문자열_(raw) {
  if (raw instanceof Date) return ymd_(raw);
  var t = String(raw || '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  var d = new Date(t);
  if (!isNaN(d.getTime())) return ymd_(d);
  return t;
}

/** 설정값을 yyyy-MM-dd 로 정규화해서 읽습니다 (시트가 날짜형으로 바꿔버려도 안전) */
function 설정날짜_(key, fallback) {
  var v = [[]].concat(rows_(SHEET_설정));
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() !== key) continue;
    var raw = v[i][1];
    if (raw instanceof Date) return ymd_(raw);
    var t = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    if (t) {
      var d = new Date(t);
      if (!isNaN(d.getTime())) return ymd_(d);
    }
    break;
  }
  return fallback;
}

function 설정저장_(key, value) {
  _설정캐시 = null;
  var sh = sheet_(SHEET_설정), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); 캐시비움_(); return; }
  }
  sh.appendRow([key, value, '']);
  캐시비움_();
}

/** 설정 시트에 항목이 없을 때만 추가합니다 (이미 쓰고 계신 값은 건드리지 않습니다) */
function 설정기본값_(key, value, desc) {
  if (key in 설정맵_()) return;                 // 이미 있으면 시트를 다시 읽지 않습니다
  var sh = sheet_(SHEET_설정), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === key) return;
  sh.appendRow([key, value, desc || '']);
  _설정캐시 = null;
  캐시비움_();
}

function ymd_(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(d);
}
function md_(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'M/d') : String(d);
}
function parseYmd_(s) {
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =========================================================
   2. 인증
   ========================================================= */

function isAdmin_(key) {
  var 관리키 = 설정값_('관리자키');
  return !!관리키 && String(key || '').trim() === 관리키;
}

function requireAdmin_(key) {
  if (!isAdmin_(key)) throw new Error('권한이 없습니다. 관리자 링크로 다시 접속해주세요.');
}

/** 명단 변경 기록의 '처리자' 칸 — 웹에서는 접속한 계정을 알 수 없어 화면 종류만 남깁니다 */
function whoami_() { return '웹'; }

/** 관리 작업 결과 메일을 받을 주소 (설정 시트의 관리자이메일 첫 번째) */
function 관리자메일_() {
  return String(설정값_('관리자이메일') || 설정값_('알림받을이메일') || '').split(',')[0].trim();
}

/** 선교중은 불참으로 기록하되 출석으로 인정합니다 */
function 출석인정_(status, reason) {
  return status === '출석' || String(reason || '') === '선교중';
}

/** 불참 사유에 상세 설명이 필요한 항목 */
function 상세필요_(reason) {
  return !!reason && reason !== '선교중';
}

/* ---------- 셀장 로그인 ---------- */

var 셀비번접두 = '셀비번:';

/**
 * 구글 로그인만 쓰기 — 이름 · 전화번호 로그인과 모든 숫자 비밀번호(셀 · 팀 · 새가족 · 마스터 · 관리자 · 회계)를 막습니다.
 * 급할 때는 설정 시트의 '구글로그인만' 을 OFF 로 바꾸면 예전 방식이 다시 열립니다.
 */
function 구글만_() { return String(설정값_('구글로그인만') || 'ON').toUpperCase() !== 'OFF'; }
var 구글만안내 = '포털에서 구글 계정으로 로그인해 주세요.';

function 셀비번_(cellName) { return 구글만_() ? '' : 설정값_(셀비번접두 + cellName); }

function 마스터비번_() { return 구글만_() ? '' : 설정값_('마스터비밀번호'); }

function 마스터_(token) {
  var m = 마스터비번_();
  return !!m && String(token || '').trim() === m;
}

/** 비밀번호가 하나도 설정되지 않았으면 잠금 없이 동작합니다 */
function 셀잠금사용_() {
  var v = [[]].concat(rows_(SHEET_설정));
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().indexOf(셀비번접두) === 0 && String(v[i][1]).trim()) return true;
  }
  return false;
}

/** 셀장이 비밀번호로 로그인 — 본인 셀 정보만 돌려줍니다 */
/** 이름 목록 → { 이름: { s: 작은 사진, l: 큰 사진 } } (사진 있는 사람만) */
function 사진맵_(names) {
  var 교적 = 교적맵_(), out = {};
  names.forEach(function (n) {
    var p = 교적[n];
    if (p && p.photo) out[n] = { s: p.photo, l: p.photoLarge };
  });
  return out;
}

function 셀사진_(cells) {
  var names = [];
  cells.forEach(function (c) { names = names.concat(c.members); });
  return 사진맵_(names);
}

function 팀사진_(teams) {
  var names = [];
  teams.forEach(function (t) { t.members.forEach(function (m) { names.push(m.name); }); });
  return 사진맵_(names);
}

function leaderLogin(password) {
  password = String(password || '').trim();
  if (!password) throw new Error('비밀번호를 입력해주세요.');

  var cells = getCells();

  // 포털에서 넘어온 경우 — 이름·전화번호로 이미 본인 확인이 끝났습니다
  var me = 포털본인_(password);
  if (me) {
    var r = 포털역할_(me.name);
    var 전체 = r.roles.indexOf('커미티') !== -1;
    var mine = 전체 ? cells : cells.filter(function (c) { return r.cells.indexOf(c.name) !== -1; });
    if (!mine.length) throw new Error('맡고 계신 셀이 없습니다. 커미티에 문의해주세요.');
    return {
      token: password, master: 전체, cells: mine, photos: 셀사진_(mine),
      me: me.name, delegate: 전체 ? {} : (r.delegate || {}),
      defaultDate: ymd_(이번주기준_()), startDate: 설정날짜_('셀시작일', '2026-09-13'),
      today: ymd_(new Date())
    };
  }

  if (마스터_(password)) {
    return {
      token: password, master: true, cells: cells, photos: 셀사진_(cells),
      defaultDate: ymd_(이번주기준_()), startDate: 설정날짜_('셀시작일', '2026-09-13'),
      today: ymd_(new Date())
    };
  }

  for (var i = 0; i < cells.length; i++) {
    var pw = 셀비번_(cells[i].name);
    if (pw && pw === password) {
      return {
        token: password, master: false, cells: [cells[i]], photos: 셀사진_([cells[i]]),
        defaultDate: ymd_(이번주기준_()), startDate: 설정날짜_('셀시작일', '2026-09-13'),
        today: ymd_(new Date())
      };
    }
  }
  if (구글만_()) throw new Error(구글만안내);
  throw new Error('비밀번호가 올바르지 않습니다. 양육팀에 문의해주세요.');
}

/** 토큰이 이 셀에 대한 권한을 갖는지 확인 */
function requireCell_(token, cellName) {
  if (isAdmin_(token) || 마스터_(token)) return;
  // 포털에서 온 요청은 역할로만 판단합니다 (비밀번호 미설정 시의 통과 규칙을 타지 않도록)
  if (포털해독_(token)) {
    if (포털권한_(token, '셀', cellName)) return;
    throw new Error('이 셀에 대한 권한이 없습니다. 커미티에 문의해주세요.');
  }
  if (구글만_()) throw new Error(구글만안내);
  if (!셀잠금사용_()) return;
  var pw = 셀비번_(String(cellName || '').trim());
  if (!pw || pw !== String(token || '').trim()) {
    throw new Error('이 셀에 대한 권한이 없습니다. 다시 로그인해주세요.');
  }
}

/* ---------- 셀 보고서 대리 작성자 ----------
   셀장이 못 나오는 주에 셀원 한 분을 기간을 정해 대리 작성자로 지정합니다.
   지정된 분은 본인 구글 로그인으로 포털에 들어가면 그 기간 동안만 '셀모임 보고서' 가 보이고,
   보고서 작성 · 수정만 할 수 있습니다 (셀원 정보 · 비밀번호 · 이메일 · 셀원 빼기 · 보고서 삭제는 안 됩니다).
   ------------------------------------------ */

/** '2026-09-27' → '9/27' */
function 월일_(ymd) {
  var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  return m ? Number(m[1]) + '/' + Number(m[2]) : String(ymd || '');
}

/** 아직 기간이 남은 대리 지정 → [{cell, name, until, by, at}] */
function 셀대리목록_() {
  var 오늘 = ymd_(new Date());
  return rows_(SHEET_셀대리).map(function (r) {
    var until = r[2] instanceof Date ? ymd_(r[2]) : String(r[2] || '').trim();
    return {
      cell: String(r[0] || '').trim(), name: String(r[1] || '').trim(), until: until,
      by: String(r[3] || '').trim(), at: r[4] instanceof Date ? ymd_(r[4]) : String(r[4] || '')
    };
  }).filter(function (d) {
    return d.cell && d.name && /^\d{4}-\d{2}-\d{2}$/.test(d.until) && d.until >= 오늘;
  });
}

/** 이 토큰이 이 셀에 '대리 작성자로만' 들어온 거면 그 사람 이름, 아니면 '' */
function 대리본인_(token, cellName) {
  var me = 포털본인_(token);
  if (!me) return '';
  var r = 포털역할_(me.name);
  if (r.roles.indexOf('커미티') !== -1) return '';
  return (r.delegate || {})[String(cellName || '').trim()] ? me.name : '';
}

/** 셀장 본인만 할 수 있는 일 (대리 작성자는 막습니다) */
function requireCellLeader_(token, cellName) {
  requireCell_(token, cellName);
  if (대리본인_(token, cellName)) throw new Error('대리 작성자는 보고서 작성 · 수정만 할 수 있습니다.');
}

/** 대리 작성자를 정할 수 있는 사람 — 그 셀 셀장, 커미티, 양육팀(관리자 · 마스터). 정한 사람 이름을 돌려줍니다 */
function 대리지정자_(token, cellName) {
  var cell = findCell_(cellName);
  if (isAdmin_(token) || 마스터_(token)) return '양육팀';
  var me = 포털본인_(token);
  if (me) {
    var r = 포털역할_(me.name);
    if (r.roles.indexOf('커미티') !== -1 || cell.leader === me.name) return me.name;
    throw new Error('대리 작성자는 셀장님이나 커미티만 정할 수 있습니다.');
  }
  var pw = 셀비번_(cellName);
  if (pw && pw === String(token || '').trim()) return cell.leader || '셀장';
  throw new Error('권한이 없습니다. 다시 로그인해주세요.');
}

function 대리시트_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_셀대리) || createSheet_(ss, SHEET_셀대리, HEAD_셀대리);
}

/** 기간 지난 줄은 정리하고, 남길 줄 + 새 줄로 시트를 다시 씁니다 */
function 대리다시쓰기_(버릴까, 새줄) {
  var sh = 대리시트_();
  var 남길 = 셀대리목록_().filter(function (d) { return !버릴까(d); })
    .map(function (d) { return [d.cell, d.name, d.until, d.by, d.at]; });
  var 결과 = 남길.concat(새줄 || []);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEAD_셀대리.length).clearContent();
  if (결과.length) {
    sh.getRange(2, 1, 결과.length, HEAD_셀대리.length).setNumberFormat('@').setValues(결과);
  }
  캐시비움_();
}

/**
 * 대리 작성자 지정 — until: 'yyyy-MM-dd' (그날까지 포함, 최대 60일)
 * 같은 셀에 같은 분이 이미 있으면 기간만 바꿉니다.
 */
function setCellDelegate(token, cellName, name, until) {
  cellName = String(cellName || '').trim();
  name = String(name || '').trim();
  until = String(until || '').trim();
  var by = 대리지정자_(token, cellName);
  var cell = findCell_(cellName);

  if (!name) throw new Error('대리 작성자 이름을 적어주세요.');
  if (name === cell.leader) throw new Error('셀장님 본인은 지정할 필요가 없습니다.');
  var info = 교적맵_()[name];
  if (!info) throw new Error('교적에 없는 이름입니다. 대리 작성자는 본인 구글 로그인으로 들어오므로 교적에 있는 이름이어야 합니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('언제까지인지 날짜를 골라주세요.');
  if (until < ymd_(new Date())) throw new Error('지난 날짜로는 지정할 수 없습니다.');
  var 한계 = new Date(); 한계.setDate(한계.getDate() + 60);
  if (until > ymd_(한계)) throw new Error('대리 기간은 최대 60일까지입니다.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    대리다시쓰기_(function (d) { return d.cell === cellName && d.name === name; },
      [[cellName, name, until, by, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')]]);
  } finally { lock.releaseLock(); }

  대리안내메일_(info, cell, until, by);
  return getCells();
}

function removeCellDelegate(token, cellName, name) {
  cellName = String(cellName || '').trim();
  name = String(name || '').trim();
  대리지정자_(token, cellName);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    대리다시쓰기_(function (d) { return d.cell === cellName && d.name === name; }, []);
  } finally { lock.releaseLock(); }
  return getCells();
}

/** 지정된 분께 안내 메일 (교적에 이메일이 있을 때만 — 실패해도 지정은 그대로) */
function 대리안내메일_(info, cell, until, by) {
  if (!info.email || !/@/.test(info.email)) return;
  try {
    var url = (앱주소_() || '') + '?page=portal';
    MailApp.sendEmail({
      to: info.email,
      subject: '[청년1부] ' + cell.name + ' 셀모임 보고서 대리 작성 안내',
      htmlBody:
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#1C1C1C;">' +
        '<p style="font-size:12px;letter-spacing:.14em;color:#8E8880;margin:0 0 14px;">YNTORONTO · CELL REPORT</p>' +
        '<h2 style="font-size:19px;margin:0 0 14px;">' + esc_(info.name) + '님, 셀 보고서를 부탁드려요</h2>' +
        '<p style="font-size:14.5px;line-height:1.75;margin:0 0 18px;">' + esc_(by) + '님이 <b>' + esc_(cell.name) +
          '</b> 셀모임 보고서 대리 작성자로 ' + esc_(info.name) + '님을 지정했습니다.<br><b>' + 월일_(until) +
          '</b>까지 포털에 <b>셀모임 보고서</b> 메뉴가 보입니다.</p>' +
        '<a href="' + url + '" style="display:inline-block;background:#1C1C1C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">포털 열기</a>' +
        '<p style="font-size:12.5px;color:#8E8880;line-height:1.7;margin:22px 0 0;">본인 구글 계정으로 로그인하시면 됩니다. 기간이 지나면 메뉴는 저절로 사라집니다.</p></div>'
    });
  } catch (e) {}
}

/** 셀장이 직접 알림 받을 이메일을 등록·변경 */
function changeCellEmail__원래(token, cellName, email) {
  cellName = String(cellName || '').trim();
  requireCellLeader_(token, cellName);

  email = String(email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('이메일 주소 형식을 확인해주세요.');
  }

  var sh = sheet_(SHEET_셀목록), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === cellName) {
      sh.getRange(i + 1, 3).setValue(email);
      return { email: email };
    }
  }
  throw new Error('셀을 찾을 수 없습니다.');
}

/** 셀장이 직접 자기 셀 비밀번호를 변경 */
function changeCellPassword(token, cellName, newPassword) {
  cellName = String(cellName || '').trim();
  requireCellLeader_(token, cellName);

  if (마스터_(token)) throw new Error('마스터 비밀번호로는 셀 비밀번호를 변경할 수 없습니다.');

  newPassword = String(newPassword || '').trim();
  if (!/^[0-9]+$/.test(newPassword)) throw new Error('숫자만 사용해주세요.');
  if (newPassword.length < 4) throw new Error('숫자 4자리 이상으로 정해주세요.');
  if (newPassword === String(token || '').trim()) throw new Error('기존 비밀번호와 다르게 정해주세요.');

  var cells = getCells();
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].name !== cellName && 셀비번_(cells[i].name) === newPassword) {
      throw new Error('다른 셀에서 사용 중인 비밀번호입니다. 다른 번호로 정해주세요.');
    }
  }

  설정저장_(셀비번접두 + cellName, newPassword);
  return { token: newPassword };
}

function setCellPassword(key, cellName, password) {
  requireAdmin_(key);
  cellName = String(cellName || '').trim();
  password = String(password || '').trim();
  if (!cellName) throw new Error('셀 이름이 없습니다.');
  if (!/^[0-9]+$/.test(password)) throw new Error('셀 비밀번호는 숫자만 사용해주세요.');
  if (마스터_(password)) throw new Error('마스터 비밀번호와 같은 번호는 사용할 수 없습니다.');
  if (password.length < 4) throw new Error('비밀번호는 숫자 4자리 이상으로 정해주세요.');

  var cells = getCells();
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].name !== cellName && 셀비번_(cells[i].name) === password) {
      throw new Error('이미 ' + cells[i].name + '에서 사용 중인 비밀번호입니다.');
    }
  }
  설정저장_(셀비번접두 + cellName, password);
  캐시비움_();
  return getCellPasswords(key);
}

function getCellPasswords(key) {
  requireAdmin_(key);
  var out = {};
  getCells().forEach(function (c) { out[c.name] = 셀비번_(c.name); });
  return out;
}

/** 관리 페이지 로그인 */
function adminLogin(password) {
  if (구글만_()) throw new Error(구글만안내);
  var pw = 설정값_('관리자비밀번호');
  if (!pw) throw new Error('비밀번호가 설정되지 않았습니다. 설정 시트를 확인해주세요.');
  if (String(password || '').trim() !== pw) throw new Error('비밀번호가 올바르지 않습니다.');
  return 설정값_('관리자키');
}

/* ---------- 회계 전용 권한 ----------
   회계팀은 관리 페이지에서 회계 영역만 열 수 있도록 키를 따로 씁니다. */

function 회계키_() {
  회계설정_();
  var k = 설정값_('회계팀키');
  if (!k) { k = 'ac-' + Utilities.getUuid().slice(0, 8); 설정저장_('회계팀키', k); }
  return k;
}

function acctLogin(password) {
  if (구글만_()) throw new Error(구글만안내);
  회계설정_();
  var pw = 설정값_('회계팀비밀번호');
  if (!pw) throw new Error('회계팀 비밀번호가 설정되지 않았습니다. 커미티에 문의해주세요.');
  if (String(password || '').trim() !== pw) throw new Error('비밀번호가 올바르지 않습니다.');
  return 회계키_();
}

function isAcct_(key) {
  if (isAdmin_(key)) return true;
  var k = 설정값_('회계팀키');
  return !!k && String(key || '').trim() === k;
}

function requireAcct_(key) {
  if (!isAcct_(key)) throw new Error('회계 권한이 없습니다. 다시 로그인해주세요.');
}

/** 관리 페이지가 어떤 영역을 열어줄지 판단합니다 */
function getScope(key) {
  return { admin: isAdmin_(key), acct: isAcct_(key) };
}

/** 설정 확인용 — 관리 작업(/tasks) 화면에서 실행합니다 */
function 설정확인() {
  var base = 앱주소_() || '(배포 후 확인 가능)';
  HOST.alert(
    '★ 모두에게 나눠줄 링크 (포털) ★\n' + base + '?page=portal\n' +
    '  이름 + 전화번호 10자리로 들어가면 각자 역할에 맞는 메뉴가 열립니다.\n\n' +
    '관리자이메일: [' + 설정값_('관리자이메일') + ']\n' +
    '관리자키: [' + 설정값_('관리자키') + ']\n' +
    '시간대: ' + Session.getScriptTimeZone() + '\n\n' +
    '관리 페이지 링크:\n' +
    (앱주소_() || '(배포 후 확인 가능)') +
    '?page=admin&key=' + 설정값_('관리자키') + '\n\n' +
    '새가족팀 링크:\n' +
    (앱주소_() || '(배포 후 확인 가능)') + '?page=newfamily\n\n' +
    '사역팀 링크:\n' +
    (앱주소_() || '(배포 후 확인 가능)') + '?page=team\n\n' +
    '지출환급신청서 링크 (누구나 접근 가능):\n' +
    (앱주소_() || '(배포 후 확인 가능)') + '?page=expense');
}

/* =========================================================
   3. 웹앱 진입점
   ========================================================= */

/* 커미티가 "화면 보기"로 다른 사람으로 들어온 경우 — 모든 페이지 맨 위에 경고를 띄웁니다 */
var _보기이름 = '';

function doGet(e) {
  var p = (e && e.parameter) || {};
  _보기이름 = String(p.as || '').trim().slice(0, 30);
  // 주소만 치고 들어오면 포털로 (예전 메일의 ?cell=… 링크는 셀모임 보고서로)
  var page = p.page || (p.cell ? 'leader' : 'portal');

  if (page === 'admin') {
    // 키나 소유자 계정이면 바로 통과, 아니면 Admin 화면에서 비밀번호를 묻습니다
    // (포털에서 회계 관리로 들어오면 회계키를, 커미티면 관리자키를 URL에 실어 보냅니다)
    var scope = (String(p.scope || '') === 'acct') ? 'acct' : '';
    var key = '';
    if (scope === 'acct') {
      if (isAcct_(p.key)) key = String(p.key || '').trim();
    } else if (isAdmin_(p.key)) {
      key = 설정값_('관리자키') || String(p.key || '');
    }
    return render_('Admin', scope === 'acct' ? '회계 관리' : '청년1부 관리시스템',
      { key: key, scope: scope }, 'admin');
  }

  if (page === 'cells') {
    return render_('Cells', '셀 신청 · 편성', { key: isAdmin_(p.key) ? (설정값_('관리자키') || '') : '' }, 'admin');
  }

  if (page === 'newfamily') {
    return render_('NewFamily', '새가족 관리', { t: p.t || '' }, 'newfamily');
  }

  if (page === 'forms') {
    var fpre = { t: p.t || '', key: isAdmin_(p.key) ? (설정값_('관리자키') || '') : '' };
    try { if (fpre.t || fpre.key) fpre.init = formAdminInit(fpre.key || fpre.t); } catch (e) { fpre.err = e.message || ''; }
    return render_('Forms', '신청서 관리', fpre, 'admin');
  }

  if (page === 'team') {
    return render_('Team', '사역 보고서', { t: p.t || '' }, 'team');
  }

  if (page === 'expense') {
    return render_('Expense', '지출환급신청서', {}, 'expense');
  }

  if (page === 'portal') {
    return render_('Portal', '토론토영락교회 청년1부', 포털입구_(p), 'portal');
  }

  if (page === 'worship') {
    var wk = isAdmin_(p.key) ? (설정값_('관리자키') || '') : '';
    var wpre = { t: p.t || '', key: wk };
    // 첫 화면 자료를 페이지와 함께 보내 왕복 한 번을 줄입니다
    try { if (wk || p.t) wpre.hub = worshipHub(wk || p.t, ''); } catch (e) { wpre.hubErr = e.message || ''; }
    return render_('Worship', '찬양방송팀 허브', wpre, 'worship');
  }

  if (page === 'calendar') {
    var cpre = {};
    try { cpre.cal = getOpenCalendar(''); } catch (e) { cpre.err = e.message || ''; }
    return render_('Calendar', '청년부 일정 · 토론토영락교회 청년1부', cpre, 'portal');
  }

  if (page === 'bulletin') {
    var bpre = { edit: p.edit ? 1 : 0, t: p.t || '', date: p.date || '' };
    // 보는 화면은 주보를 함께 실어 보내 바로 열리게 합니다
    if (!bpre.edit) { try { bpre.data = getBulletin(p.date || ''); } catch (e) { bpre.err = e.message || ''; } }
    return render_('Bulletin', bpre.edit ? '주보 편집' : '토론토영락교회 청년1부 주보', bpre, 'bulletin');
  }

  if (page === 'mission') {
    return render_('Mission', '선교팀 관리',
      { t: p.t || '', team: p.team || '',
        key: isAdmin_(p.key) ? (설정값_('관리자키') || '') : '' }, 'mission');
  }

  return render_('Leader', '셀모임 보고서', {
    cell: p.cell || '', date: p.date || '', action: p.action || '', t: p.t || ''
  }, 'leader');
}

/** 화면 하나를 그립니다 — views/<file>.html 에 PREFILL 값을 실어 보냅니다 */
function render_(file, title, params, iconKey) {
  params = params || {};
  // 어느 페이지든 맨 위 로고 → 포털 첫 화면, 오른쪽 위 ↻ → 새로고침 (Theme 가 씁니다)
  var base = 앱주소_() || '';
  params._base = base;
  params._home = base + '?page=portal';
  if (_보기이름) params._as = _보기이름;
  // 설정 시트에 아이콘 주소가 있으면 탭 아이콘으로 사용합니다
  return HOST.page(file, title, params, 설정값_('아이콘:' + iconKey) || '');
}

/* =========================================================
   4. 셀 / 셀원
   ========================================================= */

function getCells() {
  var 목록 = rows_(SHEET_셀목록), 명단 = rows_(SHEET_셀원명단);
  var 대리 = 셀대리목록_();
  return 목록.filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    var n = String(r[0]).trim();
    return {
      delegates: 대리.filter(function (d) { return d.cell === n; })
        .map(function (d) { return { name: d.name, until: d.until, by: d.by }; }),
      name: n,
      leader: String(r[1] || '').trim(),
      email: String(r[2] || '').trim(),
      room: String(r[3] || '').trim(),
      members: 명단.filter(function (m) {
        return String(m[0]).trim() === n && String(m[1]).trim();
      }).map(function (m) { return String(m[1]).trim(); })
    };
  });
}

/** 셀방 번호 설정 (양육팀 전용) */
function setCellRoom(key, cellName, room) {
  requireAdmin_(key);
  cellName = String(cellName || '').trim();
  room = String(room || '').trim();
  ensureColumn_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_셀목록, 4, '셀방번호');

  var sh = sheet_(SHEET_셀목록), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === cellName) {
      sh.getRange(i + 1, 4).setValue(room);
      캐시비움_();
  return getCells();
    }
  }
  throw new Error('셀을 찾을 수 없습니다.');
}

function findCell_(cellName) {
  var cells = getCells();
  for (var i = 0; i < cells.length; i++) if (cells[i].name === cellName) return cells[i];
  throw new Error('존재하지 않는 셀입니다.');
}

function getLeaderInit() {
  return {
    locked: 구글만_() || 셀잠금사용_(),
    cells: (구글만_() || 셀잠금사용_()) ? [] : getCells(),
    defaultDate: ymd_(이번주기준_()),
    startDate: 설정날짜_('셀시작일', '2026-09-13'),
    today: ymd_(new Date())
  };
}

function addMember(token, cellName, memberName) {
  cellName = String(cellName || '').trim();
  requireCell_(token, cellName);
  memberName = String(memberName || '').trim();
  if (!memberName) throw new Error('셀원 이름을 입력해주세요.');
  if (findCell_(cellName).members.indexOf(memberName) !== -1) throw new Error('이미 명단에 있는 이름입니다.');

  sheet_(SHEET_셀원명단).appendRow([cellName, memberName]);
  sheet_(SHEET_명단변경).appendRow([new Date(), cellName, memberName, '추가', '', whoami_()]);
  캐시비움_();
  return getCells();
}

function removeMember(token, cellName, memberName, reason) {
  cellName = String(cellName || '').trim();
  requireCellLeader_(token, cellName);
  memberName = String(memberName || '').trim();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('제거 사유를 입력해주세요.');
  findCell_(cellName);

  var sh = sheet_(SHEET_셀원명단), v = sh.getDataRange().getValues(), found = false;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]).trim() === cellName && String(v[i][1]).trim() === memberName) {
      sh.deleteRow(i + 1); found = true; break;
    }
  }
  if (!found) throw new Error('명단에서 찾을 수 없습니다.');

  sheet_(SHEET_명단변경).appendRow([new Date(), cellName, memberName, '제거', reason, whoami_()]);
  캐시비움_();
  return getCells();
}

/* =========================================================
   5. 셀 관리 (양육팀)
   ========================================================= */

function 셀이름만들기_(leader) { return String(leader || '').trim() + ' 셀'; }

function addCell(key, leader, email) {
  requireAdmin_(key);
  leader = String(leader || '').trim();
  email = String(email || '').trim();

  if (!leader) throw new Error('셀장 이름을 입력해주세요.');
  if (leader.indexOf('@') !== -1) {
    throw new Error('셀장 이름 자리에 이메일이 들어왔습니다. 이름과 이메일 칸을 확인해주세요.');
  }

  var name = 셀이름만들기_(leader), 기존 = getCells();
  for (var i = 0; i < 기존.length; i++) {
    if (기존[i].name === name) throw new Error('이미 있는 셀입니다: ' + name);
  }

  sheet_(SHEET_셀목록).appendRow([name, leader, email]);

  // 셀장을 셀원 명단에 기본으로 넣어둡니다
  sheet_(SHEET_셀원명단).appendRow([name, leader]);
  sheet_(SHEET_명단변경).appendRow([new Date(), name, leader, '추가', '셀장 등록 시 자동 추가', whoami_()]);

  캐시비움_();
  return getCells();
}

function updateCellLeader(key, oldName, newLeader, newEmail) {
  requireAdmin_(key);
  newLeader = String(newLeader || '').trim();
  if (!newLeader) throw new Error('셀장 이름을 입력해주세요.');
  var newName = 셀이름만들기_(newLeader);
  var sh = sheet_(SHEET_셀목록), v = sh.getDataRange().getValues();

  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === newName && newName !== oldName) {
      throw new Error('이미 있는 셀 이름입니다: ' + newName);
    }
  }
  for (var k = 1; k < v.length; k++) {
    if (String(v[k][0]).trim() === oldName) {
      sh.getRange(k + 1, 1, 1, 3).setValues([[newName, newLeader, String(newEmail || '').trim()]]);
      break;
    }
  }
  if (newName !== oldName) {
    renameInColumn_(SHEET_셀원명단, 0, oldName, newName);
    renameInColumn_(SHEET_응답원본, R_CELL, oldName, newName);
    renameInColumn_(SHEET_출결기록, A_CELL, oldName, newName);
    var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('[셀] ' + oldName);
    if (tab) tab.setName('[셀] ' + newName);
  }
  캐시비움_();
  return getCells();
}

function renameInColumn_(sheetName, col, oldV, newV) {
  var sh = sheet_(sheetName), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][col]).trim() === oldV) sh.getRange(i + 1, col + 1).setValue(newV);
  }
  캐시비움_();
}

function removeCell(key, name) {
  requireAdmin_(key);
  name = String(name || '').trim();
  if (!name) throw new Error('삭제할 셀 이름이 전달되지 않았습니다.');

  var 있음 = getCells().filter(function (c) { return c.name === name; }).length > 0;
  if (!있음) throw new Error('존재하지 않는 셀입니다: ' + name);

  deleteRowsWhere_(SHEET_셀목록, 0, name);
  deleteRowsWhere_(SHEET_셀원명단, 0, name);
  캐시비움_();
  return getCells();
}

function deleteRowsWhere_(sheetName, col, value) {
  var sh = sheet_(sheetName), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][col]).trim() === value) sh.deleteRow(i + 1);
  캐시비움_();
}

/* =========================================================
   교적(셀원 정보) 조회
   ========================================================= */

var D_이름 = 0, D_전화 = 1, D_카카오 = 2, D_이메일 = 3, D_생일 = 4, D_세례 = 5, D_사역 = 6,
    D_성별 = 7, D_제자훈련 = 8, D_사진 = 9, D_훈련출석 = 10,
    D_영문 = 11, D_주소 = 12, D_등록일 = 13, D_멤버십 = 14, D_헌금번호 = 15, D_역할 = 16, D_셀상태 = 17,
    D_체류 = 18, D_부모 = 19;

/**
 * 커미티만 보는 칸 — 셀장 · 팀장 화면으로는 나가지 않습니다.
 * (주소 · 헌금번호 같은 정보는 교적 관리에서만 다룹니다)
 */
var 교적비공개 = ['address', 'joinedAt', 'memberSince', 'envelopeNo', 'cellStatus'];

function 교적축약_(info) {
  var out = {};
  for (var k in info) if (교적비공개.indexOf(k) === -1) out[k] = info[k];
  return out;
}

/**
 * 누가 어디에 속했는지를 한 번에 모읍니다 — 셀 · 사역팀 · 선교팀.
 * (교적 화면마다 따로 읽지 않도록 한 번만 훑습니다)
 */
function 소속맵_() {
  var out = { cells: {}, teams: {}, missions: {} };

  rows_(SHEET_셀원명단).forEach(function (r) {
    var n = String(r[1] || '').trim(), c = String(r[0] || '').trim();
    if (!n || !c) return;
    (out.cells[n] = out.cells[n] || []);
    if (out.cells[n].indexOf(c) === -1) out.cells[n].push(c);
  });

  rows_(SHEET_사역팀원).forEach(function (r) {
    var n = String(r[TM_이름] || '').trim(), t = String(r[TM_팀] || '').trim();
    if (!n || !t) return;
    (out.teams[n] = out.teams[n] || []).push({ team: t, role: String(r[TM_역할] || '').trim() });
  });
  사역팀목록_().forEach(function (t) {
    var n = String(t.leader || '').trim();
    if (!n) return;
    var mine = (out.teams[n] = out.teams[n] || []);
    if (!mine.filter(function (x) { return x.team === t.name; }).length) {
      mine.push({ team: t.name, role: '팀장' });
    }
  });

  rows_(SHEET_선교팀원).forEach(function (r) {
    var n = String(r[MM_이름] || '').trim(), t = String(r[MM_팀] || '').trim();
    if (!n || !t) return;
    var roles = String(r[MM_역할] || '').split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    (out.missions[n] = out.missions[n] || []).push({ team: t, role: roles.join(' · ') });
  });

  return out;
}

/** 한 사람에게 소속 정보를 붙입니다 */
function 소속붙이기_(p, 소속) {
  p.cells = 소속.cells[p.name] || [];
  p.cell = p.cells[0] || '';
  p.teams = 소속.teams[p.name] || [];
  p.missions = 소속.missions[p.name] || [];
  return p;
}

var _교적캐시 = null;

function 교적맵_() {
  if (_교적캐시) return _교적캐시;
  var map = {};
  rows_(SHEET_교적).forEach(function (r) {
    var name = String(r[D_이름] || '').trim();
    if (!name) return;
    var birthday = 날짜문자열_(r[D_생일]);
    map[name] = {
      name: name,
      phone: String(r[D_전화] || '').trim(),
      kakao: String(r[D_카카오] || '').trim(),
      email: String(r[D_이메일] || '').trim(),
      birthday: birthday,
      birthdayDisplay: 나이표시_(birthday),
      baptized: String(r[D_세례] || '').trim(),
      ministry: String(r[D_사역] || '').trim(),
      gender: String(r[D_성별] || '').trim(),
      discipleship: String(r[D_제자훈련] || '').trim(),
      trainingRate: String(r[D_훈련출석] || '').trim(),
      engName: String(r[D_영문] || '').trim(),
      address: String(r[D_주소] || '').trim(),
      joinedAt: 날짜문자열_(r[D_등록일]),
      memberSince: 날짜문자열_(r[D_멤버십]),
      envelopeNo: String(r[D_헌금번호] || '').trim(),
      roleTags: String(r[D_역할] || '').trim(),
      cellStatus: String(r[D_셀상태] || '').trim(),
      residency: String(r[D_체류] || '').trim(),
      parents: String(r[D_부모] || '').trim(),
      photo: 사진주소_(String(r[D_사진] || '').trim(), 240),
      photoLarge: 사진주소_(String(r[D_사진] || '').trim(), 1400)
    };
  });
  _교적캐시 = map;
  return map;
}

/** 생년월일(YYYY-MM-DD)을 받아 "YYYY-MM-DD (만 ##세)" 형태로 반환. 형식이 아니면 원문 그대로 */
function 나이표시_(birthday) {
  var s = String(birthday || '').trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;

  var by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3]);
  var today = new Date();
  var age = today.getFullYear() - by;
  var hadBirthdayThisYear = (today.getMonth() + 1 > bm) || (today.getMonth() + 1 === bm && today.getDate() >= bd);
  if (!hadBirthdayThisYear) age--;
  if (age < 0 || age > 130) return s;

  return s + ' (만 ' + age + '세)';
}

function 빈교적_(name) {
  return {
    name: name, phone: '', kakao: '', email: '', birthday: '', birthdayDisplay: '',
    baptized: '', ministry: '', gender: '', discipleship: '', trainingRate: '',
    engName: '', address: '', joinedAt: '', memberSince: '', envelopeNo: '', roleTags: '', cellStatus: '',
    photo: '', photoLarge: '', notFound: true
  };
}

/** 셀+이름 기준 출석 통계 { present, total, rate } */
var _출석통계캐시 = null;

function 출석통계_() {
  if (_출석통계캐시) return _출석통계캐시;
  var stat = {};
  rows_(SHEET_출결기록).forEach(function (r) {
    var k = String(r[A_CELL]).trim() + '||' + String(r[A_NAME]).trim();
    if (!stat[k]) stat[k] = { present: 0, total: 0 };
    stat[k].total++;
    if (출석인정_(r[A_STATUS], r[A_REASON])) stat[k].present++;
  });
  _출석통계캐시 = stat;
  return stat;
}

function 출석붙이기_(info, stat, cellName) {
  var s = stat[cellName + '||' + info.name] || { present: 0, total: 0 };
  info.present = s.present;
  info.totalMeetings = s.total;
  info.rate = s.total ? Math.round((s.present / s.total) * 100) : null;
  return info;
}

/** 양육팀 — 이름으로 셀원 검색. 소속 셀 + 교적 정보를 함께 반환 */
function searchMembers(key, query) {
  requireAdmin_(key);
  query = String(query || '').trim();
  if (!query) throw new Error('검색할 이름을 입력해주세요.');

  var 명단 = rows_(SHEET_셀원명단);
  var 교적 = 교적맵_();
  var 통계 = 출석통계_();
  var seen = {};

  return 명단
    .filter(function (m) { return String(m[1]).trim().indexOf(query) !== -1; })
    .map(function (m) {
      var name = String(m[1]).trim();
      var cell = String(m[0]).trim();
      var key2 = name + '||' + cell;
      if (seen[key2]) return null;
      seen[key2] = true;
      var info = 교적[name] || 빈교적_(name);
      return 출석붙이기_({
        name: name, cell: cell,
        phone: info.phone, kakao: info.kakao, email: info.email,
        birthday: info.birthday, birthdayDisplay: info.birthdayDisplay,
        baptized: info.baptized, ministry: info.ministry,
        gender: info.gender, discipleship: info.discipleship,
        notFound: !!info.notFound
      }, 통계, cell);
    })
    .filter(function (x) { return x; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
}

/** 셀장 — 본인 셀원들의 교적 정보 */
function getMyDirectory(token, cellName) {
  requireCellLeader_(token, cellName);
  cellName = String(cellName || '').trim();
  var cell = findCell_(cellName);
  var 교적 = 교적맵_();
  var 통계 = 출석통계_();
  var 소속 = 소속맵_();
  return cell.members.map(function (name) {
    return 출석붙이기_(소속붙이기_(교적축약_(교적[name] || 빈교적_(name)), 소속), 통계, cellName);
  });
}

/**
 * 셀원 정보 저장 (셀장은 본인 셀원만, 양육팀/마스터는 모두 가능).
 * info: { phone, kakao, email, birthday, baptized, ministry }
 */
function saveMemberInfo(token, cellName, name, info) {
  cellName = String(cellName || '').trim();
  name = String(name || '').trim();
  requireCellLeader_(token, cellName);

  var cell = findCell_(cellName);
  if (cell.members.indexOf(name) === -1) throw new Error('이 셀의 셀원이 아닙니다.');

  교적저장_(name, info);
  return 출석붙이기_(소속붙이기_(교적축약_(교적맵_()[name] || 빈교적_(name)), 소속맵_()), 출석통계_(), cellName);
}

/** 교적 시트에 한 사람의 정보를 저장(없으면 추가)합니다 */
function 교적저장_(name, info) {
  name = String(name || '').trim();
  if (!name) throw new Error('이름을 입력해주세요.');
  info = info || {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var c2 = 8; c2 <= HEAD_교적.length; c2++) ensureColumn_(ss, SHEET_교적, c2, HEAD_교적[c2 - 1]);

  var sh = sheet_(SHEET_교적), v = sh.getDataRange().getValues();
  var targetRow = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][D_이름]).trim() === name) { targetRow = i + 1; break; }
  }
  if (!targetRow) {
    var blank = [];
    for (var z = 0; z < HEAD_교적.length; z++) blank.push('');
    blank[D_이름] = name;
    sh.appendRow(blank);
    targetRow = sh.getLastRow();
  }

  /**
   * 보내온 칸만 고칩니다. 일부만 담아 보내도 나머지가 지워지지 않습니다.
   * 마지막 값 1 = 날짜 칸 (텍스트 서식을 고정해 시트가 날짜형으로 바꾸지 못하게 합니다)
   */
  [[D_전화, 'phone', 0], [D_카카오, 'kakao', 0], [D_이메일, 'email', 0],
   [D_생일, 'birthday', 1], [D_세례, 'baptized', 0], [D_사역, 'ministry', 0],
   [D_성별, 'gender', 0], [D_제자훈련, 'discipleship', 0],
   [D_영문, 'engName', 0], [D_주소, 'address', 0], [D_등록일, 'joinedAt', 1],
   [D_멤버십, 'memberSince', 1], [D_헌금번호, 'envelopeNo', 0], [D_역할, 'roleTags', 0],
   [D_셀상태, 'cellStatus', 0], [D_체류, 'residency', 0], [D_부모, 'parents', 0]
  ].forEach(function (f) {
    if (!info.hasOwnProperty(f[1])) return;
    var val = String(info[f[1]] == null ? '' : info[f[1]]).trim();
    if (f[2] && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      throw new Error(HEAD_교적[f[0]] + '은 날짜 선택으로 입력해주세요.');
    }
    var cell = sh.getRange(targetRow, f[0] + 1);
    if (f[2]) cell.setNumberFormat('@');
    cell.setValue(val);
  });

  캐시비움_();
}

/* ---------- 교적 관리 (커미티) ---------- */

/**
 * 교적·셀원명단·사역팀원을 합쳐 사람 단위로 돌려줍니다. (새가족 과정 중인 분은 제외)
 * 셀이나 사역팀에 속하지 않은 사람도 모두 포함됩니다.
 */
function 교적전체_() {
  var 교적 = 교적맵_();
  var 통계 = 출석통계_();
  var people = {};

  function person(name) {
    name = String(name || '').trim();
    if (!name) return null;
    if (!people[name]) {
      var info = 교적[name] || 빈교적_(name);
      var p = {};
      for (var k in info) p[k] = info[k];
      p.cells = []; p.teams = []; p.missions = [];
      people[name] = p;
    }
    return people[name];
  }

  Object.keys(교적).forEach(person);

  rows_(SHEET_셀원명단).forEach(function (r) {
    var p = person(r[1]);
    var c = String(r[0] || '').trim();
    if (p && c && p.cells.indexOf(c) === -1) p.cells.push(c);
  });

  rows_(SHEET_사역팀원).forEach(function (r) {
    var p = person(r[TM_이름]);
    var t = String(r[TM_팀] || '').trim();
    if (p && t) p.teams.push({ team: t, role: String(r[TM_역할] || '').trim() });
  });

  // 팀장은 팀원 명단에 없어도 그 팀 소속입니다
  사역팀목록_().forEach(function (t) {
    var p = person(t.leader);
    if (!p) return;
    if (!p.teams.filter(function (x) { return x.team === t.name; }).length) {
      p.teams.push({ team: t.name, role: '팀장' });
    }
  });

  rows_(SHEET_선교팀원).forEach(function (r) {
    var p = person(r[MM_이름]);
    var t = String(r[MM_팀] || '').trim();
    if (!p || !t) return;
    var roles = String(r[MM_역할] || '').split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    p.missions.push({ team: t, role: roles.join(' · ') });
  });

  var rmap = 역할맵_();
  return Object.keys(people).map(function (nm) {
    var p = people[nm];
    p.cell = p.cells[0] || '';
    p.autoRoles = Object.keys(rmap[nm] || {});
    p.roles = 역할적용_(rmap[nm], p.roleTags);
    return 출석붙이기_(p, 통계, p.cell);
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
}

function getDirectory(key) {
  requireAdmin_(key);
  var list = 교적전체_();
  return {
    list: list,
    total: list.length,
    withCell: list.filter(function (p) { return p.cells.length; }).length,
    noCell: list.filter(function (p) { return !p.cells.length; }).length,
    inTeam: list.filter(function (p) { return p.teams.length; }).length,
    missing: list.filter(function (p) { return p.notFound; }).length,
    cells: getCells().map(function (c) { return c.name; }),
    teams: 사역팀목록_().map(function (t) { return t.name; })
  };
}

/* ---------- 교적 내보내기 ---------- */

var 교적내보내기헤더 = ['이름', '영문이름', '성별', '생년월일', '전화번호', '이메일', '카카오톡', '주소',
  '헌금번호', '청년부등록일', '멤버십등록일', '소속셀', '셀상태', '사역팀', '선교팀', '세례여부',
  '제자훈련', '제자훈련출석', '출석률', '출석', '총모임', '포털역할'];

function exportDirectory(key) {
  requireAdmin_(key);
  var list = 교적전체_();
  if (!list.length) throw new Error('내보낼 교적이 없습니다.');

  var H = 교적내보내기헤더;
  var data = list.map(function (p) {
    return [
      p.name, p.engName, p.gender, p.birthday, p.phone, p.email, p.kakao, p.address,
      p.envelopeNo, p.joinedAt, p.memberSince,
      (p.cells || []).join(', '), p.cells && p.cells.length ? '' : (p.cellStatus || '미분류'),
      (p.teams || []).map(function (t) { return t.team + (t.role ? '(' + t.role + ')' : ''); }).join(', '),
      (p.missions || []).map(function (t) { return t.team + (t.role ? '(' + t.role + ')' : ''); }).join(', '),
      p.baptized, p.discipleship, p.trainingRate,
      p.rate === null || p.rate === undefined ? '' : p.rate / 100,
      p.present || 0, p.totalMeetings || 0,
      (p.roles || []).join(', ')
    ];
  });

  var fname = '청년1부_교적_' + ymd_(new Date());
  var tmp = null;
  try {
    tmp = SpreadsheetApp.create(fname);
    var sh = tmp.getSheets()[0];
    sh.setName('교적');
    sh.getRange(1, 1, 1, H.length).setValues([H])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    sh.getRange(2, 1, data.length, H.length).setValues(data);
    sh.getRange(2, 19, data.length, 1).setNumberFormat('0%');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(1);
    for (var c = 1; c <= H.length; c++) sh.setColumnWidth(c, c === 8 ? 260 : 120);
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + HOST.accessToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return {
        name: fname + '.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        b64: Utilities.base64Encode(res.getBlob().getBytes()),
        count: list.length
      };
    }
  } catch (e) {
    // 아래 CSV로 넘어갑니다
  } finally {
    if (tmp) { try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e2) {} }
  }

  var csv = [H].concat(data).map(function (r) {
    return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  return {
    name: fname + '.csv', mime: 'text/csv;charset=utf-8',
    b64: Utilities.base64Encode('﻿' + csv, Utilities.Charset.UTF_8),
    count: list.length, fallback: true
  };
}

/* ---------- 개인 교적 카드 (PDF) ---------- */

/** 사진을 파일에 직접 담아 PDF에서도 보이게 합니다 */
function 사진데이터_(name) {
  var v = rows_(SHEET_교적);
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][D_이름]).trim() !== name) continue;
    var id = String(v[i][D_사진] || '').trim();
    if (!id) return '';
    try {
      var blob = DriveApp.getFileById(id).getBlob();
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) { return ''; }
  }
  return '';
}

function directoryPdf(key, name) {
  requireAdmin_(key);
  name = String(name || '').trim();
  var p = 교적한장_(name);
  if (!p) throw new Error('교적에서 찾을 수 없습니다: ' + name);

  var html = 교적카드Html_(p, 사진데이터_(name));
  var blob = Utilities.newBlob(html, MimeType.HTML, name + '.html').getAs(MimeType.PDF);
  return {
    name: '교적_' + name + '_' + ymd_(new Date()) + '.pdf',
    mime: 'application/pdf',
    b64: Utilities.base64Encode(blob.getBytes())
  };
}

function 교적카드Html_(p, photo) {
  var 줄 = function (k, v) {
    return '<tr><th>' + k + '</th><td>' + (v === '' || v == null ? '&mdash;' : v) + '</td></tr>';
  };
  var 팀 = (p.teams || []).map(function (t) {
    return esc_(t.team) + (t.role ? ' <span class="r">' + esc_(t.role) + '</span>' : '');
  }).join('<br>');
  var 선교 = (p.missions || []).map(function (t) {
    return esc_(t.team) + (t.role ? ' <span class="r">' + esc_(t.role) + '</span>' : '');
  }).join('<br>');
  var 출석 = p.attendance
    ? p.attendance.rate + '% <span class="r">' + p.attendance.present + ' / ' + p.attendance.total + '회</span>'
    : '';
  var 셀 = (p.cells && p.cells.length)
    ? esc_(p.cells.join(', '))
    : '소속 셀 없음' + (p.cellStatus ? ' <span class="r">' + esc_(p.cellStatus) + '</span>' : '');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page { size: A4; margin: 17mm 16mm; }' +
    'body { font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; color: #1A1917; margin: 0; }' +
    '.top { display: flex; align-items: center; gap: 22px; border-bottom: 2.5px solid #1A1917; padding-bottom: 20px; }' +
    '.ph { width: 104px; height: 104px; border-radius: 52px; object-fit: cover; flex: none; }' +
    '.phx { width: 104px; height: 104px; border-radius: 52px; background: #F1EFEB; flex: none; }' +
    '.nm { font-size: 30pt; font-weight: 800; letter-spacing: -1.2pt; line-height: 1.1; }' +
    '.en { font-size: 13pt; color: #6E6962; margin-top: 5px; letter-spacing: .3pt; }' +
    '.tag { display: inline-block; font-size: 9pt; font-weight: 700; background: #1A1917; color: #fff;' +
      ' padding: 3px 11px; border-radius: 20px; margin: 9px 5px 0 0; }' +
    '.org { font-size: 9pt; color: #8B857C; letter-spacing: 2pt; margin-bottom: 9px; font-weight: 700; }' +
    'h2 { font-size: 10pt; letter-spacing: 2.4pt; color: #8B857C; margin: 26px 0 9px; font-weight: 800; }' +
    'table { width: 100%; border-collapse: collapse; }' +
    'th, td { text-align: left; vertical-align: top; padding: 9px 4px; border-bottom: 1px solid #E4E1DB; font-size: 11.5pt; }' +
    'th { width: 118px; color: #8B857C; font-weight: 700; font-size: 10pt; }' +
    'td { font-weight: 500; }' +
    '.r { color: #8B857C; font-size: 9.5pt; font-weight: 400; }' +
    '.foot { margin-top: 30px; border-top: 1px solid #E4E1DB; padding-top: 11px;' +
      ' font-size: 8.5pt; color: #A39D95; display: flex; justify-content: space-between; }' +
    '</style></head><body>' +

    '<div class="org">TORONTO YOUNGNAK CHURCH &nbsp;·&nbsp; YOUNG ADULTS</div>' +
    '<div class="top">' +
      (photo ? '<img class="ph" src="' + photo + '">' : '<div class="phx"></div>') +
      '<div><div class="nm">' + esc_(p.name) + '</div>' +
        (p.engName ? '<div class="en">' + esc_(p.engName) + '</div>' : '') +
        (p.roles || []).map(function (r) { return '<span class="tag">' + esc_(r) + '</span>'; }).join('') +
      '</div>' +
    '</div>' +

    '<h2>연락처</h2><table>' +
      줄('전화번호', esc_(p.phone)) + 줄('이메일', esc_(p.email)) +
      줄('카카오톡', esc_(p.kakao)) + 줄('주소', esc_(p.address)) +
    '</table>' +

    '<h2>인적사항</h2><table>' +
      줄('생년월일', esc_(p.birthdayDisplay)) + 줄('성별', esc_(p.gender)) +
      줄('세례여부', esc_(p.baptized)) + 줄('헌금봉투번호', esc_(p.envelopeNo)) +
    '</table>' +

    '<h2>교회 등록</h2><table>' +
      줄('청년부 등록일', esc_(p.joinedAt)) + 줄('멤버십 등록일', esc_(p.memberSince)) +
      줄('첫 셀모임 출석', esc_(p.firstSeen)) +
    '</table>' +

    '<h2>소속 · 사역</h2><table>' +
      줄('소속 셀', 셀) + 줄('셀 출석률', 출석) + 줄('사역팀', 팀) + 줄('선교팀', 선교) +
      줄('제자훈련', (esc_(p.discipleship) || '') +
        (p.trainingRate ? ' <span class="r">' + esc_(p.trainingRate) + '</span>' : '')) +
    '</table>' +

    '<div class="foot"><span>토론토영락교회 청년1부 교적</span>' +
      '<span>출력 ' + ymd_(new Date()) + '</span></div>' +
    '</body></html>';
}

/** 커미티 — 교적 정보 저장 (셀 소속과 무관하게 누구나) */
function saveDirectoryEntry(key, name, info) {
  requireAdmin_(key);
  교적저장_(name, info);
  return 교적한사람_(name);
}

function 교적한사람_(name) {
  name = String(name || '').trim();
  return 교적전체_().filter(function (p) { return p.name === name; })[0] || null;
}

/** 교적 사진 보관 폴더 */
function 교적사진폴더_() {
  var id = 설정값_('교적사진폴더');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder('청년부 교적 사진');
  설정저장_('교적사진폴더', folder.getId());
  return folder;
}

/** 교적에서 이 사람의 행 번호(1부터). 없으면 새로 만듭니다 */
function 교적행_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureColumn_(ss, SHEET_교적, 10, '사진');
  var sh = sheet_(SHEET_교적), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][D_이름]).trim() === name) return { sh: sh, row: i + 1, old: String(v[i][D_사진] || '').trim() };
  }
  교적저장_(name, {});
  return 교적행_(name);
}

/** 교적 사진 저장 (dataURL) */
function 교적사진저장_(name, dataUrl) {
  name = String(name || '').trim();
  if (!name) throw new Error('이름이 없습니다.');
  var m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('사진 형식을 읽을 수 없습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('사진이 너무 큽니다.');

  var at = 교적행_(name);
  if (at.old) { try { DriveApp.getFileById(at.old).setTrashed(true); } catch (e) {} }
  var file = 교적사진폴더_().createFile(Utilities.newBlob(bytes, m[1], name + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  at.sh.getRange(at.row, D_사진 + 1).setValue(file.getId());
  캐시비움_();
}

function 교적사진삭제_(name) {
  name = String(name || '').trim();
  var at = 교적행_(name);
  if (at.old) { try { DriveApp.getFileById(at.old).setTrashed(true); } catch (e) {} }
  at.sh.getRange(at.row, D_사진 + 1).setValue('');
  캐시비움_();
}

/** 커미티 — 교적 사진 올리기 (폰에서 줄여서 보낸 dataURL) */
function uploadMemberPhoto(key, name, dataUrl) {
  requireAdmin_(key);
  교적사진저장_(name, dataUrl);
  return 교적한사람_(name);
}

function deleteMemberPhoto(key, name) {
  requireAdmin_(key);
  교적사진삭제_(name);
  return 교적한사람_(name);
}

/** 셀장 — 본인 셀원 사진 올리기/삭제. 셀원 정보(출석률 포함)를 돌려줍니다 */
function 셀원확인_(token, cellName, name) {
  cellName = String(cellName || '').trim();
  requireCellLeader_(token, cellName);
  if (findCell_(cellName).members.indexOf(String(name || '').trim()) === -1) {
    throw new Error('이 셀의 셀원이 아닙니다.');
  }
}

function 셀원정보_(cellName, name) {
  return 출석붙이기_(소속붙이기_(교적축약_(교적맵_()[name] || 빈교적_(name)), 소속맵_()), 출석통계_(), cellName);
}

function uploadCellMemberPhoto(token, cellName, name, dataUrl) {
  셀원확인_(token, cellName, name);
  교적사진저장_(name, dataUrl);
  return 셀원정보_(String(cellName).trim(), String(name).trim());
}

function deleteCellMemberPhoto(token, cellName, name) {
  셀원확인_(token, cellName, name);
  교적사진삭제_(name);
  return 셀원정보_(String(cellName).trim(), String(name).trim());
}



/* =========================================================
   제자훈련 (매주 화요일 · 9주 과정)
   ========================================================= */

var 훈련_이름 = 0, 훈련_등록일 = 1, 훈련_메모 = 2, 훈련_회비 = 3, 훈련_회비일 = 4, 훈련_회비메모 = 5, 훈련_기수 = 6;
var 훈련출결_이름 = 0, 훈련출결_날짜 = 1, 훈련출결_출결 = 2;

/** 제자훈련 설정 { start, weeks, passRate } */
var SHEET_훈련기수 = '제자훈련기수';
var HEAD_훈련기수 = ['ID', '이름', '시작일', '주차수', '수료기준'];
var TC_ID = 0, TC_이름 = 1, TC_시작 = 2, TC_주차 = 3, TC_기준 = 4;

function 훈련기수시트_() {
  var sh = 주보시트_(SHEET_훈련기수, HEAD_훈련기수);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_훈련기수.length).setValues([HEAD_훈련기수]); 캐시비움_(); } } catch (e) {}
  return sh;
}

/**
 * 기수 목록. 아직 없으면 지금 설정으로 첫 기수를 하나 만들어 둡니다
 * (예전 명단은 기수 칸이 비어 있는데, 그건 모두 첫 기수로 봅니다)
 */
function 훈련기수들_() {
  var list = rows_(SHEET_훈련기수).filter(function (r) { return String(r[TC_ID]).trim(); })
    .map(function (r) {
      var w = parseInt(r[TC_주차], 10), p = parseInt(r[TC_기준], 10);
      return { id: String(r[TC_ID]).trim(), name: String(r[TC_이름] || '').trim(),
        start: 날짜문자열_(r[TC_시작]),
        weeks: (w && w > 0 && w <= 52) ? w : 9,
        passRate: (isNaN(p) || p < 0 || p > 100) ? 80 : p };
    });
  if (list.length) return list.sort(function (a, b) { return (b.start || '').localeCompare(a.start || ''); });

  // 처음 — 지금 설정 시트 값으로 1기를 만듭니다
  var w0 = parseInt(설정값_('제자훈련주차수'), 10), p0 = parseInt(설정값_('제자훈련수료기준'), 10);
  var first = { id: 'C1', name: '1기',
    start: 설정날짜_('제자훈련시작일', '2026-09-22'),
    weeks: (w0 && w0 > 0 && w0 <= 52) ? w0 : 9,
    passRate: (isNaN(p0) || p0 < 0 || p0 > 100) ? 80 : p0 };
  try {
    훈련기수시트_().appendRow([first.id, first.name, first.start, first.weeks, first.passRate]);
    캐시비움_();
  } catch (e) {}
  return [first];
}

function 지금기수_() {
  var list = 훈련기수들_();
  var cur = String(설정값_('제자훈련현재기수') || '').trim();
  var hit = list.filter(function (c) { return c.id === cur; })[0];
  return hit || list[0];
}

function 기수찾기_(id) {
  id = String(id || '').trim();
  if (!id) return 지금기수_();
  return 훈련기수들_().filter(function (c) { return c.id === id; })[0] || 지금기수_();
}

/** 이 사람이 이 기수 명단에 있는지 (기수 칸이 비어 있으면 첫 기수) */
function 기수맞나_(row, cohortId, firstId) {
  var v = String(row[훈련_기수] || '').trim();
  if (!v) v = firstId;
  return v === cohortId;
}

function 훈련설정_(cohortId) {
  var c = 기수찾기_(cohortId);
  return { id: c.id, name: c.name, start: c.start, weeks: c.weeks, passRate: c.passRate };
}

/** 시작일부터 매주 같은 요일로 weeks 회 */
function 훈련일정_(cfg) {
  cfg = cfg || 훈련설정_();
  var d = parseYmd_(cfg.start), out = [];
  for (var i = 0; i < cfg.weeks; i++) {
    out.push(ymd_(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i * 7)));
  }
  return out;
}

function saveDiscipleshipConfig(key, cfg) {
  requireAdmin_(key);
  cfg = cfg || {};
  var start = String(cfg.start || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('시작일을 날짜로 선택해주세요.');
  var weeks = parseInt(cfg.weeks, 10);
  if (!weeks || weeks < 1 || weeks > 52) throw new Error('주차 수는 1~52 사이로 입력해주세요.');
  var pass = parseInt(cfg.passRate, 10);
  if (isNaN(pass) || pass < 0 || pass > 100) throw new Error('수료 기준은 0~100 사이 숫자로 입력해주세요.');

  설정저장_('제자훈련시작일', start);
  var sh = sheet_(SHEET_설정), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === '제자훈련시작일') {
      sh.getRange(i + 1, 2).setNumberFormat('@').setValue(start);
      break;
    }
  }
  설정저장_('제자훈련주차수', weeks);
  설정저장_('제자훈련수료기준', pass);
  캐시비움_();
  // 지금 보고 있는 기수에도 같이 반영합니다
  var cur = 지금기수_();
  return saveDiscipleshipCohort(key, { id: cur.id, name: cfg.name || cur.name,
    start: start, weeks: weeks, passRate: pass });
}

function addDiscipleshipMember(key, name, cohortId) {
  requireAdmin_(key);
  name = String(name || '').trim();
  if (!name) throw new Error('이름을 입력해주세요.');
  var 기수들 = 훈련기수들_(), cfg = 훈련설정_(cohortId);
  var 첫기수 = 기수들[기수들.length - 1].id;
  var exists = rows_(SHEET_제자훈련).some(function (r) {
    return String(r[훈련_이름]).trim() === name && 기수맞나_(r, cfg.id, 첫기수);
  });
  if (exists) throw new Error(name + '님은 이미 ' + cfg.name + ' 명단에 있습니다.');
  ensureColumn_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_제자훈련, 훈련_기수 + 1, '기수');
  sheet_(SHEET_제자훈련).appendRow([name, ymd_(new Date()), '', '', '', '', cfg.id]);
  캐시비움_();
  훈련교적반영_(name);
  return getDiscipleship(key, cfg.id);
}

function removeDiscipleshipMember(key, name, cohortId) {
  requireAdmin_(key);
  name = String(name || '').trim();
  var 기수들 = 훈련기수들_(), cfg = 훈련설정_(cohortId);
  var 첫기수 = 기수들[기수들.length - 1].id;
  var sh = sheet_(SHEET_제자훈련), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (!기수맞나_(v[i], cfg.id, 첫기수)) continue;
    if (String(v[i][훈련_이름]).trim() === name) sh.deleteRow(i + 1);
  }
  // 이 기수의 날짜에 해당하는 출결만 지웁니다
  var 날짜들 = {};
  훈련일정_(cfg).forEach(function (d) { 날짜들[d] = 1; });
  var a = sheet_(SHEET_제자훈련출결), av = a.getDataRange().getValues();
  for (var j = av.length - 1; j >= 1; j--) {
    if (String(av[j][훈련출결_이름]).trim() === name && 날짜들[날짜문자열_(av[j][훈련출결_날짜])]) a.deleteRow(j + 1);
  }
  캐시비움_();
  훈련교적반영_(name);
  return getDiscipleship(key, cfg.id);
}

/* ---- 기수 관리 ---- */

/** 기수를 새로 만들거나 고칩니다 */
function saveDiscipleshipCohort(key, c) {
  requireAdmin_(key);
  c = c || {};
  var name = String(c.name || '').trim().slice(0, 40);
  if (!name) throw new Error('기수 이름을 적어주세요. (예: 2026 가을)');
  var start = String(c.start || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('시작일을 골라주세요.');
  var weeks = parseInt(c.weeks, 10);
  if (!weeks || weeks < 1 || weeks > 52) throw new Error('주차 수는 1~52 사이로 적어주세요.');
  var pass = parseInt(c.passRate, 10);
  if (isNaN(pass) || pass < 0 || pass > 100) throw new Error('수료 기준은 0~100 사이로 적어주세요.');

  훈련기수들_();                       // 첫 기수가 없으면 만들어 둡니다
  var sh = 훈련기수시트_(), v = sh.getDataRange().getValues();
  var id = String(c.id || '').trim(), at = 0;
  if (id) { for (var i = 1; i < v.length; i++) if (String(v[i][TC_ID]).trim() === id) { at = i + 1; break; } }
  if (!id) id = 'C' + Date.now().toString(36);
  var row = [id, name, start, weeks, pass];
  if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); at = sh.getLastRow(); }
  sh.getRange(at, TC_시작 + 1).setNumberFormat('@').setValue(start);
  설정저장_('제자훈련현재기수', id);
  캐시비움_();
  return getDiscipleship(key, id);
}

/** 보고 있는 기수를 바꿉니다 */
function setDiscipleshipCohort(key, id) {
  requireAdmin_(key);
  설정저장_('제자훈련현재기수', String(id || '').trim());
  캐시비움_();
  return getDiscipleship(key, id);
}

function deleteDiscipleshipCohort(key, id) {
  requireAdmin_(key);
  id = String(id || '').trim();
  var list = 훈련기수들_();
  if (list.length <= 1) throw new Error('기수가 하나뿐이라 지울 수 없습니다.');
  var 기수들 = list, 첫기수 = 기수들[기수들.length - 1].id;
  var 남은 = rows_(SHEET_제자훈련).filter(function (r) {
    return String(r[훈련_이름] || '').trim() && 기수맞나_(r, id, 첫기수);
  }).length;
  if (남은) throw new Error('이 기수에 ' + 남은 + '명이 있습니다. 명단을 먼저 비워주세요.');
  var sh = 훈련기수시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][TC_ID]).trim() === id) sh.deleteRow(i + 1);
  설정저장_('제자훈련현재기수', '');
  캐시비움_();
  return getDiscipleship(key);
}

/** 출석 기록 (status: '출석' | '결석' | '' = 지움) */
function setDiscipleshipAttendance(key, name, date, status) {
  requireAdmin_(key);
  name = String(name || '').trim();
  date = 날짜문자열_(date);
  status = String(status || '').trim();
  if (!name || !date) throw new Error('이름과 날짜가 필요합니다.');
  if (status && status !== '출석' && status !== '결석') throw new Error('출석 또는 결석만 기록할 수 있습니다.');

  var sh = sheet_(SHEET_제자훈련출결), v = sh.getDataRange().getValues(), row = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][훈련출결_이름]).trim() === name && 날짜문자열_(v[i][훈련출결_날짜]) === date) { row = i + 1; break; }
  }
  if (!status) {
    if (row) sh.deleteRow(row);
  } else if (row) {
    sh.getRange(row, 훈련출결_출결 + 1).setValue(status);
    sh.getRange(row, 4).setValue(new Date());
  } else {
    sh.appendRow([name, '', status, new Date()]);
    sh.getRange(sh.getLastRow(), 훈련출결_날짜 + 1).setNumberFormat('@').setValue(date);
  }
  캐시비움_();
  훈련교적반영_(name);
  return getDiscipleship(key);
}

/** 회비 납부 여부 저장 (paid: true/false, note: 금액·방법 메모) */
function setDiscipleshipFee(key, name, paid, note) {
  requireAdmin_(key);
  name = String(name || '').trim();
  if (!name) throw new Error('이름이 없습니다.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureColumn_(ss, SHEET_제자훈련, 4, '회비');
  ensureColumn_(ss, SHEET_제자훈련, 5, '회비일');
  ensureColumn_(ss, SHEET_제자훈련, 6, '회비메모');

  var sh = sheet_(SHEET_제자훈련), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][훈련_이름]).trim() !== name) continue;
    var wasPaid = String(v[i][훈련_회비] || '').trim() === '납부';
    sh.getRange(i + 1, 훈련_회비 + 1).setValue(paid ? '납부' : '');
    if (paid) {
      if (!wasPaid) sh.getRange(i + 1, 훈련_회비일 + 1).setNumberFormat('@').setValue(ymd_(new Date()));
    } else {
      sh.getRange(i + 1, 훈련_회비일 + 1).setValue('');
    }
    if (note !== undefined && note !== null) {
      sh.getRange(i + 1, 훈련_회비메모 + 1).setValue(String(note).trim());
    }
    캐시비움_();
    return getDiscipleship(key);
  }
  throw new Error('훈련 명단에서 찾을 수 없습니다.');
}

/** 한 사람의 출석 집계 */
function 훈련집계_(name, 출결, dates, cfg, today) {
  var mine = 출결[name] || {};
  var present = 0, marked = 0, past = 0;
  dates.forEach(function (d) {
    if (d <= today) past++;
    var s = mine[d];
    if (s) { marked++; if (s === '출석') present++; }
  });
  var done = dates.length ? dates[dates.length - 1] < today : false;
  var rate = Math.round((present / cfg.weeks) * 100);                       // 전체 주차 기준
  var soFar = past ? Math.round((present / past) * 100) : null;             // 지난 모임 기준
  var best = Math.round(((present + (cfg.weeks - past)) / cfg.weeks) * 100); // 남은 주 모두 출석 시
  var status = done ? (rate >= cfg.passRate ? '수료' : '미이수')
    : (best < cfg.passRate ? '기준 미달 예상' : '진행중');
  return {
    name: name, present: present, marked: marked, past: past, weeks: cfg.weeks,
    rate: rate, soFar: soFar, best: best, finished: done, status: status,
    marks: mine
  };
}

function 훈련출결맵_() {
  var map = {};
  rows_(SHEET_제자훈련출결).forEach(function (r) {
    var n = String(r[훈련출결_이름] || '').trim(), d = 날짜문자열_(r[훈련출결_날짜]);
    if (!n || !d) return;
    (map[n] = map[n] || {})[d] = String(r[훈련출결_출결] || '').trim();
  });
  return map;
}

/** 교적의 제자훈련 / 제자훈련출석 칸을 최신 상태로 */
function 훈련교적반영_(name) {
  name = String(name || '').trim();
  if (!name) return;
  var cfg = 훈련설정_(), dates = 훈련일정_(cfg), today = ymd_(new Date());
  var 명단 = rows_(SHEET_제자훈련).map(function (r) { return String(r[훈련_이름]).trim(); });
  var at = 교적행_(name);

  if (명단.indexOf(name) === -1) {
    // 명단에서 빠진 경우 — 수료 기록은 남기고 진행 중 표시만 지웁니다
    if (String(at.sh.getRange(at.row, D_제자훈련 + 1).getValue()).trim() !== '수료') {
      at.sh.getRange(at.row, D_제자훈련 + 1).setValue('');
      at.sh.getRange(at.row, D_훈련출석 + 1).setValue('');
    }
    캐시비움_();
    return;
  }
  var s = 훈련집계_(name, 훈련출결맵_(), dates, cfg, today);
  at.sh.getRange(at.row, D_제자훈련 + 1).setValue(s.finished ? s.status : '진행중');
  at.sh.getRange(at.row, D_훈련출석 + 1)
    .setValue(s.rate + '% (' + s.present + '/' + cfg.weeks + ')');
  캐시비움_();
}

/** 명단 전체를 다시 계산해 교적에 반영 */
function syncDiscipleship(key) {
  requireAdmin_(key);
  rows_(SHEET_제자훈련).forEach(function (r) { 훈련교적반영_(String(r[훈련_이름]).trim()); });
  return getDiscipleship(key);
}

function getDiscipleship(key, cohortId) {
  requireAdmin_(key);
  var 기수들 = 훈련기수들_();
  var cfg = 훈련설정_(cohortId), dates = 훈련일정_(cfg), today = ymd_(new Date());
  var 출결 = 훈련출결맵_();
  var 교적 = 교적맵_();
  var 첫기수 = 기수들[기수들.length - 1].id;      // 기수 칸이 빈 줄은 가장 오래된 기수로 봅니다

  var list = rows_(SHEET_제자훈련)
    .filter(function (r) { return String(r[훈련_이름] || '').trim() && 기수맞나_(r, cfg.id, 첫기수); })
    .map(function (row) {
      var n = String(row[훈련_이름]).trim();
      var s = 훈련집계_(n, 출결, dates, cfg, today);
      s.feePaid = String(row[훈련_회비] || '').trim() === '납부';
      s.feeDate = 날짜문자열_(row[훈련_회비일]);
      s.feeNote = String(row[훈련_회비메모] || '').trim();
      var info = 교적[n];
      s.photo = info ? info.photo : '';
      s.photoLarge = info ? info.photoLarge : '';
      s.notFound = !info;
      return s;
    })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });

  // 이번(또는 다음) 모임 날짜
  var current = dates.filter(function (d) { return d <= today; }).pop() || dates[0];
  var next = dates.filter(function (d) { return d > today; })[0] || '';

  return {
    config: cfg, dates: dates, today: today, current: current, next: next,
    cohorts: 기수들, cohortId: cfg.id,
    list: list,
    names: Object.keys(교적).sort(function (a, b) { return a.localeCompare(b, 'ko'); }),
    stats: {
      total: list.length,
      done: list.filter(function (x) { return x.status === '수료'; }).length,
      risk: list.filter(function (x) { return x.status === '기준 미달 예상' || x.status === '미이수'; }).length,
      feePaid: list.filter(function (x) { return x.feePaid; }).length,
      avg: list.length ? Math.round(list.reduce(function (s, x) { return s + (x.soFar === null ? 0 : x.soFar); }, 0) / list.length) : null,
      pastWeeks: dates.filter(function (d) { return d <= today; }).length
    }
  };
}

/* =========================================================
   새가족 관리
   ========================================================= */

/* 새가족 관련 시트는 모두 '이름'을 키로 씁니다 */
var NF_이름=0, NF_성별=1, NF_생일=2, NF_연락처=3,
    NF_수세=4, NF_이전교회=5, NF_직업=6, NF_활동계획=7, NF_특징=8, NF_담당자=9,
    NF_등록일=10, NF_상태=11, NF_배정셀=12, NF_배정일=13, NF_사진=14, NF_이메일=15, NF_셀신청=16, NF_카카오=17;

var NP_이름=0, NP_주차=1, NP_일자=2, NP_담당=3,
    NP_신앙배경=4, NP_이해도=5, NP_성격=6, NP_호응=7, NP_공동체=8, NP_섬김=9, NP_전망=10,
    NP_노트=11, NP_시각=12,
    NP_계기=13, NP_아는사람=14, NP_원하는사역=15, NP_공동체기대=16,
    NP_이단주의=17, NP_이단상세=18, NP_배정유의=19;

var NP_헤더 = ['이름', '주차', '진행일자', '담당자',
  '신앙배경', '신앙이해도', '성격분위기', '호응도', '공동체관심', '섬김관심', '다음참석전망', '노트', '작성시각',
  '교회오게된계기', '교회내아는사람', '원하는사역', '공동체에바라는점', '이단주의', '이단주의내용', '셀배정유의사항'];

var NT_이름=0, NT_월=1, NT_상태=2, NT_메모=3, NT_작성자=4, NT_시각=5;

/** 새가족 과정에서 쓰는 객관식 선택지 (화면과 서버가 공유) */
function 새가족선택지() {
  return {
    수세여부: [['성인세례/입교','\u271D\uFE0F'], ['유아세례','\uD83D\uDC76'], ['없음','\u2014']],
    활동계획: [['새가족 교육(4주) 후 정식등록','\uD83C\uDFAF'], ['매주 예배만 참석','\uD83D\uDE4F'],
              ['가끔 예배만 참석','\uD83C\uDF19'], ['예배만 참석','\u26EA'], ['방문','\uD83D\uDC4B']],
    상태: [['진행중','\uD83C\uDF31'], ['보류','\u23F8\uFE0F'], ['셀배정완료','\u2705'], ['중단','\uD83D\uDEAB']],
    신앙배경: [['신앙생활 처음','\uD83C\uDF31'], ['오랜만에 다시 시작','\uD83D\uDD04'],
              ['꾸준히 신앙생활','\uD83D\uDD4A\uFE0F'], ['타교회에서 이동','\u26EA']],
    신앙이해도: [['기초부터 필요','\uD83D\uDCD6'], ['기본 개념은 있음','\uD83D\uDCA1'], ['충분히 이해하고 있음','\u2728']],
    성격분위기: [['활발하고 적극적','\uD83D\uDD25'], ['밝고 편안함','\uD83D\uDE0A'],
                ['조용하지만 편안함','\uD83C\uDF3F'], ['조심스럽고 어색함','\uD83D\uDE07']],
    호응도: [['질문도 하며 매우 적극적','\uD83D\uDE4B'], ['잘 따라오며 반응 좋음','\uD83D\uDC4D'],
            ['듣기는 하나 반응 적음','\uD83E\uDD10'], ['거의 반응 없음','\uD83D\uDE36']],
    공동체관심: [['빨리 셀 배정 원함','\uD83E\uDD1D'], ['관심 있음','\uD83D\uDE42'],
                ['천천히 알아가고 싶음','\uD83D\uDC22'], ['아직 잘 모르겠음','\u2753']],
    섬김관심: [['구체적으로 원하는 사역 있음','\uD83C\uDFAF'], ['관심은 있음','\uD83C\uDF31'], ['아직 생각 없음','\uD83D\uDCA4']],
    교회오게된계기: [['지인 \u00B7 가족 소개','\uD83E\uDD1D'], ['온라인 \u00B7 검색','\uD83D\uDD0E'],
                    ['이사 \u00B7 이주','\uD83E\uDDF3'], ['다른 교회 추천','\u26EA'], ['기타','\u270F\uFE0F']],
    교회내아는사람: [['이미 가까운 지체가 있음','\uD83D\uDC65'], ['한두 명 알고 있음','\uD83D\uDE42'],
                    ['아직 아는 사람 없음','\uD83C\uDF31']],
    이단주의: [['특이사항 없음','\uD83D\uDFE2'], ['주의 필요','\uD83D\uDEA9']],
    다음참석전망: [['다음 주 참석 확실','\u2705'], ['아마도 참석','\uD83E\uDD14'],
                  ['불확실 \u2014 연락 필요','\u26A0\uFE0F'], ['연락이 어려움','\uD83D\uDEAB']],
    정착상태: [['잘 정착함','\uD83C\uDF3F'], ['간헐적 출석','\uD83C\uDF25\uFE0F'], ['연락 필요','\u26A0\uFE0F'],
              ['이탈','\uD83D\uDEAB'], ['타교회 이동','\u26EA']]
  };
}


/**
 * 주차별 문항 구성 — 화면은 이 정의를 그대로 따라 그립니다.
 * type: pick(이모지 선택) / text(주관식)
 * showIf: 특정 선택일 때만 보이는 칸
 */
function 주차문항() {
  return {
    1: {
      topic: '오리엔테이션 · 교회 소개',
      fields: [
        { key: 'faithBg',     label: '신앙 배경',          type: 'pick', opt: '신앙배경' },
        { key: 'reason',      label: '교회에 오게 된 계기', type: 'pick', opt: '교회오게된계기' },
        { key: 'personality', label: '첫인상 · 성격',      type: 'pick', opt: '성격분위기' }
      ]
    },
    2: {
      topic: '관계',
      fields: [
        { key: 'personality', label: '성격 · 분위기',     type: 'pick', opt: '성격분위기' },
        { key: 'response',    label: '호응도',            type: 'pick', opt: '호응도' },
        { key: 'community',   label: '공동체 관심도',      type: 'pick', opt: '공동체관심' },
        { key: 'acquaint',    label: '교회 내 아는 사람',  type: 'pick', opt: '교회내아는사람' },
        { key: 'outlook',     label: '다음 주 참석 전망',  type: 'pick', opt: '다음참석전망' }
      ]
    },
    3: {
      topic: '구원 · 영생 · 함께하는 공동체',
      fields: [
        { key: 'understanding', label: '신앙 이해도',     type: 'pick', opt: '신앙이해도' },
        { key: 'personality',   label: '성격 · 분위기',   type: 'pick', opt: '성격분위기' },
        { key: 'community',     label: '공동체 관심도',   type: 'pick', opt: '공동체관심' },
        { key: 'serving',       label: '섬김 관심',       type: 'pick', opt: '섬김관심' },
        { key: 'servingWish',   label: '원하는 사역',     type: 'text',
          placeholder: '예: 찬양팀, 미디어, 새가족 섬김',
          showIf: { key: 'serving', notIn: ['아직 생각 없음'] } },
        { key: 'expect',        label: '공동체에 바라는 점', type: 'text',
          placeholder: '청년부 · 셀모임에서 기대하는 것' },
        { key: 'outlook',       label: '다음 주 참석 전망', type: 'pick', opt: '다음참석전망' }
      ]
    },
    4: {
      topic: '이단 분별 · 셀모임 예행연습',
      fields: [
        { key: 'heresy',      label: '이단 관련 주의',   type: 'pick', opt: '이단주의' },
        { key: 'heresyNote',  label: '주의가 필요한 내용', type: 'text',
          placeholder: '어떤 반응이나 발언이 있었는지',
          showIf: { key: 'heresy', in: ['주의 필요'] } },
        { key: 'personality', label: '성격 · 분위기',   type: 'pick', opt: '성격분위기' },
        { key: 'community',   label: '공동체 관심도',   type: 'pick', opt: '공동체관심' },
        { key: 'serving',     label: '섬김 관심',       type: 'pick', opt: '섬김관심' },
        { key: 'assignNote',  label: '셀 배정 시 유의사항', type: 'text',
          placeholder: '또래 · 직장/학생 · 성향 · 피해야 할 조합 등' }
      ]
    }
  };
}

/* 필드 키 → 시트 컬럼 */
var NP_필드 = {
  faithBg: NP_신앙배경, understanding: NP_이해도, personality: NP_성격, response: NP_호응,
  community: NP_공동체, serving: NP_섬김, outlook: NP_전망, note: NP_노트,
  reason: NP_계기, acquaint: NP_아는사람, servingWish: NP_원하는사역, expect: NP_공동체기대,
  heresy: NP_이단주의, heresyNote: NP_이단상세, assignNote: NP_배정유의
};

/* ---- 새가족팀원 명단 ---- */

function 새가족팀원_() {
  return rows_(SHEET_새가족팀원)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return { name: String(r[0]).trim(), week: Number(r[1]) || 0, order: Number(r[2]) || 99 };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

function getNewFamilyStaff(key) {
  requireNewFamily_(key);
  return 새가족팀원_();
}

function saveNewFamilyStaff(key, list) {
  requireNewFamily_(key);
  var sh = sheet_(SHEET_새가족팀원);
  var rows = (list || []).filter(function (x) { return String(x.name || '').trim(); })
    .map(function (x, i) { return [String(x.name).trim(), Number(x.week) || 0, i + 1]; });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  캐시비움_();
  return 새가족팀원_();
}

/* ---- 연락 기록 ---- */

var NC_이름=0, NC_일자=1, NC_담당=2, NC_내용=3, NC_시각=4;

function addContactLog(token, name, date, by, text) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  text = String(text || '').trim();
  if (!name) throw new Error('새가족을 선택해주세요.');
  if (!text) throw new Error('연락 내용을 적어주세요.');

  var d = String(date || '').trim() || ymd_(new Date());
  var sh = sheet_(SHEET_새가족연락);
  sh.appendRow([name, d, String(by || '').trim(), text, new Date()]);
  sh.getRange(sh.getLastRow(), NC_일자 + 1).setNumberFormat('@').setValue(d);

  캐시비움_();
  return 새가족하나_(name);
}

function deleteContactLog(token, name, date, text) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var sh = sheet_(SHEET_새가족연락), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][NC_이름]).trim() === name &&
        날짜문자열_(v[i][NC_일자]) === String(date).trim() &&
        String(v[i][NC_내용]).trim() === String(text).trim()) {
      sh.deleteRow(i + 1); break;
    }
  }
  캐시비움_();
  return 새가족하나_(name);
}

function 새가족목록_() {
  return rows_(SHEET_새가족).filter(function (r) { return String(r[NF_이름]).trim(); }).map(function (r) {
    var birthday = 날짜문자열_(r[NF_생일]);
    var name = String(r[NF_이름]).trim();
    return {
      id: name, name: name,
      gender: String(r[NF_성별] || '').trim(),
      birthday: birthday,
      birthdayDisplay: 나이표시_(birthday),
      contact: String(r[NF_연락처] || '').trim(),
      baptized: String(r[NF_수세] || '').trim(),
      prevChurch: String(r[NF_이전교회] || '').trim(),
      job: String(r[NF_직업] || '').trim(),
      plan: String(r[NF_활동계획] || '').trim(),
      note: String(r[NF_특징] || '').trim(),
      owner: String(r[NF_담당자] || '').trim(),
      joinedAt: 날짜문자열_(r[NF_등록일]),
      status: String(r[NF_상태] || '진행중').trim(),
      cell: String(r[NF_배정셀] || '').trim(),
      assignedAt: 날짜문자열_(r[NF_배정일]),
      email: String(r[NF_이메일] || '').trim(),
      kakao: String(r[NF_카카오] || '').trim(),
      cellApp: 참_(r[NF_셀신청]),
      photo: 사진주소_(String(r[NF_사진] || '').trim(), 240),
      photoLarge: 사진주소_(String(r[NF_사진] || '').trim(), 1400)
    };
  });
}

/** 드라이브 파일 ID → 썸네일 주소 */
function 사진주소_(id, size) {
  return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + size : '';
}

/** 새가족이 지금 어느 단계에 있는지 */
function 단계_(nf) {
  if (nf.status === '중단') return '중단';
  if (nf.status === '보류') return '보류';
  if (nf.status === '셀배정완료') return '셀배정완료';
  if (nf.completedWeeks >= 4) return '셀배정대상';
  return (nf.completedWeeks + 1) + '주차대상';
}

var 단계순서 = ['1주차대상', '2주차대상', '3주차대상', '4주차대상', '셀배정대상', '셀배정완료', '보류', '중단'];

/** 과정·추적·연락 시트를 각각 한 번만 읽어 새가족ID로 묶어둡니다 */
function 새가족인덱스_() {
  var idx = { steps: {}, track: {}, contacts: {} };

  rows_(SHEET_새가족과정).forEach(function (r) {
    var k = String(r[NP_이름]).trim();
    if (!k) return;
    var rec = { week: Number(r[NP_주차]) || 0,
                date: 날짜문자열_(r[NP_일자]), by: String(r[NP_담당] || '').trim() };
    Object.keys(NP_필드).forEach(function (f) {
      rec[f] = String(r[NP_필드[f]] == null ? '' : r[NP_필드[f]]).trim();
    });
    (idx.steps[k] = idx.steps[k] || []).push(rec);
  });
  Object.keys(idx.steps).forEach(function (k) {
    idx.steps[k].sort(function (a, b) { return a.week - b.week; });
  });

  rows_(SHEET_새가족추적).forEach(function (r) {
    var k = String(r[NT_이름]).trim();
    if (!k) return;
    (idx.track[k] = idx.track[k] || []).push({
      month: String(r[NT_월] || ''), status: String(r[NT_상태] || ''),
      memo: String(r[NT_메모] || ''), by: String(r[NT_작성자] || '')
    });
  });
  Object.keys(idx.track).forEach(function (k) {
    idx.track[k].sort(function (a, b) { return a.month < b.month ? 1 : -1; });
  });

  rows_(SHEET_새가족연락).forEach(function (r) {
    var k = String(r[NC_이름]).trim();
    if (!k) return;
    (idx.contacts[k] = idx.contacts[k] || []).push({
      date: 날짜문자열_(r[NC_일자]),
      by: String(r[NC_담당] || ''), text: String(r[NC_내용] || '')
    });
  });
  Object.keys(idx.contacts).forEach(function (k) {
    idx.contacts[k].sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  });

  // 셀 배정된 새가족의 교적 연동용
  idx.directory = 교적맵_();
  idx.attend = 출석통계_();
  idx.소속 = 소속맵_();
  idx.memberCell = {};
  rows_(SHEET_셀원명단).forEach(function (r) {
    var nm = String(r[1]).trim();
    if (nm && !idx.memberCell[nm]) idx.memberCell[nm] = String(r[0]).trim();
  });

  return idx;
}

/** 전체 새가족을 인덱스 한 번으로 조립 */
function 새가족전체_() {
  var idx = 새가족인덱스_();
  return 새가족목록_().map(function (nf) { return 새가족합치기_(nf, idx); });
}

function 새가족하나_(name) {
  var idx = 새가족인덱스_();
  var hit = 새가족목록_().filter(function (x) { return x.id === String(name).trim(); })[0];
  return hit ? 새가족합치기_(hit, idx) : null;
}

/** 마지막 활동으로부터 6개월이 지나도록 과정이 끝나지 않으면 자동 중단 */
function 자동중단_(nf) {
  if (nf.status !== '진행중') return nf.status;
  if (nf.completedWeeks >= 4) return nf.status;
  var base = (nf.lastDate && /^\d{4}-\d{2}-\d{2}$/.test(nf.lastDate)) ? nf.lastDate : nf.joinedAt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(base))) return nf.status;
  var d = parseYmd_(base);
  d.setMonth(d.getMonth() + 6);
  return (new Date() > d) ? '중단' : nf.status;
}

function 새가족합치기_(nf, idx) {
  if (!idx) idx = 새가족인덱스_();
  var steps = idx.steps[nf.id] || [];
  var done = {};
  steps.forEach(function (s) { if (s.week >= 1 && s.week <= 4) done[s.week] = s; });
  var completed = Object.keys(done).length;
  var nextWeek = 0;
  for (var w = 1; w <= 4; w++) { if (!done[w]) { nextWeek = w; break; } }

  nf.steps = steps;
  nf.completedWeeks = completed;
  nf.nextWeek = nextWeek;
  nf.progress = completed + ' / 4';
  nf.lastDate = steps.length
    ? (steps.map(function (s) { return s.date; }).filter(function (x) { return x; }).sort().reverse()[0] || '')
    : '';
  nf.tracking = idx.track[nf.id] || [];
  nf.latestTracking = nf.tracking.length ? nf.tracking[0] : null;
  nf.contacts = idx.contacts[nf.id] || [];

  var auto = 자동중단_(nf);
  if (auto !== nf.status) { nf.status = auto; nf.autoStopped = true; }
  nf.stage = 단계_(nf);

  // 셀 배정이 끝났으면 교적에서 실제 정보를 끌어옵니다
  if (nf.status === '셀배정완료' && idx.directory) {
    var d = idx.directory[nf.name];
    if (d) {
      nf.linked = true;
      nf.contact = [d.phone, d.kakao, d.email].filter(function (x) { return x; }).join(' · ') || nf.contact;
      nf.phone = d.phone; nf.kakao = d.kakao; nf.email = d.email;
      nf.gender = d.gender || nf.gender;
      nf.birthday = d.birthday || nf.birthday;
      nf.birthdayDisplay = d.birthdayDisplay || nf.birthdayDisplay;
      nf.baptized = d.baptized || nf.baptized;
      nf.discipleship = d.discipleship || '';
      var 소속 = idx.소속 || { teams: {}, missions: {} };
      nf.teams = 소속.teams[nf.name] || [];
      nf.missions = 소속.missions[nf.name] || [];

      var m = idx.memberCell ? idx.memberCell[nf.name] : '';
      if (m) nf.cell = m;
      var st = idx.attend ? idx.attend[(nf.cell || '') + '||' + nf.name] : null;
      if (st && st.total) {
        nf.present = st.present;
        nf.totalMeetings = st.total;
        nf.rate = Math.round((st.present / st.total) * 100);
      }
    }
  }

  return nf;
}

/* ---- 새가족팀 로그인 ---- */

function 새가족비번_() { return 구글만_() ? '' : 설정값_('새가족팀비밀번호'); }

function newFamilyLogin(password) {
  password = String(password || '').trim();

  if (!포털권한_(password, '새가족')) {
    if (구글만_()) throw new Error(포털해독_(password) ? '새가족 관리 권한이 없습니다. 커미티에 문의해주세요.' : 구글만안내);
    var pw = 새가족비번_();
    if (!pw) throw new Error('새가족팀 비밀번호가 설정되지 않았습니다. 양육팀에 문의해주세요.');
    if (password !== pw) throw new Error('비밀번호가 올바르지 않습니다.');
  }
  // 로그인 응답에 첫 화면 데이터를 함께 담아 왕복을 한 번으로 줄입니다
  var data = getNewFamilies(password);
  data.token = password;
  return data;
}

function requireNewFamily_(token) {
  if (isAdmin_(token) || 마스터_(token)) return;
  if (포털해독_(token)) {
    if (포털권한_(token, '새가족')) return;
    throw new Error('새가족 관리 권한이 없습니다. 커미티에 문의해주세요.');
  }
  var pw = 새가족비번_();
  if (!pw || String(token || '').trim() !== pw) throw new Error('권한이 없습니다. 다시 로그인해주세요.');
}

/* ---- 새가족 조회 / 저장 ---- */

function getNewFamilies(token) {
  requireNewFamily_(token);
  return {
    list: 새가족전체_().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); }),
    staff: 새가족팀원_(),
    stages: 단계순서,
    options: 새가족선택지(),
    weeks: 주차문항(),
    cells: getCells().map(function (c) { return c.name; }),
    canNotify: 커미티토큰_(token),
    notifyEmails: 새가족알림주소_().join(', '),
    notifySet: !!String(설정값_('새가족등록알림이메일') || '').trim()
  };
}

function saveNewFamily(token, data) {
  requireNewFamily_(token);
  data = data || {};
  var name = String(data.name || '').trim();
  if (!name) throw new Error('이름을 입력해주세요.');

  var birthday = String(data.birthday || '').trim();
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new Error('생년월일 형식을 확인해주세요.');

  var email = String(data.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('이메일 형식을 확인해주세요.');

  var prev = String(data.id || '').trim();
  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();

  for (var i = 1; i < v.length; i++) {
    var rn = String(v[i][NF_이름]).trim();
    if (rn === name && rn !== prev) {
      throw new Error('같은 이름의 새가족이 이미 있습니다. 구분할 수 있도록 이름을 조정해주세요.');
    }
    if (email && rn !== prev && String(v[i][NF_이메일] || '').trim().toLowerCase() === email) {
      throw new Error(email + ' 은 이미 ' + rn + '님 이메일로 쓰이고 있습니다.');
    }
  }
  if (email) {
    var 기존교적 = 이메일찾기_(email);
    if (기존교적) throw new Error(email + ' 은 교적에서 ' + 기존교적.name + '님 이메일로 쓰이고 있습니다.');
  }

  var joined = String(data.joinedAt || '').trim() || ymd_(new Date());
  var row = [
    name, String(data.gender || '').trim(), birthday, String(data.contact || '').trim(),
    String(data.baptized || '').trim(), String(data.prevChurch || '').trim(),
    String(data.job || '').trim(), String(data.plan || '').trim(),
    String(data.note || '').trim(), String(data.owner || '').trim(),
    joined, String(data.status || '진행중').trim(),
    String(data.cell || '').trim(), String(data.assignedAt || '').trim()
  ];

  var target = 0;
  if (prev) {
    for (var k = 1; k < v.length; k++) {
      if (String(v[k][NF_이름]).trim() === prev) { target = k + 1; break; }
    }
  }
  if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); target = sh.getLastRow(); }

  sh.getRange(target, NF_생일 + 1).setNumberFormat('@').setValue(birthday);
  sh.getRange(target, NF_등록일 + 1).setNumberFormat('@').setValue(joined);
  ensureColumn_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_새가족, NF_이메일 + 1, '이메일');
  sh.getRange(target, NF_이메일 + 1).setValue(email);

  if (prev && prev !== name) {
    renameInColumn_(SHEET_새가족과정, NP_이름, prev, name);
    renameInColumn_(SHEET_새가족추적, NT_이름, prev, name);
    renameInColumn_(SHEET_새가족연락, NC_이름, prev, name);
  }

  캐시비움_();
  return 새가족하나_(name);
}

function saveNewFamilyStep(token, data) {
  requireNewFamily_(token);
  data = data || {};
  var name = String(data.newFamilyId || data.name || '').trim();
  var week = Number(data.week);
  if (!name) throw new Error('새가족을 선택해주세요.');
  if (!(week >= 1 && week <= 4)) throw new Error('주차를 선택해주세요.');
  if (!String(data.by || '').trim()) throw new Error('담당자를 선택해주세요.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var c = 14; c <= NP_헤더.length; c++) ensureColumn_(ss, SHEET_새가족과정, c, NP_헤더[c - 1]);

  var sh = sheet_(SHEET_새가족과정), v = sh.getDataRange().getValues();
  var row = [];
  for (var z = 0; z < NP_헤더.length; z++) row.push('');
  row[NP_이름] = name;
  row[NP_주차] = week;
  row[NP_일자] = String(data.date || ymd_(new Date())).trim();
  row[NP_담당] = String(data.by || '').trim();
  row[NP_시각] = new Date();
  Object.keys(NP_필드).forEach(function (f) {
    row[NP_필드[f]] = String(data[f] == null ? '' : data[f]).trim();
  });

  var target = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NP_이름]).trim() === name && Number(v[i][NP_주차]) === week) { target = i + 1; break; }
  }
  if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); target = sh.getLastRow(); }
  sh.getRange(target, NP_일자 + 1).setNumberFormat('@').setValue(row[NP_일자]);

  캐시비움_();
  var updated = 새가족하나_(name);
  if (updated && updated.stage === '셀배정대상') {
    try { 배정대상알림_(); } catch (e) {}
  }
  return updated;
}

function deleteNewFamilyStep(token, name, week) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var sh = sheet_(SHEET_새가족과정), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][NP_이름]).trim() === name && Number(v[i][NP_주차]) === Number(week)) {
      sh.deleteRow(i + 1); break;
    }
  }
  캐시비움_();
  return 새가족하나_(name);
}

/* ---- 양육팀 전용: 셀 배정 / 정착 추적 ---- */

function assignNewFamilyCell(token, name, cellName) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  cellName = String(cellName || '').trim();
  if (!cellName) throw new Error('배정할 셀을 선택해주세요.');
  findCell_(cellName);

  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() === name) {
      sh.getRange(i + 1, NF_상태 + 1).setValue('셀배정완료');
      sh.getRange(i + 1, NF_배정셀 + 1).setValue(cellName);
      sh.getRange(i + 1, NF_배정일 + 1).setNumberFormat('@').setValue(ymd_(new Date()));

      var 이미 = rows_(SHEET_셀원명단).filter(function (m) {
        return String(m[0]).trim() === cellName && String(m[1]).trim() === name;
      }).length;
      if (!이미) {
        sheet_(SHEET_셀원명단).appendRow([cellName, name]);
        sheet_(SHEET_명단변경).appendRow([new Date(), cellName, name, '추가', '새가족 배정', whoami_()]);
      }
      캐시비움_();
      return 새가족하나_(name);
    }
  }
  throw new Error('새가족을 찾을 수 없습니다.');
}

/**
 * 4주 과정을 마쳐 셀 배정이 필요한 새가족이 생기면 양육부에 알립니다.
 * 같은 사람에 대해 한 번만 발송합니다.
 */
function 배정대상알림_() {
  var 대기 = 새가족전체_().filter(function (n) { return n.stage === '셀배정대상'; });
  if (!대기.length) return { sent: [] };

  var 보냄 = rows_(SHEET_배정알림).map(function (r) { return String(r[0]).trim(); });
  var 신규 = 대기.filter(function (n) { return 보냄.indexOf(n.name) === -1; });
  if (!신규.length) return { sent: [] };

  // 사역팀 시트에서 양육부 팀장 이메일 찾기
  var 양육 = 사역팀목록_().filter(function (t) {
    return t.dept === '양육부' && t.email;
  })[0];
  var admin = 설정값_('알림받을이메일');
  var to = (양육 && 양육.email) || admin;
  if (!to) return { sent: [] };

  var url = (앱주소_() || '') + '?page=newfamily';
  MailApp.sendEmail({
    to: to,
    cc: (admin && admin !== to) ? admin : '',
    subject: '[새가족] 셀 배정 대상 ' + 신규.length + '명 안내',
    name: '토론토영락교회 청년1부',
    htmlBody: 배정알림Html_(신규, url),
    body: 배정알림Text_(신규, url)
  });

  var sh = sheet_(SHEET_배정알림);
  신규.forEach(function (n) { sh.appendRow([n.name, new Date()]); });
  캐시비움_();
  return { sent: 신규.map(function (n) { return n.name; }) };
}

function 배정알림Html_(list, url) {
  var rows = list.map(function (n) {
    var last = n.steps.length ? n.steps[n.steps.length - 1] : null;
    var w4 = n.steps.filter(function (x) { return x.week === 4; })[0] || {};
    var extra = '';
    if (w4.heresy === '주의 필요') {
      extra += '<div style="margin-top:6px;font-size:12px;color:#A82F16;font-weight:700;">' +
        '\uD83D\uDEA9 이단 관련 주의' + (w4.heresyNote ? ' — ' + esc_(w4.heresyNote) : '') + '</div>';
    }
    if (w4.assignNote) {
      extra += '<div style="margin-top:6px;font-size:12px;color:#4A4640;background:#F1EFEB;' +
        'border-radius:6px;padding:6px 9px;">배정 유의사항 · ' + esc_(w4.assignNote) + '</div>';
    }
    return '<tr>' +
      '<td style="padding:9px 0;border-top:1px solid #E4E1DB;font-size:14px;font-weight:700;">' +
        esc_(n.name) + (n.note ? ' <span style="font-weight:400;color:#7A756D;font-size:12px;">' +
        esc_(n.note) + '</span>' : '') + extra + '</td>' +
      '<td style="padding:9px 0;border-top:1px solid #E4E1DB;font-size:12px;color:#7A756D;text-align:right;">' +
        (n.owner ? '담당 ' + esc_(n.owner) : '담당 미지정') +
        (last ? '<br>4주차 ' + esc_(last.date) : '') + '</td></tr>';
  }).join('');

  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.85;margin-bottom:16px;">' +
      '4주 과정을 마친 새가족 <b>' + list.length + '명</b>이 셀 배정을 기다리고 있습니다.<br>' +
      '새가족 페이지의 과정 노트를 참고하셔서 셀을 배정해 주세요.</div>' +
    card_(label_('셀 배정 대상') +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' + rows + '</table>') +
    '<div style="text-align:center;margin-top:20px;">' + btn_(url, '새가족 페이지 열기', true) + '</div>' +
    '<div style="margin-top:14px;font-size:11.5px;color:#7A756D;line-height:1.85;">' +
      '\u203B 각 새가족의 신앙 배경, 성격, 공동체 관심도 등이 주차별 노트에 기록되어 있습니다.<br>' +
      '\u203B 배정이 완료되면 셀원 명단에 자동으로 추가됩니다.</div>';

  return mailShell_('셀 배정 대상<br>안내', '토론토영락교회 청년1부 새가족', body);
}

function 배정알림Text_(list, url) {
  return '4주 과정을 마친 새가족 ' + list.length + '명이 셀 배정을 기다리고 있습니다.\n\n' +
    list.map(function (n) {
      return '· ' + n.name + (n.note ? ' (' + n.note + ')' : '') +
        (n.owner ? ' — 담당 ' + n.owner : '');
    }).join('\n') +
    '\n\n새가족 페이지의 과정 노트를 참고하셔서 셀을 배정해 주세요.\n' + url;
}

/** 수동 발송 (커미티 페이지 버튼) */
function sendAssignAlert(key) {
  requireAdmin_(key);
  return 배정대상알림_();
}

/** 주차 기록 저장 후 자동 확인용 트리거 */
function 배정대상확인() {
  배정대상알림_();
}


/* ---- 새가족 사진 ---- */

/** 사진 보관 폴더 (없으면 만들고 설정 시트에 기억) */
function 사진폴더_() {
  var id = 설정값_('사진폴더');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder('청년부 새가족 사진');
  설정저장_('사진폴더', folder.getId());
  return folder;
}

/**
 * 폰에서 줄여서 보낸 사진(dataURL)을 저장합니다.
 * 링크를 아는 사람만 볼 수 있게 공유해야 화면에 표시됩니다.
 */
function uploadNewFamilyPhoto(token, name, dataUrl) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('사진 형식을 읽을 수 없습니다.');

  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('사진이 너무 큽니다.');

  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  ensureColumn_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_새가족, NF_사진 + 1, '사진');

  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() !== name) continue;

    // 이전 사진은 휴지통으로
    var old = String(v[i][NF_사진] || '').trim();
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }

    var blob = Utilities.newBlob(bytes, m[1], name + '.jpg');
    var file = 사진폴더_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    sh.getRange(i + 1, NF_사진 + 1).setValue(file.getId());
    캐시비움_();
    return 새가족하나_(name);
  }
  throw new Error('새가족을 찾을 수 없습니다.');
}

function deleteNewFamilyPhoto(token, name) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() !== name) continue;
    var old = String(v[i][NF_사진] || '').trim();
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }
    sh.getRange(i + 1, NF_사진 + 1).setValue('');
    캐시비움_();
    return 새가족하나_(name);
  }
  throw new Error('새가족을 찾을 수 없습니다.');
}

/** 담당자만 바로 변경 */
function setNewFamilyOwner(token, name, owner) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() === name) {
      sh.getRange(i + 1, NF_담당자 + 1).setValue(String(owner || '').trim());
      캐시비움_();
      return 새가족하나_(name);
    }
  }
  throw new Error('새가족을 찾을 수 없습니다.');
}

/** 상태만 바로 변경 */
function setNewFamilyStatus(token, name, status) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() === name) {
      sh.getRange(i + 1, NF_상태 + 1).setValue(String(status || '').trim());
      캐시비움_();
      return 새가족하나_(name);
    }
  }
  throw new Error('새가족을 찾을 수 없습니다.');
}

function saveTracking(token, name, month, status, memo, by) {
  requireNewFamily_(token);
  name = String(name || '').trim();
  month = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('확인 월을 선택해주세요.');
  if (!String(status || '').trim()) throw new Error('정착 상태를 선택해주세요.');

  var sh = sheet_(SHEET_새가족추적), v = sh.getDataRange().getValues();
  var row = [name, month, String(status).trim(), String(memo || '').trim(),
             String(by || '').trim(), new Date()];
  var target = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NT_이름]).trim() === name && String(v[i][NT_월]).trim() === month) {
      target = i + 1; break;
    }
  }
  if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); target = sh.getLastRow(); }
  sh.getRange(target, NT_월 + 1).setNumberFormat('@').setValue(month);

  캐시비움_();
  return 새가족하나_(name);
}

/**
 * 관리 페이지 초기 로딩용 — 여러 번 왕복하지 않고 한 번에 보냅니다.
 * Apps Script는 호출 1회당 오버헤드가 크기 때문에 이게 체감 속도에 가장 큰 영향을 줍니다.
 */
function getAdminBootstrap(key) {
  requireAdmin_(key);
  // 트리거 조회(getReminderState)는 별도 서비스라 느립니다 — 화면에 병렬로 따로 붙입니다.
  return {
    summary: getSummary(key, 'ALL'),
    cells: getCells(),
    passwords: getCellPasswords(key),
    changes: getMemberChanges(key)
  };
}

/** 첫 화면(메뉴) 카드에 보여줄 요약 숫자 — 가볍게 계산합니다 */
function getHomeStats(key) {
  requireAdmin_(key);
  return 홈통계_();
}

/** 권한 확인 없이 숫자만 (포털 · 관리 화면이 함께 씁니다) */
function 홈통계_() {

  // 셀: 전체 출석률 + 이번 주 제출 현황
  var 출결 = rows_(SHEET_출결기록);
  var present = 0;
  출결.forEach(function (r) { if (출석인정_(r[A_STATUS], r[A_REASON])) present++; });
  var cellsList = getCells();
  var 이번주 = ymd_(이번주기준_());
  var 제출 = {};
  rows_(SHEET_응답원본).forEach(function (r) {
    if (ymd_(r[R_DATE]) === 이번주) 제출[String(r[R_CELL]).trim()] = true;
  });

  // 새가족
  var nf = 새가족전체_();

  // 사역팀
  var teams = 사역팀목록_();
  var 보고팀 = {};
  rows_(SHEET_사역보고서).forEach(function (r) { 보고팀[String(r[TR_팀]).trim()] = true; });

  return {
    cell: {
      count: cellsList.length,
      rate: 출결.length ? Math.round((present / 출결.length) * 100) : null,
      submitted: cellsList.filter(function (c) { return 제출[c.name]; }).length,
      weekOf: 이번주
    },
    newFamily: (function () {
      var t = ymd_(new Date());
      return {
        active: nf.filter(function (n) { return /주차대상$/.test(n.stage); }).length,
        ready: nf.filter(function (n) { return n.stage === '셀배정대상'; }).length,
        settled: nf.filter(function (n) { return n.stage === '셀배정완료'; }).length,
        week: nf.filter(function (n) {
          return n.joinedAt && (parseYmd_(t) - parseYmd_(n.joinedAt)) / 86400000 <= 7;
        }).length
      };
    })(),
    team: {
      count: teams.length,
      reported: teams.filter(function (t) { return 보고팀[t.name]; }).length,
      members: teams.reduce(function (s, t) { return s + t.members.length; }, 0)
    },
    training: (function () {
      var cfg = 훈련설정_(), dates = 훈련일정_(cfg), today = ymd_(new Date());
      var 출결 = 훈련출결맵_();
      var list = rows_(SHEET_제자훈련).map(function (r2) { return String(r2[0] || '').trim(); })
        .filter(function (n) { return n; })
        .map(function (n) { return 훈련집계_(n, 출결, dates, cfg, today); });
      var past = dates.filter(function (d) { return d <= today; }).length;
      var paid = rows_(SHEET_제자훈련).filter(function (r2) {
        return String(r2[3] || '').trim() === '납부';
      }).length;
      return {
        total: list.length,
        feePaid: paid,
        week: Math.min(past + (past < cfg.weeks ? 1 : 0), cfg.weeks),
        weeks: cfg.weeks,
        avg: list.length ? Math.round(list.reduce(function (s, x) { return s + (x.soFar === null ? 0 : x.soFar); }, 0) / list.length) : null,
        passRate: cfg.passRate
      };
    })(),
    directory: (function () {
      var all = 교적전체_();
      var withCell = all.filter(function (p) { return p.cell; }).length;
      return { total: all.length, withCell: withCell, noCell: all.length - withCell };
    })(),
    mission: (function () {
      var list = 선교팀목록_();
      return {
        total: list.length,
        active: list.filter(function (t) { return t.status !== '완료'; }).length,
        gaps: list.filter(function (t) { return t.missingRoles.length; }).length
      };
    })(),
    calendar: (function () {
      var p = 캘린더ID_('공개'), c = 캘린더ID_('커미티'), l = 캘린더ID_('리더');
      return {
        publicId: p, committeeId: c, leaderId: l,
        publicOk: !!(p && 캘린더_('공개')), committeeOk: !!(c && 캘린더_('커미티')),
        leaderOk: !!(l && 캘린더_('리더'))
      };
    })(),
    worship: (function () {
      var d = ymd_(이번주기준_());
      var slot = 편성맵_([d])[d] || {};
      var 포지션 = 찬양포지션();
      var 필수 = 포지션.filter(function (p) { return !p.multi && !p.optional; });
      return {
        date: d,
        filled: 필수.filter(function (p) { return (slot[p.key] || []).length; }).length,
        need: 필수.length,
        songs: 콘티목록_(d, '콘티').length,
        finals: 콘티목록_(d, '결단').length,
        url: 앱주소_() + '?page=worship&key=' + encodeURIComponent(설정값_('관리자키') || '')
      };
    })(),
    expense: (function () {
      var list = 지출목록_();
      var 열린 = ['In Review', 'Pending Hardcopy Receipt', 'Action Required'];
      var 미지급 = list.filter(function (e) { return e.status !== 'Paid' && e.status !== 'Closed'; });
      return {
        total: list.length,
        open: list.filter(function (e) { return 열린.indexOf(e.status) !== -1; }).length,
        outstanding: Math.round(미지급.reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100
      };
    })()
  };
}

/** 사역팀 탭 초기 로딩 묶음 */
function getTeamBootstrap(key) {
  requireAdmin_(key);
  return {
    summary: getTeamSummary(key),
    passwords: getTeamPasswords(key),
    names: getDirectoryNames(key),
    periods: getTeamPeriods(key)
  };
}

/** 양육팀 대시보드용 새가족 요약 */
function getNewFamilySummary(key) {
  requireNewFamily_(key);
  var list = 새가족전체_();
  var 상태 = {};
  새가족선택지().상태.forEach(function (p) { 상태[p[0]] = 0; });
  list.forEach(function (n) { 상태[n.status] = (상태[n.status] || 0) + 1; });

  var 정착 = {};
  새가족선택지().정착상태.forEach(function (p) { 정착[p[0]] = 0; });
  list.forEach(function (n) {
    if (n.latestTracking) 정착[n.latestTracking.status] = (정착[n.latestTracking.status] || 0) + 1;
  });

  var 배정완료 = list.filter(function (n) { return n.status === '셀배정완료'; }).length;
  var 정착중 = list.filter(function (n) {
    return n.latestTracking && n.latestTracking.status === '잘 정착함';
  }).length;

  var 단계 = {};
  단계순서.forEach(function (k) { 단계[k] = 0; });
  list.forEach(function (n) { 단계[n.stage] = (단계[n.stage] || 0) + 1; });

  return {
    total: list.length,
    inProgress: list.filter(function (n) { return n.status === '진행중'; }).length,
    assigned: 배정완료,
    settleRate: 배정완료 ? Math.round((정착중 / 배정완료) * 100) : null,
    statusCounts: 상태,
    stageCounts: 단계,
    stages: 단계순서,
    staff: 새가족팀원_(),
    trackingCounts: 정착,
    options: 새가족선택지(),
    weeks: 주차문항(),
    list: list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); })
  };
}


/* =========================================================
   사역팀 보고서
   ========================================================= */

var T_팀=0, T_부서=1, T_커미티=2, T_팀장=3, T_이메일=4;
var TM_팀=0, TM_이름=1, TM_역할=2;
var TR_ID=0, TR_TS=1, TR_팀=2, TR_기준월=3, TR_제출자=4, TR_분위기=5, TR_분위기메모=6,
    TR_팀원변동=7, TR_최근사역=8, TR_향후사역=9, TR_지출필요=10, TR_지출내용=11,
    TR_기도제목=12, TR_코멘트=13, TR_코멘트작성자=14, TR_코멘트시각=15, TR_팀장컨디션=16;
var TS_보고서=0, TS_팀=1, TS_이름=2, TS_상태=3;

function 사역팀선택지() {
  return {
    팀원상태: [['활발하게 섬기는 중','\uD83D\uDD25'], ['꾸준히 참여','\uD83C\uDF3F'],
              ['참여가 뜸해짐','\uD83C\uDF25\uFE0F'], ['연락이 어려움','\u26A0\uFE0F'],
              ['잠시 쉼 (휴식\u00B7학업\u00B7이동)','\uD83D\uDCA4']],
    팀분위기: [['활기차고 동력이 좋음','\u2728'], ['안정적으로 운영 중','\uD83C\uDF3F'],
              ['지쳐 있음 \u00B7 충전 필요','\uD83C\uDF27\uFE0F'], ['갈등이나 어려움이 있음','\u26A1'],
              ['인원 부족으로 버거움','\uD83E\uDEAB']],
    팀장컨디션: [['충만함','\uD83D\uDD4A\uFE0F'], ['평안함','\uD83C\uDF3F'],
                ['지침/지체됨','\uD83C\uDF27\uFE0F'], ['SOS/기도 필요','\uD83C\uDD98']],
    지출필요: [['아니오','\u2014'], ['예','\uD83D\uDCB0']]
  };
}

function 사역팀목록_() {
  var 팀원 = rows_(SHEET_사역팀원);
  return rows_(SHEET_사역팀).filter(function (r) { return String(r[T_팀]).trim(); }).map(function (r) {
    var name = String(r[T_팀]).trim();
    return {
      name: name,
      dept: String(r[T_부서] || '').trim(),
      committee: String(r[T_커미티] || '').trim(),
      leader: String(r[T_팀장] || '').trim(),
      email: String(r[T_이메일] || '').trim(),
      members: 팀원.filter(function (m) { return String(m[TM_팀]).trim() === name; })
        .map(function (m) {
          return { name: String(m[TM_이름]).trim(), role: String(m[TM_역할] || '').trim() };
        }).filter(function (m) { return m.name; })
        .sort(function (a, b) {
          var leader = String(r[T_팀장] || '').trim();
          if (a.name === leader) return -1;
          if (b.name === leader) return 1;
          return a.name.localeCompare(b.name, 'ko');
        })
    };
  });
}

function findTeam_(name) {
  var list = 사역팀목록_();
  for (var i = 0; i < list.length; i++) if (list[i].name === String(name).trim()) return list[i];
  throw new Error('존재하지 않는 팀입니다.');
}

/* ---- 팀장 로그인 ---- */

var 팀비번접두 = '팀비번:';
function 팀비번_(teamName) { return 구글만_() ? '' : 설정값_(팀비번접두 + teamName); }
function 사역마스터_(token) {
  var m = 구글만_() ? '' : 설정값_('사역팀마스터비밀번호');
  return !!m && String(token || '').trim() === m;
}

function teamLogin(password) {
  password = String(password || '').trim();
  if (!password) throw new Error('비밀번호를 입력해주세요.');
  var teams = 사역팀목록_();

  var me = 포털본인_(password);
  if (me) {
    var r = 포털역할_(me.name);
    var 전체 = r.roles.indexOf('커미티') !== -1;
    var mine = 전체 ? teams : teams.filter(function (t) { return r.teams.indexOf(t.name) !== -1; });
    if (!mine.length) throw new Error('맡고 계신 사역팀이 없습니다. 커미티에 문의해주세요.');
    return {
      token: password, master: 전체, teams: mine, photos: 팀사진_(mine),
      options: 사역팀선택지(),
      reports: mine.length === 1 ? getTeamReports(password, mine[0].name) : []
    };
  }

  if (사역마스터_(password)) {
    return { token: password, master: true, teams: teams, photos: 팀사진_(teams), options: 사역팀선택지(), reports: [] };
  }
  for (var i = 0; i < teams.length; i++) {
    var pw = 팀비번_(teams[i].name);
    if (pw && pw === password) {
      return {
        token: password, master: false, teams: [teams[i]], photos: 팀사진_([teams[i]]),
        options: 사역팀선택지(),
        reports: getTeamReports(password, teams[i].name)
      };
    }
  }
  if (구글만_()) throw new Error(구글만안내);
  throw new Error('비밀번호가 올바르지 않습니다. 커미티에 문의해주세요.');
}

function requireTeam_(token, teamName) {
  if (isAdmin_(token) || 사역마스터_(token)) return;
  if (포털해독_(token)) {
    if (포털권한_(token, '팀', teamName)) return;
    throw new Error('이 팀에 대한 권한이 없습니다. 커미티에 문의해주세요.');
  }
  var pw = 팀비번_(String(teamName || '').trim());
  if (!pw || pw !== String(token || '').trim()) throw new Error('이 팀에 대한 권한이 없습니다.');
}

function setTeamPassword(key, teamName, password) {
  requireAdmin_(key);
  password = String(password || '').trim();
  if (!/^[0-9]+$/.test(password)) throw new Error('숫자만 사용해주세요.');
  if (password.length < 4) throw new Error('숫자 4자리 이상으로 정해주세요.');
  설정저장_(팀비번접두 + String(teamName).trim(), password);
  캐시비움_();
  return getTeamPasswords(key);
}

function getTeamPasswords(key) {
  requireAdmin_(key);
  var out = {};
  사역팀목록_().forEach(function (t) { out[t.name] = 팀비번_(t.name); });
  return out;
}

/* ---- 팀 / 팀원 관리 ---- */

function addTeam(key, name, dept, committee, leader, email) {
  requireAdmin_(key);
  name = String(name || '').trim();
  if (!name) throw new Error('팀 이름을 입력해주세요.');
  var list = 사역팀목록_();
  for (var i = 0; i < list.length; i++) if (list[i].name === name) throw new Error('이미 있는 팀입니다.');
  sheet_(SHEET_사역팀).appendRow([name, String(dept || '').trim(), String(committee || '').trim(),
    String(leader || '').trim(), String(email || '').trim()]);
  캐시비움_();
  return 사역팀목록_();
}

function updateTeam(key, name, dept, committee, leader, email) {
  requireAdmin_(key);
  var sh = sheet_(SHEET_사역팀), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][T_팀]).trim() === String(name).trim()) {
      sh.getRange(i + 1, 2, 1, 4).setValues([[String(dept || '').trim(), String(committee || '').trim(),
        String(leader || '').trim(), String(email || '').trim()]]);
      캐시비움_();
  return 사역팀목록_();
    }
  }
  throw new Error('팀을 찾을 수 없습니다.');
}

function removeTeam(key, name) {
  requireAdmin_(key);
  deleteRowsWhere_(SHEET_사역팀, T_팀, String(name).trim());
  deleteRowsWhere_(SHEET_사역팀원, TM_팀, String(name).trim());
  캐시비움_();
  return 사역팀목록_();
}

/** 역할 여러 개 — "인도자, 남싱" 처럼 쉼표로 (· / 로 적어도 같은 뜻) */
function 역할정리_(v) {
  var seen = {};
  return String(v || '').split(/[,·\/|]/).map(function (x) { return x.trim().slice(0, 20); })
    .filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; })
    .slice(0, 8).join(', ');
}

function addTeamMember(token, teamName, memberName, role) {
  requireTeam_(token, teamName);
  memberName = String(memberName || '').trim();
  if (!memberName) throw new Error('팀원 이름을 입력해주세요.');
  var team = findTeam_(teamName);
  for (var i = 0; i < team.members.length; i++) {
    if (team.members[i].name === memberName) throw new Error('이미 명단에 있는 이름입니다.');
  }
  sheet_(SHEET_사역팀원).appendRow([String(teamName).trim(), memberName, 역할정리_(role)]);
  캐시비움_();
  return 사역팀목록_();
}

function setTeamMemberRole(token, teamName, memberName, role) {
  requireTeam_(token, teamName);
  var sh = sheet_(SHEET_사역팀원), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][TM_팀]).trim() === String(teamName).trim() &&
        String(v[i][TM_이름]).trim() === String(memberName).trim()) {
      sh.getRange(i + 1, TM_역할 + 1).setValue(역할정리_(role));
      캐시비움_();
  return 사역팀목록_();
    }
  }
  throw new Error('팀원을 찾을 수 없습니다.');
}

function removeTeamMember(token, teamName, memberName) {
  requireTeam_(token, teamName);
  var sh = sheet_(SHEET_사역팀원), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][TM_팀]).trim() === String(teamName).trim() &&
        String(v[i][TM_이름]).trim() === String(memberName).trim()) {
      sh.deleteRow(i + 1); break;
    }
  }
  캐시비움_();
  return 사역팀목록_();
}

/** 팀장 — 본인 팀원들의 교적 + 소속 셀 + 출석률 + 팀내 역할 */
function getTeamDirectory(token, teamName) {
  requireTeam_(token, teamName);
  var team = findTeam_(teamName);
  var 교적 = 교적맵_();
  var 통계 = 출석통계_();
  var 명단 = rows_(SHEET_셀원명단);

  var 소속 = 소속맵_();
  return team.members.map(function (m) {
    var copy = 소속붙이기_(교적축약_(교적[m.name] || 빈교적_(m.name)), 소속);
    var row = 명단.filter(function (x) { return String(x[1]).trim() === m.name; })[0];
    if (row) copy.cell = String(row[0]).trim();
    copy.role = m.role;
    return 출석붙이기_(copy, 통계, copy.cell);
  });
}

/* ---- 사역 보고서 ---- */

function buildTeamReport_(row, stIdx) {
  var id = String(row[TR_ID]);
  return {
    reportId: id,
    date: row[TR_TS] instanceof Date ? ymd_(row[TR_TS]) : '',
    dateShort: row[TR_TS] instanceof Date ? md_(row[TR_TS]) : '',
    team: String(row[TR_팀]),
    period: 날짜문자열_(row[TR_기준월]),
    submitter: String(row[TR_제출자] || ''),
    mood: String(row[TR_분위기] || ''),
    moodNote: String(row[TR_분위기메모] || ''),
    change: String(row[TR_팀원변동] || ''),
    recent: String(row[TR_최근사역] || ''),
    upcoming: String(row[TR_향후사역] || ''),
    expenseNeeded: String(row[TR_지출필요] || ''),
    expenseDetail: String(row[TR_지출내용] || ''),
    prayer: String(row[TR_기도제목] || ''),
    condition: String(row[TR_팀장컨디션] || ''),
    comment: String(row[TR_코멘트] || ''),
    commentBy: String(row[TR_코멘트작성자] || ''),
    members: stIdx ? (stIdx[id] || [])
      : rows_(SHEET_사역팀원상태).filter(function (x) {
          return String(x[TS_보고서]) === id;
        }).map(function (x) {
          return { name: String(x[TS_이름]), status: String(x[TS_상태]) };
        })
  };
}

function getTeamReports(token, teamName) {
  requireTeam_(token, teamName);
  var stIdx = {};
  rows_(SHEET_사역팀원상태).forEach(function (x) {
    var k = String(x[TS_보고서]);
    (stIdx[k] = stIdx[k] || []).push({ name: String(x[TS_이름]), status: String(x[TS_상태]) });
  });
  return rows_(SHEET_사역보고서)
    .filter(function (r) { return String(r[TR_팀]).trim() === String(teamName).trim(); })
    .map(function (r) { return buildTeamReport_(r, stIdx); })
    .sort(function (a, b) { return (b.period || '').localeCompare(a.period || ''); });
}

function submitTeamReport__원래(token, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    data = data || {};
    var team = String(data.team || '').trim();
    requireTeam_(token, team);

    if (!String(data.period || '').trim()) throw new Error('보고하실 달을 골라주세요.');
    // 'YYYY-MM' 으로 오면 그 달의 1일로 맞춥니다 (예전 날짜 보고서와 섞이지 않게)
    if (/^\d{4}-\d{2}$/.test(String(data.period).trim())) data.period = String(data.period).trim() + '-01';
    if (!String(data.submitter || '').trim()) throw new Error('작성자 이름을 입력해주세요.');
    if (!String(data.condition || '').trim()) throw new Error('팀장님의 컨디션을 선택해주세요.');
    if (!String(data.mood || '').trim()) throw new Error('팀 분위기를 선택해주세요.');
    if (String(data.expenseNeeded || '') === '예' && !String(data.expenseDetail || '').trim()) {
      throw new Error('지출이 필요한 내용을 적어주세요.');
    }

    var 기존코멘트 = ['', '', ''];
    var id = String(data.reportId || '').trim();
    if (id) {
      var old = rows_(SHEET_사역보고서).filter(function (r) { return String(r[TR_ID]) === id; })[0];
      if (old) 기존코멘트 = [old[TR_코멘트], old[TR_코멘트작성자], old[TR_코멘트시각]];
      deleteRowsWhere_(SHEET_사역보고서, TR_ID, id);
      deleteRowsWhere_(SHEET_사역팀원상태, TS_보고서, id);
    } else {
      var dup = rows_(SHEET_사역보고서).filter(function (r) {
        return String(r[TR_팀]).trim() === team && 날짜문자열_(r[TR_기준월]) === String(data.period).trim();
      })[0];
      if (dup) throw new Error('이미 같은 기간의 보고서가 있습니다. 기존 보고서를 불러와 수정해주세요.');
      id = Utilities.getUuid();
    }

    sheet_(SHEET_사역보고서).appendRow([
      id, new Date(), team, String(data.period).trim(), String(data.submitter).trim(),
      String(data.mood).trim(), String(data.moodNote || '').trim(), String(data.change || '').trim(),
      String(data.recent || '').trim(), String(data.upcoming || '').trim(),
      String(data.expenseNeeded || '아니오'), String(data.expenseDetail || '').trim(),
      String(data.prayer || '').trim(), 기존코멘트[0], 기존코멘트[1], 기존코멘트[2],
      String(data.condition || '').trim()
    ]);

    var rep = sheet_(SHEET_사역보고서);
    rep.getRange(rep.getLastRow(), TR_기준월 + 1).setNumberFormat('@')
       .setValue(String(data.period).trim());

    var st = sheet_(SHEET_사역팀원상태);
    (data.members || []).forEach(function (m) {
      st.appendRow([id, team, String(m.name), String(m.status || '')]);
    });

    notifyTeamReport_(team, data, !!data.reportId);
    return { ok: true, reportId: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteTeamReport(token, reportId) {
  var row = rows_(SHEET_사역보고서).filter(function (r) { return String(r[TR_ID]) === String(reportId); })[0];
  if (!row) throw new Error('보고서를 찾을 수 없습니다.');
  requireTeam_(token, String(row[TR_팀]));
  deleteRowsWhere_(SHEET_사역보고서, TR_ID, String(reportId));
  deleteRowsWhere_(SHEET_사역팀원상태, TS_보고서, String(reportId));
  return { ok: true };
}

function saveTeamComment__원래(key, reportId, text, author) {
  requireAdmin_(key);
  text = String(text || '').trim();
  author = String(author || '').trim();
  if (text && !author) throw new Error('코멘트 작성자 이름을 입력해주세요.');

  var sh = sheet_(SHEET_사역보고서), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][TR_ID]) === String(reportId)) {
      sh.getRange(i + 1, TR_코멘트 + 1, 1, 3)
        .setValues([[text, text ? author : '', text ? new Date() : '']]);
      return { ok: true };
    }
  }
  throw new Error('보고서를 찾을 수 없습니다.');
}

function notifyTeamReport_(team, data, isEdit) {
  var admin = 설정값_('알림받을이메일');
  var t;
  try { t = findTeam_(team); } catch (e) { t = { email: '', leader: '' }; }
  var to = t.email || admin;
  if (!to) return;

  var url = (앱주소_() || '') + '?page=team';
  var opts = {
    to: to,
    subject: '[' + team + '] ' + data.period + ' 사역 보고서 ' + (isEdit ? '수정' : '제출') + ' 확인',
    name: '토론토영락교회 청년1부',
    body: teamSubmitText_(t, data, isEdit, url),
    htmlBody: teamSubmitHtml_(t, data, isEdit, url)
  };
  if (t.email && admin && admin !== t.email) opts.cc = admin;
  MailApp.sendEmail(opts);
}

function teamSubmitHtml_(t, data, isEdit, url) {
  var states = (data.members || []).map(function (m) {
    return '<tr><td style="padding:8px 0;border-top:1px solid #E4E1DB;font-size:13.5px;font-weight:600;">' +
      esc_(m.name) + '</td>' +
      '<td style="padding:8px 0;border-top:1px solid #E4E1DB;font-size:12.5px;color:#7A756D;text-align:right;">' +
      esc_(m.status) + '</td></tr>';
  }).join('');

  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.8;margin-bottom:16px;">' +
      esc_(t.leader || '팀장') + '님, 수고하셨습니다.<br>아래 내용으로 접수됐습니다.</div>' +
    card_(
      kv_('보고 기준일', esc_(data.period)) +
      kv_('팀장 컨디션', esc_(data.condition || '')) +
      kv_('팀 분위기', esc_(data.mood)) +
      kv_('지출 필요', esc_(data.expenseNeeded || '아니오')) +
      kv_('작성자', esc_(data.submitter))
    ) +
    (states ? card_(label_('팀원 상태') +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' + states + '</table>') : '') +
    card_(label_('최근 사역') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(data.recent || '') + '</div>') +
    (data.prayer ? card_(label_('기도제목 \u00B7 커미티 요청') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(data.prayer) + '</div>') : '') +
    '<div style="text-align:center;margin-top:20px;">' + btn_(url, '보고서 수정하기', true) + '</div>' +
    '<div style="margin-top:12px;font-size:11.5px;color:#7A756D;line-height:1.85;">' +
      '\u203B 같은 날짜를 다시 선택하시면 이 보고서를 불러와 수정하실 수 있습니다.</div>';

  return mailShell_('사역 보고서<br>' + (isEdit ? '수정' : '제출') + ' 확인',
    esc_(t.name || '') + ' &nbsp;\u00B7&nbsp; ' + esc_(data.period), body);
}

function teamSubmitText_(t, data, isEdit, url) {
  return (t.leader || '팀장') + '님, 수고하셨습니다.\n\n' +
    (t.name || '') + ' 사역 보고서가 ' + (isEdit ? '수정' : '제출') + '됐습니다.\n\n' +
    '보고 기준일: ' + data.period + '\n작성자: ' + data.submitter + '\n' +
    '팀장 컨디션: ' + (data.condition || '') + '\n팀 분위기: ' + data.mood + '\n' +
    '지출 필요: ' + (data.expenseNeeded || '아니오') + '\n\n' +
    '[최근 사역]\n' + (data.recent || '') + '\n\n' +
    '[기도제목 및 커미티 요청]\n' + (data.prayer || '(없음)') + '\n\n' +
    '수정하려면: ' + url;
}

/* ---- 커미티 요약 ---- */

/** 커미티 — 특정 팀의 특정 기준일 보고서 */
function getTeamReportForAdmin(key, teamName, period) {
  requireAdmin_(key);
  var stIdx = {};
  rows_(SHEET_사역팀원상태).forEach(function (x) {
    var k = String(x[TS_보고서]);
    (stIdx[k] = stIdx[k] || []).push({ name: String(x[TS_이름]), status: String(x[TS_상태]) });
  });
  var row = rows_(SHEET_사역보고서).filter(function (r) {
    return String(r[TR_팀]).trim() === String(teamName).trim() &&
           날짜문자열_(r[TR_기준월]) === String(period).trim();
  })[0];
  return row ? buildTeamReport_(row, stIdx) : null;
}

/** 팀별 보고서 목록 (기준일 드롭다운용) */
function getTeamPeriods(key) {
  requireAdmin_(key);
  var out = {};
  rows_(SHEET_사역보고서).forEach(function (r) {
    var t = String(r[TR_팀]).trim();
    (out[t] = out[t] || []).push(날짜문자열_(r[TR_기준월]));
  });
  Object.keys(out).forEach(function (k) {
    out[k] = out[k].sort().reverse();
  });
  return out;
}

/** 교적에 등록된 전체 이름 (팀원 추가 드롭다운용) */
function getDirectoryNames(key) {
  requireAdmin_(key);
  var 교적 = 교적맵_();
  return Object.keys(교적).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
}

function getTeamSummary(key) {
  requireAdmin_(key);
  var teams = 사역팀목록_();
  var tsIdx = {};
  rows_(SHEET_사역팀원상태).forEach(function (x) {
    var k = String(x[TS_보고서]);
    (tsIdx[k] = tsIdx[k] || []).push({ name: String(x[TS_이름]), status: String(x[TS_상태]) });
  });
  var 전체 = rows_(SHEET_사역보고서).map(function (r) { return buildTeamReport_(r, tsIdx); });

  var data = teams.map(function (t) {
    var reps = 전체.filter(function (r) { return r.team === t.name; })
      .sort(function (a, b) { return (b.period || '').localeCompare(a.period || ''); });
    var last = reps[0] || null;
    return {
      team: t.name, dept: t.dept, committee: t.committee, leader: t.leader,
      memberCount: t.members.length,
      reports: reps.length,
      lastPeriod: last ? last.period : null,
      mood: last ? last.mood : null,
      condition: last ? last.condition : null,
      expense: last ? last.expenseNeeded : null,
      prayer: last ? last.prayer : '',
      comment: last ? last.comment : '',
      commentBy: last ? last.commentBy : '',
      reportId: last ? last.reportId : null,
      memberStates: last ? last.members : [],
      report: last || null
    };
  });

  var OPT = 사역팀선택지();

  var 분위기 = {};
  OPT.팀분위기.forEach(function (p) { 분위기[p[0]] = 0; });
  data.forEach(function (d) { if (d.mood) 분위기[d.mood] = (분위기[d.mood] || 0) + 1; });

  var 컨디션 = {};
  OPT.팀장컨디션.forEach(function (p) { 컨디션[p[0]] = 0; });
  data.forEach(function (d) { if (d.condition) 컨디션[d.condition] = (컨디션[d.condition] || 0) + 1; });

  var 팀원상태 = {};
  OPT.팀원상태.forEach(function (p) { 팀원상태[p[0]] = 0; });
  data.forEach(function (d) {
    (d.memberStates || []).forEach(function (m) {
      if (m.status) 팀원상태[m.status] = (팀원상태[m.status] || 0) + 1;
    });
  });

  return {
    teams: data,
    rawTeams: teams,
    moodCounts: 분위기,
    conditionCounts: 컨디션,
    memberStateCounts: 팀원상태,
    submitted: data.filter(function (d) { return d.reports > 0; }).length,
    total: data.length,
    expenseTeams: data.filter(function (d) { return d.expense === '예'; }).map(function (d) { return d.team; }),
    options: 사역팀선택지()
  };
}

/* ---- 사역 보고 요청 메일 ---- */

function requestTeamReports(key, period, message) {
  requireAdmin_(key);
  period = String(period || '').trim();
  if (!period) throw new Error('보고 기준 월을 선택해주세요.');

  var url = (앱주소_() || '') + '?page=team';
  var sent = [], skipped = [];

  사역팀목록_().forEach(function (t) {
    if (!t.email) { skipped.push(t.name); return; }
    MailApp.sendEmail({
      to: t.email,
      cc: 설정값_('알림받을이메일') || '',
      subject: '[' + t.name + '] ' + period + ' 사역 보고서 제출 요청',
      name: '토론토영락교회 청년1부',
      htmlBody: teamRequestHtml_(t, period, message, url),
      body: (t.leader || '팀장') + '님, 안녕하세요.\n\n' + period + ' 사역 보고서 제출을 요청드립니다.\n' +
            (message ? '\n' + message + '\n' : '') + '\n작성 링크: ' + url + '\n\n청년1부 커미티'
    });
    sent.push(t.name);
  });
  return { sent: sent, skipped: skipped };
}

function teamRequestHtml_(team, period, message, url) {
  var body =
    card_(
      '<div style="font-size:15px;font-weight:600;color:#2B2B2B;margin-bottom:10px;">' +
        esc_(team.leader || '팀장') + '님, 안녕하세요.</div>' +
      '<div style="font-size:14px;color:#4A4640;line-height:1.8;">' +
        '청년1부 커미티입니다.<br>' + esc_(period) + ' 사역 보고서 제출을 요청드립니다.<br>' +
        '아래 버튼을 통해 작성해 주세요.</div>' +
      (message ? '<div style="background:#F1EFEB;border-radius:7px;padding:10px 13px;margin-top:14px;' +
        'font-size:13px;color:#4A4640;white-space:pre-wrap;">' + esc_(message) + '</div>' : '') +
      '<div style="text-align:center;margin-top:18px;">' + btn_(url, '사역 보고서 작성', true) + '</div>' +
      '<div style="text-align:center;margin-top:6px;font-size:11.5px;color:#9A948C;word-break:break-all;">' +
        url + '</div>'
    ) +
    '<div style="margin-top:16px;font-size:12px;color:#7A756D;line-height:1.85;">' +
      '※ 팀 비밀번호를 모르시면 담당 커미티(' + esc_(team.committee) + ')에게 문의해 주세요.</div>';

  return mailShell_('사역 보고서<br>제출 요청', esc_(team.name) + ' &nbsp;·&nbsp; ' + esc_(period), body);
}

/* =========================================================
   6. 보고서 제출 / 수정 / 삭제
   ========================================================= */

function validateReport_(data) {
  if (!data.meetingDate) throw new Error('모임 날짜를 선택해주세요.');
  if (!data.cell) throw new Error('셀을 선택해주세요.');
  if (!String(data.submitter || '').trim()) throw new Error('작성자 이름을 입력해주세요.');
  if (!data.attendance || !data.attendance.length) throw new Error('셀원 명단이 비어 있습니다.');
  data.attendance.forEach(function (a) {
    if (a.status !== '출석' && a.status !== '불참') throw new Error(a.name + '님의 출결을 체크해주세요.');
    if (a.status === '불참') {
      if (!a.reason) throw new Error(a.name + '님의 불참 사유를 선택해주세요.');
      if (상세필요_(a.reason) && !String(a.reasonOther || '').trim()) {
        throw new Error(a.name + '님의 ' + a.reason + ' 내용을 간략히 적어주세요.');
      }
    }
  });
  if (!data.condition) throw new Error('본인의 컨디션을 선택해주세요.');
  if (!data.mood) throw new Error('셀모임 분위기를 선택해주세요.');
}

function submitReport__원래(token, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireCell_(token, data && data.cell);
    var 대리 = 대리본인_(token, data.cell);
    if (대리) data.submitter = 대리 + ' (대리)';
    validateReport_(data);

    var 기존코멘트 = ['', '', ''];
    if (data.reportId) {
      var old = findReportRow_(data.reportId);
      if (old) 기존코멘트 = [old.row[R_COMMENT], old.row[R_CBY], old.row[R_CAT]];
      purgeReport_(data.reportId);
    } else if (findReportByCellDate_(data.cell, data.meetingDate)) {
      throw new Error('이미 같은 날짜의 보고서가 있습니다. 기존 보고서를 불러와 수정해주세요.');
    }

    var id = data.reportId || Utilities.getUuid();
    var now = new Date();
    var 날짜 = parseYmd_(data.meetingDate);
    var 출석 = data.attendance.filter(function (a) {
      return 출석인정_(a.status, a.reason);
    }).length;
    var 전체 = data.attendance.length;
    var 율 = 전체 ? Math.round((출석 / 전체) * 100) : 0;

    sheet_(SHEET_응답원본).appendRow([
      id, now, 날짜, data.cell, data.submitter, data.condition, data.mood,
      출석, 전체, 율 + '%', data.notes || '', 기존코멘트[0], 기존코멘트[1], 기존코멘트[2]
    ]);

    var 출결 = sheet_(SHEET_출결기록);
    data.attendance.forEach(function (a) {
      출결.appendRow([id, now, 날짜, data.cell, a.name, a.status, a.reason || '', a.reasonOther || '']);
    });

    writeCellTab_(data.cell, id, 날짜, data, 출석, 전체, 율);
    notifySubmit_(data, 출석, 전체, 율, !!data.reportId);
    return { ok: true, reportId: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteReport(token, reportId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findReportRow_(reportId);
    if (!found) throw new Error('보고서를 찾을 수 없습니다.');
    var cell = found.row[R_CELL], date = ymd_(found.row[R_DATE]);
    requireCellLeader_(token, cell);
    purgeReport_(reportId);
    return { ok: true, cell: cell, date: date };
  } finally {
    lock.releaseLock();
  }
}

function purgeReport___원래(id) {
  deleteRowsWhere_(SHEET_응답원본, R_ID, id);
  deleteRowsWhere_(SHEET_출결기록, A_ID, id);
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    if (sh.getName().indexOf('[셀] ') !== 0) return;
    var v = sh.getDataRange().getValues();
    for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === id) sh.deleteRow(i + 1);
  });
}

function writeCellTab___원래(cell, id, 날짜, data, 출석, 전체, 율) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName('[셀] ' + cell);
  if (!tab) {
    tab = ss.insertSheet('[셀] ' + cell);
    tab.getRange(1, 1, 1, 9).setValues([[
      '보고서ID', '모임날짜', '작성자', '컨디션', '분위기', '출석', '전체', '출석률', '기도제목및특이사항'
    ]]).setFontWeight('bold');
    tab.setFrozenRows(1);
    tab.hideColumns(1);
  }
  tab.appendRow([id, 날짜, data.submitter, data.condition, data.mood, 출석, 전체, 율 + '%', data.notes || '']);

  var 결석 = data.attendance.filter(function (a) { return a.status === '불참'; });
  if (결석.length) {
    tab.getRange(tab.getLastRow(), 6).setNote(결석.map(function (a) {
      return a.name + ' — ' + a.reason + (a.reasonOther ? ' (' + a.reasonOther + ')' : '');
    }).join('\n'));
  }
}

function findReportRow_(id) {
  var v = rows_(SHEET_응답원본);
  for (var i = 0; i < v.length; i++) if (String(v[i][R_ID]) === id) return { index: i, row: v[i] };
  return null;
}

function findReportByCellDate_(cell, date) {
  var v = rows_(SHEET_응답원본);
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][R_CELL]).trim() === cell && ymd_(v[i][R_DATE]) === date) return v[i];
  }
  return null;
}

/* =========================================================
   7. 보고서 조회
   ========================================================= */

/** 출결기록을 보고서ID로 한 번만 묶습니다 */
function 출결인덱스_() {
  var idx = {};
  rows_(SHEET_출결기록).forEach(function (a) {
    var k = String(a[A_ID]);
    (idx[k] = idx[k] || []).push({
      name: String(a[A_NAME]), status: String(a[A_STATUS]),
      reason: String(a[A_REASON] || ''), reasonOther: String(a[A_OTHER] || '')
    });
  });
  return idx;
}

function buildReport_(row, attIdx) {
  var id = String(row[R_ID]);
  return {
    reportId: id,
    date: ymd_(row[R_DATE]),
    dateShort: md_(row[R_DATE]),
    cell: String(row[R_CELL]),
    submitter: String(row[R_BY] || ''),
    condition: String(row[R_COND] || ''),
    mood: String(row[R_MOOD] || ''),
    present: Number(row[R_PRESENT]) || 0,
    total: Number(row[R_TOTAL]) || 0,
    rate: Number(row[R_TOTAL]) ? Math.round((Number(row[R_PRESENT]) / Number(row[R_TOTAL])) * 100) : 0,
    notes: String(row[R_NOTES] || ''),
    comment: String(row[R_COMMENT] || ''),
    commentBy: String(row[R_CBY] || ''),
    commentAt: row[R_CAT] instanceof Date ? md_(row[R_CAT]) : '',
    attendance: attIdx ? (attIdx[id] || [])
      : rows_(SHEET_출결기록).filter(function (a) {
          return String(a[A_ID]) === id;
        }).map(function (a) {
          return {
            name: String(a[A_NAME]), status: String(a[A_STATUS]),
            reason: String(a[A_REASON] || ''), reasonOther: String(a[A_OTHER] || '')
          };
        })
  };
}

function getExistingReport(token, cellName, date) {
  requireCell_(token, cellName);
  var row = findReportByCellDate_(String(cellName).trim(), String(date).trim());
  return row ? buildReport_(row) : null;
}

function getMeetingDates() {
  var seen = {}, out = [];
  rows_(SHEET_응답원본).forEach(function (r) {
    var d = ymd_(r[R_DATE]);
    if (d && !seen[d]) { seen[d] = 1; out.push(d); }
  });
  return out.sort().reverse();
}

function getReport(key, cellName, date) {
  requireAdmin_(key);
  var row = findReportByCellDate_(String(cellName).trim(), String(date).trim());
  return row ? buildReport_(row) : null;
}

function saveComment__원래(key, reportId, text, author) {
  requireAdmin_(key);
  author = String(author || '').trim();
  text = String(text || '').trim();
  if (text && !author) throw new Error('코멘트 작성자 이름을 입력해주세요.');

  var sh = sheet_(SHEET_응답원본), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][R_ID]) === reportId) {
      sh.getRange(i + 1, R_COMMENT + 1, 1, 3)
        .setValues([[text, text ? author : '', text ? new Date() : '']]);
      return { ok: true };
    }
  }
  throw new Error('보고서를 찾을 수 없습니다.');
}

/* =========================================================
   8. 요약
   ========================================================= */

function getSummary(key, scope) {
  requireAdmin_(key);
  scope = scope || 'ALL';
  var all = scope === 'ALL';

  var 응답 = rows_(SHEET_응답원본).filter(function (r) {
    return String(r[R_ID]) && (all || ymd_(r[R_DATE]) === scope);
  });
  var 출결 = rows_(SHEET_출결기록).filter(function (r) {
    return String(r[A_ID]) && (all || ymd_(r[A_DATE]) === scope);
  });

  var attIdx = 출결인덱스_();
  var byCell = {};
  응답.forEach(function (r) {
    var n = String(r[R_CELL]);
    if (!byCell[n]) byCell[n] = [];
    byCell[n].push(buildReport_(r, attIdx));
  });

  var 인원 = {};
  출결.forEach(function (r) {
    var k = r[A_CELL] + '||' + r[A_NAME];
    if (!인원[k]) {
      인원[k] = { cell: String(r[A_CELL]), name: String(r[A_NAME]), total: 0, present: 0, absences: [] };
    }
    인원[k].total++;
    if (출석인정_(r[A_STATUS], r[A_REASON])) 인원[k].present++;
    if (r[A_STATUS] !== '출석') {
      인원[k].absences.push({
        date: md_(r[A_DATE]),
        reason: String(r[A_REASON] || ''),
        other: String(r[A_OTHER] || ''),
        counted: 출석인정_(r[A_STATUS], r[A_REASON])
      });
    }
  });

  // 셀별 불참 상세
  var 불참 = {};
  출결.forEach(function (r) {
    if (r[A_STATUS] === '출석') return;
    var c = String(r[A_CELL]);
    if (!불참[c]) 불참[c] = [];
    불참[c].push({
      date: md_(r[A_DATE]),
      name: String(r[A_NAME]),
      reason: String(r[A_REASON] || ''),
      other: String(r[A_OTHER] || ''),
      counted: 출석인정_(r[A_STATUS], r[A_REASON])
    });
  });

  var cellData = getCells().map(function (c) {
    var reps = (byCell[c.name] || []).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var 출석합 = 0, 전체합 = 0;
    reps.forEach(function (r) { 출석합 += r.present; 전체합 += r.total; });
    var last = reps[0] || null;

    return {
      cell: c.name,
      leader: c.leader,
      memberCount: c.members.length,
      submissions: reps.length,
      rate: 전체합 ? Math.round((출석합 / 전체합) * 100) : null,
      present: 출석합,
      total: 전체합,
      submitted: reps.length > 0,
      condition: last ? last.condition : null,
      mood: last ? last.mood : null,
      lastDate: last ? last.dateShort : null,
      reportId: last ? last.reportId : null,
      notes: reps.filter(function (r) { return r.notes; }).map(function (r) {
        return { date: r.dateShort, text: r.notes };
      }),
      comments: reps.filter(function (r) { return r.comment; }).map(function (r) {
        return { date: r.dateShort, text: r.comment, by: r.commentBy };
      }),
      absences: (불참[c.name] || []).sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
      lastComment: last ? last.comment : '',
      lastCommentBy: last ? last.commentBy : '',
      members: Object.keys(인원).filter(function (k2) { return 인원[k2].cell === c.name; })
        .map(function (k2) {
          var p = 인원[k2];
          return {
            name: p.name,
            rate: Math.round((p.present / p.total) * 100),
            present: p.present, total: p.total,
            absences: p.absences.sort(function (a, b) { return a.date < b.date ? 1 : -1; })
          };
        }).sort(function (a, b) { return a.rate - b.rate; })
    };
  });

  var 전체출결 = 출결.length;
  var 전체출석 = 출결.filter(function (r) { return 출석인정_(r[A_STATUS], r[A_REASON]); }).length;
  var 분위기 = {};
  ['깊고 진솔', '소소하고 평안', '수동적', '무거움/어려움'].forEach(function (k) { 분위기[k] = 0; });
  응답.forEach(function (r) {
    var m = String(r[R_MOOD] || '');
    if (!m) return;
    분위기[m] = (분위기[m] || 0) + 1;
  });

  var 컨디션 = {};
  ['충만함', '평안함', '지침/지체됨', 'SOS/기도 필요'].forEach(function (k) { 컨디션[k] = 0; });
  응답.forEach(function (r) {
    var c = String(r[R_COND] || '');
    if (!c) return;
    컨디션[c] = (컨디션[c] || 0) + 1;
  });

  return {
    scope: scope,
    dates: getMeetingDates(),
    overallRate: 전체출결 ? Math.round((전체출석 / 전체출결) * 100) : 0,
    presentTotal: 전체출석,
    attendanceTotal: 전체출결,
    submittedCount: cellData.filter(function (c) { return c.submitted; }).length,
    totalCells: cellData.length,
    moodCounts: 분위기,
    conditionCounts: 컨디션,
    commentCount: cellData.reduce(function (s, c) { return s + c.comments.length; }, 0),
    cells: cellData
  };
}

function getMemberChanges(key) {
  requireAdmin_(key);
  return rows_(SHEET_명단변경).reverse().slice(0, 20).map(function (r) {
    return { date: md_(r[0]), cell: r[1], name: r[2], type: r[3], reason: r[4] };
  });
}

/* =========================================================
   9. 이메일 (셀장 발송분에는 로고를 넣지 않습니다)
   ========================================================= */

function mailShell_(headline, subline, bodyHtml) {
  return '' +
  '<div style="margin:0;padding:20px 10px;background:#DDDAD4;">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;' +
    'margin:0 auto;background:#EDEBE7;border-radius:12px;overflow:hidden;' +
    'font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Malgun Gothic\',\'Noto Sans KR\',Arial,sans-serif;">' +

  '<tr><td style="background:#0F0F0F;padding:28px 24px 26px;text-align:center;">' +
    '<div style="color:#EE5622;font-size:22px;font-weight:800;line-height:1.35;">' + headline + '</div>' +
    '<div style="color:#B8B2A9;font-size:12px;margin-top:8px;">' + subline + '</div>' +
  '</td></tr>' +

  '<tr><td style="padding:24px 22px;">' + bodyHtml + '</td></tr>' +

  '<tr><td style="background:#0F0F0F;padding:18px 22px;text-align:center;' +
    'font-size:11px;color:#6A655E;line-height:1.85;">' + CHURCH_FOOTER + '</td></tr>' +
  '</table></div>';
}

function card_(inner) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
    'style="background:#ffffff;border-radius:10px;margin-bottom:10px;">' +
    '<tr><td style="padding:18px;">' + inner + '</td></tr></table>';
}

function label_(text) {
  return '<div style="font-size:12px;font-weight:700;color:#ffffff;background:#1C1C1C;display:inline-block;' +
    'padding:5px 14px;border-radius:6px;margin-bottom:8px;">' + text + '</div>';
}

function kv_(k, v) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:7px;"><tr>' +
    '<td width="96" style="background:#1C1C1C;color:#ffffff;font-size:12px;font-weight:700;' +
      'padding:6px 12px;border-radius:6px;text-align:center;white-space:nowrap;">' + k + '</td>' +
    '<td style="padding-left:8px;"><div style="background:#F7F5F2;border:1px solid #E4E1DB;border-radius:6px;' +
      'padding:6px 12px;font-size:13.5px;color:#2B2B2B;">' + v + '</div></td></tr></table>';
}

function btn_(url, text, primary) {
  return primary
    ? '<a href="' + url + '" style="display:inline-block;background:#EE5622;color:#ffffff;font-size:14px;' +
      'font-weight:700;padding:12px 26px;border-radius:8px;text-decoration:none;margin:0 4px 8px;">' + text + '</a>'
    : '<a href="' + url + '" style="display:inline-block;background:#ffffff;color:#A82F16;font-size:14px;' +
      'font-weight:700;padding:11px 26px;border-radius:8px;text-decoration:none;' +
      'border:1px solid #E6C9C5;margin:0 4px 8px;">' + text + '</a>';
}

/* ---- 제출 확인 메일 ---- */

function notifySubmit_(data, 출석, 전체, 율, isEdit) {
  var admin = 설정값_('알림받을이메일');
  var cell;
  try { cell = findCell_(data.cell); } catch (e) { cell = { email: '' }; }

  var to = cell.email || admin;
  if (!to) return;

  var base = 앱주소_() || '';
  var q = '?cell=' + encodeURIComponent(data.cell) + '&date=' + encodeURIComponent(data.meetingDate);

  var leaderName = (cell.leader || data.cell.replace(/\s*셀$/, '')) + ' 셀장님';
  var opts = {
    to: to,
    subject: '[' + data.cell + '] ' + data.meetingDate + ' 셀모임 보고서 ' + (isEdit ? '수정' : '제출') + ' 확인',
    name: '토론토영락교회 청년1부 양육팀',
    body: submitText_(data, 출석, 전체, 율, isEdit, base + q, leaderName),
    htmlBody: submitHtml_(data, 출석, 전체, 율, isEdit, base + q, base + q + '&action=delete', leaderName)
  };
  if (cell.email && admin && admin !== cell.email) opts.cc = admin;
  MailApp.sendEmail(opts);
}

function submitHtml_(data, 출석, 전체, 율, isEdit, editUrl, delUrl, leaderName) {
  var cf = FACE_COND[data.condition] || '';
  var mf = FACE_MOOD[data.mood] || '';

  var 명단 = data.attendance.map(function (a) {
    var on = a.status === '출석';
    var 사유 = on ? '' : (a.reason + (a.reasonOther ? ' · ' + a.reasonOther : ''));
    return '<tr>' +
      '<td style="padding:8px 0;border-top:1px solid #E4E1DB;font-size:13.5px;color:#2B2B2B;font-weight:600;">' +
        esc_(a.name) + '</td>' +
      '<td style="padding:8px 0;border-top:1px solid #E4E1DB;font-size:12px;color:#7A756D;text-align:right;">' +
        esc_(사유) + '</td>' +
      '<td style="padding:8px 0 8px 10px;border-top:1px solid #E4E1DB;text-align:right;white-space:nowrap;">' +
        '<span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:99px;' +
        (on ? 'background:#E3F2EA;color:#1D7A56;' : 'background:#FBEADF;color:#B14A12;') + '">' +
        a.status + '</span></td></tr>';
  }).join('');

  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.8;margin-bottom:16px;">' +
      esc_(leaderName) + ', 수고하셨습니다.<br>아래 내용으로 접수됐습니다. 확인해주세요.</div>' +

    card_(
      kv_('출석', 출석 + ' / ' + 전체 + '명 (' + 율 + '%)') +
      kv_('컨디션·영적상태', cf + ' ' + esc_(data.condition)) +
      kv_('셀모임 분위기', mf + ' ' + esc_(data.mood)) +
      kv_('작성자', esc_(data.submitter))
    ) +

    card_(label_('출결 명단') +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' + 명단 + '</table>') +

    card_(label_('기도제목 · 특이사항') +
      '<div style="font-size:13.5px;color:' + (data.notes ? '#2B2B2B' : '#9A948C') +
      ';line-height:1.75;white-space:pre-wrap;">' + esc_(data.notes || '작성된 내용이 없습니다.') + '</div>') +

    '<div style="text-align:center;margin-top:20px;">' +
      btn_(editUrl, '보고서 수정', true) + btn_(delUrl, '보고서 삭제', false) + '</div>' +

    '<div style="margin-top:12px;font-size:11.5px;color:#7A756D;line-height:1.85;">' +
      '※ 수정 버튼을 누르면 이 보고서가 그대로 불러와집니다. 고쳐서 다시 제출하면 덮어쓰기 됩니다.<br>' +
      '※ 잘못 보내신 경우 삭제 후 다시 작성해주세요.</div>';

  return mailShell_('셀모임 보고서<br>' + (isEdit ? '수정' : '제출') + ' 확인',
                    esc_(data.cell) + ' &nbsp;·&nbsp; ' + esc_(data.meetingDate), body);
}

function submitText_(data, 출석, 전체, 율, isEdit, editUrl, leaderName) {
  var 결석 = data.attendance.filter(function (a) { return a.status === '불참'; });
  return leaderName + ', 수고하셨습니다.\n\n' +
    data.cell + ' 셀모임 보고서가 ' + (isEdit ? '수정' : '제출') + '됐습니다.\n\n' +
    '모임 날짜: ' + data.meetingDate + '\n작성자: ' + data.submitter + '\n' +
    '출석: ' + 출석 + ' / ' + 전체 + '명 (' + 율 + '%)\n' +
    '본인의 컨디션: ' + data.condition + '\n셀모임 분위기: ' + data.mood + '\n\n[불참]\n' +
    (결석.length ? 결석.map(function (a) {
      return '· ' + a.name + ' — ' + a.reason + (a.reasonOther ? ' (' + a.reasonOther + ')' : '');
    }).join('\n') : '· 전원 출석') +
    '\n\n[기도제목 및 특이사항]\n' + (data.notes || '(없음)') +
    '\n\n수정하거나 삭제하려면: ' + editUrl;
}

/* ---- 리마인더 메일 ---- */

function sendReminderMail_(cell, dateKey, url) {
  var leaderName = cell.leader || cell.name.replace(/\s*셀$/, '');
  var admin = 설정값_('알림받을이메일');
  var opts = {
    to: cell.email,
    subject: '[' + leaderName + '] 셀 셀모임 보고서 미제출 안내 및 작성 링크',
    name: '토론토영락교회 청년1부 양육팀',
    body: reminderText_(leaderName, dateKey, url),
    htmlBody: reminderHtml_(leaderName, dateKey, url)
  };
  if (admin && admin !== cell.email) opts.cc = admin;
  MailApp.sendEmail(opts);
}

function reminderHtml_(leaderName, dateKey, url) {
  var body =
    card_(
      '<div style="font-size:15px;font-weight:600;color:#2B2B2B;margin-bottom:10px;">' +
        '안녕하세요, ' + esc_(leaderName) + ' 셀장님.</div>' +
      '<div style="font-size:14px;color:#4A4640;line-height:1.8;">' +
        '청년1부 양육팀입니다.<br>이번 주일 셀모임 보고서가 아직 제출되지 않아 안내드립니다.<br>' +
        '아래 버튼을 통해 빠른 시일 내에 작성해 주시면 감사하겠습니다.</div>' +
      '<div style="background:#F1EFEB;border-radius:7px;padding:10px 13px;margin-top:16px;font-size:13px;color:#7A756D;">' +
        '모임 날짜 &nbsp;·&nbsp; <span style="color:#2B2B2B;font-weight:600;">' + dateKey + '</span></div>' +
      '<div style="text-align:center;margin-top:18px;">' + btn_(url, '보고서 작성하기', true) + '</div>' +
      '<div style="text-align:center;margin-top:6px;font-size:11.5px;color:#9A948C;word-break:break-all;">' +
        '버튼이 눌리지 않으면 이 주소를 복사해주세요<br>' + url + '</div>'
    ) +
    '<div style="margin-top:16px;font-size:12px;color:#7A756D;line-height:1.85;">' +
      '※ 본 메일은 자동 발송 시스템을 통해 전송되므로, 셀모임이 없는 주간이나 방학 기간 중 ' +
      '수신하신 경우 별도로 작성하지 않으셔도 됩니다.<br>' +
      '※ 관련 문의 사항은 양육팀으로 편하게 말씀해 주세요.</div>' +
    '<div style="border-top:1px solid #D8D4CD;margin-top:18px;padding-top:16px;font-size:14px;color:#2B2B2B;line-height:1.75;">' +
      '늘 보이지 않는 곳에서 애써주시는 셀장님께 감사드립니다.<br>' +
      '<span style="font-weight:700;">청년1부 양육팀 드림</span></div>';

  return mailShell_('셀모임 보고서<br>미제출 안내', '토론토영락교회 청년1부', body);
}

function reminderText_(leaderName, dateKey, url) {
  return '안녕하세요, ' + leaderName + ' 셀장님. 청년1부 양육팀입니다.\n' +
    '이번 주일 셀모임 보고서가 아직 제출되지 않아 안내드립니다.\n' +
    '아래 링크를 참고하시어 빠른 시일 내에 작성해 주시면 감사하겠습니다.\n\n' +
    '모임 날짜: ' + dateKey + '\n보고서 작성 링크: ' + url + '\n\n' +
    '※ 본 메일은 자동 발송 시스템을 통해 전송되므로, 셀모임이 없는 주간이나 방학 기간 중 ' +
    '수신하신 경우 별도로 작성하지 않으셔도 됩니다.\n' +
    '※ 관련 문의 사항은 양육팀으로 편하게 말씀해 주세요.\n\n' +
    '늘 보이지 않는 곳에서 애써주시는 셀장님께 감사드립니다.\n청년1부 양육팀 드림';
}

/* ---- 주일 당일 제출 안내 (오후 4시 30분) ---- */

function sendSundayNudge_(cell, dateKey, url) {
  var leaderName = cell.leader || cell.name.replace(/\s*셀$/, '');
  var admin = 설정값_('알림받을이메일');
  var opts = {
    to: cell.email,
    subject: '[' + cell.name + '] 주일 셀모임 보고서 제출 안내',
    name: '토론토영락교회 청년1부 양육팀',
    body: nudgeText_(url),
    htmlBody: nudgeHtml_(url)
  };
  if (admin && admin !== cell.email) opts.cc = admin;
  MailApp.sendEmail(opts);
}

function nudgeHtml_(url) {
  var body =
    card_(
      '<div style="font-size:14px;color:#4A4640;line-height:1.85;">' +
        '셀장님, 오늘도 수고 많으셨습니다.<br><br>' +
        '아래 링크를 통하여 오늘 셀모임의 보고서를 작성하여 주세요.<br>' +
        '오늘 중으로 부탁드리며, 도움이 필요하다면 항상 양육팀에게 문의 바랍니다.</div>' +
      '<div style="text-align:center;margin-top:20px;">' + btn_(url, '보고서 작성하기', true) + '</div>' +
      '<div style="text-align:center;margin-top:6px;font-size:11.5px;color:#9A948C;word-break:break-all;">' +
        '버튼이 눌리지 않으면 이 주소를 복사해주세요<br>' + url + '</div>'
    ) +
    '<div style="text-align:center;margin-top:16px;font-size:14px;color:#2B2B2B;font-weight:700;">' +
      '한 주간도 승리하시길 바랍니다!</div>';

  return mailShell_('주일 셀모임<br>보고서 제출 안내', '토론토영락교회 청년1부', body);
}

function nudgeText_(url) {
  return '셀장님, 오늘도 수고 많으셨습니다.\n\n' +
    '아래 링크를 통하여 오늘 셀모임의 보고서를 작성하여 주세요. ' +
    '오늘 중으로 부탁드리며, 도움이 필요하다면 항상 양육팀에게 문의 바랍니다.\n\n' +
    url + '\n\n한 주간도 승리하시길 바랍니다!\n청년부 양육팀';
}

/* =========================================================
   10. 리마인더 발송
   ========================================================= */

function 이번주기준_() {
  var w = parseInt(설정값_('모임요일'), 10);
  if (isNaN(w)) w = 0;
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - w + 7) % 7));
  return d;
}

/** 오늘 이후로 가장 가까운 모임 주일 (주일이 지나면 다음 주일) */
function 다가오는주일_() {
  var w = parseInt(설정값_('모임요일'), 10);
  if (isNaN(w)) w = 0;
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((w - d.getDay() + 7) % 7));
  return d;
}

/** 매주 월요일 오전 8시(토론토 시간) 트리거 */
function 미제출리마인더() {
  if (설정값_('리마인더사용').toUpperCase() === 'OFF') return;
  sendReminders_(false);
}

function sendRemindersNow(key) {
  requireAdmin_(key);
  return sendReminders_(true);
}

function sendReminders___원래(force) {
  var 키 = ymd_(이번주기준_());
  var 기록 = sheet_(SHEET_리마인더);
  var 발송됨 = rows_(SHEET_리마인더).map(function (r) { return ymd_(r[0]) === 키 ? r[1] : null; });
  var 제출됨 = rows_(SHEET_응답원본).filter(function (r) { return ymd_(r[R_DATE]) === 키; })
    .map(function (r) { return String(r[R_CELL]); });
  var url = 앱주소_();

  var sent = [], skipped = [];
  getCells().forEach(function (c) {
    if (제출됨.indexOf(c.name) !== -1) return;
    if (!force && 발송됨.indexOf(c.name) !== -1) return;
    if (!c.email) { skipped.push(c.name); return; }
    sendReminderMail_(c, 키, url);
    기록.appendRow([키, c.name, new Date()]);
    sent.push(c.name);
    // 휴대폰 알림도 같이 (설정에서 꺼둘 수 있습니다)
    알림보내기_('셀보고', [c.leader], {
      title: '셀보고서를 기다리고 있습니다',
      body: c.name + ' — ' + 키 + ' 셀모임 보고서를 아직 안 쓰셨습니다.',
      url: url + '?page=leader', tag: '셀보고', keep: true
    });
  });
  return { date: 키, sent: sent, skipped: skipped };
}

/** 매주 주일 오후 4시 30분(토론토 시간) 트리거 — 당일 미제출 셀에게 제출 안내 */
function 주일독려() {
  if (설정값_('리마인더사용').toUpperCase() === 'OFF') return;
  sendSundayNudges_(false);
}

function sendSundayNudgesNow(key) {
  requireAdmin_(key);
  return sendSundayNudges_(true);
}

function sendSundayNudges___원래(force) {
  var 키 = ymd_(이번주기준_());
  var 기록 = sheet_(SHEET_주일독려);
  var 발송됨 = rows_(SHEET_주일독려).map(function (r) { return ymd_(r[0]) === 키 ? r[1] : null; });
  var 제출됨 = rows_(SHEET_응답원본).filter(function (r) { return ymd_(r[R_DATE]) === 키; })
    .map(function (r) { return String(r[R_CELL]); });
  var url = 앱주소_();

  var sent = [], skipped = [];
  getCells().forEach(function (c) {
    if (제출됨.indexOf(c.name) !== -1) return;
    if (!force && 발송됨.indexOf(c.name) !== -1) return;
    if (!c.email) { skipped.push(c.name); return; }
    sendSundayNudge_(c, 키, url);
    기록.appendRow([키, c.name, new Date()]);
    sent.push(c.name);
  });
  return { date: 키, sent: sent, skipped: skipped };
}

function getReminderState(key) {
  requireAdmin_(key);
  var jobs = HOST.schedules();
  return {
    on: 설정값_('리마인더사용').toUpperCase() !== 'OFF',
    sundayScheduled: jobs.indexOf('주일독려') !== -1,
    mondayScheduled: jobs.indexOf('미제출리마인더') !== -1,
    weekOf: ymd_(이번주기준_())
  };
}

function setReminderState(key, on) {
  requireAdmin_(key);
  설정저장_('리마인더사용', on ? 'ON' : 'OFF');
  return getReminderState(key);
}

/* 자동 발송 시각은 서버(lib/scheduler.js)에 정해져 있습니다.
   켜고 끄기는 설정 시트의 '리마인더사용' (ON / OFF) 으로 합니다. */
function 리마인더트리거설치() {
  설정저장_('리마인더사용', 'ON');
  HOST.alert('리마인더가 켜졌습니다.\n매주 월요일 오전 8시(토론토 시간)에 미제출 셀장에게 발송됩니다.');
}

function 주일독려트리거설치() {
  설정저장_('리마인더사용', 'ON');
  HOST.alert('주일 제출 안내가 켜졌습니다.\n매주 주일 오후 4시 30분(토론토 시간)에 아직 제출하지 않은 셀장에게 발송됩니다.');
}

function 리마인더미리보기() {
  var me = 관리자메일_();
  if (!me) throw new Error('설정 시트에 관리자이메일을 먼저 넣어주세요.');
  sendReminderMail_({ leader: '홍길동', name: '홍길동 셀', email: me },
    ymd_(이번주기준_()), 앱주소_());
  HOST.alert(me + ' 로 월요일 리마인더 미리보기 메일을 보냈습니다.');
}

/** 지출 접수 메일이 어떻게 보이는지 관리자 메일로 한 번 보내봅니다 */
function 지출신청미리보기() {
  var me = 관리자메일_();
  if (!me) throw new Error('설정 시트에 관리자이메일을 먼저 넣어주세요.');
  지출접수메일_({
    no: 'EXP-' + new Date().getFullYear() + '-000', name: '홍길동', email: me,
    dept: '찬양/방송팀', spentAt: ymd_(new Date()),
    beforeTax: 120.5, tax: 15.67, total: 136.17, payableTo: 'Gil Dong Hong',
    detail: 'Guitar strings and cables for Sunday worship',
    reason: '', attendees: '', headcount: '', comment: '',
    receipts: [{ name: 'receipt.jpg' }]
  });
  HOST.alert(me + ' 로 지출 접수 확인 메일 미리보기를 보냈습니다.');
}

function 주일독려미리보기() {
  var me = 관리자메일_();
  if (!me) throw new Error('설정 시트에 관리자이메일을 먼저 넣어주세요.');
  sendSundayNudge_({ leader: '홍길동', name: '홍길동 셀', email: me },
    ymd_(이번주기준_()), 앱주소_());
  HOST.alert(me + ' 로 주일 제출 안내 미리보기 메일을 보냈습니다.');
}

/* =========================================================
   14. 선교팀
   ========================================================= */

var 선교필수역할 = ['팀장', '회계', '서기'];
var 선교기본역할 = ['팀장', '회계', '서기', '팀원', '찬양', '통역', '의료', '사진'];
var 선교상태 = ['준비중', '진행중', '완료'];
var 선교일정구분 = ['토론토 출발', '현지 도착', '현지 출발', '토론토 도착', '경유', '기타'];

/** 제출 현황 — 팀 화면의 체크리스트가 이 정의를 그대로 따릅니다 */
function 선교체크목록() {
  return [
    { key: 'ticket',   col: MT_티케팅,  label: '티케팅',      by: '팀장' },
    { key: 'budget',   col: MT_예산,    label: '예산안 제출', by: '회계' },
    { key: 'closing',  col: MT_결산,    label: '결산안 제출', by: '회계' },
    { key: 'handbook', col: MT_핸드북,  label: '핸드북 제출', by: '서기' },
    { key: 'report',   col: MT_보고서,  label: '보고서 제출', by: '서기' }
  ];
}

function 선교시트_(name, head) {
  var sh = sheet_(name);
  if (sh) return sh;
  createSheet_(SpreadsheetApp.getActiveSpreadsheet(), name, head);
  캐시비움_();
  return sheet_(name);
}
function 선교팀시트_() { return 선교시트_(SHEET_선교팀, HEAD_선교팀); }
function 선교팀원시트_() { return 선교시트_(SHEET_선교팀원, HEAD_선교팀원); }
function 선교일정시트_() { return 선교시트_(SHEET_선교일정, HEAD_선교일정); }

function 예아니오_(v) { return String(v || '').trim() === '예'; }

/** 세례 기록이 선교 참가 조건을 만족하는지 (성인세례 또는 유아세례 + 입교) */
function 세례충족_(baptized) {
  var b = String(baptized || '');
  return b.indexOf('성인세례') !== -1 || b.indexOf('입교') !== -1;
}

/**
 * 이름 → 첫 셀모임 출석일. 출결기록을 한 번만 훑습니다.
 * (팀원이 열 명이든 스무 명이든 시트를 한 번만 읽습니다)
 */
function 첫출석맵_() {
  var map = {};
  rows_(SHEET_출결기록).forEach(function (r) {
    var n = String(r[A_NAME] || '').trim();
    if (!n) return;
    var d = ymd_(r[A_DATE]);
    if (d && (!map[n] || d < map[n])) map[n] = d;
  });
  return map;
}

function 선교팀원목록_(teamName, 교적, 소속, 통계) {
  return rows_(SHEET_선교팀원)
    .filter(function (r) { return String(r[MM_팀]).trim() === teamName && String(r[MM_이름]).trim(); })
    .map(function (r) {
      var nm = String(r[MM_이름]).trim();
      var info = 교적[nm] || null;
      var cells = 소속.cells[nm] || [];
      var cell = cells[0] || '';
      var st = 통계[cell + '||' + nm];
      return {
        name: nm,
        roles: String(r[MM_역할] || '').split(',').map(function (x) { return x.trim(); })
          .filter(function (x) { return x; }),
        waiver: 예아니오_(r[MM_waiver]),
        passport: 예아니오_(r[MM_여권]),
        cellOk: 예아니오_(r[MM_셀출석]),
        baptismOk: 예아니오_(r[MM_세례]),
        memo: String(r[MM_메모] || '').trim(),
        // 교적에서 자동으로 뽑아 화면에 참고로 보여드립니다
        auto: {
          baptized: info ? info.baptized : '',
          baptismOk: info ? 세례충족_(info.baptized) : false,
          cell: cell,
          cellOk: !!cell,
          rate: (st && st.total) ? Math.round((st.present / st.total) * 100) : null,
          present: st ? st.present : 0,
          meetings: st ? st.total : 0,
          phone: info ? info.phone : '',
          engName: info ? info.engName : '',
          notFound: !info
        }
      };
    })
    .sort(function (a, b) {
      var ra = 선교필수역할.indexOf(a.roles[0] || ''), rb = 선교필수역할.indexOf(b.roles[0] || '');
      if (ra !== rb) return (ra === -1 ? 9 : ra) - (rb === -1 ? 9 : rb);
      return a.name.localeCompare(b.name, 'ko');
    });
}

function 선교일정목록_(teamName) {
  return rows_(SHEET_선교일정)
    .filter(function (r) { return String(r[MF_팀]).trim() === teamName; })
    .map(function (r, i) {
      return {
        seq: i,
        kind: String(r[MF_구분] || '').trim(),
        at: String(r[MF_일시] || '').trim(),
        flight: String(r[MF_편명] || '').trim(),
        memo: String(r[MF_메모] || '').trim()
      };
    })
    .sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
}

/** 팀 하나의 자료 { 항목key: [ {id, kind, name, url, label, by, at} ] } */
function 선교자료_(teamName) {
  var out = {};
  if (!sheet_(SHEET_선교첨부)) return out;
  rows_(SHEET_선교첨부).forEach(function (r) {
    if (String(r[MX_팀]).trim() !== teamName) return;
    var k = String(r[MX_항목] || '').trim();
    if (!k) return;
    (out[k] = out[k] || []).push({
      id: String(r[MX_ID] || '').trim(), kind: String(r[MX_종류] || '').trim(),
      name: String(r[MX_이름] || '').trim(), url: String(r[MX_주소] || '').trim(),
      label: String(r[MX_분류] || '').trim(), by: String(r[MX_올린이] || '').trim(),
      at: 시각문자열_(r[MX_시각])
    });
  });
  return out;
}

function 선교팀하나_(row, 교적, 소속, 통계) {
  var name = String(row[MT_이름]).trim();
  var members = 선교팀원목록_(name, 교적, 소속, 통계);
  var checks = {};
  선교체크목록().forEach(function (c) { checks[c.key] = 예아니오_(row[c.col]); });

  var 채움 = {};
  선교필수역할.forEach(function (r) {
    채움[r] = members.filter(function (m) { return m.roles.indexOf(r) !== -1; })
      .map(function (m) { return m.name; });
  });

  var 서류완료 = members.filter(function (m) {
    return m.waiver && m.passport && m.cellOk && m.baptismOk;
  }).length;
  var 체크완료 = 선교체크목록().filter(function (c) { return checks[c.key]; }).length;

  return {
    name: name,
    country: String(row[MT_나라] || '').trim(),
    start: 날짜문자열_(row[MT_시작]),
    end: 날짜문자열_(row[MT_종료]),
    status: String(row[MT_상태] || '준비중').trim(),
    checks: checks,
    note: String(row[MT_노트] || '').trim(),
    members: members,
    flights: 선교일정목록_(name),
    filled: 채움,
    missingRoles: 선교필수역할.filter(function (r) { return !채움[r].length; }),
    docsDone: 서류완료,
    files: 선교자료_(name),
    checkDone: 체크완료,
    checkTotal: 선교체크목록().length
  };
}

function 선교팀목록_() {
  var 교적 = 교적맵_(), 소속 = 소속맵_(), 통계 = 출석통계_();
  return rows_(SHEET_선교팀)
    .filter(function (r) { return String(r[MT_이름] || '').trim(); })
    .map(function (r) { return 선교팀하나_(r, 교적, 소속, 통계); })
    .sort(function (a, b) { return (b.start || '').localeCompare(a.start || ''); });
}

/** 한 팀만 다시 만들어 돌려줍니다 (화면 갱신용) */
function 선교팀새로_(name) {
  return 선교팀하나_(선교팀찾기_(name).values, 교적맵_(), 소속맵_(), 출석통계_());
}

function 선교팀찾기_(name) {
  name = String(name || '').trim();
  var sh = 선교팀시트_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][MT_이름]).trim() === name) return { sh: sh, row: i + 1, values: v[i] };
  }
  return null;
}

/* ---- 권한 ---- */

/** 이름 → 이 사람이 맡은 선교팀 (팀장·회계·서기만 편집할 수 있습니다) */
function 선교담당팀_(personName) {
  personName = String(personName || '').trim();
  if (!personName) return [];
  var out = {};
  rows_(SHEET_선교팀원).forEach(function (r) {
    if (String(r[MM_이름]).trim() !== personName) return;
    var roles = String(r[MM_역할] || '').split(',').map(function (x) { return x.trim(); });
    for (var i = 0; i < 선교필수역할.length; i++) {
      if (roles.indexOf(선교필수역할[i]) !== -1) { out[String(r[MM_팀]).trim()] = 1; break; }
    }
  });
  return Object.keys(out);
}

function requireMission_(token, teamName) {
  if (isAdmin_(token)) return;
  var me = 포털본인_(token);
  if (me) {
    var r = 포털역할_(me.name);
    if (r.roles.indexOf('커미티') !== -1) return;
    if (!teamName || 선교담당팀_(me.name).indexOf(String(teamName).trim()) !== -1) return;
  }
  throw new Error('이 선교팀에 대한 권한이 없습니다. 커미티에 문의해주세요.');
}

/* ---- 조회 ---- */

function getMissions(key) {
  requireAdmin_(key);
  선교팀시트_(); 선교팀원시트_(); 선교일정시트_();
  return {
    list: 선교팀목록_(),
    baseUrl: 앱주소_() || '',
    checks: 선교체크목록(),
    statuses: 선교상태,
    roles: 선교기본역할,
    kinds: 선교일정구분,
    names: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); }),
    today: ymd_(new Date())
  };
}

/** 이 사람이 속한 선교팀 (역할과 상관없이 팀원이면 모두) */
function 선교속한팀_(name) {
  name = String(name || '').trim();
  if (!name) return [];
  var out = {};
  rows_(SHEET_선교팀원).forEach(function (r) {
    if (String(r[MM_이름]).trim() === name) out[String(r[MM_팀]).trim()] = 1;
  });
  return Object.keys(out);
}

/** 선교팀 이름에서 연도를 떼어냅니다 — "2026 니카라과 선교팀" → 2026 / 니카라과 */
function 선교연도_(name) {
  var m = /(20\d{2})/.exec(String(name || ''));
  return m ? m[1] : '';
}
function 선교짧은이름_(name, country) {
  var s = String(name || '').replace(/20\d{2}/g, '').replace(/선교팀?/g, '').trim();
  s = s.replace(/^[\s·\-]+|[\s·\-]+$/g, '');
  return s || String(country || '').trim() || String(name || '').trim();
}

/**
 * 선교팀 페이지 — 커미티는 모든 팀, 팀장·회계·서기는 자기 팀을 고칩니다.
 * 그냥 팀원도 자기 팀을 볼 수 있고, 본인 서류(서약서·여권)를 올립니다.
 */
function missionLogin(token) {
  선교팀시트_(); 선교팀원시트_(); 선교일정시트_();
  var all = 선교팀목록_();
  var mine = all, who = '', 커미티 = isAdmin_(token), 편집 = {};

  if (!커미티) {
    var me = 포털본인_(token);
    if (!me) throw new Error('포털에서 다시 들어와 주세요.');
    who = me.name;
    var r = 포털역할_(me.name);
    커미티 = r.roles.indexOf('커미티') !== -1;
    if (!커미티) {
      var 맡은팀 = 선교담당팀_(me.name);
      var 속한팀 = 선교속한팀_(me.name);
      mine = all.filter(function (t) { return 속한팀.indexOf(t.name) !== -1; });
      if (!mine.length) throw new Error('속해 계신 선교팀이 없습니다. 커미티에 문의해주세요.');
      맡은팀.forEach(function (t) { 편집[t] = 1; });
    }
  }
  if (커미티) all.forEach(function (t) { 편집[t.name] = 1; });

  var years = {};
  all.forEach(function (t) { var y = 선교연도_(t.name) || (t.start || '').slice(0, 4); if (y) years[y] = 1; });

  return {
    token: token, who: who, admin: isAdmin_(token), committee: 커미티,
    canEdit: 편집,
    list: mine.map(function (t) {
      t.year = 선교연도_(t.name) || (t.start || '').slice(0, 4);
      t.short = 선교짧은이름_(t.name, t.country);
      return t;
    }),
    years: Object.keys(years).sort().reverse(),
    checks: 선교체크목록(), statuses: 선교상태,
    roles: 선교기본역할, kinds: 선교일정구분,
    names: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); }),
    deadlines: (function () { try { return 마감들_().filter(function (d) { return d.kind === '선교'; }); } catch (e) { return []; } })(),
    today: ymd_(new Date())
  };
}

/* ---- 팀 만들기 · 고치기 ---- */

function saveMission(key, data) {
  requireAdmin_(key);
  data = data || {};
  var name = String(data.name || '').trim();
  if (!name) throw new Error('선교팀 이름을 입력해주세요.');

  var country = String(data.country || '').trim();
  if (!country) throw new Error('나라를 입력해주세요.');

  var start = String(data.start || '').trim(), end = String(data.end || '').trim();
  [start, end].forEach(function (d) {
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('선교 기간을 날짜로 선택해주세요.');
  });
  if (start && end && end < start) throw new Error('종료일이 시작일보다 빠릅니다.');

  var status = String(data.status || '준비중').trim();
  if (선교상태.indexOf(status) === -1) status = '준비중';

  var old = String(data.oldName || '').trim();
  var at = 선교팀찾기_(old || name);
  if (!old || old !== name) {
    var dup = 선교팀찾기_(name);
    if (dup && (!at || dup.row !== at.row)) throw new Error('같은 이름의 선교팀이 이미 있습니다.');
  }

  var sh = 선교팀시트_();
  if (at) {
    sh.getRange(at.row, MT_이름 + 1, 1, 5).setValues([[name, country, start, end, status]]);
    sh.getRange(at.row, MT_노트 + 1).setValue(String(data.note || '').trim());
  } else {
    var row = [];
    for (var z = 0; z < HEAD_선교팀.length; z++) row.push('');
    row[MT_이름] = name; row[MT_나라] = country;
    row[MT_시작] = start; row[MT_종료] = end; row[MT_상태] = status;
    row[MT_노트] = String(data.note || '').trim();
    row[MT_시각] = new Date();
    sh.appendRow(row);
    at = { row: sh.getLastRow() };
  }
  sh.getRange(at.row, MT_시작 + 1, 1, 2).setNumberFormat('@').setValues([[start, end]]);

  if (old && old !== name) {
    renameInColumn_(SHEET_선교팀원, MM_팀, old, name);
    renameInColumn_(SHEET_선교일정, MF_팀, old, name);
  }
  캐시비움_();
  // 기간이 정해지면 청년부 공개 캘린더에도 올려둡니다
  try { 선교일정캘린더_(name, country, start, end, status, old); } catch (e) {}
  return getMissions(key);
}

/**
 * 선교 기간을 청년부 공개 캘린더에 올립니다 (이미 있으면 고칩니다).
 * 캘린더 ID 가 없거나 기간이 비어 있으면 아무 일도 하지 않습니다.
 */
function 선교일정캘린더_(name, country, start, end, status, oldName) {
  var cal = 캘린더_('공개');
  if (!cal || !start) return;
  var title = 선교짧은이름_(name, country) + ' 선교';
  var 찾을이름 = [title, 선교짧은이름_(oldName || name, country) + ' 선교'];
  var from = parseYmd_(start);
  var to = parseYmd_(end || start);
  to.setDate(to.getDate() + 1);          // 하루 종일 일정은 끝날을 하루 뒤로

  // 같은 이름의 일정이 이미 있으면 지우고 다시 만듭니다 (기간이 바뀔 수 있어서)
  try {
    var 앞 = new Date(from.getFullYear() - 1, 0, 1), 뒤 = new Date(from.getFullYear() + 2, 0, 1);
    cal.getEvents(앞, 뒤).forEach(function (ev) {
      var t = String(ev.getTitle() || '').trim();
      if (찾을이름.indexOf(t) !== -1) { try { ev.deleteEvent(); } catch (e) {} }
    });
  } catch (e) {}
  if (status === '취소') return;
  var ev2 = cal.createAllDayEvent(title, from, to);
  try { ev2.setDescription('청년부 선교팀 · ' + name); } catch (e) {}
}

function deleteMission(key, name) {
  requireAdmin_(key);
  name = String(name || '').trim();
  deleteRowsWhere_(SHEET_선교팀, MT_이름, name);
  선교팀원시트_(); deleteRowsWhere_(SHEET_선교팀원, MM_팀, name);
  선교일정시트_(); deleteRowsWhere_(SHEET_선교일정, MF_팀, name);
  캐시비움_();
  return getMissions(key);
}

/** 제출 현황 토글 · 상태 · 노트 — 팀장/회계/서기가 직접 고칩니다 */
function setMissionField(token, name, patch) {
  requireMission_(token, name);
  patch = patch || {};
  var at = 선교팀찾기_(name);
  if (!at) throw new Error('선교팀을 찾을 수 없습니다.');

  선교체크목록().forEach(function (c) {
    if (!patch.hasOwnProperty(c.key)) return;
    at.sh.getRange(at.row, c.col + 1).setValue(patch[c.key] ? '예' : '');
  });
  if (patch.hasOwnProperty('note')) {
    at.sh.getRange(at.row, MT_노트 + 1).setValue(String(patch.note || '').trim());
  }
  if (patch.hasOwnProperty('status')) {
    var st = String(patch.status || '').trim();
    if (선교상태.indexOf(st) !== -1) at.sh.getRange(at.row, MT_상태 + 1).setValue(st);
  }
  캐시비움_();
  return 선교팀새로_(name);
}

/* ---- 팀원 ---- */

function saveMissionMember(token, name, member) {
  requireMission_(token, name);
  member = member || {};
  var who = String(member.name || '').trim();
  if (!who) throw new Error('팀원 이름을 입력해주세요.');

  var roles = (member.roles || []).map(function (r) { return String(r).trim(); })
    .filter(function (r) { return r; });
  if (!roles.length) roles = ['팀원'];

  var sh = 선교팀원시트_(), v = sh.getDataRange().getValues(), target = 0;
  var prev = String(member.oldName || who).trim();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][MM_팀]).trim() === name && String(v[i][MM_이름]).trim() === prev) { target = i + 1; break; }
  }
  if (!target) {
    for (var j = 1; j < v.length; j++) {
      if (String(v[j][MM_팀]).trim() === name && String(v[j][MM_이름]).trim() === who) {
        throw new Error(who + '님은 이미 이 팀에 있습니다.');
      }
    }
  }

  var row = [name, who, roles.join(', '),
    member.waiver ? '예' : '', member.passport ? '예' : '',
    member.cellOk ? '예' : '', member.baptismOk ? '예' : '',
    String(member.memo || '').trim()];

  if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);

  캐시비움_();
  return 선교팀새로_(name);
}

function removeMissionMember(token, name, memberName) {
  requireMission_(token, name);
  memberName = String(memberName || '').trim();
  var sh = 선교팀원시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][MM_팀]).trim() === name && String(v[i][MM_이름]).trim() === memberName) {
      sh.deleteRow(i + 1); break;
    }
  }
  캐시비움_();
  return 선교팀새로_(name);
}

/* ---- 항공 일정 ---- */

/* ---- 제출 자료 (티케팅 · 예산안 · 결산안 · 핸드북 · 보고서) ---- */

function 선교자료폴더_(teamName) {
  var id = 설정값_('선교자료폴더'), root = null;
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) {} }
  if (!root) { root = DriveApp.createFolder('청년부 선교팀 자료'); 설정저장_('선교자료폴더', root.getId()); }
  var it = root.getFoldersByName(teamName);
  return it.hasNext() ? it.next() : root.createFolder(teamName);
}

function 선교항목확인_(key) {
  var ok = 선교체크목록().some(function (c) { return c.key === key; });
  if (!ok) throw new Error('알 수 없는 항목입니다.');
}

function 선교올린이_(token) {
  if (isAdmin_(token)) return '커미티';
  var me = 포털본인_(token);
  return me ? me.name : '';
}

function uploadMissionFile(token, name, key, fileName, dataUrl, label) {
  requireMission_(token, name);
  선교항목확인_(key);
  if (!선교팀찾기_(name)) throw new Error('선교팀을 찾을 수 없습니다.');
  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('파일은 20MB까지 올릴 수 있습니다.');
  var safe = String(fileName || '자료').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 90);
  var file = 선교자료폴더_(name).createFile(Utilities.newBlob(bytes, m[1], safe));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  선교시트_(SHEET_선교첨부, HEAD_선교첨부).appendRow([name, key, file.getId(), 'file', safe,
    'https://drive.google.com/file/d/' + file.getId() + '/view', String(label || '').trim().slice(0, 20),
    선교올린이_(token), new Date()]);
  캐시비움_();
  return 선교팀새로_(name);
}

function addMissionLink(token, name, key, url, title, label) {
  requireMission_(token, name);
  선교항목확인_(key);
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('https:// 로 시작하는 링크를 붙여주세요.');
  var t = String(title || '').trim() || (/docs\.google\.com\/spreadsheets/.test(url) ? '구글 시트' :
    (/docs\.google\.com\/document/.test(url) ? '구글 문서' : '링크'));
  선교시트_(SHEET_선교첨부, HEAD_선교첨부).appendRow([name, key, 'l' + Utilities.getUuid().slice(0, 8), 'link',
    t.slice(0, 90), url.slice(0, 500), String(label || '').trim().slice(0, 20), 선교올린이_(token), new Date()]);
  캐시비움_();
  return 선교팀새로_(name);
}

function removeMissionFile(token, name, id) {
  requireMission_(token, name);
  id = String(id || '').trim();
  var sh = 선교시트_(SHEET_선교첨부, HEAD_선교첨부), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][MX_팀]).trim() === name && String(v[i][MX_ID]).trim() === id) {
      if (String(v[i][MX_종류]) === 'file') { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
      sh.deleteRow(i + 1); break;
    }
  }
  캐시비움_();
  return 선교팀새로_(name);
}

function saveMissionFlight(token, name, flight) {
  requireMission_(token, name);
  flight = flight || {};
  var kind = String(flight.kind || '').trim();
  if (!kind) throw new Error('구분을 선택해주세요.');
  var at = String(flight.at || '').trim();
  if (!at) throw new Error('일시를 입력해주세요.');

  var sh = 선교일정시트_();
  var row = [name, kind, at, String(flight.flight || '').trim(), String(flight.memo || '').trim()];

  var seq = (flight.seq === undefined || flight.seq === null) ? -1 : Number(flight.seq);
  if (seq >= 0) {
    var v = sh.getDataRange().getValues(), n = -1;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][MF_팀]).trim() !== name) continue;
      n++;
      if (n === seq) { sh.getRange(i + 1, 1, 1, row.length).setValues([row]); seq = -2; break; }
    }
    if (seq !== -2) sh.appendRow(row);
  } else sh.appendRow(row);

  캐시비움_();
  return 선교팀새로_(name);
}

function removeMissionFlight(token, name, kind, at) {
  requireMission_(token, name);
  var sh = 선교일정시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][MF_팀]).trim() === name &&
        String(v[i][MF_구분]).trim() === String(kind).trim() &&
        String(v[i][MF_일시]).trim() === String(at).trim()) { sh.deleteRow(i + 1); break; }
  }
  캐시비움_();
  return 선교팀새로_(name);
}

/* =========================================================
   15. 찬양방송팀 허브 — 편성 · 콘티 · 악보 · 댓글
   ---------------------------------------------------------
   화면이 빠르도록, 한 주에 필요한 모든 내용을 한 번에 내려줍니다.
   (실행 한 번 안에서는 시트 준비·권한 확인을 한 번만 합니다)
   ========================================================= */

/** 포지션 — icon 은 화면에서 쓰는 이름, fit 은 사역팀 역할에서 찾을 낱말입니다 */
function 찬양포지션() {
  return [
    { key: 'lead',   label: '인도자',   icon: 'mic',   multi: false, wide: true, fit: ['인도', '리드', 'lead'] },
    { key: 'piano',  label: '피아노',   icon: 'piano', multi: false, fit: ['건반', '피아노', '키보드', 'key'] },
    { key: 'synth',  label: '신디',     icon: 'synth', multi: false, fit: ['건반', '신디', '신스', '키보드', 'key'] },
    { key: 'drum',   label: '드럼',     icon: 'drum',  multi: false, fit: ['드럼', 'drum'] },
    { key: 'bass',   label: '베이스',   icon: 'bass',  multi: false, fit: ['베이스', 'bass'] },
    { key: 'egt',    label: '일렉',     icon: 'egt',   multi: false, fit: ['일렉', '기타', 'guitar'] },
    { key: 'agt',    label: '어쿠기타', icon: 'agt',   multi: false, fit: ['어쿠', '통기타', '기타', 'guitar'] },
    { key: 'mvocal', label: '남싱',     icon: 'voice', multi: true,  fit: ['싱어', '보컬', '남싱', 'vocal'] },
    { key: 'fvocal', label: '여싱',     icon: 'voice', multi: true,  fit: ['싱어', '보컬', '여싱', 'vocal'] },
    // 방송팀 — 음향 (예전 '방송팀' 칸의 이름은 음향으로 옮겨 보입니다) · PPT · 코디
    { key: 'media',  label: '음향',     icon: 'sound', multi: false, fit: ['음향', 'sound', '엔지니어'], bcast: true },
    { key: 'ppt',    label: 'PPT',      icon: 'ppt',   multi: false, fit: ['ppt', '피피티', '자막', '프로프리젠터'], bcast: true },
    { key: 'codi',   label: '코디',     icon: 'codi',  multi: false, fit: ['코디', 'cordi', 'coordi', '진행'], bcast: true },
    { key: 'pray',   label: '토요 기도인도', icon: 'pray', multi: false, optional: true, fit: [] }
  ];
}

/* ---- 시트 준비 (실행당 한 번) ---- */

var 찬양준비됨_ = false;

function 찬양시트준비_() {
  if (찬양준비됨_) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var 필요 = [
    [SHEET_찬양편성, HEAD_찬양편성], [SHEET_찬양불가, HEAD_찬양불가],
    [SHEET_찬양콘티, HEAD_찬양콘티], [SHEET_찬양악보, HEAD_찬양악보],
    [SHEET_찬양주보, HEAD_찬양주보], [SHEET_찬양댓글, HEAD_찬양댓글],
    [SHEET_찬양행사, HEAD_찬양행사], [SHEET_찬양공지, HEAD_찬양공지],
    [SHEET_찬양녹음, HEAD_찬양녹음]
  ];
  var 새로 = false;
  필요.forEach(function (x) {
    if (!ss.getSheetByName(x[0])) { createSheet_(ss, x[0], x[1]); 새로 = true; }
  });
  // 예전 버전에서 만든 시트에 새 칸을 붙입니다
  for (var i = 1; i <= HEAD_찬양콘티.length; i++) ensureColumn_(ss, SHEET_찬양콘티, i, HEAD_찬양콘티[i - 1]);
  for (var j = 1; j <= HEAD_찬양악보.length; j++) ensureColumn_(ss, SHEET_찬양악보, j, HEAD_찬양악보[j - 1]);
  for (var k = 1; k <= HEAD_찬양주보.length; k++) ensureColumn_(ss, SHEET_찬양주보, k, HEAD_찬양주보[k - 1]);
  ensureColumn_(ss, SHEET_찬양녹음, WR_구분 + 1, '구분');
  ensureColumn_(ss, SHEET_찬양행사, WE_세션 + 1, '세션');
  if (새로) 캐시비움_();
  찬양준비됨_ = true;
}

function 찬양시트_(name, head) {
  찬양시트준비_();
  return sheet_(name);
}

/** 설정에서 팀 이름을 읽습니다 (교회마다 팀 이름이 달라도 되도록) */
function 찬양팀이름_() {
  return String(설정값_('찬양팀이름') || 'Kairos 찬양팀').split(',')
    .map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}
function 방송팀이름_() {
  return String(설정값_('방송팀이름') || 'HOPE 방송팀').split(',')
    .map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/** 찬양팀 · 방송팀에 속한 사람 { 이름: { kind, role } } */
function 찬양명단_() {
  if (찬양명단캐시_) return 찬양명단캐시_;
  var 찬양 = 찬양팀이름_(), 방송 = 방송팀이름_();
  var out = {};
  사역팀목록_().forEach(function (t) {
    var 구분 = 찬양.indexOf(t.name) !== -1 ? '찬양' : (방송.indexOf(t.name) !== -1 ? '방송' : '');
    if (!구분) return;
    if (t.leader) out[t.leader] = { kind: 구분, role: out[t.leader] ? out[t.leader].role : '팀장' };
    t.members.forEach(function (m) {
      if (!m.name) return;
      var 기존 = out[m.name] && out[m.name].role ? out[m.name].role : '';
      out[m.name] = { kind: 구분, role: [기존, m.role].filter(function (x) { return x; }).join(' · ') };
    });
  });
  찬양명단캐시_ = out;
  return out;
}

/** 포지션마다 "먼저 보여줄 사람"을 미리 계산해 둡니다 */
function 찬양멤버들_() {
  var c = null;
  try { c = CacheService.getScriptCache().get('찬양멤버v2'); } catch (e) {}
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  var out = 찬양멤버계산_();
  try { CacheService.getScriptCache().put('찬양멤버v2', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

function 찬양멤버계산_() {
  var 명단 = 찬양명단_(), 교적 = 교적맵_(), 포지션 = 찬양포지션();
  return Object.keys(명단).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
    .map(function (n) {
      var info = 명단[n];
      var role = String(info.role || '');
      var 성별 = String((교적[n] || {}).gender || '').trim();
      var fit = [];
      var 방송맞음 = 포지션.filter(function (p) {
        return p.bcast && p.fit.some(function (w) { return role.toLowerCase().indexOf(w.toLowerCase()) !== -1; });
      }).length;
      포지션.forEach(function (p) {
        if (p.bcast) {
          if (info.kind !== '방송') return;
          // 역할이 적혀 있으면 그 자리만, 없으면 방송 세 자리 모두 먼저 보여줍니다
          var 맞 = p.fit.some(function (w) { return role.toLowerCase().indexOf(w.toLowerCase()) !== -1; });
          if (맞 || !방송맞음) fit.push(p.key);
          return;
        }
        if (info.kind !== '찬양') return;
        var 맞음 = p.fit.filter(function (w) { return role.toLowerCase().indexOf(w.toLowerCase()) !== -1; }).length > 0;
        if (!맞음) return;
        if (p.key === 'mvocal' && 성별 === '여') return;
        if (p.key === 'fvocal' && 성별 === '남') return;
        fit.push(p.key);
      });
      var p = 교적[n] || {};
      return { name: n, kind: info.kind, role: role, gender: 성별, fit: fit,
        photo: p.photo || '', photoLarge: p.photoLarge || '' };
    });
}

/* ---- 권한 ---- */

function 찬양권한_(token) {
  var key = String(token || '');
  if (찬양권한캐시_[key]) return 찬양권한캐시_[key];
  찬양시트준비_();

  var out;
  if (isAdmin_(token)) {
    out = { name: '', canEdit: true, admin: true, committee: true };
  } else {
    var me = 포털본인_(token);
    if (!me) throw new Error('포털에서 다시 들어와 주세요.');
    var 명단 = 찬양명단_();
    var r = 포털역할_(me.name);
    var 커미티 = r.roles.indexOf('커미티') !== -1;
    if (!명단[me.name] && !커미티) {
      throw new Error('찬양팀 · 방송팀에 속한 분만 볼 수 있습니다. 커미티에 문의해주세요.');
    }
    out = { name: me.name, canEdit: 커미티 || 찬양팀장_(me.name), admin: false, committee: 커미티 };
  }
  찬양권한캐시_[key] = out;
  return out;
}

/** 찬양 · 방송 팀장이거나 인도자인지 — 이 분들만 편성 · 말씀 · 연습시간을 바꿀 수 있습니다 */
function 찬양팀장_(name) {
  if (!name) return false;
  var 팀 = 찬양팀이름_().concat(방송팀이름_());
  var 팀장 = 사역팀목록_().filter(function (t) {
    return 팀.indexOf(t.name) !== -1 && t.leader === name;
  }).length > 0;
  if (팀장) return true;
  var 명단 = 찬양명단_();
  var role = String((명단[name] || {}).role || '').toLowerCase();
  return role.indexOf('인도') !== -1 || role.indexOf('리드') !== -1 || role.indexOf('lead') !== -1;
}

function requireWorshipEdit_(token) {
  var w = 찬양권한_(token);
  if (!w.canEdit) throw new Error('찬양팀 팀장 · 인도자만 바꿀 수 있습니다. 팀장에게 말씀해 주세요.');
  return w;
}

/** 이번 주일을 기준으로 앞뒤 주일 목록 */
function 주일목록_(back, forward) {
  var base = 이번주기준_();
  var out = [];
  for (var i = -back; i <= forward; i++) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * 7);
    out.push(ymd_(d));
  }
  return out;
}

/** 주일 날짜 → 그 전날(토요일) */
function 전날_(date) {
  var p = String(date).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1);
  return ymd_(d);
}

/* ---- 빠른 쓰기: 한 번에 읽고 한 번에 씁니다 ---- */

/**
 * 조건에 맞는 줄을 지우고 새 줄을 넣습니다.
 * deleteRow 를 반복하지 않으므로 줄이 많아도 느려지지 않습니다.
 */
function 시트치환_(sheetName, head, 버릴까, 새줄, 글자칸) {
  var sh = 찬양시트_(sheetName, head);
  var last = sh.getLastRow();
  var 남길 = [];
  if (last > 1) {
    sh.getRange(2, 1, last - 1, head.length).getValues().forEach(function (r) {
      var 비었나 = r.filter(function (x) { return String(x).trim(); }).length === 0;
      if (!비었나 && !버릴까(r)) 남길.push(r);
    });
  }
  var 결과 = 남길.concat(새줄 || []);
  // 시간 · 날짜를 시트가 멋대로 날짜형으로 바꾸지 않도록 글자로 둡니다 (예: 10:30 → 1899-12-30)
  (글자칸 || []).forEach(function (c) {
    var fix = c.fix || function (v) { return v; };
    결과.forEach(function (r) { r[c.col] = String(fix(r[c.col]) || ''); });
  });
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (결과.length) {
    (글자칸 || []).forEach(function (c) { sh.getRange(2, c.col + 1, 결과.length, 1).setNumberFormat('@'); });
    sh.getRange(2, 1, 결과.length, head.length).setValues(결과);
  }
  캐시비움_();
  return sh;
}

/* ---- 한 주 읽기 ---- */

function 편성맵_(dates) {
  var want = {};
  dates.forEach(function (d) { want[d] = 1; });
  var out = {};
  rows_(SHEET_찬양편성).forEach(function (r) {
    var d = 날짜문자열_(r[WA_날짜]), p = String(r[WA_포지션] || '').trim(),
        n = String(r[WA_이름] || '').trim();
    if (!d || !p || !n || !want[d]) return;
    ((out[d] = out[d] || {})[p] = out[d][p] || []).push(n);
  });
  return out;
}

function 불가맵_(dates) {
  var want = {};
  dates.forEach(function (d) { want[d] = 1; });
  var out = {};
  rows_(SHEET_찬양불가).forEach(function (r) {
    var d = 날짜문자열_(r[WB_날짜]), n = String(r[WB_이름] || '').trim();
    if (!d || !n || !want[d]) return;
    (out[d] = out[d] || []).push({ name: n, reason: String(r[WB_사유] || '').trim() });
  });
  return out;
}

function 콘티목록_(date, 구분) {
  return rows_(SHEET_찬양콘티)
    .filter(function (r) {
      return 날짜문자열_(r[WS_날짜]) === date &&
        (String(r[WS_구분] || '콘티').trim() || '콘티') === 구분;
    })
    .map(function (r) {
      return {
        seq: Number(r[WS_순서]) || 0,
        title: String(r[WS_제목] || '').trim(),
        team: String(r[WS_팀] || '').trim(),
        key: String(r[WS_키] || '').trim(),
        link: String(r[WS_링크] || '').trim(),
        note: String(r[WS_설명] || '').trim(),
        bpm: String(r[WS_BPM] || '').trim(),
        form: String(r[WS_송폼] || '').trim(),
        solo: 솔로읽기_(r[WS_솔로])
      };
    })
    .sort(function (a, b) { return a.seq - b.seq; });
}

/**
 * 솔로 — "김예은:2절|박소망:브릿지" 처럼 한 칸에 적어 둡니다.
 * 방송팀이 누구 마이크를 올릴지 바로 알 수 있게 콘티마다 붙입니다.
 */
function 솔로읽기_(v) {
  return String(v || '').split('|').map(function (x) {
    var i = x.indexOf(':');
    var name = (i === -1 ? x : x.slice(0, i)).trim();
    return { name: name, part: i === -1 ? '' : x.slice(i + 1).trim() };
  }).filter(function (x) { return x.name; });
}
function 솔로쓰기_(list) {
  return (list || []).map(function (x) {
    var n = String((x && x.name) || '').replace(/[|:]/g, ' ').trim().slice(0, 30);
    var p = String((x && x.part) || '').replace(/[|]/g, ' ').trim().slice(0, 40);
    return n ? n + (p ? ':' + p : '') : '';
  }).filter(function (x) { return x; }).join('|');
}

function 악보목록_(date, 구분) {
  return rows_(SHEET_찬양악보)
    .filter(function (r) {
      return 날짜문자열_(r[WF_날짜]) === date &&
        (String(r[WF_구분] || '콘티').trim() || '콘티') === 구분;
    })
    .map(function (r) {
      var id = String(r[WF_파일] || '').trim();
      return {
        id: id, name: String(r[WF_이름] || '').trim(),
        by: String(r[WF_올린이] || '').trim(),
        url: 'https://drive.google.com/file/d/' + id + '/view'
      };
    });
}

function 주보하나_(date) {
  var 기본 = { practice: 시간문자열_(설정값_('찬양연습시간')) || '10:30', verse: '', verseNote: '', verseTitle: '', playlist: '', media: '' };
  var hit = rows_(SHEET_찬양주보).filter(function (r) { return 날짜문자열_(r[WW_날짜]) === date; })[0];
  if (!hit) return 기본;
  return {
    practice: 시간문자열_(hit[WW_연습]) || 기본.practice,
    verse: String(hit[WW_말씀] || '').trim(),
    verseNote: String(hit[WW_설명] || '').trim(),
    verseTitle: String(hit[WW_제목] || '').trim(),
    playlist: String(hit[WW_재생목록] || '').trim(),
    media: String(hit[WW_방송] || '').trim()
  };
}

function 댓글목록_(date) {
  return rows_(SHEET_찬양댓글)
    .filter(function (r) { return 날짜문자열_(r[WC_날짜]) === date && String(r[WC_내용] || '').trim(); })
    .map(function (r) {
      return {
        id: String(r[WC_아이디] || '').trim(),
        by: String(r[WC_작성자] || '').trim(),
        text: String(r[WC_내용] || '').trim(),
        at: 시각문자열_(r[WC_시각])
      };
    })
    .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
}

/**
 * 시트에 "10:30" 을 넣으면 시트가 1899-12-30 10:30 날짜로 바꿔버립니다.
 * 어떤 모양으로 들어 있든 "HH:mm" 으로 돌려놓습니다.
 */
function 시간문자열_(v) {
  if (v === '' || v == null) return '';
  var p2 = function (n) { return ('0' + n).slice(-2); };
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    try { tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || tz; } catch (e) {}
    return Utilities.formatDate(v, tz, 'HH:mm');
  }
  if (typeof v === 'number') {                 // 시트의 시간 숫자 (하루 = 1)
    var m = Math.round((v % 1) * 1440);
    return p2(Math.floor(m / 60) % 24) + ':' + p2(m % 60);
  }
  var t = String(v).trim();
  var hit = /(\d{1,2}):(\d{2})/.exec(t);
  return hit ? p2(Number(hit[1])) + ':' + hit[2] : t;
}

function 시각문자열_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return String(v).slice(0, 16);
}

/** 한 주일(또는 한 행사)의 모든 내용 */
function 한주_(date) {
  date = 예배키_(date);
  var 세션 = 세션키냐_(date);
  var evKey = 세션 ? 세션부모_(date) : date;
  var ev = (행사키냐_(evKey)) ? 행사찾기_(evKey) : null;
  if ((행사키냐_(evKey)) && !ev) throw new Error('행사를 찾지 못했습니다. 지워졌을 수 있습니다.');
  var ses = 세션 ? (ev.sessions || []).filter(function (x) { return x.key === date; })[0] : null;
  if (세션 && !ses) throw new Error('세션을 찾지 못했습니다. 지워졌을 수 있습니다.');
  var paper = 주보하나_(date);
  if (ev) paper.practice = ev.practice;       // 행사는 연습 날짜 · 시간을 따로 정합니다
  // 행사 불가는 행사 전체에 걸리고, 세션만 따로 불가를 표시할 수도 있습니다
  var off = (불가맵_([date])[date] || []);
  if (세션) {
    var seen = {}; off.forEach(function (x) { seen[x.name] = 1; });
    (불가맵_([evKey])[evKey] || []).forEach(function (x) { if (!seen[x.name]) off.push(x); });
  }
  return {
    date: date,
    day: ses ? (ses.date || ev.date) : (ev ? ev.date : date),
    event: ev,
    session: ses,
    saturday: ev ? ev.practiceDate : 전날_(date),
    slots: (편성맵_([date])[date] || {}),
    off: off,
    songs: 콘티목록_(date, '콘티'),
    finals: 콘티목록_(date, '결단'),
    sheets: 악보목록_(date, '콘티'),
    finalSheets: 악보목록_(date, '결단'),
    recs: 녹음목록_(date),
    paper: paper,
    comments: 댓글목록_(date)
  };
}

/* ---- 행사 (수련회 · 부흥회 · 집회) ---- */

function 행사키냐_(k) { return /^ev-[0-9a-z]{6,}$/i.test(String(k || '').trim()); }
/* 수련회처럼 여러 날 · 여러 번 모이는 행사 — 세션마다 따로 편성 · 콘티를 합니다. 키: ev-xxxxxx~s1 */
function 세션키냐_(k) { return /^ev-[0-9a-z]{6,}~[0-9a-z]{1,10}$/i.test(String(k || '').trim()); }
function 세션부모_(k) { return String(k || '').split('~')[0]; }

/** 주일 날짜(yyyy-MM-dd) 또는 행사 ID(ev-…) 만 받습니다 */
function 예배키_(raw) {
  var k = 날짜문자열_(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(k) || 행사키냐_(k) || 세션키냐_(k)) return k;
  throw new Error('날짜를 확인해주세요.');
}

function 행사목록_() {
  return rows_(SHEET_찬양행사)
    .filter(function (r) { return 행사키냐_(r[WE_ID]); })
    .map(function (r) {
      var d = 날짜문자열_(r[WE_날짜]);
      return {
        key: String(r[WE_ID]).trim(),
        name: String(r[WE_이름] || '').trim(),
        kind: String(r[WE_종류] || '').trim() || '행사',
        date: d,
        endDate: 날짜문자열_(r[WE_끝]) || d,
        practiceDate: 날짜문자열_(r[WE_연습날짜]),
        practice: 시간문자열_(r[WE_연습시간]),
        place: String(r[WE_장소] || '').trim(),
        memo: String(r[WE_메모] || '').trim(),
        by: String(r[WE_만든이] || '').trim(),
        sessions: 세션읽기_(String(r[WE_ID]).trim(), r[WE_세션])
      };
    })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function 세션읽기_(evKey, raw) {
  var list = [];
  try { list = JSON.parse(String(raw || '').replace(/^'/, '') || '[]'); } catch (e) { list = []; }
  return (Array.isArray(list) ? list : []).filter(function (x) { return x && x.id && x.label; }).map(function (x) {
    return { key: evKey + '~' + x.id, id: String(x.id), label: String(x.label), date: String(x.date || ''), time: String(x.time || '') };
  }).sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
}

function 행사찾기_(key) {
  key = String(key || '').trim();
  return 행사목록_().filter(function (e) { return e.key === key; })[0] || null;
}

/** 행사 만들기 · 고치기 (팀장 · 인도자 · 커미티) */
function saveWorshipEvent(token, ev) {
  var w = requireWorshipEdit_(token);
  ev = ev || {};
  var name = String(ev.name || '').trim().slice(0, 60);
  if (!name) throw new Error('행사 이름을 적어주세요.');
  var date = 날짜문자열_(ev.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('행사 날짜를 골라주세요.');
  var end = 날짜문자열_(ev.endDate) || date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < date) end = date;
  var pd = 날짜문자열_(ev.practiceDate);
  if (pd && !/^\d{4}-\d{2}-\d{2}$/.test(pd)) pd = '';

  var key = 행사키냐_(ev.key) ? String(ev.key).trim() : 'ev-' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 8).toLowerCase();
  var old = 행사키냐_(ev.key) ? 행사찾기_(key) : null;
  if (행사키냐_(ev.key) && !old) throw new Error('행사를 찾지 못했습니다.');

  // 세션 — [{ id, label, date, time }] (id 는 한 번 정하면 바뀌지 않습니다: 콘티 · 편성이 그 키에 붙어 있으니까요)
  var ses = (ev.sessions || []).map(function (x) {
    var d = 날짜문자열_(x && x.date);
    return {
      id: /^[0-9a-z]{1,10}$/i.test(String(x && x.id || '')) ? String(x.id) : 's' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 5).toLowerCase(),
      label: String(x && x.label || '').trim().slice(0, 30),
      date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '',
      time: 시간문자열_(x && x.time)
    };
  }).filter(function (x) { return x.label; }).slice(0, 20);

  var row = [key, name, String(ev.kind || '행사').trim().slice(0, 20), date, end, pd,
    시간문자열_(ev.practice), String(ev.place || '').trim().slice(0, 100),
    String(ev.memo || '').trim().slice(0, 1000), old ? old.by : (w.name || '커미티'), new Date(),
    ses.length ? JSON.stringify(ses) : ''];

  시트치환_(SHEET_찬양행사, HEAD_찬양행사, function (r) {
    return String(r[WE_ID]).trim() === key;
  }, [row], [{ col: WE_날짜 }, { col: WE_끝 }, { col: WE_연습날짜 }, { col: WE_연습시간, fix: 시간문자열_ }, { col: WE_세션 }]);
  // 지운 세션의 편성 · 콘티는 정리합니다
  if (old) {
    var 남은 = {}; ses.forEach(function (x) { 남은[key + '~' + x.id] = 1; });
    (old.sessions || []).forEach(function (x) { if (!남은[x.key]) 행사자료지우기_(x.key, false); });
  }
  return { events: 행사목록_(), week: 한주_(key) };
}

/** 행사를 지우면 그 행사의 편성 · 콘티 · 악보 · 댓글도 함께 지웁니다 */
function removeWorshipEvent(token, key) {
  requireWorshipEdit_(token);
  key = String(key || '').trim();
  if (!행사키냐_(key)) throw new Error('행사를 찾지 못했습니다.');
  var ev0 = 행사찾기_(key);
  ((ev0 && ev0.sessions) || []).forEach(function (x) { 행사자료지우기_(x.key, false); });
  악보목록_(key, '콘티').concat(악보목록_(key, '결단')).forEach(function (f) {
    try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {}
  });
  rows_(SHEET_찬양녹음).forEach(function (r) {
    var fid = String(r[WR_파일] || '').trim();
    if (fid && 날짜문자열_(r[WR_날짜]) === key) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {} }
  });
  var 같은 = function (col) { return function (r) { return 날짜문자열_(r[col]) === key; }; };
  시트치환_(SHEET_찬양편성, HEAD_찬양편성, 같은(WA_날짜), []);
  시트치환_(SHEET_찬양불가, HEAD_찬양불가, 같은(WB_날짜), []);
  시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, 같은(WS_날짜), []);
  시트치환_(SHEET_찬양악보, HEAD_찬양악보, 같은(WF_날짜), []);
  시트치환_(SHEET_찬양주보, HEAD_찬양주보, 같은(WW_날짜), [], [{ col: WW_연습, fix: 시간문자열_ }]);
  시트치환_(SHEET_찬양댓글, HEAD_찬양댓글, 같은(WC_날짜), []);
  시트치환_(SHEET_찬양녹음, HEAD_찬양녹음, 같은(WR_날짜), []);
  시트치환_(SHEET_찬양행사, HEAD_찬양행사, function (r) { return String(r[WE_ID]).trim() === key; }, []);
  return { events: 행사목록_() };
}

/* ---- 스케줄표 — 앞으로 6개월을 한눈에 ---- */

/**
 * range — next6(앞으로 6개월 · 기본) · around(앞뒤 3개월) · past3 · past6 · past12(지난 기간)
 */
/** 한 예배 키(행사 · 세션)의 편성 · 콘티 · 악보 · 녹음 · 댓글을 지웁니다 */
function 행사자료지우기_(key) {
  악보목록_(key, '콘티').concat(악보목록_(key, '결단')).forEach(function (f) {
    try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {}
  });
  rows_(SHEET_찬양녹음).forEach(function (r) {
    var fid = String(r[WR_파일] || '').trim();
    if (fid && 날짜문자열_(r[WR_날짜]) === key) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {} }
  });
  var 같은 = function (col) { return function (r) { return 날짜문자열_(r[col]) === key; }; };
  시트치환_(SHEET_찬양편성, HEAD_찬양편성, 같은(WA_날짜), []);
  시트치환_(SHEET_찬양불가, HEAD_찬양불가, 같은(WB_날짜), []);
  시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, 같은(WS_날짜), []);
  시트치환_(SHEET_찬양악보, HEAD_찬양악보, 같은(WF_날짜), []);
  시트치환_(SHEET_찬양주보, HEAD_찬양주보, 같은(WW_날짜), [], [{ col: WW_연습, fix: 시간문자열_ }]);
  시트치환_(SHEET_찬양댓글, HEAD_찬양댓글, 같은(WC_날짜), []);
  시트치환_(SHEET_찬양녹음, HEAD_찬양녹음, 같은(WR_날짜), []);
}

function worshipSchedule(token, range) {
  var w = 찬양권한_(token);
  var first = 다가오는주일_();
  var 범위 = { next6: [0, 26], around: [-13, 13], past3: [-13, -1], past6: [-26, -1], past12: [-52, -1] }[range] || [0, 26];
  var dates = [];
  for (var i = 범위[0]; i <= 범위[1]; i++) {
    dates.push(ymd_(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * 7)));
  }
  var last = dates[dates.length - 1];
  var evs = 행사목록_().filter(function (e) { return e.endDate >= dates[0] && e.date <= last; });
  var keys = dates.concat(evs.map(function (e) { return e.key; }));

  var 편성 = 편성맵_(keys), 불가 = 불가맵_(keys);
  var 말씀 = {};
  rows_(SHEET_찬양주보).forEach(function (r) {
    var k = 날짜문자열_(r[WW_날짜]);
    if (k) 말씀[k] = String(r[WW_말씀] || '').trim();
  });
  var 곡수 = {};
  rows_(SHEET_찬양콘티).forEach(function (r) {
    var k = 날짜문자열_(r[WS_날짜]);
    if (k && String(r[WS_제목] || '').trim()) 곡수[k] = (곡수[k] || 0) + 1;
  });

  var rows = dates.map(function (d) {
    return { key: d, date: d, event: null, slots: 편성[d] || {}, off: 불가[d] || [], verse: 말씀[d] || '', songs: 곡수[d] || 0 };
  }).concat(evs.map(function (e) {
    return { key: e.key, date: e.date, event: e, slots: 편성[e.key] || {}, off: 불가[e.key] || [],
      verse: 말씀[e.key] || '', songs: 곡수[e.key] || 0 };
  })).sort(function (a, b) {
    return a.date === b.date ? (a.event ? 1 : -1) : a.date.localeCompare(b.date);
  });
  if (String(range || '').indexOf('past') === 0) rows.reverse();      // 지난 기간은 최근 것부터
  return { rows: rows, range: range || 'next6', mine: w.name ? myUnavailable(token) : [] };
}

/* ---- 팀원 관리 — 찬양팀 · 방송팀 팀장 (커미티는 모두) ---- */

/** 이 사람이 팀원을 관리할 수 있는 팀 이름들 */
function 찬양관리팀_(w) {
  var 팀 = 찬양팀이름_().concat(방송팀이름_());
  var 있는 = 사역팀목록_().filter(function (t) { return 팀.indexOf(t.name) !== -1; });
  if (w.admin || w.committee) return 있는.map(function (t) { return t.name; });
  return 있는.filter(function (t) { return t.leader === w.name; }).map(function (t) { return t.name; });
}

function worshipTeams(token) {
  var w = 찬양권한_(token);
  var mine = 찬양관리팀_(w);
  if (!mine.length) throw new Error('팀장만 팀원을 관리할 수 있습니다.');
  var 찬양 = 찬양팀이름_();
  return {
    teams: 사역팀목록_().filter(function (t) { return mine.indexOf(t.name) !== -1; }).map(function (t) {
      return { name: t.name, kind: 찬양.indexOf(t.name) !== -1 ? '찬양' : '방송', leader: t.leader, members: t.members };
    }),
    names: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
  };
}

function requireWorshipTeam_(token, teamName) {
  var w = 찬양권한_(token);
  if (찬양관리팀_(w).indexOf(String(teamName || '').trim()) === -1) throw new Error('이 팀의 팀장만 팀원을 관리할 수 있습니다.');
  return w;
}

/** 허브에서 팀원 넣기 · 역할 바꾸기 · 빼기 — 바뀐 뒤 편성에 쓰는 멤버 목록까지 돌려줍니다 */
function saveWorshipMember(token, teamName, memberName, roles) {
  requireWorshipTeam_(token, teamName);
  memberName = String(memberName || '').trim();
  if (!memberName) throw new Error('이름을 골라주세요.');
  var team = findTeam_(teamName);
  var 있음 = team.members.some(function (m) { return m.name === memberName; });
  var sh = sheet_(SHEET_사역팀원);
  if (있음) {
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][TM_팀]).trim() === team.name && String(v[i][TM_이름]).trim() === memberName) {
        sh.getRange(i + 1, TM_역할 + 1).setValue(역할정리_(roles));
        break;
      }
    }
  } else {
    sh.appendRow([team.name, memberName, 역할정리_(roles)]);
  }
  캐시비움_();
  return worshipTeamsAfter_(token);
}

function removeWorshipMember(token, teamName, memberName) {
  requireWorshipTeam_(token, teamName);
  var sh = sheet_(SHEET_사역팀원), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][TM_팀]).trim() === String(teamName).trim() &&
        String(v[i][TM_이름]).trim() === String(memberName).trim()) { sh.deleteRow(i + 1); break; }
  }
  캐시비움_();
  return worshipTeamsAfter_(token);
}

function worshipTeamsAfter_(token) {
  var out = worshipTeams(token);
  out.members = 찬양멤버들_();
  return out;
}

/* ---- 공지사항 · 회의록 ---- */

function 공지목록_() {
  return rows_(SHEET_찬양공지)
    .filter(function (r) { return String(r[WN_ID]).trim() && String(r[WN_제목] || r[WN_내용] || '').trim(); })
    .map(function (r) {
      return {
        id: String(r[WN_ID]).trim(),
        kind: String(r[WN_구분] || '공지').trim() || '공지',
        title: String(r[WN_제목] || '').trim(),
        body: String(r[WN_내용] || ''),
        by: String(r[WN_작성자] || '').trim(),
        at: 시각문자열_(r[WN_작성]),
        edited: 시각문자열_(r[WN_수정]),
        pin: String(r[WN_고정] || '').toUpperCase() === 'Y'
      };
    })
    .sort(function (a, b) { return (a.pin === b.pin ? 0 : (a.pin ? -1 : 1)) || b.at.localeCompare(a.at); });
}

function worshipNotices(token) {
  찬양권한_(token);
  return 공지목록_();
}

/** 누구나 글을 쓸 수 있고, 고치기 · 지우기는 쓴 사람이나 팀장 · 인도자 · 커미티 */
function saveWorshipNotice(token, n) {
  var w = 찬양권한_(token);
  n = n || {};
  var title = String(n.title || '').trim().slice(0, 120);
  var body = String(n.body || '').replace(/\s+$/, '').slice(0, 20000);
  if (!title) throw new Error('제목을 적어주세요.');
  var id = String(n.id || '').trim();
  var old = id ? 공지목록_().filter(function (x) { return x.id === id; })[0] : null;
  if (id && !old) throw new Error('글을 찾지 못했습니다. 지워졌을 수 있습니다.');
  if (old && !(w.canEdit || w.committee || (w.name && old.by === w.name))) throw new Error('쓴 분만 고칠 수 있습니다.');
  var pin = (w.canEdit || w.committee) ? !!n.pin : (old ? old.pin : false);
  var kind = String(n.kind || '공지').trim() === '회의록' ? '회의록' : '공지';
  var now = new Date();
  var row = [id || 'n' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 10), kind, title, body,
    old ? old.by : (w.name || '커미티'), old ? old.at : ymd_(now) + ' ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'),
    old ? ymd_(now) + ' ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm') : '', pin ? 'Y' : ''];
  시트치환_(SHEET_찬양공지, HEAD_찬양공지, function (r) { return String(r[WN_ID]).trim() === row[0]; }, [row],
    [{ col: WN_제목 }, { col: WN_내용 }, { col: WN_작성 }, { col: WN_수정 }]);
  return 공지목록_();
}

function removeWorshipNotice(token, id) {
  var w = 찬양권한_(token);
  var old = 공지목록_().filter(function (x) { return x.id === String(id || '').trim(); })[0];
  if (!old) return 공지목록_();
  if (!(w.canEdit || w.committee || (w.name && old.by === w.name))) throw new Error('쓴 분만 지울 수 있습니다.');
  시트치환_(SHEET_찬양공지, HEAD_찬양공지, function (r) { return String(r[WN_ID]).trim() === old.id; }, [],
    [{ col: WN_제목 }, { col: WN_내용 }, { col: WN_작성 }, { col: WN_수정 }]);
  return 공지목록_();
}

/* ---- 아카이브 — 지금까지의 콘티 · 악보를 한곳에 ---- */

function worshipArchive(token) {
  찬양권한_(token);
  var 행사 = {};
  행사목록_().forEach(function (e) {
    행사[e.key] = e;
    (e.sessions || []).forEach(function (x) {
      행사[x.key] = { key: x.key, name: e.name + ' · ' + x.label, kind: e.kind, date: x.date || e.date };
    });
  });
  var 날 = {};
  function 하나(k) {
    if (!날[k]) {
      var e = 행사[k];
      날[k] = { key: k, date: e ? e.date : k, event: e ? { name: e.name, kind: e.kind } : null,
        lead: [], songs: [], files: [], recs: [] };
    }
    return 날[k];
  }
  rows_(SHEET_찬양콘티).forEach(function (r) {
    var k = 날짜문자열_(r[WS_날짜]), t = String(r[WS_제목] || '').trim();
    if (!k || !t) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) && !행사[k]) return;
    하나(k).songs.push({
      seq: Number(r[WS_순서]) || 0, kind: 구분정리_(r[WS_구분]), title: t,
      team: String(r[WS_팀] || '').trim(), key: String(r[WS_키] || '').trim(),
      link: String(r[WS_링크] || '').trim(), bpm: String(r[WS_BPM] || '').trim(),
      solo: 솔로읽기_(r[WS_솔로])
    });
  });
  rows_(SHEET_찬양악보).forEach(function (r) {
    var k = 날짜문자열_(r[WF_날짜]), id = String(r[WF_파일] || '').trim();
    if (!k || !id) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) && !행사[k]) return;
    하나(k).files.push({ id: id, name: String(r[WF_이름] || '').trim(), kind: 구분정리_(r[WF_구분]),
      url: 'https://drive.google.com/file/d/' + id + '/view' });
  });
  rows_(SHEET_찬양녹음).forEach(function (r) {
    var k = 날짜문자열_(r[WR_날짜]);
    if (!k || !String(r[WR_ID] || '').trim()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) && !행사[k]) return;
    하나(k).recs.push(녹음정리_(r));
  });
  rows_(SHEET_찬양편성).forEach(function (r) {
    var k = 날짜문자열_(r[WA_날짜]);
    if (날[k] && String(r[WA_포지션]).trim() === 'lead') 날[k].lead.push(String(r[WA_이름] || '').trim());
  });
  var list = Object.keys(날).map(function (k) {
    var x = 날[k];
    x.songs.sort(function (a, b) { return (a.kind === b.kind ? 0 : (a.kind === '결단' ? 1 : -1)) || a.seq - b.seq; });
    return x;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  return { today: ymd_(new Date()), days: list };
}

/* ---- 콘티 통계 — 지금까지 부른 곡 전부 (오늘까지) ---- */

function worshipStats(token) {
  찬양권한_(token);
  var 오늘 = ymd_(new Date());
  var 행사 = {};
  행사목록_().forEach(function (e) { 행사[e.key] = e; });
  var 날짜 = function (k) { return 행사[k] ? 행사[k].date : k; };

  var 편성 = {};
  rows_(SHEET_찬양편성).forEach(function (r) {
    var k = 날짜문자열_(r[WA_날짜]), p = String(r[WA_포지션] || '').trim(), n = String(r[WA_이름] || '').trim();
    if (!k || !p || !n) return;
    var x = 편성[k] = 편성[k] || { lead: [], people: [] };
    if (p === 'lead' && x.lead.indexOf(n) === -1) x.lead.push(n);
    if (p !== 'pray' && x.people.indexOf(n) === -1) x.people.push(n);
  });

  var songs = [];
  rows_(SHEET_찬양콘티).forEach(function (r) {
    var k = 날짜문자열_(r[WS_날짜]), t = String(r[WS_제목] || '').trim();
    if (!k || !t) return;
    var d = 날짜(k);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;      // 앞으로 예정된 콘티도 함께 셉니다
    songs.push([k, d, 구분정리_(r[WS_구분]), t, String(r[WS_팀] || '').trim(), String(r[WS_키] || '').trim()]);
  });

  var 쓴 = {};
  songs.forEach(function (x) { 쓴[x[0]] = 1; });
  var lineups = {};
  Object.keys(쓴).forEach(function (k) { if (편성[k]) lineups[k] = 편성[k]; });
  var events = {};
  Object.keys(쓴).forEach(function (k) { if (행사[k]) events[k] = 행사[k].kind + ' · ' + 행사[k].name; });

  return { today: 오늘, songs: songs, lineups: lineups, events: events };
}

/* ---- 첫 화면: 로그인 + 첫 주 내용을 한 번에 ---- */

function worshipHub(token, date) {
  var w = 찬양권한_(token);
  var dates = 주일목록_(3, 8);
  var thisWeek = ymd_(이번주기준_());
  var nextWeek = ymd_(다가오는주일_());     // 주일이 지나면 다음 주일을 먼저 보여드립니다
  date = 예배키_(date || nextWeek);
  if (!행사키냐_(date) && dates.indexOf(date) === -1) { dates.push(date); dates.sort(); }

  // 주차 줄에 행사도 날짜 순서대로 끼워 넣습니다 (지난 3주 ~ 앞으로 6개월)
  var 행사들 = 행사목록_();
  var 끝 = ymd_(new Date(new Date().getFullYear(), new Date().getMonth() + 6, new Date().getDate()));
  var 보일행사 = 행사들.filter(function (e) {
    return (e.endDate >= dates[0] && e.date <= 끝) || e.key === date;
  });
  var keys = dates.concat(보일행사.map(function (e) { return e.key; }));

  var 편성 = 편성맵_(keys), 불가 = 불가맵_(keys);
  var 포지션 = 찬양포지션();
  var 필수 = 포지션.filter(function (p) { return !p.multi && !p.optional; }).length;
  var 칸 = function (k) {
    var slot = 편성[k] || {};
    return 포지션.filter(function (p) { return !p.multi && !p.optional && (slot[p.key] || []).length; }).length;
  };

  var weeks = dates.map(function (d) {
    return { date: d, day: d, filled: 칸(d), need: 필수, off: (불가[d] || []).length };
  }).concat(보일행사.map(function (e) {
    return { date: e.key, day: e.date, event: { name: e.name, kind: e.kind }, filled: 칸(e.key), need: 필수,
      off: (불가[e.key] || []).length };
  })).sort(function (a, b) {
    return a.day === b.day ? (a.event ? 1 : -1) : a.day.localeCompare(b.day);
  });

  return {
    who: w.name, canEdit: w.canEdit, admin: w.admin, committee: w.committee,
    positions: 포지션, weeks: weeks,
    today: ymd_(new Date()), thisWeek: thisWeek, nextWeek: nextWeek,
    members: 찬양멤버들_(),
    mine: w.name ? myUnavailable(token) : [],
    events: 행사들,
    manage: 찬양관리팀_(w),
    week: 한주_(date)
  };
}

/** 한 주만 다시 읽기 (달력에서 다른 주를 고를 때) */
function getWorshipWeek(token, date) {
  찬양권한_(token);
  return 한주_(date);
}

/* ---- 편성 ---- */

function setWorshipSlot(token, date, posKey, names) {
  requireWorshipEdit_(token);
  date = 예배키_(date);
  posKey = String(posKey || '').trim();
  if (!찬양포지션().filter(function (p) { return p.key === posKey; }).length) {
    throw new Error('알 수 없는 포지션입니다.');
  }

  var 본 = {};
  var list = (names || []).map(function (n) { return String(n).trim().slice(0, 30); })
    .filter(function (n) { if (!n || 본[n]) return false; 본[n] = 1; return true; });

  시트치환_(SHEET_찬양편성, HEAD_찬양편성, function (r) {
    return 날짜문자열_(r[WA_날짜]) === date && String(r[WA_포지션]).trim() === posKey;
  }, list.map(function (n) { return [date, posKey, n]; }));

  return 한주_(date);
}

/** 편성 전체를 한 번에 저장 */
function saveWorshipPlan(token, date, slots) {
  requireWorshipEdit_(token);
  date = 예배키_(date);

  var rows = [];
  찬양포지션().forEach(function (p) {
    ((slots || {})[p.key] || []).forEach(function (n) {
      n = String(n || '').trim().slice(0, 30);
      if (n) rows.push([date, p.key, n]);
    });
  });
  시트치환_(SHEET_찬양편성, HEAD_찬양편성, function (r) {
    return 날짜문자열_(r[WA_날짜]) === date;
  }, rows);
  return 한주_(date);
}

/* ---- 연습시간 · 이 주의 말씀 · 재생목록 ---- */

function saveWorshipPaper(token, date, info) {
  requireWorshipEdit_(token);
  date = 예배키_(date);
  info = info || {};

  var row = [date,
    시간문자열_(info.practice).slice(0, 20),
    String(info.verse || '').trim().slice(0, 200),
    String(info.verseNote || '').trim().slice(0, 1000),
    String(info.playlist || '').trim().slice(0, 500),
    String(info.media || '').replace(/\s+$/, '').slice(0, 3000),
    String(info.verseTitle || '').trim().slice(0, 200)];

  시트치환_(SHEET_찬양주보, HEAD_찬양주보, function (r) {
    return 날짜문자열_(r[WW_날짜]) === date;
  }, [row], [{ col: WW_연습, fix: 시간문자열_ }, { col: WW_방송 }]);
  return 한주_(date);
}

/* ---- 본인 불가 날짜 ---- */

function setMyUnavailable(token, date, reason) {
  var w = 찬양권한_(token);
  if (!w.name) throw new Error('포털에서 들어오셔야 표시할 수 있습니다.');
  date = 날짜문자열_(date);
  reason = String(reason || '').trim().slice(0, 100);
  if (!reason) throw new Error('사유를 적어주세요.');

  시트치환_(SHEET_찬양불가, HEAD_찬양불가, function (r) {
    return String(r[WB_이름]).trim() === w.name && 날짜문자열_(r[WB_날짜]) === date;
  }, [[w.name, date, reason, new Date()]]);
  return myUnavailable(token);
}

/** 여러 날짜를 한 번에 표시·해제합니다 (달력에서 쓰기 좋게) */
function setMyUnavailableMany(token, dates, reason) {
  var w = 찬양권한_(token);
  if (!w.name) throw new Error('포털에서 들어오셔야 표시할 수 있습니다.');
  reason = String(reason || '').trim().slice(0, 100);
  if (!reason) throw new Error('사유를 적어주세요.');

  var want = {};
  (dates || []).forEach(function (d) {
    d = 날짜문자열_(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) || 행사키냐_(d) || 세션키냐_(d)) want[d] = 1;
  });
  var 목록 = Object.keys(want);
  if (!목록.length) throw new Error('날짜를 골라주세요.');

  시트치환_(SHEET_찬양불가, HEAD_찬양불가, function (r) {
    return String(r[WB_이름]).trim() === w.name && want[날짜문자열_(r[WB_날짜])];
  }, 목록.map(function (d) { return [w.name, d, reason, new Date()]; }));
  return myUnavailable(token);
}

function removeMyUnavailable(token, date) {
  var w = 찬양권한_(token);
  if (!w.name) throw new Error('포털에서 들어오셔야 합니다.');
  date = 날짜문자열_(date);
  시트치환_(SHEET_찬양불가, HEAD_찬양불가, function (r) {
    return String(r[WB_이름]).trim() === w.name && 날짜문자열_(r[WB_날짜]) === date;
  }, []);
  return myUnavailable(token);
}

function myUnavailable(token) {
  var w = 찬양권한_(token);
  if (!w.name) return [];
  var 오늘 = ymd_(new Date());
  var 행사 = {};
  행사목록_().forEach(function (e) { 행사[e.key] = e; });
  return rows_(SHEET_찬양불가)
    .filter(function (r) { return String(r[WB_이름]).trim() === w.name; })
    .map(function (r) {
      var k = 날짜문자열_(r[WB_날짜]), e = 행사[k];
      return { date: k, day: e ? e.endDate : k, label: e ? e.name : '', reason: String(r[WB_사유] || '').trim() };
    })
    .filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x.day) && x.day >= 오늘; })
    .sort(function (a, b) { return a.day.localeCompare(b.day); });
}

/* ---- 콘티 · 결단찬양 ---- */

function 구분정리_(kind) {
  return String(kind || '콘티').trim() === '결단' ? '결단' : '콘티';
}

function saveWorshipSong(token, date, song) {
  requireWorshipEdit_(token);
  date = 날짜문자열_(date);
  song = song || {};
  var kind = 구분정리_(song.kind);
  var title = String(song.title || '').trim();
  if (!title) throw new Error('찬양 제목을 입력해주세요.');

  var seq = Number(song.seq) || 0;
  if (!seq) {
    var max = 0;
    콘티목록_(date, kind).forEach(function (s) { max = Math.max(max, s.seq); });
    seq = max + 1;
  }

  var row = [date, seq, title, String(song.team || '').trim(), String(song.key || '').trim(),
    String(song.link || '').trim(), String(song.note || '').trim(), kind,
    String(song.bpm || '').trim().slice(0, 10), String(song.form || '').trim().slice(0, 120),
    솔로쓰기_(song.solo)];

  시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, function (r) {
    return 날짜문자열_(r[WS_날짜]) === date && Number(r[WS_순서]) === seq &&
      구분정리_(r[WS_구분]) === kind;
  }, [row]);
  return 한주_(date);
}

function removeWorshipSong(token, date, seq, kind) {
  requireWorshipEdit_(token);
  date = 날짜문자열_(date);
  kind = 구분정리_(kind);
  시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, function (r) {
    return 날짜문자열_(r[WS_날짜]) === date && Number(r[WS_순서]) === Number(seq) &&
      구분정리_(r[WS_구분]) === kind;
  }, []);
  return 한주_(date);
}

/* ---- 악보 (PDF · 사진) ---- */

function 찬양악보폴더_() {
  var id = 설정값_('찬양악보폴더');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var folder = DriveApp.createFolder('청년부 찬양 악보');
  설정저장_('찬양악보폴더', folder.getId());
  return folder;
}

function uploadWorshipSheet(token, date, fileName, dataUrl, kind) {
  var w = requireWorshipEdit_(token);
  date = 날짜문자열_(date);
  kind = 구분정리_(kind);
  date = 예배키_(date);

  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다.');
  var mime = m[1].toLowerCase();
  if (mime !== 'application/pdf' && mime.indexOf('image/') !== 0) {
    throw new Error('PDF 또는 사진 파일만 올릴 수 있습니다.');
  }
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('파일은 20MB까지 올릴 수 있습니다.');

  var root = 찬양악보폴더_();
  var it = root.getFoldersByName(date);
  var folder = it.hasNext() ? it.next() : root.createFolder(date);

  var safe = String(fileName || '악보.pdf').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  var file = folder.createFile(Utilities.newBlob(bytes, mime, safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var sh = 찬양시트_(SHEET_찬양악보, HEAD_찬양악보);
  sh.appendRow([date, file.getId(), safe, w.name || '커미티', new Date(), kind]);
  sh.getRange(sh.getLastRow(), WF_날짜 + 1).setNumberFormat('@').setValue(date);

  캐시비움_();
  return 한주_(date);
}

function removeWorshipSheet(token, date, fileId) {
  requireWorshipEdit_(token);
  date = 날짜문자열_(date);
  fileId = String(fileId || '').trim();
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
  시트치환_(SHEET_찬양악보, HEAD_찬양악보, function (r) {
    return 날짜문자열_(r[WF_날짜]) === date && String(r[WF_파일]).trim() === fileId;
  }, []);
  return 한주_(date);
}

/* ---- 녹음 — 연습 녹음 · 예배 녹음 (mp3 · m4a 올리기, 또는 구글 드라이브 링크) ----
   팀원 누구나 올릴 수 있고, 올린 사람 · 팀장 · 인도자 · 커미티가 지울 수 있습니다. */

/** 드라이브 링크에서 파일 ID 를 뽑습니다 (폴더 · 다른 사이트는 '') */
function 드라이브파일ID_(url) {
  var s = String(url || '');
  if (!/(drive|docs)\.google\.com/.test(s) || /\/folders\//.test(s)) return '';
  var m = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  return m ? m[1] : '';
}

/** 녹음 구분 — '연습' (토요 연습 · 행사 전 연습) 또는 '예배' (주일 예배 · 행사 실황) */
function 녹음구분_(k) { return String(k || '').trim() === '예배' ? '예배' : '연습'; }

function 녹음정리_(r) {
  var fileId = String(r[WR_파일] || '').trim();
  var link = String(r[WR_링크] || '').trim();
  var did = fileId || 드라이브파일ID_(link);
  return {
    id: String(r[WR_ID] || '').trim(),
    kind: 녹음구분_(r[WR_구분]),
    title: String(r[WR_제목] || '').trim() || (녹음구분_(r[WR_구분]) === '예배' ? '예배 녹음' : '연습 녹음'),
    by: String(r[WR_올린이] || '').trim(),
    at: r[WR_시각] instanceof Date ? ymd_(r[WR_시각]) : String(r[WR_시각] || '').slice(0, 10),
    uploaded: !!fileId,
    // 드라이브 파일이면 바로 재생, 아니면 링크로 엽니다
    // 서버가 드라이브에서 바로 흘려보냅니다 (/audio/…) — 앞뒤로 옮기기 · 볼륨이 되는 기본 재생기
    play: did ? '/audio/' + did : '',
    preview: did ? 'https://drive.google.com/file/d/' + did + '/preview' : '',
    url: fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : link
  };
}

function 녹음목록_(date) {
  return rows_(SHEET_찬양녹음)
    .filter(function (r) { return 날짜문자열_(r[WR_날짜]) === date && String(r[WR_ID] || '').trim(); })
    .map(녹음정리_);
}

function 녹음추가_(w, date, title, fileId, link, kind) {
  var id = 'rc-' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 10).toLowerCase();
  var sh = 찬양시트_(SHEET_찬양녹음, HEAD_찬양녹음);
  sh.appendRow([date, id, String(title || '').trim().slice(0, 80), fileId || '', link || '', w.name || '커미티', new Date(), 녹음구분_(kind)]);
  sh.getRange(sh.getLastRow(), WR_날짜 + 1).setNumberFormat('@').setValue(date);
  캐시비움_();
  return 한주_(date);
}

function uploadWorshipRecording(token, date, fileName, dataUrl, title, kind) {
  var w = 찬양권한_(token);
  date = 예배키_(날짜문자열_(date));
  var m = /^data:([a-zA-Z0-9.+\/-]*);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다.');
  var mime = (m[1] || '').toLowerCase();
  var ext = (/\.([a-z0-9]+)$/i.exec(String(fileName || '')) || ['', ''])[1].toLowerCase();
  var 소리 = mime.indexOf('audio/') === 0 || /^(mp3|m4a|wav|aac|ogg|flac)$/.test(ext);
  if (!소리) throw new Error('mp3 · m4a 같은 녹음 파일만 올릴 수 있습니다.');
  if (mime.indexOf('audio/') !== 0) mime = ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 30 * 1024 * 1024) {
    throw new Error('30MB 가 넘는 파일은 구글 드라이브에 올린 뒤 "링크 걸기" 로 붙여주세요.');
  }

  var root = 찬양악보폴더_();
  var it = root.getFoldersByName(date);
  var folder = it.hasNext() ? it.next() : root.createFolder(date);
  var safe = String(fileName || '녹음.mp3').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  var file = folder.createFile(Utilities.newBlob(bytes, mime, safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 녹음추가_(w, date, title || safe.replace(/\.[a-z0-9]+$/i, ''), file.getId(), '', kind);
}

function addWorshipRecordingLink(token, date, url, title, kind) {
  var w = 찬양권한_(token);
  date = 예배키_(날짜문자열_(date));
  url = String(url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('링크를 확인해주세요. (https:// 로 시작)');
  return 녹음추가_(w, date, title || '', '', url.slice(0, 500), kind);
}

function removeWorshipRecording(token, date, id) {
  var w = 찬양권한_(token);
  date = 예배키_(날짜문자열_(date));
  id = String(id || '').trim();
  var row = rows_(SHEET_찬양녹음).filter(function (r) {
    return 날짜문자열_(r[WR_날짜]) === date && String(r[WR_ID]).trim() === id;
  })[0];
  if (!row) throw new Error('녹음을 찾지 못했습니다. 이미 지워졌을 수 있습니다.');
  if (!w.canEdit && String(row[WR_올린이]).trim() !== w.name) {
    throw new Error('올린 분이나 팀장 · 인도자만 지울 수 있습니다.');
  }
  var fid = String(row[WR_파일] || '').trim();
  if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {} }
  시트치환_(SHEET_찬양녹음, HEAD_찬양녹음, function (r) {
    return 날짜문자열_(r[WR_날짜]) === date && String(r[WR_ID]).trim() === id;
  }, [], [{ col: WR_날짜 }]);
  return 한주_(date);
}

/* ---- 댓글 — 누구나 남길 수 있고, 이름이 함께 남습니다 ---- */

function addWorshipComment(token, date, text) {
  var w = 찬양권한_(token);
  date = 날짜문자열_(date);
  text = String(text || '').trim().slice(0, 1000);
  if (!text) throw new Error('내용을 적어주세요.');
  date = 예배키_(date);

  var sh = 찬양시트_(SHEET_찬양댓글, HEAD_찬양댓글);
  sh.appendRow([date, w.name || '커미티', text, new Date(), Utilities.getUuid().slice(0, 8)]);
  sh.getRange(sh.getLastRow(), WC_날짜 + 1).setNumberFormat('@').setValue(date);
  캐시비움_();
  return 댓글목록_(date);
}

function removeWorshipComment(token, date, id) {
  var w = 찬양권한_(token);
  date = 날짜문자열_(date);
  id = String(id || '').trim();

  var 하나 = 댓글목록_(date).filter(function (c) { return c.id === id; })[0];
  if (!하나) return 댓글목록_(date);
  // 본인 글이거나, 커미티 · 팀장이면 지울 수 있습니다
  if (!(w.committee || w.canEdit || (w.name && 하나.by === w.name))) {
    throw new Error('본인이 남긴 글만 지울 수 있습니다.');
  }
  시트치환_(SHEET_찬양댓글, HEAD_찬양댓글, function (r) {
    return 날짜문자열_(r[WC_날짜]) === date && String(r[WC_아이디]).trim() === id;
  }, []);
  return 댓글목록_(date);
}

/* =========================================================
   17. 구글 계정으로 포털 로그인
   ---------------------------------------------------------
   두 가지 길을 다 받습니다.
     1) 같은 Google Workspace 안이면 — 접속한 계정을 바로 읽어 통과
     2) 그 밖의 계정(gmail 등)이면 — 구글 로그인 화면을 거쳐 이메일을 확인
   어느 쪽이든 "교적에 적힌 이메일"과 같아야 들어옵니다.
   설정에 클라이언트 ID·시크릿이 없으면 이 기능은 조용히 꺼집니다.
   ========================================================= */

function 구글로그인사용_() {
  return String(설정값_('구글로그인') || 'ON').toUpperCase() !== 'OFF';
}
function 구글ID_() { return String(설정값_('구글클라이언트ID') || '').trim(); }
function 구글시크릿_() { return String(설정값_('구글클라이언트시크릿') || '').trim(); }
function 구글준비됨_() { return 구글로그인사용_() && !!구글ID_() && !!구글시크릿_(); }

/** 지금 접속한 구글 계정 (같은 Workspace 일 때만 값이 옵니다) */
function 접속계정_() { return ''; }

/** 이메일로 교적에서 한 사람을 찾습니다 (대소문자 무시) */
function 이메일찾기_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  var 교적 = 교적맵_(), hit = null;
  Object.keys(교적).forEach(function (n) {
    if (hit) return;
    if (String(교적[n].email || '').trim().toLowerCase() === email) hit = 교적[n];
  });
  return hit;
}

/** 이메일이 맞는 분께 포털 토큰을 내어줍니다 */
function 이메일로토큰_(email) {
  var me = 이메일찾기_(email);
  if (!me) {
    throw new Error(email + ' 로 등록된 교적을 찾지 못했습니다. ' +
      '커미티에 이메일 등록을 부탁드리거나, 이름·전화번호로 들어와 주세요.');
  }
  var key = 전화키_(me.phone);
  if (!key) throw new Error('교적에 전화번호가 없어 들어올 수 없습니다. 커미티에 문의해주세요.');
  var need = 우편확인사용_() ? 우편키_(me.address) : '';
  return 포털토큰_(me.name, key, need);
}

/** 되돌아올 때 위조를 막는 표식 */
function 구글표식_() {
  var stamp = String(Math.floor(new Date().getTime() / 1000));
  return stamp + '.' + 포털서명_('g:' + stamp);
}
function 구글표식확인_(state) {
  var p = String(state || '').split('.');
  if (p.length !== 2 && p.length !== 3) return false;
  if (포털서명_('g:' + p[0]) !== p[1]) return false;
  var age = Math.floor(new Date().getTime() / 1000) - Number(p[0]);
  // 30분 안에 돌아와야 합니다 (시크릿 모드에서는 구글 계정 로그인부터 해야 해서 넉넉히 둡니다)
  return age >= 0 && age < 1800;
}

function 포털주소_() { return 앱주소_() + '?page=portal'; }

/** 구글 로그인 화면 주소 */
function 구글로그인주소_(intent) {
  if (!구글준비됨_()) return '';
  var st = 구글표식_() + (intent === 'newcomer' ? '.nf' : '');
  return 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(구글ID_()) +
    '&redirect_uri=' + encodeURIComponent(포털주소_()) +
    '&response_type=code&scope=' + encodeURIComponent('openid email') +
    '&access_type=online' +
    '&state=' + encodeURIComponent(st);
}

/** 로그인 화면에서 쓸 새 구글 로그인 주소 (15분 표식이 지나지 않도록 그때그때 받습니다) */
function portalGoogleUrl(intent) { return 구글로그인주소_(intent); }

/** 돌아온 code 를 이메일로 바꿉니다 */
function 구글이메일_(code) {
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: {
      code: code, client_id: 구글ID_(), client_secret: 구글시크릿_(),
      redirect_uri: 포털주소_(), grant_type: 'authorization_code'
    }
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (!body.id_token) throw new Error('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');

  var info = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.id_token),
    { muteHttpExceptions: true });
  var claim = {};
  try { claim = JSON.parse(info.getContentText()); } catch (e) {}
  if (String(claim.aud || '') !== 구글ID_()) throw new Error('구글 로그인 확인에 실패했습니다.');
  if (String(claim.email_verified) !== 'true') throw new Error('구글 계정의 이메일이 확인되지 않았습니다.');
  return String(claim.email || '').trim().toLowerCase();
}

/** 포털을 열 때 부르는 준비 — 자동 로그인 여부와 버튼 주소를 정합니다 */
function 포털입구_(p) {
  var out = { token: '', googleUrl: '', err: '', email: '' };
  if (p.state && String(p.state).split('.')[2] === 'nf') out.intent = 'newcomer';

  // 1) 구글에서 돌아온 길
  if (p.code) {
    try {
      if (!구글표식확인_(p.state)) throw new Error('로그인 시간이 지났습니다. 다시 시도해주세요.');
      var email = 구글이메일_(p.code);
      out.email = email;
      // 교적에 이 구글 이메일이 없으면 — 한 번만 본인 확인을 받아 교적에 연결합니다
      // (새가족 등록으로 들어온 분은 등록 양식을 보여줍니다)
      if (!이메일찾기_(email)) {
        out.link = 구글연결표_(email);
        var 등록 = 새가족찾기_(email);
        if (out.intent === 'newcomer') {
          out.newcomer = { mine: 새가족내등록_(email), options: 새가족등록선택지_() };
          if (등록) out.nfToken = 새가족토큰_(email);
        } else if (등록) {
          // 새가족으로 등록한 분 — 새가족 포털로 들어갑니다
          out.nfToken = 새가족토큰_(email);
          try { out.nfHome = newcomerHome(out.nfToken); } catch (e3) {}
        }
        return out;
      }
      if (out.intent === 'newcomer') out.already = true;
      out.token = 이메일로토큰_(email);
      try { out.data = 포털자료_(out.token); } catch (e2) {}
      return out;
    } catch (e) {
      out.err = e.message || '구글 로그인에 실패했습니다.';
    }
  }

  // 2) 같은 Workspace 계정이면 그대로 통과
  if (!out.token && 구글로그인사용_()) {
    var mine = 접속계정_();
    if (mine) {
      // 교적에 없는 계정이면 조용히 지나갑니다 (이름·전화번호로 들어오시면 됩니다)
      try {
        out.token = 이메일로토큰_(mine); out.email = mine;
        out.data = 포털자료_(out.token);
      } catch (e) {}
    }
  }

  if (!out.token) out.googleUrl = 구글로그인주소_();
  return out;
}

/* =========================================================
   16. 일정 — 구글 캘린더 연동
   ---------------------------------------------------------
   캘린더 두 개를 씁니다.
     · 공개   — 청년부 행사 일정 (포털에서 누구나 봅니다)
     · 커미티 — 커미티만 보는 일정 (관리 페이지에서만)
   설정 탭에 캘린더 ID 를 넣으면 곧바로 이어집니다.
   ID 가 비어 있으면 화면에서 "연결 안 됨"으로 안내합니다.
   ========================================================= */

/** 캘린더 세 개 — 공개 · 리더(셀장 · 팀장) · 커미티 */
function 캘린더범위_(scope) {
  scope = String(scope || '').trim();
  return (scope === '커미티' || scope === '리더') ? scope : '공개';
}

function 캘린더ID_(scope) {
  var k = { 공개: '공개캘린더ID', 리더: '리더캘린더ID', 커미티: '커미티캘린더ID' }[캘린더범위_(scope)];
  return String(설정값_(k) || '').trim();
}

function 캘린더_(scope) {
  var id = 캘린더ID_(scope);
  if (!id) return null;
  try { return CalendarApp.getCalendarById(id); } catch (e) { return null; }
}

function 달_(ym) {
  var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  var d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** 반복 일정은 여기서 고치면 전체 반복이 바뀌므로 구글 캘린더에서만 고치도록 합니다 */
function 반복일정_(ev) {
  try { return !!ev.isRecurringEvent(); } catch (e) { return false; }
}

function 일정줄_(ev) {
  var tz = Session.getScriptTimeZone();
  var 종일 = ev.isAllDayEvent();
  var s = ev.getStartTime(), e = ev.getEndTime();
  return {
    id: ev.getId(),
    title: ev.getTitle(),
    allDay: 종일,
    date: Utilities.formatDate(s, tz, 'yyyy-MM-dd'),
    time: 종일 ? '' : Utilities.formatDate(s, tz, 'HH:mm'),
    endDate: Utilities.formatDate(종일 ? new Date(e.getTime() - 1000) : e, tz, 'yyyy-MM-dd'),
    endTime: 종일 ? '' : Utilities.formatDate(e, tz, 'HH:mm'),
    where: ev.getLocation() || '',
    desc: (ev.getDescription() || '').slice(0, 1500),
    recurring: 반복일정_(ev)
  };
}

/** 한 달치 일정을 읽습니다 (앞뒤로 조금 더 읽어 걸친 일정도 담습니다) */
function 일정읽기_(scope, ym) {
  var c = 캐시_(), ck = null;
  try { if (c) ck = 'cal|' + (c.get('캘린더판') || '0') + '|' + scope + '|' + ym; } catch (e) {}
  if (ck) { try { var hit = c.get(ck); if (hit) return JSON.parse(hit); } catch (e) {} }
  var out = 일정읽기원래_(scope, ym);
  if (ck && !out.error) { try { var str = JSON.stringify(out); if (str.length < 90000) c.put(ck, str, 300); } catch (e) {} }
  return out;
}

function 캘린더판갈기_() {
  var c = 캐시_();
  if (c) { try { c.put('캘린더판', Date.now().toString(36), 21600); } catch (e) {} }
}

function 일정읽기원래_(scope, ym) {
  var cal = 캘린더_(scope);
  if (!cal) return { configured: false, name: '', ym: ym, events: [] };

  var first = 달_(ym);
  var from = new Date(first.getFullYear(), first.getMonth(), 1);
  var to = new Date(first.getFullYear(), first.getMonth() + 1, 1);

  var list = [];
  try {
    list = cal.getEvents(from, to).map(일정줄_);
  } catch (e) {
    return { configured: true, error: '캘린더를 읽지 못했습니다. 공유 설정을 확인해주세요.', ym: ym, events: [] };
  }
  list.sort(function (a, b) {
    return (a.date + ' ' + (a.time || '00:00')).localeCompare(b.date + ' ' + (b.time || '00:00'));
  });
  return {
    configured: true,
    name: cal.getName(),
    ym: Utilities.formatDate(first, Session.getScriptTimeZone(), 'yyyy-MM'),
    events: list
  };
}

/** 포털 — 청년부 공개 일정 (포털에 들어온 분이면 누구나) */
/** 이 사람이 볼 수 있는 캘린더 — 공개는 누구나, 리더는 셀장 · 팀장 · 커미티, 커미티는 커미티 */
function 볼캘린더_(roles) {
  var 커미티 = roles.indexOf('커미티') !== -1;
  var 리더 = 커미티 || roles.indexOf('셀장') !== -1 || roles.indexOf('팀장') !== -1;
  return { 리더: 리더, 커미티: 커미티 };
}

function getPublicCalendar(token, ym) {
  var me = isAdmin_(token) ? null : 포털본인_(token);
  if (!isAdmin_(token) && !me) throw new Error('포털에서 다시 들어와 주세요.');
  var see = isAdmin_(token) ? { 리더: true, 커미티: true } : 볼캘린더_(포털역할_(me.name).roles);
  var out = 일정읽기_('공개', ym);
  (out.events || []).forEach(function (e) { e.cal = '공개'; });
  out.committee = see.커미티; out.leader = see.리더;
  ['리더', '커미티'].forEach(function (sc) {
    if (!see[sc]) return;
    var r = 일정읽기_(sc, ym);
    if (!r.configured || r.error) return;
    (r.events || []).forEach(function (e) { e.cal = sc; });
    out.events = (out.events || []).concat(r.events || []);
    out.configured = true;
    out['has' + sc] = true;
  });
  out.events = (out.events || []).sort(function (a, b) {
    return (a.date + ' ' + (a.time || '00:00')).localeCompare(b.date + ' ' + (b.time || '00:00'));
  });
  return out;
}

/** 여러 달을 한 번에 (포털 첫 화면 — 서버를 한 번만 부르도록) */
function getPublicCalendarMany(token, yms) {
  var out = {};
  (yms || []).slice(0, 3).forEach(function (ym) { out[ym] = getPublicCalendar(token, ym); });
  return out;
}

/** 관리 페이지 — 공개 · 커미티 두 캘린더 */
function getAdminCalendar(key, scope, ym) {
  requireAdmin_(key);
  return 일정읽기_(캘린더범위_(scope), ym);
}

function 시각만들기_(date, time) {
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!d) throw new Error('날짜를 확인해주세요.');
  var t = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]),
    t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}

/** 일정 추가 · 수정 (커미티만) */
function saveCalendarEvent(key, scope, ev) {
  requireAdmin_(key);
  var cal = 캘린더_(캘린더범위_(scope));
  if (!cal) throw new Error('설정 탭에 캘린더 ID 를 먼저 넣어주세요.');

  ev = ev || {};
  var title = String(ev.title || '').trim();
  if (!title) throw new Error('일정 이름을 입력해주세요.');
  var 종일 = !ev.time;

  var start = 시각만들기_(ev.date, ev.time);
  var endDate = String(ev.endDate || ev.date).trim() || ev.date;
  var end = 종일
    ? new Date(시각만들기_(endDate, '').getTime() + 24 * 60 * 60 * 1000)
    : 시각만들기_(endDate, ev.endTime || ev.time);
  if (!종일 && end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);

  var opts = { description: String(ev.desc || '').slice(0, 2000), location: String(ev.where || '').slice(0, 200) };

  if (ev.id) {
    var old = null;
    try { old = cal.getEventById(String(ev.id)); } catch (e) {}
    if (!old) throw new Error('이 일정을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.');
    if (반복일정_(old)) throw new Error('반복 일정은 구글 캘린더 앱에서 수정해주세요.');
    // 그 자리에서 바꿉니다 — 구글 캘린더에서 넣은 알림 · 색 · 참석자가 그대로 남습니다
    old.setTitle(title);
    old.setDescription(opts.description);
    old.setLocation(opts.location);
    if (종일) {
      var 하루 = (end.getTime() - start.getTime()) <= 24 * 60 * 60 * 1000;
      if (하루) old.setAllDayDate(start); else old.setAllDayDates(start, end);
    } else {
      old.setTime(start, end);
    }
    캘린더판갈기_();
    return 일정줄_(old);
  }
  var made = 종일
    ? cal.createAllDayEvent(title, start, end, opts)
    : cal.createEvent(title, start, end, opts);
  캘린더판갈기_();
  return 일정줄_(made);
}

function removeCalendarEvent(key, scope, id) {
  requireAdmin_(key);
  var cal = 캘린더_(캘린더범위_(scope));
  if (!cal) throw new Error('캘린더가 연결되어 있지 않습니다.');
  var ev = null;
  try { ev = cal.getEventById(String(id)); } catch (e) {}
  if (!ev) throw new Error('일정을 찾지 못했습니다.');
  if (반복일정_(ev)) throw new Error('반복 일정은 구글 캘린더 앱에서 지워주세요.');
  ev.deleteEvent();
  캘린더판갈기_();
  return true;
}

/** 설정 화면에서 캘린더가 잘 이어졌는지 확인합니다 */
function testCalendar(key, scope) {
  requireAdmin_(key);
  var id = 캘린더ID_(scope);
  if (!id) return { ok: false, msg: '캘린더 ID 가 비어 있습니다.' };
  var cal = 캘린더_(scope);
  if (!cal) return { ok: false, msg: '이 ID 로 캘린더를 열 수 없습니다. 스크립트 계정에 공유했는지 확인해주세요.' };
  return { ok: true, msg: cal.getName() + ' — 연결됐습니다.' };
}

/* =========================================================
   13. 출력 — 보고서 PDF · 명단 내보내기
   ========================================================= */

/** 보고서 PDF가 공통으로 쓰는 종이 틀 */
function 문서틀_(title, subtitle, bodyHtml) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page { size: A4; margin: 17mm 16mm; }' +
    'body { font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; color: #1A1917; margin: 0; }' +
    '.org { font-size: 9pt; color: #8B857C; letter-spacing: 2pt; font-weight: 700; margin-bottom: 8px; }' +
    'h1 { font-size: 25pt; font-weight: 800; letter-spacing: -1pt; margin: 0 0 6px; line-height: 1.15; }' +
    '.sub { font-size: 12pt; color: #6E6962; margin-bottom: 18px; }' +
    '.rule { border-bottom: 2.5px solid #1A1917; margin-bottom: 4px; }' +
    'h2 { font-size: 10pt; letter-spacing: 2.4pt; color: #8B857C; margin: 24px 0 8px; font-weight: 800; }' +
    'table { width: 100%; border-collapse: collapse; }' +
    'th, td { text-align: left; vertical-align: top; padding: 8px 4px;' +
      ' border-bottom: 1px solid #E4E1DB; font-size: 11pt; }' +
    'th { width: 118px; color: #8B857C; font-weight: 700; font-size: 9.5pt; }' +
    'table.grid th { width: auto; }' +
    'table.grid td.n { width: 42%; font-weight: 600; }' +
    'table.grid td.r { text-align: right; color: #6E6962; font-size: 10pt; }' +
    '.box { background: #F7F5F2; border-radius: 7px; padding: 12px 14px;' +
      ' font-size: 11pt; line-height: 1.75; white-space: pre-wrap; margin-top: 4px; }' +
    '.stats { display: flex; gap: 10px; margin: 14px 0 4px; }' +
    '.stat { flex: 1; border: 1px solid #E4E1DB; border-radius: 8px; padding: 11px 6px; text-align: center; }' +
    '.stat .v { font-size: 18pt; font-weight: 800; letter-spacing: -0.5pt; }' +
    '.stat .k { font-size: 8.5pt; color: #8B857C; margin-top: 2px; }' +
    '.pill { display: inline-block; font-size: 8.5pt; font-weight: 700; padding: 2px 9px;' +
      ' border-radius: 16px; background: #EDEBE7; color: #55504A; }' +
    '.pill.no { background: #FBEADF; color: #A8420F; }' +
    '.pill.ok { background: #E3F2EA; color: #1D7A56; }' +
    '.foot { margin-top: 28px; border-top: 1px solid #E4E1DB; padding-top: 10px;' +
      ' font-size: 8.5pt; color: #A39D95; display: flex; justify-content: space-between; }' +
    '</style></head><body>' +
    '<div class="org">TORONTO YOUNGNAK CHURCH &nbsp;·&nbsp; YOUNG ADULTS</div>' +
    '<div class="rule"></div>' +
    '<h1>' + title + '</h1><div class="sub">' + subtitle + '</div>' +
    bodyHtml +
    '<div class="foot"><span>토론토영락교회 청년1부</span><span>출력 ' + ymd_(new Date()) + '</span></div>' +
    '</body></html>';
}

function PDF응답_(html, filename) {
  var blob = Utilities.newBlob(html, MimeType.HTML, filename + '.html').getAs(MimeType.PDF);
  return { name: filename + '.pdf', mime: 'application/pdf', b64: Utilities.base64Encode(blob.getBytes()) };
}

/** 셀별 보고서 한 건을 PDF로 */
function cellReportPdf(key, cellName, date) {
  requireAdmin_(key);
  var row = findReportByCellDate_(String(cellName).trim(), String(date).trim());
  if (!row) throw new Error('해당 날짜의 보고서가 없습니다.');
  var r = buildReport_(row);

  var 명단 = r.attendance.map(function (a) {
    var on = 출석인정_(a.status, a.reason);
    var 사유 = a.status === '출석' ? '' : (a.reason + (a.reasonOther ? ' · ' + a.reasonOther : ''));
    return '<tr><td class="n">' + esc_(a.name) + '</td>' +
      '<td class="r">' + esc_(사유) + '</td>' +
      '<td style="width:74px;text-align:right;"><span class="pill ' + (on ? 'ok' : 'no') + '">' +
        esc_(a.status) + '</span></td></tr>';
  }).join('');

  var body =
    '<div class="stats">' +
      '<div class="stat"><div class="v">' + r.present + ' / ' + r.total + '</div><div class="k">출석</div></div>' +
      '<div class="stat"><div class="v">' + r.rate + '%</div><div class="k">출석률</div></div>' +
      '<div class="stat"><div class="v">' + esc_(r.submitter) + '</div><div class="k">작성자</div></div>' +
    '</div>' +
    '<h2>모임 상태</h2><table>' +
      '<tr><th>셀장 컨디션</th><td>' + (FACE_COND[r.condition] || '') + ' ' + esc_(r.condition) + '</td></tr>' +
      '<tr><th>모임 분위기</th><td>' + (FACE_MOOD[r.mood] || '') + ' ' + esc_(r.mood) + '</td></tr>' +
    '</table>' +
    '<h2>출결 명단</h2><table class="grid">' + 명단 + '</table>' +
    '<h2>기도제목 · 특이사항</h2>' +
      '<div class="box">' + (esc_(r.notes) || '작성된 내용이 없습니다.') + '</div>' +
    (r.comment
      ? '<h2>커미티 코멘트</h2><div class="box">' + esc_(r.comment) +
        (r.commentBy ? '\n\n— ' + esc_(r.commentBy) : '') + '</div>'
      : '');

  return PDF응답_(문서틀_('셀모임 보고서', esc_(r.cell) + ' &nbsp;·&nbsp; ' + esc_(r.date), body),
    '셀보고서_' + cellName + '_' + r.date);
}

/** 사역팀 보고서 한 건을 PDF로 */
function teamReportPdf(key, teamName, period) {
  requireAdmin_(key);
  var r = getTeamReportForAdmin(key, teamName, period);
  if (!r) throw new Error('해당 기간의 보고서가 없습니다.');

  var 상태 = r.members.map(function (m) {
    return '<tr><td class="n">' + esc_(m.name) + '</td>' +
      '<td class="r">' + esc_(m.status) + '</td></tr>';
  }).join('');

  var 글 = function (t, v) {
    return v ? '<h2>' + t + '</h2><div class="box">' + esc_(v) + '</div>' : '';
  };

  var body =
    '<h2>보고 개요</h2><table>' +
      '<tr><th>보고 기준일</th><td>' + esc_(r.period) + '</td></tr>' +
      '<tr><th>작성자</th><td>' + esc_(r.submitter) + '</td></tr>' +
      '<tr><th>팀장 컨디션</th><td>' + esc_(r.condition) + '</td></tr>' +
      '<tr><th>팀 분위기</th><td>' + esc_(r.mood) +
        (r.moodNote ? ' <span style="color:#8B857C;">· ' + esc_(r.moodNote) + '</span>' : '') + '</td></tr>' +
      '<tr><th>지출 필요</th><td>' + esc_(r.expenseNeeded || '아니오') +
        (r.expenseDetail ? ' <span style="color:#8B857C;">· ' + esc_(r.expenseDetail) + '</span>' : '') + '</td></tr>' +
    '</table>' +
    (상태 ? '<h2>팀원 상태</h2><table class="grid">' + 상태 + '</table>' : '') +
    글('최근 사역', r.recent) + 글('향후 사역', r.upcoming) +
    글('팀원 변동', r.change) + 글('기도제목 · 커미티 요청', r.prayer) +
    (r.comment ? '<h2>커미티 코멘트</h2><div class="box">' + esc_(r.comment) +
      (r.commentBy ? '\n\n— ' + esc_(r.commentBy) : '') + '</div>' : '');

  return PDF응답_(문서틀_('사역 보고서', esc_(r.team) + ' &nbsp;·&nbsp; ' + esc_(r.period), body),
    '사역보고서_' + teamName + '_' + r.period);
}

/* ---- 새가족 명단 내보내기 ---- */

var 새가족내보내기헤더 = ['이름', '성별', '생년월일', '연락처', '수세여부', '이전출석교회', '직업',
  '활동계획', '특징', '전담담당자', '등록일', '상태', '단계', '진행', '최근진행일',
  '배정셀', '배정일', '정착상태', '정착메모', '연락횟수'];

function exportNewFamilies(key) {
  requireAdmin_(key);
  var list = 새가족전체_();
  if (!list.length) throw new Error('내보낼 새가족이 없습니다.');

  var H = 새가족내보내기헤더;
  var data = list.map(function (n) {
    var t = n.latestTracking;
    return [n.name, n.gender, n.birthday, n.contact, n.baptized, n.prevChurch, n.job,
      n.plan, n.note, n.owner, n.joinedAt, n.status, n.stage, n.progress, n.lastDate,
      n.cell, n.assignedAt, t ? t.status : '', t ? t.memo : '', (n.contacts || []).length];
  });

  // 주차별 기록은 따로 한 장 더
  var IH = ['이름', '주차', '진행일자', '담당자', '신앙배경', '신앙이해도', '성격분위기', '호응도',
    '공동체관심', '섬김관심', '다음참석전망', '교회오게된계기', '교회내아는사람', '원하는사역',
    '공동체에바라는점', '이단주의', '이단주의내용', '셀배정유의사항', '노트'];
  var idata = [];
  list.forEach(function (n) {
    (n.steps || []).forEach(function (s) {
      idata.push([n.name, s.week, s.date, s.by, s.faithBg, s.understanding, s.personality, s.response,
        s.community, s.serving, s.outlook, s.reason, s.acquaint, s.servingWish,
        s.expect, s.heresy, s.heresyNote, s.assignNote, s.note]);
    });
  });

  var fname = '청년1부_새가족_' + ymd_(new Date());
  var tmp = null;
  try {
    tmp = SpreadsheetApp.create(fname);
    var sh = tmp.getSheets()[0];
    sh.setName('새가족');
    sh.getRange(1, 1, 1, H.length).setValues([H])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    sh.getRange(2, 1, data.length, H.length).setValues(data);
    sh.setFrozenRows(1); sh.setFrozenColumns(1);
    for (var c = 1; c <= H.length; c++) sh.setColumnWidth(c, c === 9 ? 240 : 120);

    var ish = tmp.insertSheet('주차별 기록');
    ish.getRange(1, 1, 1, IH.length).setValues([IH])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    if (idata.length) ish.getRange(2, 1, idata.length, IH.length).setValues(idata);
    ish.setFrozenRows(1);
    for (var c2 = 1; c2 <= IH.length; c2++) ish.setColumnWidth(c2, 130);
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + HOST.accessToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return {
        name: fname + '.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        b64: Utilities.base64Encode(res.getBlob().getBytes()),
        count: list.length
      };
    }
  } catch (e) {
    // 아래 CSV로 넘어갑니다
  } finally {
    if (tmp) { try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e2) {} }
  }

  var csv = [H].concat(data).map(function (r) {
    return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  return {
    name: fname + '.csv', mime: 'text/csv;charset=utf-8',
    b64: Utilities.base64Encode('﻿' + csv, Utilities.Charset.UTF_8),
    count: list.length, fallback: true
  };
}

/* =========================================================
   12. 포털 — 한 링크로 각자에게 맞는 화면
   ========================================================= */

var 포털접두 = 'YNP2.';
var 역할종류 = ['커미티', '회계팀', '새가족팀'];

/** 전화번호에서 숫자만 남기고 뒤 10자리 */
function 전화키_(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** 주소에서 캐나다 우편번호 6자리 (650 McNicoll Ave … M2H 2E1 → M2H2E1). 없으면 빈 값 */
function 우편키_(address) {
  var s = String(address == null ? '' : address).toUpperCase();
  var m = /([A-Z]\d[A-Z])\s*(\d[A-Z]\d)/.exec(s);
  return m ? (m[1] + m[2]) : '';
}

function 우편입력_(v) {
  return String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** 토큰 위조를 막는 서명 열쇠 (없으면 한 번 만들어 둡니다) */
function 포털비밀_() {
  var k = 설정값_('포털비밀키');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); 설정저장_('포털비밀키', k); }
  return k;
}

function 포털서명_(payload) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, 포털비밀_())).slice(0, 24);
}

function 포털토큰_(name, phoneKey, postalKey) {
  var payload = name + '\n' + phoneKey + '\n' + (postalKey || '');
  return 포털접두 + Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) +
    '.' + 포털서명_(payload);
}

function 포털해독_(token) {
  token = String(token || '').trim();
  if (token.indexOf(포털접두) !== 0) return null;
  try {
    var rest = token.slice(포털접두.length).split('.');
    if (rest.length !== 2) return null;
    var bytes = Utilities.base64DecodeWebSafe(rest[0], Utilities.Charset.UTF_8);
    var s = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    if (포털서명_(s) !== rest[1]) return null;   // 위조된 토큰
    var p = s.split('\n');
    return (p.length === 3 && p[0] && p[1]) ? { name: p[0], phone: p[1], postal: p[2] } : null;
  } catch (e) { return null; }
}

/** 이름 + 전화 뒤 10자리로 교적에서 한 사람을 찾습니다 */
function 교적찾기_(name, phoneKey) {
  name = String(name || '').trim();
  if (!name || !phoneKey) return null;
  var hit = 교적맵_()[name];
  return (hit && 전화키_(hit.phone) === phoneKey) ? hit : null;
}

/** 우편번호 2차 확인을 쓸지 (설정에서 OFF 로 끌 수 있습니다) */
function 우편확인사용_() {
  return String(설정값_('우편번호확인') || 'ON').toUpperCase() !== 'OFF';
}

/** 토큰이 가리키는 사람 (없거나 전화·우편번호가 바뀌었으면 null) */
function 포털본인_(token) {
  var d = 포털해독_(token);
  if (!d) return null;
  var me = 교적찾기_(d.name, d.phone);
  if (!me) return null;
  // 주소에 우편번호가 있는 분은 토큰에도 같은 값이 들어 있어야 합니다
  var need = 우편확인사용_() ? 우편키_(me.address) : '';
  if (need && need !== d.postal) return null;
  return me;
}

function requirePortal_(token) {
  var me = 포털본인_(token);
  if (!me) throw new Error('다시 로그인해주세요.');
  return me;
}

/**
 * 포털 토큰이 이 일을 할 권한을 갖는지 봅니다.
 * kind: '셀' | '팀' | '새가족'  (커미티는 모두 통과)
 */
function 포털권한_(token, kind, target) {
  var me = 포털본인_(token);
  if (!me) return false;
  var r = 포털역할_(me.name);
  if (r.roles.indexOf('커미티') !== -1) return true;
  if (kind === '셀') return r.cells.indexOf(String(target || '').trim()) !== -1;
  if (kind === '팀') return r.teams.indexOf(String(target || '').trim()) !== -1;
  if (kind === '새가족') return r.roles.indexOf('새가족팀') !== -1;
  return false;
}

/**
 * 한 사람의 역할을 정합니다.
 *  - 셀장 · 팀장은 셀목록 · 사역팀 시트에서 자동으로
 *  - 커미티 · 회계팀 · 새가족팀은 사역팀 시트에서 자동으로 잡고,
 *    교적 '역할' 칸으로 더하거나(커미티) 뺄 수 있습니다(-커미티)
 */
/** 시트에서 자동으로 잡히는 역할을 한 번에 모읍니다 → { 이름: {역할:1} } */
function 역할맵_() {
  var map = {};
  function add(n, r) {
    n = String(n || '').trim();
    if (!n) return;
    (map[n] = map[n] || {})[r] = 1;
  }

  // 담당 목사님은 커미티와 같은 권한으로 모든 영역을 보십니다
  String(설정값_('담당목사') || '').split(',').forEach(function (n) {
    if (!n.trim()) return;
    add(n, '목사');
    add(n, '커미티');
  });

  getCells().forEach(function (c) { add(c.leader, '셀장'); });

  사역팀목록_().forEach(function (t) {
    add(t.leader, '팀장');
    // 담당 커미티 칸 (쉼표로 여러 명일 수 있습니다)
    String(t.committee || '').split(',').forEach(function (x) { add(x, '커미티'); });

    var 회계 = (t.name === '회계팀' || t.dept === '회계');
    var 새가족 = (t.name === '새가족팀');
    if (!회계 && !새가족) return;

    var names = t.members.map(function (m) { return m.name; });
    if (t.leader) names.push(t.leader);
    names.forEach(function (n) {
      if (회계) add(n, '회계팀');
      if (새가족) add(n, '새가족팀');
    });
  });

  새가족팀원_().forEach(function (s) { add(s.name, '새가족팀'); });

  // 찬양팀 · 방송팀
  var 찬양 = 찬양명단_();
  Object.keys(찬양).forEach(function (n) { add(n, '찬양팀'); });

  // 선교팀 팀장 · 회계 · 서기
  rows_(SHEET_선교팀원).forEach(function (r) {
    var roles = String(r[MM_역할] || '').split(',').map(function (x) { return x.trim(); });
    for (var i = 0; i < 선교필수역할.length; i++) {
      if (roles.indexOf(선교필수역할[i]) !== -1) { add(r[MM_이름], '선교팀'); break; }
    }
  });
  return map;
}

/** 자동 역할에 교적 '역할' 칸을 덮어씁니다 ('커미티' 더하기 / '-커미티' 빼기) */
function 역할적용_(auto, roleTags) {
  var roles = {};
  for (var k in (auto || {})) roles[k] = 1;
  String(roleTags || '').split(',').forEach(function (raw) {
    var t = raw.trim();
    if (!t) return;
    var 빼기 = t.charAt(0) === '-';
    var key = 빼기 ? t.slice(1).trim() : t;
    if (역할종류.indexOf(key) === -1) return;
    if (빼기) delete roles[key]; else roles[key] = 1;
  });
  return Object.keys(roles);
}

var _포털역할캐시 = {};
function 포털역할_(name) {
  name = String(name || '').trim();
  if (_포털역할캐시[name]) return _포털역할캐시[name];
  return (_포털역할캐시[name] = 포털역할계산_(name));
}

function 포털역할계산_(name) {
  var info = 교적맵_()[name];
  var roles = 역할적용_(역할맵_()[name], info && info.roleTags);

  var myCells = getCells().filter(function (c) { return c.leader === name; })
    .map(function (c) { return c.name; });
  // 대리 작성자로 지정된 셀 (기간이 지나면 저절로 빠집니다)
  var delegate = {};
  셀대리목록_().forEach(function (d) {
    if (d.name !== name || myCells.indexOf(d.cell) !== -1) return;
    delegate[d.cell] = d.until;
    myCells.push(d.cell);
  });
  var myTeams = 사역팀목록_().filter(function (t) { return t.leader === name; })
    .map(function (t) { return t.name; });

  return { name: name, roles: roles, cells: myCells, teams: myTeams, delegate: delegate };
}

function 역할있나_(name, role) {
  return 포털역할_(name).roles.indexOf(role) !== -1;
}

/** 역할에 따라 포털 첫 화면에 놓을 메뉴 */
function 포털메뉴_(r, token) {
  var base = 앱주소_() || '';
  var has = function (x) { return r.roles.indexOf(x) !== -1; };
  var 커미티 = has('커미티');
  var out = [];

  if (has('셀장') || 커미티 || r.cells.length) {
    var 대리 = r.delegate || {};
    out.push({ key: 'leader', title: '셀모임 보고서', desc: '주일 셀모임 출결 · 기도제목 제출',
      url: base + '?page=leader&t=' + encodeURIComponent(token),
      note: r.cells.map(function (c) { return 대리[c] ? c + ' (대리 ~' + 월일_(대리[c]) + ')' : c; }).join(', ') });
  }
  if (has('팀장') || 커미티) {
    out.push({ key: 'team', title: '사역 보고서', desc: '팀 현황 · 팀원 상태 보고',
      url: base + '?page=team&t=' + encodeURIComponent(token),
      note: r.teams.join(', ') });
  }
  if (has('팀장') || 커미티 || 지출공개_()) {
    out.push({ key: 'expense', title: '지출환급신청서', desc: '영수증 첨부 · 환급 신청',
      url: base + '?page=expense', note: '' });
  }
  if (has('새가족팀') || 커미티) {
    out.push({ key: 'newfamily', title: '새가족 관리', desc: '4주 과정 · 셀 배정 · 정착 추적',
      url: base + '?page=newfamily&t=' + encodeURIComponent(token), note: '' });
  }
  if (has('찬양팀') || 커미티) {
    out.push({ key: 'worship', title: '찬양방송팀 허브', desc: '주차별 편성 · 콘티 · 악보',
      url: base + '?page=worship&t=' + encodeURIComponent(token), note: '' });
  }
  if (has('선교팀') || 커미티) {
    out.push({ key: 'mission', title: '선교팀 관리', desc: '팀원 · 서류 · 항공 일정 · 제출 현황',
      url: base + '?page=mission&t=' + encodeURIComponent(token),
      note: 선교담당팀_(r.name || '').join(', ') });
  }
  if (has('팀장') || 커미티) {
    out.push({ key: 'forms', title: '신청서 관리', desc: '수련회 · 티셔츠 · 인원조사 만들기',
      url: base + '?page=forms&t=' + encodeURIComponent(token), note: '' });
  }
  if (주보권한이름_(r.name).edit) {
    out.push({ key: 'bulletinEdit', title: '주보 편집', desc: '예배 순서 · 광고 · 스케줄',
      url: base + '?page=bulletin&edit=1&t=' + encodeURIComponent(token), note: '' });
  }
  // 회계팀 (커미티가 아닌 분) — 커미티는 아래 커미티 칸에서 회계로 바로 갑니다
  if (has('회계팀') && !커미티) {
    out.push({ key: 'acct', title: '회계 관리', desc: '지출 신청 · 예산 · Cheque',
      url: base + '?page=admin&scope=acct&key=' + encodeURIComponent(회계키_()), note: '' });
  }
  return out;
}

/**
 * 커미티 칸 — 관리 페이지의 각 영역으로 바로 들어갑니다 (#영역).
 * 포털에서 본인 확인이 끝났으므로 관리자 비밀번호를 다시 묻지 않습니다.
 */
function 포털관리메뉴_(r, token) {
  var has = function (x) { return r.roles.indexOf(x) !== -1; };
  var 커미티 = has('커미티');
  var 새가족팀 = has('새가족팀'), 회계팀 = has('회계팀');
  if (!커미티 && !새가족팀 && !회계팀) return [];

  var app = 앱주소_() || '';
  var akey = encodeURIComponent(설정값_('관리자키') || '');
  var base = app + '?page=admin&key=' + akey;
  var st = {};
  try { st = 홈통계_(); } catch (e) { st = {}; }
  var out = [];

  /* 1. 셀 관리 */
  if (커미티) {
    var c = st.cell || {};
    out.push({ key: 'cell', title: '셀 관리', desc: '출석 · 보고서 · 편성', url: base + '#cell',
      stats: [
        { n: (c.rate == null ? '—' : c.rate + '%'), l: '출석률' },
        { n: (c.submitted || 0) + '/' + (c.count || 0), l: '이번 주 제출', warn: (c.submitted || 0) < (c.count || 0) },
        { n: (st.directory && st.directory.withCell) || 0, l: '셀 소속' }
      ],
      more: [{ t: '셀 신청 · 편성', u: app + '?page=cells&key=' + akey }] });
  }

  /* 2. 새가족 관리 — 새가족팀도 봅니다 */
  if (커미티 || 새가족팀) {
    var n = st.newFamily || {};
    out.push({ key: 'nf', title: '새가족 관리', desc: '4주 과정 · 셀 배정 · 정착',
      url: app + '?page=newfamily&t=' + encodeURIComponent(token || ''),
      stats: [
        { n: n.active || 0, l: '과정 중' },
        { n: n.ready || 0, l: '배정 대기', warn: !!(n.ready) },
        { n: n.week || 0, l: '이번 주 새가족' }
      ] });
  }

  /* 3. 사역팀 관리 */
  if (커미티) {
    var t = st.team || {};
    out.push({ key: 'team', title: '사역팀 관리', desc: '팀 보고서 · 팀원', url: base + '#team',
      stats: [
        { n: (t.reported || 0) + '/' + (t.count || 0), l: '보고', warn: (t.reported || 0) < (t.count || 0) },
        { n: t.members || 0, l: '팀원' }
      ] });
  }

  /* 4. 회계 관리 — 회계팀도 봅니다 */
  if (커미티 || 회계팀) {
    var e = st.expense || {};
    out.push({ key: 'acct', title: '회계 관리', desc: '지출 신청 · 헌금봉투 · Cheque',
      url: app + '?page=admin&scope=acct&key=' + encodeURIComponent(회계키_()),
      stats: [
        { n: e.open || 0, l: '처리할 지출', warn: !!(e.open) },
        { n: 헌금대기수_(), l: '봉투 신청', warn: !!헌금대기수_() },
        { n: '$' + (e.outstanding || 0), l: '미지급' }
      ] });
  }

  /* 5. 제자훈련 관리 */
  if (커미티) {
    var d = st.training || {};
    out.push({ key: 'tr', title: '제자훈련 관리', desc: '출석 · 수료', url: base + '#tr',
      stats: [
        { n: d.total || 0, l: '인원' },
        { n: (d.week || 0) + '/' + (d.weeks || 0), l: '주차' },
        { n: (d.avg == null ? '—' : d.avg + '%'), l: '평균 출석' }
      ] });
  }

  /* 6. 선교팀 관리 */
  if (커미티) {
    var m = st.mission || {};
    out.push({ key: 'mis', title: '선교팀 관리', desc: '서류 · 항공 · 일정',
      url: app + '?page=mission&t=' + encodeURIComponent(token || ''),
      stats: [
        { n: m.active || 0, l: '진행 중' },
        { n: m.gaps || 0, l: '역할 비었음', warn: !!(m.gaps) }
      ] });
  }

  /* 7. 교적 관리 */
  if (커미티) {
    var dir = st.directory || {};
    out.push({ key: 'dir', title: '교적 관리', desc: '검색 · 수정', url: base + '#dir',
      stats: [
        { n: dir.total || 0, l: '전체' },
        { n: dir.noCell || 0, l: '셀 없음' }
      ] });
  }

  /* 8. 알림 관리 */
  if (커미티) {
    out.push({ key: 'push', title: '알림 관리', desc: '푸시 · 공지 · 직접 보내기', url: base + '#push',
      stats: [{ n: 푸시행들_().length, l: '알림 켠 기기' }] });
  }

  /* 9. 일정 관리 */
  if (커미티) {
    out.push({ key: 'cal', title: '일정 관리', desc: '공개 · 리더 · 커미티', url: base + '#cal',
      stats: [{ n: (st.calendar && st.calendar.publicOk) ? '연결됨' : '연결 안 됨', l: '공개 캘린더',
        warn: !(st.calendar && st.calendar.publicOk) }] });
  }

  return out;
}

/** 헌금봉투 발급을 기다리는 사람 수 */
function 헌금대기수_() {
  var n = 0, 본 = {};
  var rows = rows_(SHEET_헌금신청);
  for (var i = rows.length - 1; i >= 0; i--) {
    var nm = String(rows[i][EV_이름]).trim();
    if (!nm || 본[nm]) continue;
    본[nm] = 1;
    if (String(rows[i][EV_상태] || '발급중').trim() === '발급중') n++;
  }
  return n;
}

/* ---- 본인 확인 ---- */

/**
 * 이름 · 전화번호 · 우편번호를 한 번에 받아 확인합니다.
 * 주소에 우편번호가 적혀 있는 분은 우편번호까지 맞아야 들어옵니다.
 */
/* ---------- 교적에 없는 구글 계정 연결 ----------
   구글로 로그인했는데 그 이메일이 교적에 없으면, 이름 · 전화번호 · 생년월일 · Postal Code 로
   한 번 본인 확인을 받고 교적 이메일을 그 구글 계정으로 바꿔 둡니다.
   다음부터는 구글 로그인만으로 들어옵니다.
   ------------------------------------------------ */

var 연결접두 = 'YNL1.';

/** 구글이 확인해 준 이메일을 30분 동안만 쓸 수 있는 표로 싸 둡니다 (위조 방지 서명) */
function 구글연결표_(email) {
  var payload = String(email).trim().toLowerCase() + '\n' + Math.floor(Date.now() / 1000);
  return 연결접두 + Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + 포털서명_('L:' + payload);
}

function 구글연결풀기_(link, maxAge) {
  link = String(link || '').trim();
  var bad = new Error('구글 로그인 확인이 끝났습니다. 구글 계정으로 다시 로그인해주세요.');
  if (link.indexOf(연결접두) !== 0) throw bad;
  var rest = link.slice(연결접두.length).split('.');
  if (rest.length !== 2) throw bad;
  var s = Utilities.newBlob(Utilities.base64DecodeWebSafe(rest[0], Utilities.Charset.UTF_8)).getDataAsString('UTF-8');
  if (포털서명_('L:' + s) !== rest[1]) throw bad;
  var p = s.split('\n'), age = Math.floor(Date.now() / 1000) - Number(p[1]);
  if (!p[0] || !(age >= 0 && age < (maxAge || 1800))) throw bad;
  return p[0];
}

/** 교적 이메일을 구글 계정으로 바꿉니다 (다른 분이 이미 쓰고 있으면 막습니다) */
function 구글이메일저장_(name, email) {
  var 기존 = 이메일찾기_(email);
  if (기존 && 기존.name !== name) {
    throw new Error(email + ' 은 교적에서 ' + 기존.name + '님 이메일로 쓰이고 있습니다. 커미티에 문의해주세요.');
  }
  var at = 교적행_(name);
  at.sh.getRange(at.row, D_이메일 + 1).setValue(email);
  캐시비움_();
}

/**
 * 처음 구글로 들어온 분 — 본인 확인 후 연결
 * change: true 면 교적 이메일을 이 구글 계정으로 바꿉니다
 */
function portalLinkGoogle(link, name, phone, birthday, postal, change) {
  var email = 구글연결풀기_(link);
  name = String(name || '').trim();
  var key = 전화키_(phone);
  birthday = String(birthday || '').trim();
  if (!name) throw new Error('이름을 입력해주세요.');
  if (!key) throw new Error('전화번호 10자리를 입력해주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new Error('생년월일을 골라주세요.');

  var 안맞음 = '입력하신 정보가 교적과 맞지 않습니다. 띄어쓰기까지 교적에 적힌 그대로 입력해주시고, ' +
    '그래도 안 되면 커미티에 문의해주세요.';
  var me = 교적찾기_(name, key);
  if (!me) throw new Error(안맞음);
  // 교적에 생년월일이 있으면 같아야 합니다
  if (me.birthday && /^\d{4}-\d{2}-\d{2}$/.test(me.birthday) && me.birthday !== birthday) throw new Error(안맞음);

  var need = 우편확인사용_() ? 우편키_(me.address) : '';
  if (need) {
    var got = 우편입력_(postal);
    if (!got) throw new Error('Postal Code 를 입력해주세요. 예: M2H 2E1');
    if (got !== need) throw new Error(안맞음);
  }

  var linked = false;
  if (change) { 구글이메일저장_(me.name, email); linked = true; }
  var res = 포털자료_(포털토큰_(me.name, key, need));
  res.linked = linked ? email : '';
  return res;
}

/* =========================================================
   새가족 스스로 등록 — 로그인 전 포털의 '새가족 등록'
   ---------------------------------------------------------
   구글로 로그인(가입)한 뒤 인삿말과 양식을 보여주고,
   적은 내용은 교적이 아니라 새가족 시트에 (지금 있는 분들과 함께) 들어갑니다.
   같은 구글 계정으로 다시 오면 적었던 내용을 고칠 수 있습니다.
   ========================================================= */

function 새가족등록선택지_() {
  return {
    성별: ['남', '여'],
    수세여부: ['성인세례/입교', '유아세례', '없음'],
    활동계획: [
      ['새가족 교육(4주) 후 정식 등록', '새가족 교육(4주) 후 정식등록'],
      ['예배만 참석', '예배만 참석'],
      ['방문', '방문']
    ]
  };
}

/** 이 구글 계정으로 이미 등록한 내용 (다시 들어왔을 때 고칠 수 있도록) */
function 새가족내등록_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  var hit = null;
  새가족목록_().forEach(function (n) {
    if (!hit && String(n.email || '').toLowerCase() === email) hit = n;
  });
  if (!hit) return null;
  var memo = String(hit.note || '');
  var m = /(?:^|\n)\[본인 문의\] ([\s\S]*)$/.exec(memo);
  return {
    name: hit.name, gender: hit.gender, birthday: hit.birthday, contact: hit.contact, kakao: hit.kakao,
    baptized: hit.baptized, prevChurch: hit.prevChurch, job: hit.job, plan: hit.plan,
    question: m ? m[1] : '', joinedAt: hit.joinedAt
  };
}

function 참_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === 'ON' || s === '허용' || s === 'O';
}

/** 전화번호 모양 — 0 으로 시작하면(한국) 000-0000-0000, 아니면 000-000-0000 */
function 전화모양_(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.charAt(0) === '0') {
    if (d.length !== 11) throw new Error('0 으로 시작하는 전화번호는 11자리로 입력해주세요. 예: 010-1234-5678');
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);   // +1 캐나다 국가번호
  if (d.length !== 10) throw new Error('전화번호는 10자리로 입력해주세요. 예: 416-000-0000');
  return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}

/* ---------- 새가족 포털 (교적 등록 전) ---------- */

var 새가족접두 = 'YNN1.';
function 새가족토큰_(email) {
  email = String(email || '').trim().toLowerCase();
  return 새가족접두 + Utilities.base64EncodeWebSafe(email, Utilities.Charset.UTF_8) + '.' + 포털서명_('N:' + email);
}
function 새가족토큰풀기_(t) {
  t = String(t || '').trim();
  if (t.indexOf(새가족접두) !== 0) return '';
  var rest = t.slice(새가족접두.length).split('.');
  if (rest.length !== 2) return '';
  try {
    var email = Utilities.newBlob(Utilities.base64DecodeWebSafe(rest[0], Utilities.Charset.UTF_8)).getDataAsString('UTF-8');
    return 포털서명_('N:' + email) === rest[1] ? email : '';
  } catch (e) { return ''; }
}
function 새가족찾기_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  return 새가족목록_().filter(function (n) { return String(n.email || '').toLowerCase() === email; })[0] || null;
}
/** 새가족 토큰 → 새가족 정보 (교적에 올라가면 더는 새가족 포털이 아닙니다) */
function 새가족본인_(t) {
  var email = 새가족토큰풀기_(t);
  if (!email) throw new Error('다시 로그인해주세요.');
  if (이메일찾기_(email)) throw new Error('교적에 등록되었습니다. 다시 로그인해주세요.');
  var nf = 새가족찾기_(email);
  if (!nf) throw new Error('새가족 등록 정보를 찾지 못했습니다. 다시 등록해주세요.');
  return nf;
}
/** 링크(구글 로그인 직후) 또는 새가족 토큰에서 이메일 */
function 새가족이메일_(linkOrToken) {
  var t = String(linkOrToken || '');
  if (t.indexOf(새가족접두) === 0) { var e = 새가족토큰풀기_(t); if (!e) throw new Error('다시 로그인해주세요.'); return e; }
  return 구글연결풀기_(t, 3 * 3600);
}

function newcomerHome(token) {
  var nf = 새가족본인_(token);
  return {
    token: token, name: nf.name, email: nf.email, joinedAt: nf.joinedAt, status: nf.status,
    mine: 새가족내등록_(nf.email),
    cellApp: 셀신청상태_({ kind: 'newcomer', nf: nf, email: nf.email, name: nf.name, allowed: nf.cellApp, committee: false }),
    myCell: 내셀_(nf.name),
    forms: myForms(token),
    todos: 내할일_(token)
  };
}

/** 새가족 등록 알림을 받을 주소 (새가족 관리에서 커미티가 적습니다) */
function 새가족알림주소_() {
  var set = String(설정값_('새가족등록알림이메일') || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
  if (set.length) return set;
  var to = [];
  사역팀목록_().forEach(function (t) {
    if (t.email && (/새가족/.test(t.name) || t.dept === '양육부')) to.push(t.email);
  });
  var admin = String(설정값_('알림받을이메일') || '').trim();
  if (admin) to.push(admin);
  return to.filter(function (x, i) { return x && to.indexOf(x) === i; });
}

function 커미티토큰_(token) {
  if (isAdmin_(token) || 마스터_(token)) return true;
  var me = 포털본인_(token);
  return !!(me && 포털역할_(me.name).roles.indexOf('커미티') !== -1);
}

function saveNewcomerNotify(token, emails) {
  requireNewFamily_(token);
  if (!커미티토큰_(token)) throw new Error('알림 받을 이메일은 커미티만 바꿀 수 있습니다.');
  var list = String(emails || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  list.forEach(function (x) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) throw new Error('이메일 형식을 확인해주세요: ' + x); });
  설정저장_('새가족등록알림이메일', list.join(', '));
  return list.join(', ');
}

/** 새가족팀 — 이 분의 셀 신청을 열어 줍니다 (새가족 교육을 마친 분) */
function setNewcomerCellApp(token, name, on) {
  requireNewFamily_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureColumn_(ss, SHEET_새가족, NF_셀신청 + 1, '셀신청허용');
  var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][NF_이름]).trim() === String(name || '').trim()) {
      sh.getRange(i + 1, NF_셀신청 + 1).setValue(on ? 'Y' : '');
      캐시비움_();
      return 새가족하나_(String(name).trim());
    }
  }
  throw new Error('새가족을 찾지 못했습니다.');
}

function registerNewcomer(link, data) {
  var email = 새가족이메일_(link);
  data = data || {};
  var opt = 새가족등록선택지_();
  var t = function (k, max) { return String(data[k] == null ? '' : data[k]).trim().slice(0, max || 200); };

  var name = t('name', 40).replace(/\s+/g, ' ');
  if (!name) throw new Error('이름(한글)을 입력해주세요.');
  var gender = t('gender');
  if (opt.성별.indexOf(gender) === -1) throw new Error('성별을 골라주세요.');
  var birthday = t('birthday');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new Error('생년월일을 입력해주세요.');
  var contact = 전화모양_(t('contact', 40));
  var kakao = t('kakao', 60);
  if (!contact && !kakao) throw new Error('전화번호 또는 카카오톡 아이디 중 하나는 꼭 입력해주세요.');
  var baptized = t('baptized');
  if (opt.수세여부.indexOf(baptized) === -1) throw new Error('수세 여부를 골라주세요.');
  var planKey = t('plan'), plan = '';
  opt.활동계획.forEach(function (x) { if (x[0] === planKey || x[1] === planKey) plan = x[1]; });
  if (!plan) throw new Error('청년부 활동 계획을 골라주세요.');
  var prevChurch = t('prevChurch', 100), job = t('job', 100), question = t('question', 2000);

  if (이메일찾기_(email)) throw new Error('이미 교적에 등록된 구글 계정입니다. 포털에서 로그인해 주세요.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureColumn_(ss, SHEET_새가족, NF_사진 + 1, '사진');
  ensureColumn_(ss, SHEET_새가족, NF_이메일 + 1, '이메일');
  ensureColumn_(ss, SHEET_새가족, NF_셀신청 + 1, '셀신청허용');
  ensureColumn_(ss, SHEET_새가족, NF_카카오 + 1, '카카오톡');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var target = 0, isNew = true, finalName = name;
  try {
    var sh = sheet_(SHEET_새가족), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][NF_이메일] || '').trim().toLowerCase() === email) { target = i + 1; isNew = false; break; }
    }
    var taken = function (nm) {
      for (var j = 1; j < v.length; j++) {
        if (j + 1 === target) continue;
        if (String(v[j][NF_이름]).trim() === nm) return true;
      }
      return false;
    };
    var prevName = target ? String(v[target - 1][NF_이름]).trim() : '';
    if (!(target && prevName === name)) {
      var k = 2;
      while (taken(finalName)) finalName = name + ' (' + (k++) + ')';
    }

    var memoLine = question ? '[본인 문의] ' + question : '';
    if (target) {
      var old = v[target - 1];
      var note = String(old[NF_특징] || '').replace(/(?:^|\n)\[본인 문의\] [\s\S]*$/, '');
      note = [note.trim(), memoLine].filter(function (x) { return x; }).join('\n');
      sh.getRange(target, 1, 1, 9).setValues([[finalName, gender, birthday, contact, baptized, prevChurch, job, plan, note]]);
      sh.getRange(target, NF_생일 + 1).setNumberFormat('@').setValue(birthday);
      sh.getRange(target, NF_카카오 + 1).setValue(kakao);
      if (prevName && prevName !== finalName) {
        renameInColumn_(SHEET_새가족과정, NP_이름, prevName, finalName);
        renameInColumn_(SHEET_새가족추적, NT_이름, prevName, finalName);
        renameInColumn_(SHEET_새가족연락, NC_이름, prevName, finalName);
      }
    } else {
      var today = ymd_(new Date());
      var row = [finalName, gender, birthday, contact, baptized, prevChurch, job, plan, memoLine, '',
        today, '진행중', '', '', '', email, '', kakao];
      sh.appendRow(row);
      target = sh.getLastRow();
      sh.getRange(target, NF_생일 + 1).setNumberFormat('@').setValue(birthday);
      sh.getRange(target, NF_등록일 + 1).setNumberFormat('@').setValue(today);
    }
  } finally { lock.releaseLock(); }
  캐시비움_();

  try {
    새가족등록알림_({ name: finalName, gender: gender, birthday: birthday, contact: contact, kakao: kakao, baptized: baptized,
      prevChurch: prevChurch, job: job, plan: plan, question: question, email: email }, isNew);
  } catch (e) {}
  // 새가족팀 · 커미티 휴대폰으로도 알려줍니다
  알림보내기_('새가족', 역할인사람_('새가족팀').concat(역할인사람_('커미티')), {
    title: isNew ? '새가족이 등록했습니다' : '새가족이 내용을 고쳤습니다',
    body: finalName + ' (' + gender + ') — ' + plan,
    url: 앱주소_() + '?page=newfamily', tag: '새가족', keep: true
  });
  return { ok: true, isNew: isNew, name: finalName, mine: 새가족내등록_(email), nfToken: 새가족토큰_(email) };
}

/** 새가족 등록 · 수정을 알립니다 */
function 새가족등록알림_(n, isNew) {
  var to = 새가족알림주소_();
  if (!to.length) return;
  var url = (앱주소_() || '') + '?page=newfamily';
  var rows = [['이름', n.name], ['성별', n.gender], ['생년월일', n.birthday], ['전화번호', n.contact], ['카카오톡', n.kakao],
    ['구글 계정', n.email], ['수세 여부', n.baptized], ['이전 출석 교회', n.prevChurch], ['직업', n.job],
    ['활동 계획', n.plan], ['문의사항', n.question]];
  MailApp.sendEmail({
    to: to.join(','),
    subject: '[새가족] ' + n.name + '님이 새가족 ' + (isNew ? '등록을 했습니다' : '등록 내용을 고쳤습니다'),
    name: '토론토영락교회 청년1부',
    htmlBody: '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;">' +
      '<h2 style="color:#D2511F;margin:0 0 6px;">새가족 ' + (isNew ? '등록' : '등록 내용 수정') + '</h2>' +
      '<p style="color:#555;margin:0 0 14px;">' + (isNew ? '포털의 새가족 등록으로 새로운 분이 등록했습니다. 담당자를 정하고 연락해 주세요.' : '등록하신 분이 내용을 고쳤습니다.') + '</p>' +
      '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + rows.map(function (r) {
        return '<tr><td style="padding:7px 10px;border-bottom:1px solid #eee;color:#888;width:110px;vertical-align:top;">' + r[0] +
          '</td><td style="padding:7px 10px;border-bottom:1px solid #eee;white-space:pre-wrap;">' + esc_(r[1] || '—') + '</td></tr>';
      }).join('') + '</table>' +
      '<p style="margin-top:18px;"><a href="' + url + '" style="background:#F26B21;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">새가족 페이지 열기</a></p></div>',
    body: rows.map(function (r) { return r[0] + ': ' + (r[1] || '—'); }).join('\n') + '\n\n' + url
  });
}

/** 이미 로그인한 분이 '구글 계정 연결하기' 로 구글에 다녀온 경우 — 본인 확인 없이 바로 연결 */
function portalLinkGoogleWithToken(link, token) {
  var email = 구글연결풀기_(link);
  var me = requirePortal_(token);
  구글이메일저장_(me.name, email);
  var d = 포털해독_(token);
  var res = 포털자료_(포털토큰_(me.name, d.phone, d.postal));
  res.linked = email;
  return res;
}

/** 구글 로그인 버튼 주소 — 포털 안에서 '구글 계정 연결하기' 를 누를 때 */
function portalGoogleLinkUrl(token) {
  requirePortal_(token);
  return 구글로그인주소_();
}

function portalLogin(name, phone, postal) {
  if (구글만_()) throw new Error('구글 계정으로 로그인해 주세요.');
  name = String(name || '').trim();
  var key = 전화키_(phone);
  if (!name) throw new Error('이름을 입력해주세요.');
  if (!key) throw new Error('전화번호 10자리를 입력해주세요.');

  var me = 교적찾기_(name, key);
  if (!me) {
    throw new Error('이름 또는 전화번호가 교적과 맞지 않습니다. ' +
      '띄어쓰기까지 교적에 적힌 그대로 입력해주시고, 그래도 안 되면 커미티에 문의해주세요.');
  }

  var need = 우편확인사용_() ? 우편키_(me.address) : '';
  if (need) {
    var got = 우편입력_(postal);
    if (!got) throw new Error('Postal Code 를 입력해주세요. 예: M2H 2E1');
    if (got !== need) throw new Error('Postal Code 가 교적에 등록된 주소와 맞지 않습니다.');
  }
  return 포털자료_(포털토큰_(me.name, key, need));
}

/** 커미티 — 한 사람이 포털에 들어왔을 때 보이는 화면 (보기 전용) */
function portalViewAs(token, name) {
  var me = requirePortal_(token);
  if (포털역할_(me.name).roles.indexOf('커미티') === -1) throw new Error('커미티만 볼 수 있습니다.');
  name = String(name || '').trim();
  var who = 교적맵_()[name];
  if (!who) throw new Error(name + ' — 교적에서 찾지 못했습니다.');
  var r = 포털역할_(name);
  // 그 사람의 표로 메뉴 링크를 만듭니다 — 열면 그 사람으로 들어갑니다 (전화번호가 있어야 합니다)
  var key = 전화키_(who.phone);
  var t = key ? 포털토큰_(name, key, 우편확인사용_() ? 우편키_(who.address) : '') : '';
  var menus = 포털메뉴_(r, t).map(function (m) {
    m.url = m.url + (m.url.indexOf('?') === -1 ? '?' : '&') + 'as=' + encodeURIComponent(name);
    return m;
  });
  return {
    token: '', viewAs: name, noLink: !t,
    me: 내정보_(who, r),
    roles: r.roles,
    menus: menus,
    admin: 포털관리메뉴_(r, token),
    committee: r.roles.indexOf('커미티') !== -1,
    leader: 볼캘린더_(r.roles).리더,
    hasCalendar: 달력있나_(r.roles)
  };
}

function 달력있나_(roles) {
  var see = 볼캘린더_(roles);
  return !!캘린더ID_('공개') || (see.리더 && !!캘린더ID_('리더')) || (see.커미티 && !!캘린더ID_('커미티'));
}

/** 로그인 응답 = 토큰 + 내 정보 + 메뉴 (한 번에 보내 왕복을 줄입니다) */
function 포털자료_(token) {
  var me = requirePortal_(token);
  var r = 포털역할_(me.name);
  var 커미티 = r.roles.indexOf('커미티') !== -1;
  var todos = 내할일_(token);
  return {
    people: 커미티 ? Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); }) : [],
    committee: 커미티,
    token: token,
    me: 내정보_(me, r),
    roles: r.roles,
    menus: 포털메뉴_(r, token),
    admin: 포털관리메뉴_(r, token),
    leader: 볼캘린더_(r.roles).리더,
    hasCalendar: 달력있나_(r.roles),
    googleReady: 구글준비됨_(),
    cellApp: 셀신청상태_({ kind: 'member', name: me.name, email: me.email, committee: 커미티,
      allowed: 셀신청열림_() || 새가족셀허용_(me.email, me.name) }),
    myCell: 내셀_(me.name),
    forms: myForms(token),
    todos: todos,
    badges: 포털뱃지_(todos)
  };
}

/** 출결기록처럼 큰 시트는 읽지 않습니다 — 포털이 가볍게 열리도록 */
function 내정보_(me, r) {
  var cell = '';
  rows_(SHEET_셀원명단).forEach(function (x) {
    if (!cell && String(x[1]).trim() === me.name) cell = String(x[0]).trim();
  });

  var teams = [];
  rows_(SHEET_사역팀원).forEach(function (x) {
    if (String(x[TM_이름]).trim() === me.name) {
      teams.push({ team: String(x[TM_팀]).trim(), role: String(x[TM_역할] || '').trim() });
    }
  });
  사역팀목록_().forEach(function (t) {
    if (t.leader === me.name && teams.filter(function (x) { return x.team === t.name; }).length === 0) {
      teams.push({ team: t.name, role: '팀장' });
    }
  });

  var missions = [];
  rows_(SHEET_선교팀원).forEach(function (x) {
    if (String(x[MM_이름]).trim() !== me.name) return;
    var roles = String(x[MM_역할] || '').split(',').map(function (y) { return y.trim(); })
      .filter(function (y) { return y; });
    missions.push({ team: String(x[MM_팀]).trim(), role: roles.join(' · ') });
  });

  return {
    name: me.name, engName: me.engName, phone: me.phone, email: me.email, kakao: me.kakao,
    address: me.address, envelopeNo: me.envelopeNo,
    joinedAt: me.joinedAt, memberSince: me.memberSince,
    birthdayDisplay: me.birthdayDisplay, gender: me.gender, baptized: me.baptized,
    photo: me.photo, photoLarge: me.photoLarge,
    cell: cell, cells: r.cells, teams: teams, missions: missions,
    envelopeRequest: 헌금신청상태_(me.name)
  };
}

function getMyProfile(token) {
  var me = requirePortal_(token);
  return 포털자료_(token);
}

/** 본인이 고칠 수 있는 칸만 저장합니다 (이름 · 헌금번호 · 소속은 커미티만) */
function saveMyProfile(token, info) {
  var me = requirePortal_(token);
  info = info || {};

  var phone = String(info.phone || '').trim();
  if (!전화키_(phone)) throw new Error('전화번호는 10자리로 입력해주세요.');

  var email = String(info.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('이메일 주소 형식을 확인해주세요.');
  }

  var at = 교적행_(me.name);
  at.sh.getRange(at.row, D_영문 + 1).setValue(String(info.engName || '').trim());
  at.sh.getRange(at.row, D_전화 + 1).setValue(phone);
  at.sh.getRange(at.row, D_이메일 + 1).setValue(email);
  at.sh.getRange(at.row, D_카카오 + 1).setValue(String(info.kakao || '').trim());
  at.sh.getRange(at.row, D_주소 + 1).setValue(String(info.address || '').trim());
  캐시비움_();

  // 전화번호를 바꿨으면 토큰도 새로 발급합니다
  return 포털자료_(포털토큰_(me.name, 전화키_(phone)));
}

/* ---- 헌금봉투번호 신청 ---- */

function 헌금신청시트_() {
  var sh = sheet_(SHEET_헌금신청);
  if (sh) return sh;
  createSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_헌금신청, HEAD_헌금신청);
  캐시비움_();
  return sheet_(SHEET_헌금신청);
}

/** 이 분의 가장 최근 신청 (없으면 null) */
function 헌금신청상태_(name) {
  var rows = rows_(SHEET_헌금신청);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][EV_이름]).trim() !== name) continue;
    return {
      status: String(rows[i][EV_상태] || '발급중').trim(),
      at: rows[i][EV_시각] instanceof Date ? ymd_(rows[i][EV_시각]) : '',
      memo: String(rows[i][EV_메모] || '').trim()
    };
  }
  return null;
}

function requestEnvelope(token, agreed) {
  var me = requirePortal_(token);
  if (!agreed) throw new Error('발급 조건에 동의해주셔야 신청이 가능합니다.');
  if (me.envelopeNo) throw new Error('이미 헌금봉투번호가 있습니다: ' + me.envelopeNo);

  var 이전 = 헌금신청상태_(me.name);
  if (이전 && 이전.status === '발급중') throw new Error('이미 신청하셨습니다. 발급되면 알려드리겠습니다.');

  헌금신청시트_().appendRow([new Date(), me.name, me.engName, me.phone, me.email, me.address,
    '발급중', '', '', '', '', '동의함 (' + 헌금조건().join(' / ') + ')']);
  캐시비움_();

  try { 헌금신청메일_(me); } catch (e) {}
  return 포털자료_(token);
}

/** 본인이 신청을 거둬들입니다 */
function cancelMyEnvelope(token) {
  var me = requirePortal_(token);
  var sh = 헌금신청시트_(), v = sh.getDataRange().getValues(), found = false;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][EV_이름]).trim() === me.name && String(v[i][EV_상태]).trim() === '발급중') {
      sh.getRange(i + 1, EV_상태 + 1).setValue('취소');
      sh.getRange(i + 1, EV_처리시각 + 1).setValue(new Date());
      sh.getRange(i + 1, EV_메모 + 1).setValue('본인이 신청을 취소했습니다.');
      found = true; break;
    }
  }
  if (!found) throw new Error('취소할 신청이 없습니다.');
  캐시비움_();
  return 포털자료_(token);
}

/**
 * 발급 여부를 판단하시는 데 필요한 정보를 한 장에 모읍니다.
 * (신청 버튼을 누른 순간에만 도는 무거운 조회 — 포털 첫 화면 속도와는 무관합니다)
 */
function 교적한장_(name) {
  var p = 교적전체_().filter(function (x) { return x.name === name; })[0];
  if (!p) return null;

  var 통계 = 출석통계_();
  var st = 통계[(p.cell || '') + '||' + name];
  p.attendance = (st && st.total)
    ? { present: st.present, total: st.total, rate: Math.round((st.present / st.total) * 100) }
    : null;

  // 셀모임에 처음 나온 날 — 6개월 출석 조건을 보시는 데 씁니다
  var 처음 = '';
  rows_(SHEET_출결기록).forEach(function (r) {
    if (String(r[A_NAME]).trim() !== name) return;
    var d = ymd_(r[A_DATE]);
    if (d && (!처음 || d < 처음)) 처음 = d;
  });
  p.firstSeen = 처음;
  return p;
}

function 개월수_(ymdStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStr || ''))) return null;
  var d = parseYmd_(ymdStr), now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function 헌금신청메일_(me) {
  var to = 회계메일받는곳_();
  if (!to) return;

  var p = 교적한장_(me.name) || me;
  var url = (앱주소_() || '') + '?page=admin&scope=acct';

  var 출석 = p.attendance
    ? p.attendance.rate + '% (' + p.attendance.present + ' / ' + p.attendance.total + '회)'
    : '기록 없음';
  var 개월 = 개월수_(p.firstSeen);
  var 기간 = p.firstSeen
    ? p.firstSeen + ' 첫 출석 · <b>약 ' + 개월 + '개월</b>' +
      (개월 >= 6 ? ' <span style="color:#1D7A56;font-weight:700;">(6개월 이상)</span>'
                 : ' <span style="color:#A82F16;font-weight:700;">(6개월 미만)</span>')
    : '셀모임 출석 기록 없음';

  var 팀 = (p.teams || []).map(function (t) {
    return esc_(t.team) + (t.role ? ' (' + esc_(t.role) + ')' : '');
  }).join(', ');
  var 선교 = (p.missions || []).map(function (t) { return esc_(t.team); }).join(', ');

  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.85;margin-bottom:16px;">' +
      '<b>' + esc_(p.name) + '</b>님이 헌금봉투번호를 신청하셨습니다.<br>' +
      '아래 교적 정보를 확인하시고 발급해 주세요.</div>' +

    card_(label_('인적사항') +
      kv_('이름', esc_(p.name) + (p.engName ? ' &nbsp;·&nbsp; ' + esc_(p.engName) : '')) +
      kv_('생년월일', esc_(p.birthdayDisplay) || '—') +
      kv_('성별', esc_(p.gender) || '—') +
      kv_('전화번호', esc_(p.phone) || '—') +
      kv_('이메일', esc_(p.email) || '—') +
      kv_('카카오톡', esc_(p.kakao) || '—') +
      kv_('주소', esc_(p.address) || '—')) +

    card_(label_('발급 조건') +
      kv_('세례여부', esc_(p.baptized) || '—') +
      kv_('출석 기간', 기간) +
      kv_('셀 출석률', 출석)) +

    card_(label_('교회 등록') +
      kv_('청년부 등록일', esc_(p.joinedAt) || '—') +
      kv_('멤버십 등록일', esc_(p.memberSince) || '—') +
      kv_('소속 셀', esc_(p.cell) || '소속 셀 없음') +
      kv_('사역팀', 팀 || '—') +
      kv_('선교팀', 선교 || '—') +
      kv_('제자훈련', (esc_(p.discipleship) || '—') +
        (p.trainingRate ? ' &nbsp;·&nbsp; ' + esc_(p.trainingRate) : ''))) +

    card_(label_('신청자 동의') +
      '<div style="font-size:13px;color:#2B2B2B;line-height:1.9;">' +
      헌금조건().map(function (c) { return '✅ ' + esc_(c); }).join('<br>') + '</div>') +

    '<div style="text-align:center;margin-top:18px;">' + btn_(url, '회계 관리에서 발급하기', true) + '</div>' +
    '<div style="margin-top:14px;font-size:11.5px;color:#7A756D;line-height:1.9;">' +
      '※ 회계 관리 → 헌금번호 탭에서 번호를 입력하시면 신청하신 분께 자동으로 안내 메일이 갑니다.</div>';

  MailApp.sendEmail({
    to: to,
    subject: '[헌금봉투번호] ' + p.name + '님 신청',
    name: '토론토영락교회 청년1부',
    htmlBody: mailShell_('헌금봉투번호<br>신청', esc_(p.name) + '님', body),
    body: p.name + '님이 헌금봉투번호를 신청하셨습니다.\n\n' +
      '[인적사항]\n영문이름: ' + (p.engName || '-') + '\n생년월일: ' + (p.birthdayDisplay || '-') +
      '\n성별: ' + (p.gender || '-') + '\n전화번호: ' + (p.phone || '-') +
      '\n이메일: ' + (p.email || '-') + '\n카카오톡: ' + (p.kakao || '-') +
      '\n주소: ' + (p.address || '-') +
      '\n\n[발급 조건]\n세례여부: ' + (p.baptized || '-') +
      '\n첫 출석: ' + (p.firstSeen || '기록 없음') + (개월 !== null ? ' (약 ' + 개월 + '개월)' : '') +
      '\n셀 출석률: ' + 출석 +
      '\n\n[교회 등록]\n청년부 등록일: ' + (p.joinedAt || '-') +
      '\n멤버십 등록일: ' + (p.memberSince || '-') +
      '\n소속 셀: ' + (p.cell || '없음') + '\n사역팀: ' + (팀 || '-') +
      '\n선교팀: ' + (선교 || '-') +
      '\n제자훈련: ' + (p.discipleship || '-') + (p.trainingRate ? ' · ' + p.trainingRate : '') +
      '\n\n[신청자 동의]\n' + 헌금조건().map(function (c) { return '- ' + c; }).join('\n') +
      '\n\n회계 관리에서 발급해 주세요: ' + url
  });
}

/* ---- 회계팀이 처리 ---- */

function getEnvelopeRequests(key) {
  requireAcct_(key);
  헌금신청시트_();
  return rows_(SHEET_헌금신청)
    .filter(function (r) { return String(r[EV_이름] || '').trim(); })
    .map(function (r, i) {
      return {
        row: i,
        at: r[EV_시각] instanceof Date
          ? Utilities.formatDate(r[EV_시각], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '',
        name: String(r[EV_이름]).trim(), engName: String(r[EV_영문] || '').trim(),
        phone: String(r[EV_전화] || '').trim(), email: String(r[EV_이메일] || '').trim(),
        address: String(r[EV_주소] || '').trim(),
        status: String(r[EV_상태] || '발급중').trim(),
        envelopeNo: String(r[EV_번호] || '').trim(),
        handledAt: r[EV_처리시각] instanceof Date ? ymd_(r[EV_처리시각]) : '',
        handler: String(r[EV_처리자] || '').trim(),
        memo: String(r[EV_메모] || '').trim()
      };
    })
    .reverse();
}

/** 번호를 넣어 발급 완료 처리하고 본인에게 알립니다 */
function resolveEnvelope(key, name, envelopeNo, handler, memo) {
  requireAcct_(key);
  name = String(name || '').trim();
  envelopeNo = String(envelopeNo || '').trim();
  if (!envelopeNo) throw new Error('헌금봉투번호를 입력해주세요.');

  var sh = 헌금신청시트_(), v = sh.getDataRange().getValues(), target = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][EV_이름]).trim() === name && String(v[i][EV_상태]).trim() === '발급중') {
      target = i + 1; break;
    }
  }
  if (!target) throw new Error('발급 대기 중인 신청을 찾을 수 없습니다.');

  sh.getRange(target, EV_상태 + 1).setValue('발급완료');
  sh.getRange(target, EV_번호 + 1).setValue(envelopeNo);
  sh.getRange(target, EV_처리시각 + 1).setValue(new Date());
  sh.getRange(target, EV_처리자 + 1).setValue(String(handler || '').trim());
  if (memo !== undefined) sh.getRange(target, EV_메모 + 1).setValue(String(memo || '').trim());

  교적저장_(name, { envelopeNo: envelopeNo });   // 교적에도 바로 반영
  캐시비움_();

  var me = 교적맵_()[name];
  if (me && me.email) { try { 헌금발급메일_(me, envelopeNo); } catch (e) {} }
  return getEnvelopeRequests(key);
}

function cancelEnvelope(key, name, memo) {
  requireAcct_(key);
  name = String(name || '').trim();
  var sh = 헌금신청시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][EV_이름]).trim() === name && String(v[i][EV_상태]).trim() === '발급중') {
      sh.getRange(i + 1, EV_상태 + 1).setValue('취소');
      sh.getRange(i + 1, EV_처리시각 + 1).setValue(new Date());
      sh.getRange(i + 1, EV_메모 + 1).setValue(String(memo || '').trim());
      break;
    }
  }
  캐시비움_();
  return getEnvelopeRequests(key);
}

function 헌금발급메일_(me, envelopeNo) {
  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.85;margin-bottom:16px;">' +
      esc_(me.name) + '님, 헌금봉투번호가 발급되었습니다.</div>' +
    card_(
      '<div style="text-align:center;padding:8px 0 14px;">' +
        '<div style="font-size:11.5px;color:#7A756D;font-weight:700;letter-spacing:.1em;">헌금봉투번호</div>' +
        '<div style="font-size:30px;font-weight:800;color:#2B2B2B;letter-spacing:.06em;margin-top:8px;">' +
          esc_(envelopeNo) + '</div>' +
      '</div>') +
    '<div style="margin-top:6px;font-size:12.5px;color:#4A4640;line-height:1.9;">' +
      '헌금하실 때 봉투에 이 번호를 적어주시면 됩니다.<br>' +
      '포털의 내 정보에서도 언제든 확인하실 수 있습니다.</div>';

  MailApp.sendEmail({
    to: me.email,
    cc: 회계메일받는곳_() || '',
    subject: '[청년1부] 헌금봉투번호 안내 — ' + envelopeNo,
    name: '토론토영락교회 청년1부 회계팀',
    htmlBody: mailShell_('헌금봉투번호<br>발급 안내', esc_(me.name) + '님', body),
    body: me.name + '님, 헌금봉투번호가 발급되었습니다.\n\n' +
      '헌금봉투번호: ' + envelopeNo + '\n\n' +
      '헌금하실 때 봉투에 이 번호를 적어주시면 됩니다.\n토론토영락교회 청년1부 회계팀'
  });
}

function uploadMyPhoto(token, dataUrl) {
  var me = requirePortal_(token);
  교적사진저장_(me.name, dataUrl);
  return 포털자료_(token);
}

function deleteMyPhoto(token) {
  var me = requirePortal_(token);
  교적사진삭제_(me.name);
  return 포털자료_(token);
}

/* =========================================================
   11. 회계 — 지출 환급 신청
   ========================================================= */

/** 상태 코드 · 화면 표기 · 색 (순서가 곧 진행 순서입니다) */
function 지출상태목록() {
  return [
    { code: 'In Review',                 label: '접수 · 검토 중',    color: '#1F6FEB' },
    { code: 'Pending Hardcopy Receipt',  label: '영수증 원본 대기',  color: '#B14A12' },
    { code: 'Action Required',           label: '신청자 확인 필요',  color: '#A3261F' },
    { code: 'Approved',                  label: '승인 완료',         color: '#1D7A56' },
    { code: 'Paid',                      label: '지급 완료',         color: '#0F8A5F' },
    { code: 'Closed',                    label: '종결',              color: '#7A756D' }
  ];
}

function 지출부서목록() {
  return ['커미티', '양육팀 (셀장/새가족)', '찬양/방송팀', '쉐마', '예배준비팀',
          '미디어팀', '원주민장기팀', '목사님', '그 외'];
}

/** 신청서 첫 화면에 보여드리는 확인 사항 */
function 지출안내문() {
  var 담당 = 설정값_('회계담당자') || '회계팀';
  return [
    '지출을 진행하시기 전에 반드시 회계팀(' + 담당 + ')과 상의하시고 결제를 진행하시기 바랍니다. ' +
      '(목사님께서 이미 허락하셨더라도) 이를 준수하지 않을 경우, 환급이 지연되거나 불가능할 수 있습니다.',
    'CAD ' + 지출사유기준액 + ' 이상의 지출 건에 대해서는 청년부 담당 장로님의 허락이 필요하므로, ' +
      '반드시 지출 사유를 기재해 주시기 바랍니다.',
    '규모가 큰 지출(팀 수련회, 청년부 전체 수련회, 선교팀, 원주민 선교 등)의 경우, ' +
      '회계팀과 협의하여 예산안을 제출해야 합니다. 자세한 사항은 회계팀에 문의하시기 바랍니다.',
    '지출 신청 시, 항목이 명시된 영수증(Itemized Receipt)의 전자 사본을 업로드해 주시고, ' +
      '종이 사본(Hard Copy)은 반드시 회계팀에 전달해 주시기 바랍니다. 종이 사본이 없으면 Cheque가 발행되지 않습니다.',
    '팁이 포함된 경우, 항목이 명시된 영수증(Itemized Receipt)과 카드 결제 영수증을 함께 첨부해 주시기 바랍니다.',
    '식사 등 여러 사람과 함께 지출한 경우 식사 인원 / 참석 인원을 꼭 기재 바랍니다.',
    '지출 내역은 최대한 영어로 기재해 주시기 바랍니다.',
    'HST가 포함된 경우, HST를 기재하시고, 영수증에 GST/HST 번호가 기재된 영수증을 첨부해 주시기 바랍니다.',
    '특수한 상황으로 인해 영수증이 없는 경우(선교지 지출, 기부 등), 영락 지출 영수증 템플릿을 작성하여 ' +
      '첨부해 주시기 바랍니다. (오피스에서 픽업 가능합니다.)'
  ];
}

/** 회계 기능에 필요한 설정 항목을 없을 때만 채웁니다 */
function 회계설정_() {
  설정기본값_('회계팀이메일', '', '지출 신청 접수 알림을 받을 주소 (쉼표로 여러 개). 비우면 알림받을이메일로 갑니다');
  설정기본값_('회계담당자', '이규원 자매', '지출 신청서 안내문에 표시되는 회계팀 담당자');
  설정기본값_('회계팀비밀번호', '0193', '회계 관리만 열 수 있는 비밀번호 (포털 → 회계 관리)');
  설정기본값_('아이콘:expense', '', '지출환급신청서 탭 아이콘 주소 (선택)');
  설정기본값_('아이콘:portal', '', '포털 페이지 탭 아이콘 주소 (선택)');
  설정기본값_('아이콘:mission', '', '선교팀 페이지 탭 아이콘 주소 (선택)');
  설정기본값_('아이콘:worship', '', '찬양방송팀 허브 탭 아이콘 주소 (선택)');
  설정기본값_('찬양연습시간', '10:30', '토요일 찬양 연습 기본 시간 (주마다 바꿀 수 있습니다)');
  설정기본값_('구글로그인', 'ON', '포털에서 구글 계정 로그인을 쓸지 (ON/OFF)');
  설정기본값_('구글클라이언트ID', '', '구글 로그인 OAuth 클라이언트 ID (Cloud Console 에서 발급)');
  설정기본값_('구글클라이언트시크릿', '', '구글 로그인 OAuth 클라이언트 시크릿');
  설정기본값_('공개캘린더ID', '', '청년부 공개 일정 구글 캘린더 ID (포털에 보입니다)');
  설정기본값_('커미티캘린더ID', '', '커미티 전용 구글 캘린더 ID (관리 페이지에만 보입니다)');
  설정기본값_('리더캘린더ID', '', '셀장 · 팀장 전용 구글 캘린더 ID (셀장 · 팀장 · 커미티의 포털에 보입니다)');
  설정기본값_('찬양팀이름', 'Kairos 찬양팀', '찬양팀 페이지를 볼 수 있는 사역팀 이름 (쉼표로 여러 개)');
  설정기본값_('방송팀이름', 'HOPE 방송팀', '찬양팀 페이지를 볼 수 있는 방송팀 이름 (쉼표로 여러 개)');
  설정기본값_('우편번호확인', 'ON', '포털 로그인 때 우편번호 뒤 3자리를 한 번 더 확인 (OFF로 끌 수 있습니다)');
  설정기본값_('담당목사', '강산 목사', '포털에서 커미티와 같은 권한을 갖는 분 (교적에 적힌 이름 그대로, 쉼표로 여러 명)');
}

/** 헌금봉투 발급 조건 — 신청서 화면과 동의 기록에 함께 쓰입니다 */
function 헌금조건() {
  return [
    '성인 세례 또는 유아세례 후 입교자',
    '토론토영락교회에 6개월 이상 출석한 자 (셀 모임 출석 기준)'
  ];
}

/** 회계 시트가 아직 없으면 그 자리에서 만들어 둡니다 (최초설정을 다시 돌리지 않아도 되도록) */
function 지출시트_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = sheet_(SHEET_지출);
  if (!sh) {
    createSheet_(ss, SHEET_지출, HEAD_지출);
    회계설정_();
    캐시비움_();
    sh = sheet_(SHEET_지출);
  }
  // 예산 · 입력경로 칸은 나중에 늘어난 항목이라 기존 시트에도 채워 넣습니다
  ensureColumn_(ss, SHEET_지출, EX_예산 + 1, HEAD_지출[EX_예산]);
  ensureColumn_(ss, SHEET_지출, EX_경로 + 1, HEAD_지출[EX_경로]);
  return sh;
}

function 지출항목시트_() {
  var sh = sheet_(SHEET_지출항목);
  if (sh) return sh;
  createSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_지출항목, HEAD_지출항목);
  캐시비움_();
  return sheet_(SHEET_지출항목);
}

function 지출이력시트_() {
  var sh = sheet_(SHEET_지출이력);
  if (sh) return sh;
  createSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_지출이력,
    ['신청번호', '시각', '상태', '처리자', '메모']);
  return sheet_(SHEET_지출이력);
}

function 예산시트_() {
  var sh = sheet_(SHEET_예산);
  if (sh) return sh;
  createSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_예산, HEAD_예산);
  캐시비움_();
  return sheet_(SHEET_예산);
}

function 회계메일받는곳_() {
  var 회계 = 설정값_('회계팀이메일');
  return 회계 || 설정값_('알림받을이메일') || '';
}

/* ---- 값 다루기 ---- */

function 돈_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) n = 0;
  return Math.round(n * 100) / 100;
}

function 돈표시_(v) {
  var n = 돈_(v);
  var s = n.toFixed(2).split('.');
  return '$' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + s[1];
}

function 영수증파싱_(raw) {
  var t = String(raw || '').trim();
  if (!t) return [];
  try {
    var arr = JSON.parse(t);
    return (arr instanceof Array) ? arr.filter(function (f) { return f && f.id; }) : [];
  } catch (e) { return []; }
}

function 영수증보기_(list) {
  return (list || []).map(function (f) {
    var img = /^image\//.test(String(f.mime || ''));
    return {
      id: f.id, name: f.name || '첨부파일', mime: f.mime || '',
      isImage: img,
      url: 'https://drive.google.com/file/d/' + f.id + '/view',
      thumb: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w1200'
    };
  });
}

/* ---- Drive 보관함 ---- */

function 지출영수증폴더_() {
  var id = 설정값_('지출영수증폴더');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder('청년부 지출 영수증');
  설정저장_('지출영수증폴더', folder.getId());
  return folder;
}

function 지출연도폴더_(year) {
  var root = 지출영수증폴더_();
  var it = root.getFoldersByName(String(year));
  return it.hasNext() ? it.next() : root.createFolder(String(year));
}

function 지출임시폴더_(draftId, year) {
  var parent = 지출연도폴더_(year);
  var it = parent.getFoldersByName(draftId);
  return it.hasNext() ? it.next() : parent.createFolder(draftId);
}

/* ---- 신청번호 ---- */

/** EXP-2026-001 — 연도별로 1번부터 */
function 지출번호발급_() {
  var year = new Date().getFullYear();
  var prefix = 'EXP-' + year + '-';
  var max = 0;
  rows_(SHEET_지출).forEach(function (r) {
    var no = String(r[EX_번호] || '').trim();
    if (no.indexOf(prefix) !== 0) return;
    var n = parseInt(no.slice(prefix.length), 10);
    if (n > max) max = n;
  });
  var next = String(max + 1);
  while (next.length < 3) next = '0' + next;
  return prefix + next;
}

/* ---- 조회 ---- */

/** 신청번호 → 항목 줄 목록 */
function 지출항목인덱스_() {
  var idx = {};
  rows_(SHEET_지출항목).forEach(function (r) {
    var no = String(r[XI_번호] || '').trim();
    if (!no) return;
    (idx[no] = idx[no] || []).push({
      seq: Number(r[XI_순번]) || 0,
      detail: String(r[XI_내역] || '').trim(),
      beforeTax: 돈_(r[XI_세전]),
      tax: 돈_(r[XI_세금]),
      total: 돈_(r[XI_합계]) || Math.round((돈_(r[XI_세전]) + 돈_(r[XI_세금])) * 100) / 100,
      receipts: 영수증보기_(영수증파싱_(r[XI_영수증]))
    });
  });
  Object.keys(idx).forEach(function (k) {
    idx[k].sort(function (a, b) { return a.seq - b.seq; });
  });
  return idx;
}

function 지출한건_(row, itemIdx) {
  var 세전 = 돈_(row[EX_세전]), 세금 = 돈_(row[EX_세금]);
  var files = 영수증파싱_(row[EX_영수증]);
  var folder = String(row[EX_폴더] || '').trim();
  var no = String(row[EX_번호] || '').trim();

  var items = (itemIdx && itemIdx[no]) ? itemIdx[no] : null;
  if (!items || !items.length) {
    // 항목 나누기 전에 들어온 건은 한 줄짜리로 봅니다
    items = [{
      seq: 1, detail: String(row[EX_내역] || '').trim(),
      beforeTax: 세전, tax: 세금,
      total: Math.round((세전 + 세금) * 100) / 100,
      receipts: 영수증보기_(files)
    }];
  }

  return {
    no: String(row[EX_번호] || '').trim(),
    submittedAt: row[EX_제출] instanceof Date ? Utilities.formatDate(row[EX_제출], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(row[EX_제출] || ''),
    submittedDate: row[EX_제출] instanceof Date ? ymd_(row[EX_제출]) : 날짜문자열_(row[EX_제출]),
    status: String(row[EX_상태] || 'In Review').trim(),
    email: String(row[EX_이메일] || '').trim(),
    name: String(row[EX_신청자] || '').trim(),
    phone: String(row[EX_연락처] || '').trim(),
    dept: String(row[EX_부서] || '').trim(),
    spentAt: 날짜문자열_(row[EX_지출일]),
    detail: String(row[EX_내역] || '').trim(),
    beforeTax: 세전,
    tax: 세금,
    total: 돈_(row[EX_총액]) || Math.round((세전 + 세금) * 100) / 100,
    payableTo: String(row[EX_수령인] || '').trim(),
    headcount: String(row[EX_식사인원] || '').trim(),
    attendees: String(row[EX_식사명단] || '').trim(),
    reason: String(row[EX_사유] || '').trim(),
    items: items,
    receipts: 영수증보기_(files),
    folderUrl: folder ? 'https://drive.google.com/drive/folders/' + folder : '',
    budget: String(row[EX_예산] || '').trim(),
    source: String(row[EX_경로] || '').trim() || '신청서',
    comment: String(row[EX_코멘트] || '').trim(),
    cheque: String(row[EX_체크번호] || '').trim(),
    chequeDate: 날짜문자열_(row[EX_체크일]),
    memo: String(row[EX_회계메모] || '').trim(),
    handler: String(row[EX_처리자] || '').trim(),
    updatedAt: row[EX_수정] instanceof Date ? Utilities.formatDate(row[EX_수정], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : ''
  };
}

function 지출목록_() {
  var idx = 지출항목인덱스_();
  return rows_(SHEET_지출)
    .filter(function (r) { return String(r[EX_번호] || '').trim(); })
    .map(function (r) { return 지출한건_(r, idx); })
    .sort(function (a, b) { return a.no < b.no ? 1 : -1; });
}

function 지출행찾기_(no) {
  no = String(no || '').trim();
  var sh = 지출시트_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][EX_번호]).trim() === no) return { sh: sh, row: i + 1, values: v[i] };
  }
  return null;
}

/** 커미티 — 지출 신청 전체 + 화면에 필요한 부가 정보 */
function getExpenses(key) {
  requireAcct_(key);
  지출시트_();
  var list = 지출목록_();
  var 상태 = 지출상태목록();

  var counts = {};
  상태.forEach(function (s) { counts[s.code] = 0; });
  list.forEach(function (e) { counts[e.status] = (counts[e.status] || 0) + 1; });

  var 열린상태 = ['In Review', 'Pending Hardcopy Receipt', 'Action Required'];
  var 미지급 = list.filter(function (e) { return e.status !== 'Paid' && e.status !== 'Closed'; });

  return {
    list: list,
    statuses: 상태,
    depts: 지출부서목록(),
    budgets: 예산목록_(),
    settings: {
      notifyEmail: 설정값_('회계팀이메일'),
      fallbackEmail: 설정값_('알림받을이메일'),
      contact: 설정값_('회계담당자'),
      formUrl: (앱주소_() || '') + '?page=expense'
    },
    today: ymd_(new Date()),
    counts: counts,
    stats: {
      total: list.length,
      open: list.filter(function (e) { return 열린상태.indexOf(e.status) !== -1; }).length,
      approved: counts['Approved'] || 0,
      outstanding: Math.round(미지급.reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100,
      paidTotal: Math.round(list.filter(function (e) { return e.status === 'Paid' || e.status === 'Closed'; })
        .reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100
    },
    history: rows_(SHEET_지출이력).slice(-60).reverse().map(function (r) {
      return {
        no: String(r[0] || ''),
        at: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'MM-dd HH:mm') : '',
        status: String(r[2] || ''), by: String(r[3] || ''), memo: String(r[4] || '')
      };
    })
  };
}

/* ---- 신청서 제출 (공개 페이지) ---- */

/** 신청서 첫 화면 — 안내문과 선택지 */
function getExpenseForm() {
  return {
    notices: 지출안내문(),
    depts: 지출부서목록(),
    reasonThreshold: 지출사유기준액,
    contact: 설정값_('회계담당자') || '회계팀',
    today: ymd_(new Date())
  };
}

var 지출허용형식 = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/heic': 'heic',
  'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf'
};

/**
 * 영수증 한 장을 올립니다. 신청서를 보내기 전에 임시 폴더에 모아두고,
 * 제출이 끝나면 폴더 이름이 신청번호로 바뀝니다.
 */
function uploadExpenseReceipt(draftId, fileName, dataUrl) {
  draftId = String(draftId || '').trim();
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(draftId)) throw new Error('신청서를 새로고침한 뒤 다시 시도해주세요.');

  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다. 다른 파일로 시도해주세요.');

  var mime = m[1].toLowerCase();
  var ext = 지출허용형식[mime];
  if (!ext) throw new Error('사진(JPG · PNG) 또는 PDF 파일만 올릴 수 있습니다.');

  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('파일 한 개는 10MB까지 올릴 수 있습니다.');

  var folder = 지출임시폴더_(draftId, new Date().getFullYear());
  var count = 0, it = folder.getFiles();
  while (it.hasNext()) { it.next(); count++; }
  if (count >= 8) throw new Error('영수증은 8개까지 올릴 수 있습니다.');

  var safe = String(fileName || '영수증').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  if (safe.toLowerCase().indexOf('.' + ext) === -1) safe += '.' + ext;

  var file = folder.createFile(Utilities.newBlob(bytes, mime, safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { id: file.getId(), name: safe, mime: mime, size: bytes.length };
}

function deleteExpenseReceipt(draftId, fileId) {
  draftId = String(draftId || '').trim();
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(draftId)) return { ok: true };
  try {
    var file = DriveApp.getFileById(String(fileId || '').trim());
    var ok = false, ps = file.getParents();
    while (ps.hasNext()) { if (ps.next().getName() === draftId) { ok = true; break; } }
    if (ok) file.setTrashed(true);
  } catch (e) {}
  return { ok: true };
}

/**
 * 지출 항목(영수증 한 건당 한 줄)을 다듬고 검사합니다.
 * 공개 신청서와 회계팀 직접 입력이 같은 규칙을 씁니다.
 */
function 지출항목정리_(data, needReceipt) {
  var raw = (data.items && data.items.length) ? data.items
    : [{ detail: data.detail, beforeTax: data.beforeTax, tax: data.tax, receipts: data.receipts }];

  var items = [];
  raw.forEach(function (it, i) {
    it = it || {};
    var detail = String(it.detail || '').trim();
    var 세전 = 돈_(it.beforeTax), 세금 = 돈_(it.tax);
    var files = (it.receipts || []).filter(function (f) { return f && f.id; })
      .map(function (f) {
        return { id: String(f.id), name: String(f.name || ''), mime: String(f.mime || '') };
      });

    // 아무것도 안 적힌 빈 칸은 그냥 넘어갑니다
    if (!detail && !세전 && !세금 && !files.length) return;

    var 라벨 = raw.length > 1 ? '항목 ' + (i + 1) + '의 ' : '';
    if (!detail) throw new Error(라벨 + '지출 내역을 입력해주세요.');
    if (세전 <= 0) throw new Error(라벨 + '세전 금액(Before Tax Amount)을 입력해주세요.');
    if (세금 < 0) throw new Error(라벨 + 'HST / GST 금액을 확인해주세요.');
    if (needReceipt && !files.length) {
      throw new Error(라벨 + '영수증을 첨부해주세요. 영수증이 없는 경우 영락 지출 영수증 템플릿을 작성해 첨부해주시면 됩니다.');
    }

    items.push({
      seq: items.length + 1, detail: detail, beforeTax: 세전, tax: 세금,
      total: Math.round((세전 + 세금) * 100) / 100, files: files
    });
  });

  if (!items.length) throw new Error('지출 항목을 최소 한 개 입력해주세요.');
  return items;
}

/**
 * 신청 한 건을 시트에 씁니다.
 * opts: { needReceipt, status, source, handler, budget, cheque, chequeDate, memo }
 */
function 지출쓰기_(data, opts) {
  opts = opts || {};

  var email = String(data.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('이메일 주소를 확인해주세요.');
  if (opts.needReceipt && !email) throw new Error('이메일 주소를 확인해주세요.');

  var name = String(data.name || '').trim();
  if (!name) throw new Error('신청자 이름을 입력해주세요.');

  var phone = String(data.phone || '').trim();
  if (opts.needReceipt && !phone) throw new Error('연락처를 입력해주세요.');

  var dept = String(data.dept || '').trim();
  if (!dept) throw new Error('부서 / 팀을 선택해주세요.');
  if (dept === '그 외') {
    var etc = String(data.deptOther || '').trim();
    if (!etc) throw new Error('부서 / 팀을 직접 적어주세요.');
    dept = '그 외 — ' + etc;
  }

  var spentAt = String(data.spentAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt)) throw new Error('지출일(영수증 날짜)을 선택해주세요.');
  if (spentAt > ymd_(new Date())) throw new Error('지출일이 오늘보다 뒤입니다. 날짜를 확인해주세요.');

  var items = 지출항목정리_(data, !!opts.needReceipt);
  var 세전 = 0, 세금 = 0, files = [];
  items.forEach(function (it) {
    세전 += it.beforeTax; 세금 += it.tax;
    files = files.concat(it.files);
  });
  세전 = Math.round(세전 * 100) / 100;
  세금 = Math.round(세금 * 100) / 100;
  var 총액 = Math.round((세전 + 세금) * 100) / 100;

  var payableTo = String(data.payableTo || '').trim();
  if (!payableTo) throw new Error('Cheque 수령인(Payable to)을 영문으로 입력해주세요.');

  var reason = String(data.reason || '').trim();
  if (총액 >= 지출사유기준액 && !reason) {
    throw new Error('CAD ' + 지출사유기준액 + ' 이상 지출은 지출 사유를 반드시 적어주셔야 합니다.');
  }

  var headcount = String(data.headcount || '').trim();
  var attendees = String(data.attendees || '').trim();
  if (data.isMeal) {
    if (!headcount) throw new Error('식사 · 숙박 · 입장료가 포함된 지출은 총 인원을 적어주세요.');
    if (!attendees) throw new Error('식사 · 숙박 · 입장료가 포함된 지출은 참석자를 적어주세요.');
  }

  var no = 지출번호발급_();
  var now = new Date();

  // 임시 폴더 이름을 신청번호로 바꿔 회계팀이 바로 찾을 수 있게 합니다
  var draftId = String(data.draftId || '').trim();
  var folderId = '';
  if (files.length && /^[0-9a-zA-Z-]{8,64}$/.test(draftId)) {
    try {
      var f = 지출임시폴더_(draftId, now.getFullYear());
      f.setName(no + ' ' + name);
      folderId = f.getId();
    } catch (e) {}
  }

  var 내역요약 = items.length > 1
    ? items.map(function (it, i) { return (i + 1) + '. ' + it.detail; }).join('\n')
    : items[0].detail;

  var sh = 지출시트_();
  var row = [];
  for (var z = 0; z < HEAD_지출.length; z++) row.push('');
  row[EX_번호] = no;
  row[EX_제출] = now;
  row[EX_상태] = opts.status || 'In Review';
  row[EX_이메일] = email;
  row[EX_신청자] = name;
  row[EX_연락처] = phone;
  row[EX_부서] = dept;
  row[EX_지출일] = spentAt;
  row[EX_내역] = 내역요약;
  row[EX_세전] = 세전;
  row[EX_세금] = 세금;
  row[EX_총액] = 총액;
  row[EX_수령인] = payableTo;
  row[EX_식사인원] = data.isMeal ? headcount : '';
  row[EX_식사명단] = data.isMeal ? attendees : '';
  row[EX_사유] = reason;
  row[EX_영수증] = files.length ? JSON.stringify(files) : '';
  row[EX_폴더] = folderId;
  row[EX_코멘트] = String(data.comment || '').trim();
  row[EX_체크번호] = String(opts.cheque || '').trim();
  row[EX_체크일] = String(opts.chequeDate || '').trim();
  row[EX_회계메모] = String(opts.memo || '').trim();
  row[EX_처리자] = String(opts.handler || '').trim();
  row[EX_수정] = now;
  row[EX_예산] = String(opts.budget || '').trim();
  row[EX_경로] = opts.source || '신청서';
  sh.appendRow(row);

  var at = sh.getLastRow();
  sh.getRange(at, EX_지출일 + 1).setNumberFormat('@').setValue(spentAt);
  sh.getRange(at, EX_세전 + 1, 1, 3).setNumberFormat('#,##0.00');
  if (row[EX_체크일]) sh.getRange(at, EX_체크일 + 1).setNumberFormat('@').setValue(row[EX_체크일]);

  var ish = 지출항목시트_();
  items.forEach(function (it) {
    ish.appendRow([no, it.seq, it.detail, it.beforeTax, it.tax, it.total,
      it.files.length ? JSON.stringify(it.files) : '']);
  });
  if (items.length) {
    ish.getRange(ish.getLastRow() - items.length + 1, XI_세전 + 1, items.length, 3)
       .setNumberFormat('#,##0.00');
  }

  지출이력_(no, row[EX_상태], opts.handler || name,
    opts.source === '회계팀 입력' ? '회계팀 직접 입력' : '신청서 제출');
  캐시비움_();

  var idx = {};
  idx[no] = items.map(function (it) {
    return {
      seq: it.seq, detail: it.detail, beforeTax: it.beforeTax, tax: it.tax,
      total: it.total, receipts: 영수증보기_(it.files)
    };
  });
  return 지출한건_(row, idx);
}

/* ---- 공개 신청서에서 들어오는 제출 ---- */

function submitExpense(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    data = data || {};
    if (!data.agreed) throw new Error('확인 사항에 동의해주셔야 신청이 가능합니다.');
    if (String(data.approved || '') !== 'Yes') {
      throw new Error('목사님과 회계팀의 승인을 먼저 받으신 뒤 신청해주세요.');
    }

    var 건 = 지출쓰기_(data, { needReceipt: true, status: 'In Review', source: '신청서' });
    try { 지출접수메일_(건); } catch (e) {}
    알림보내기_('팀보고', 역할인사람_('회계팀').concat(역할인사람_('커미티')), {
      title: '지출 신청이 들어왔습니다',
      body: (건.no ? '#' + 건.no + ' · ' : '') + (data.team || data.name || '') + ' · $' + 건.total,
      url: 앱주소_() + '?page=expense', tag: '지출'
    });
    return { ok: true, no: 건.no, total: 건.total };
  } finally {
    lock.releaseLock();
  }
}

/* ---- 회계팀이 직접 입력 ---- */

function createExpense(key, data) {
  requireAcct_(key);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    data = data || {};
    var codes = 지출상태목록().map(function (s) { return s.code; });
    var status = String(data.status || 'In Review').trim();
    if (codes.indexOf(status) === -1) status = 'In Review';

    var 건 = 지출쓰기_(data, {
      needReceipt: false,
      status: status,
      source: '회계팀 입력',
      handler: String(data.handler || '').trim(),
      budget: String(data.budget || '').trim(),
      cheque: String(data.cheque || '').trim(),
      chequeDate: String(data.chequeDate || '').trim(),
      memo: String(data.memo || '').trim()
    });

    if (data.notify && 건.email) { try { 지출접수메일_(건); } catch (e) {} }
    return { ok: true, no: 건.no, total: 건.total };
  } finally {
    lock.releaseLock();
  }
}

function 지출이력___원래(no, status, by, memo) {
  지출이력시트_().appendRow([no, new Date(), status, by || '', memo || '']);
}

/* ---- 예산 (팀별 · 행사별) ---- */

function 예산목록_() {
  return rows_(SHEET_예산)
    .filter(function (r) { return String(r[BG_이름] || '').trim(); })
    .map(function (r) {
      return {
        kind: String(r[BG_구분] || '팀').trim(),
        name: String(r[BG_이름]).trim(),
        year: String(r[BG_연도] || '').trim(),
        amount: 돈_(r[BG_금액]),
        memo: String(r[BG_메모] || '').trim()
      };
    })
    .sort(function (a, b) {
      if (a.year !== b.year) return a.year < b.year ? 1 : -1;
      if (a.kind !== b.kind) return a.kind === '팀' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });
}

function 지출연도_(e) { return String(e.spentAt || '').slice(0, 4); }

/**
 * 한 건이 이 예산에 들어가는지 판단합니다.
 *  - 회계팀이 직접 배정한 건은 그 예산으로
 *  - 배정하지 않은 건은 같은 이름의 팀 예산으로 자동 집계
 */
function 예산해당_(e, b) {
  if (지출연도_(e) !== b.year) return false;
  if (e.budget) return e.budget === b.name;
  return b.kind === '팀' && e.dept === b.name;
}

function 예산현황_(expenses) {
  var list = 예산목록_().map(function (b) {
    var mine = expenses.filter(function (e) { return 예산해당_(e, b); });
    var 사용 = Math.round(mine.reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100;
    var 확정 = Math.round(mine.filter(function (e) {
      return e.status === 'Paid' || e.status === 'Closed';
    }).reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100;

    return {
      kind: b.kind, name: b.name, year: b.year, amount: b.amount, memo: b.memo,
      actual: 사용,
      paid: 확정,
      pending: Math.round((사용 - 확정) * 100) / 100,
      remaining: Math.round((b.amount - 사용) * 100) / 100,
      rate: b.amount ? Math.round((사용 / b.amount) * 100) : null,
      count: mine.length,
      over: b.amount > 0 && 사용 > b.amount
    };
  });

  var 배정됨 = {};
  list.forEach(function (b) {
    expenses.forEach(function (e) { if (예산해당_(e, b)) 배정됨[e.no] = 1; });
  });
  var 미배정 = expenses.filter(function (e) { return !배정됨[e.no]; });

  return {
    list: list,
    years: list.map(function (b) { return b.year; })
      .filter(function (y, i, a) { return y && a.indexOf(y) === i; }).sort().reverse(),
    totals: {
      budget: Math.round(list.reduce(function (s, b) { return s + b.amount; }, 0) * 100) / 100,
      actual: Math.round(list.reduce(function (s, b) { return s + b.actual; }, 0) * 100) / 100
    },
    unassigned: {
      count: 미배정.length,
      amount: Math.round(미배정.reduce(function (s, e) { return s + e.total; }, 0) * 100) / 100
    }
  };
}

function getBudgets(key) {
  requireAcct_(key);
  예산시트_();
  return 예산현황_(지출목록_());
}

function saveBudget(key, data) {
  requireAcct_(key);
  data = data || {};

  var kind = String(data.kind || '').trim();
  if (kind !== '팀' && kind !== '행사') throw new Error('구분을 팀 또는 행사로 선택해주세요.');

  var name = String(data.name || '').trim();
  if (!name) throw new Error('예산 이름을 입력해주세요.');

  var year = String(data.year || '').trim();
  if (!/^\d{4}$/.test(year)) throw new Error('연도를 네 자리로 입력해주세요. 예: ' + new Date().getFullYear());

  var amount = 돈_(data.amount);
  if (amount < 0) throw new Error('예산액을 확인해주세요.');

  var oldName = String(data.oldName || '').trim();
  var oldYear = String(data.oldYear || '').trim();

  var sh = 예산시트_(), v = sh.getDataRange().getValues();
  var target = 0;
  for (var i = 1; i < v.length; i++) {
    var n = String(v[i][BG_이름]).trim(), y = String(v[i][BG_연도]).trim();
    if (oldName && n === oldName && y === oldYear) { target = i + 1; continue; }
    if (n === name && y === year && !(oldName === name && oldYear === year)) {
      throw new Error(year + '년 "' + name + '" 예산이 이미 있습니다.');
    }
  }

  var row = [kind, name, year, amount, String(data.memo || '').trim(), new Date()];
  if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); target = sh.getLastRow(); }
  sh.getRange(target, BG_연도 + 1).setNumberFormat('@').setValue(year);
  sh.getRange(target, BG_금액 + 1).setNumberFormat('#,##0.00');

  // 이름이 바뀌면 이미 배정된 지출 건도 함께 고쳐 둡니다
  if (oldName && oldName !== name) {
    renameInColumn_(SHEET_지출, EX_예산, oldName, name);
  }

  캐시비움_();
  return 예산현황_(지출목록_());
}

function deleteBudget(key, name, year) {
  requireAcct_(key);
  name = String(name || '').trim();
  year = String(year || '').trim();
  var sh = 예산시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][BG_이름]).trim() === name && String(v[i][BG_연도]).trim() === year) sh.deleteRow(i + 1);
  }
  캐시비움_();
  return 예산현황_(지출목록_());
}

/* ---- 회계 설정 ---- */

function getAcctSettings(key) {
  requireAcct_(key);
  회계설정_();
  return {
    notifyEmail: 설정값_('회계팀이메일'),
    fallbackEmail: 설정값_('알림받을이메일'),
    contact: 설정값_('회계담당자'),
    formUrl: (앱주소_() || '') + '?page=expense'
  };
}

function saveAcctSettings(key, cfg) {
  requireAcct_(key);
  cfg = cfg || {};

  var mails = String(cfg.notifyEmail || '').split(',')
    .map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  for (var i = 0; i < mails.length; i++) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mails[i])) {
      throw new Error('이메일 주소를 확인해주세요: ' + mails[i]);
    }
  }

  설정저장_('회계팀이메일', mails.join(', '));
  if (cfg.contact !== undefined) 설정저장_('회계담당자', String(cfg.contact || '').trim());
  캐시비움_();
  return getAcctSettings(key);
}

/* ---- 커미티 처리 ---- */

/**
 * 상태 · 체크번호 · 회계 메모를 한 번에 저장합니다.
 * patch: { status, cheque, chequeDate, memo, handler, notify, message }
 */
function updateExpense(key, no, patch) {
  requireAcct_(key);
  patch = patch || {};
  var at = 지출행찾기_(no);
  if (!at) throw new Error('신청 건을 찾을 수 없습니다.');

  var 이전상태 = String(at.values[EX_상태] || '').trim();
  var codes = 지출상태목록().map(function (s) { return s.code; });

  var status = 이전상태;
  if (patch.status !== undefined && patch.status !== null && String(patch.status).trim()) {
    status = String(patch.status).trim();
    if (codes.indexOf(status) === -1) throw new Error('알 수 없는 상태입니다: ' + status);
  }

  var chequeDate = at.values[EX_체크일];
  var cheque = String(at.values[EX_체크번호] || '').trim();
  if (patch.cheque !== undefined) {
    cheque = String(patch.cheque || '').trim();
    chequeDate = cheque ? (String(patch.chequeDate || '').trim() || 날짜문자열_(chequeDate) || ymd_(new Date())) : '';
  } else if (patch.chequeDate !== undefined) {
    chequeDate = String(patch.chequeDate || '').trim();
  } else {
    chequeDate = 날짜문자열_(chequeDate);
  }

  var memo = patch.memo !== undefined ? String(patch.memo || '').trim() : String(at.values[EX_회계메모] || '').trim();
  var handler = String(patch.handler || at.values[EX_처리자] || '').trim();
  var budget = patch.budget !== undefined ? String(patch.budget || '').trim() : String(at.values[EX_예산] || '').trim();

  at.sh.getRange(at.row, EX_예산 + 1).setValue(budget);
  at.sh.getRange(at.row, EX_상태 + 1).setValue(status);
  at.sh.getRange(at.row, EX_체크번호 + 1).setValue(cheque);
  at.sh.getRange(at.row, EX_체크일 + 1).setNumberFormat('@').setValue(chequeDate || '');
  at.sh.getRange(at.row, EX_회계메모 + 1).setValue(memo);
  at.sh.getRange(at.row, EX_처리자 + 1).setValue(handler);
  at.sh.getRange(at.row, EX_수정 + 1).setValue(new Date());

  if (status !== 이전상태 || (patch.cheque !== undefined && cheque)) {
    지출이력_(at.values[EX_번호], status, handler,
      (status !== 이전상태 ? 이전상태 + ' → ' + status : '') + (cheque ? ' · Cheque ' + cheque : ''));
  }

  캐시비움_();
  var 건 = 지출한건_(지출행찾기_(no).values, 지출항목인덱스_());

  if (patch.notify && 건.email) {
    try { 지출상태메일_(건, String(patch.message || '').trim()); } catch (e) {}
  }
  return 건;
}

function deleteExpense(key, no, keepFiles) {
  requireAcct_(key);
  var at = 지출행찾기_(no);
  if (!at) throw new Error('신청 건을 찾을 수 없습니다.');

  if (!keepFiles) {
    var folder = String(at.values[EX_폴더] || '').trim();
    if (folder) { try { DriveApp.getFolderById(folder).setTrashed(true); } catch (e) {} }
  }
  at.sh.deleteRow(at.row);
  지출항목시트_();
  deleteRowsWhere_(SHEET_지출항목, XI_번호, String(no).trim());
  지출이력_(no, '삭제', '', '신청 건 삭제');
  캐시비움_();
  return { ok: true };
}

/* ---- Excel 내보내기 ---- */

var 지출내보내기헤더 = ['신청번호', '제출일', '상태', '지출일', '신청자', '부서/팀', '예산', 'Payable To',
  '지출내역', '항목수', '세전금액', 'HST/GST', '총액', '식사인원', '지출사유', '체크번호', '체크발행일',
  '회계메모', '처리자', '입력경로', '이메일', '연락처', '영수증', '신청자 코멘트'];

function 지출내보내기행_(e) {
  return [
    e.no, e.submittedDate, e.status, e.spentAt, e.name, e.dept, e.budget, e.payableTo,
    e.detail, e.items.length, e.beforeTax, e.tax, e.total, e.headcount, e.reason, e.cheque, e.chequeDate,
    e.memo, e.handler, e.source, e.email, e.phone,
    e.receipts.length + '건' + (e.folderUrl ? ' · ' + e.folderUrl : ''), e.comment
  ];
}

var 항목내보내기헤더 = ['신청번호', '순번', '지출일', '신청자', '부서/팀', '예산',
  '지출내역', '세전금액', 'HST/GST', '합계', '영수증', '상태'];

function 항목내보내기행_(e) {
  return e.items.map(function (it) {
    return [e.no, it.seq, e.spentAt, e.name, e.dept, e.budget,
      it.detail, it.beforeTax, it.tax, it.total,
      it.receipts.map(function (f) { return f.name; }).join(' / '), e.status];
  });
}

/**
 * 선택한 건(없으면 전체)을 엑셀 파일로 내보냅니다.
 * 변환이 막히는 경우에는 엑셀에서 바로 열리는 CSV로 대신 내보냅니다.
 */
function exportExpenses(key, nos) {
  requireAcct_(key);
  var list = 지출목록_();
  if (nos && nos.length) {
    list = list.filter(function (e) { return nos.indexOf(e.no) !== -1; });
  }
  if (!list.length) throw new Error('내보낼 신청 건이 없습니다.');

  var data = list.map(지출내보내기행_);
  var H = 지출내보내기헤더;
  var IH = 항목내보내기헤더;
  var idata = [];
  list.forEach(function (e) { idata = idata.concat(항목내보내기행_(e)); });
  var budgets = 예산현황_(지출목록_()).list;
  var fname = '지출신청_' + ymd_(new Date());

  var tmp = null;
  try {
    tmp = SpreadsheetApp.create(fname);
    var sh = tmp.getSheets()[0];
    sh.setName('지출신청');
    sh.getRange(1, 1, 1, H.length).setValues([H])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    sh.getRange(2, 1, data.length, H.length).setValues(data);
    sh.getRange(2, 11, data.length, 3).setNumberFormat('#,##0.00');
    sh.setFrozenRows(1);
    for (var c = 1; c <= H.length; c++) sh.setColumnWidth(c, c === 9 ? 300 : 120);

    var ish = tmp.insertSheet('지출항목');
    ish.getRange(1, 1, 1, IH.length).setValues([IH])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    if (idata.length) {
      ish.getRange(2, 1, idata.length, IH.length).setValues(idata);
      ish.getRange(2, 8, idata.length, 3).setNumberFormat('#,##0.00');
    }
    ish.setFrozenRows(1);
    for (var c2 = 1; c2 <= IH.length; c2++) ish.setColumnWidth(c2, c2 === 7 ? 300 : 120);

    if (budgets.length) {
      var BH = ['구분', '이름', '연도', '예산액', '사용액', '지급완료', '처리중', '잔액', '사용률', '건수'];
      var bsh = tmp.insertSheet('예산');
      bsh.getRange(1, 1, 1, BH.length).setValues([BH])
        .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
      bsh.getRange(2, 1, budgets.length, BH.length).setValues(budgets.map(function (b) {
        return [b.kind, b.name, b.year, b.amount, b.actual, b.paid, b.pending, b.remaining,
          b.rate === null ? '' : b.rate + '%', b.count];
      }));
      bsh.getRange(2, 4, budgets.length, 5).setNumberFormat('#,##0.00');
      bsh.setFrozenRows(1);
      for (var c3 = 1; c3 <= BH.length; c3++) bsh.setColumnWidth(c3, 120);
    }
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + HOST.accessToken() }, muteHttpExceptions: true });

    if (res.getResponseCode() === 200) {
      return {
        name: fname + '.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        b64: Utilities.base64Encode(res.getBlob().getBytes()),
        count: list.length
      };
    }
  } catch (e) {
    // 아래 CSV로 넘어갑니다
  } finally {
    if (tmp) { try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e2) {} }
  }

  var csv = [H].concat(data).map(function (r) {
    return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');

  return {
    name: fname + '.csv',
    mime: 'text/csv;charset=utf-8',
    b64: Utilities.base64Encode('﻿' + csv, Utilities.Charset.UTF_8),
    count: list.length,
    fallback: true
  };
}

/* ---- 메일 ---- */

function 지출상태라벨_(code) {
  var hit = 지출상태목록().filter(function (s) { return s.code === code; })[0];
  return hit ? hit.code + ' · ' + hit.label : code;
}

function 지출요약카드_(e) {
  return card_(
    kv_('신청번호', esc_(e.no)) +
    kv_('신청자', esc_(e.name) + (e.dept ? ' &nbsp;·&nbsp; ' + esc_(e.dept) : '')) +
    kv_('지출일', esc_(e.spentAt)) +
    kv_('세전 금액', 돈표시_(e.beforeTax)) +
    kv_('HST / GST', 돈표시_(e.tax)) +
    kv_('총액', '<b>' + 돈표시_(e.total) + '</b>') +
    kv_('Payable to', esc_(e.payableTo)) +
    (e.headcount ? kv_('식사 인원', esc_(e.headcount) + '명') : '')
  );
}

function 지출항목표_(e) {
  if (!e.items || e.items.length < 2) {
    return '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(e.detail) + '</div>';
  }
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    e.items.map(function (it) {
      return '<tr>' +
        '<td style="padding:9px 0;border-top:1px solid #E4E1DB;font-size:13px;color:#2B2B2B;">' +
          '<b>' + it.seq + '.</b> ' + esc_(it.detail) +
          (it.receipts.length ? '<div style="font-size:11px;color:#7A756D;margin-top:3px;">' +
            it.receipts.map(function (f) { return esc_(f.name); }).join(' · ') + '</div>' : '') +
        '</td>' +
        '<td style="padding:9px 0 9px 10px;border-top:1px solid #E4E1DB;font-size:13px;' +
          'text-align:right;white-space:nowrap;font-weight:700;">' + 돈표시_(it.total) +
          '<div style="font-size:10.5px;color:#7A756D;font-weight:400;">' +
          돈표시_(it.beforeTax) + ' + ' + 돈표시_(it.tax) + '</div></td></tr>';
    }).join('') + '</table>';
}

function 지출본문_(e) {
  return card_(label_('지출 내역' + (e.items && e.items.length > 1 ? ' · ' + e.items.length + '건' : '')) +
      지출항목표_(e)) +
    (e.reason ? card_(label_('지출 사유') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(e.reason) + '</div>') : '') +
    (e.attendees ? card_(label_('식사 참석자') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(e.attendees) + '</div>') : '') +
    (e.comment ? card_(label_('신청자 코멘트') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(e.comment) + '</div>') : '') +
    card_(label_('첨부한 영수증') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.9;">' +
      e.receipts.map(function (f) { return '· ' + esc_(f.name); }).join('<br>') + '</div>');
}

/** 제출 즉시 — 신청자에게 사본, 회계팀에게 접수 알림 */
function 지출접수메일_(e) {
  var 회계 = 회계메일받는곳_();
  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.85;margin-bottom:16px;">' +
      esc_(e.name) + '님, 지출 환급 신청이 접수되었습니다.<br>' +
      '아래 내용으로 접수되었으니 확인해 주세요.</div>' +
    지출요약카드_(e) +
    지출본문_(e) +
    '<div style="margin-top:14px;font-size:11.5px;color:#7A756D;line-height:1.9;">' +
      '※ 종이 영수증(Hard Copy)을 회계팀에 전달해 주셔야 Cheque가 발행됩니다.<br>' +
      '※ 처리 상황이 바뀌면 이 메일 주소로 다시 안내드립니다.<br>' +
      '※ 문의는 회계팀(' + esc_(설정값_('회계담당자') || '회계팀') + ')에게 부탁드립니다.</div>';

  MailApp.sendEmail({
    to: e.email,
    cc: 회계 || '',
    subject: '[지출신청 ' + e.no + '] ' + e.name + ' · ' + 돈표시_(e.total) + ' 접수 확인',
    name: '토론토영락교회 청년1부 회계팀',
    htmlBody: mailShell_('지출 환급 신청<br>접수 확인', e.no + ' &nbsp;·&nbsp; ' + esc_(e.spentAt), body),
    body: 지출접수텍스트_(e)
  });
}

function 지출접수텍스트_(e) {
  return e.name + '님, 지출 환급 신청이 접수되었습니다.\n\n' +
    '신청번호: ' + e.no + '\n부서/팀: ' + e.dept + '\n지출일: ' + e.spentAt + '\n' +
    '세전 금액: ' + 돈표시_(e.beforeTax) + '\nHST/GST: ' + 돈표시_(e.tax) + '\n' +
    '총액: ' + 돈표시_(e.total) + '\nPayable to: ' + e.payableTo + '\n' +
    (e.headcount ? '식사 인원: ' + e.headcount + '명\n' : '') +
    '\n[지출 내역]\n' + e.detail + '\n' +
    (e.reason ? '\n[지출 사유]\n' + e.reason + '\n' : '') +
    '\n첨부 영수증: ' + e.receipts.length + '건\n\n' +
    '※ 종이 영수증(Hard Copy)을 회계팀에 전달해 주셔야 Cheque가 발행됩니다.\n' +
    '토론토영락교회 청년1부 회계팀';
}

/** 상태가 바뀔 때 신청자에게 보내는 안내 */
function 지출상태메일_(e, message) {
  var 회계 = 회계메일받는곳_();
  var hit = 지출상태목록().filter(function (s) { return s.code === e.status; })[0] || { color: '#1C1C1C', label: '' };

  var body =
    '<div style="font-size:14px;color:#4A4640;line-height:1.85;margin-bottom:16px;">' +
      esc_(e.name) + '님, 신청하신 지출 건의 처리 상황이 업데이트되었습니다.</div>' +
    card_(
      '<div style="text-align:center;padding:6px 0 14px;">' +
        '<div style="font-size:11.5px;color:#7A756D;font-weight:700;letter-spacing:.06em;">' + esc_(e.no) + '</div>' +
        '<div style="display:inline-block;margin-top:9px;background:' + hit.color + ';color:#fff;' +
          'font-size:15px;font-weight:800;padding:9px 22px;border-radius:99px;">' + esc_(e.status) + '</div>' +
        '<div style="font-size:12.5px;color:#7A756D;margin-top:8px;">' + esc_(hit.label) + '</div>' +
      '</div>' +
      kv_('총액', '<b>' + 돈표시_(e.total) + '</b>') +
      kv_('지출일', esc_(e.spentAt)) +
      (e.cheque ? kv_('Cheque 번호', '<b>' + esc_(e.cheque) + '</b>' +
        (e.chequeDate ? ' <span style="color:#7A756D;font-size:12px;">' + esc_(e.chequeDate) + '</span>' : '')) : '')
    ) +
    (message ? card_(label_('회계팀 안내') +
      '<div style="font-size:13.5px;color:#2B2B2B;line-height:1.75;white-space:pre-wrap;">' +
      esc_(message) + '</div>') : '') +
    (e.status === 'Action Required'
      ? '<div style="background:#FBEADF;border-radius:8px;padding:12px 14px;margin-top:6px;' +
        'font-size:13px;color:#A82F16;line-height:1.75;">' +
        '신청자 확인이 필요한 건입니다. 회계팀에 회신해 주세요.</div>' : '') +
    (e.status === 'Pending Hardcopy Receipt'
      ? '<div style="background:#FBEADF;border-radius:8px;padding:12px 14px;margin-top:6px;' +
        'font-size:13px;color:#A82F16;line-height:1.75;">' +
        '종이 영수증(Hard Copy)이 아직 회계팀에 전달되지 않았습니다. ' +
        '전달해 주셔야 Cheque가 발행됩니다.</div>' : '') +
    '<div style="margin-top:14px;font-size:11.5px;color:#7A756D;line-height:1.9;">' +
      '※ 문의는 회계팀(' + esc_(설정값_('회계담당자') || '회계팀') + ')에게 부탁드립니다.</div>';

  MailApp.sendEmail({
    to: e.email,
    cc: 회계 || '',
    subject: '[지출신청 ' + e.no + '] 처리 상황 — ' + e.status,
    name: '토론토영락교회 청년1부 회계팀',
    htmlBody: mailShell_('지출 신청<br>처리 상황 안내', e.no + ' &nbsp;·&nbsp; ' + 돈표시_(e.total), body),
    body: e.name + '님, 신청하신 지출 건의 처리 상황이 업데이트되었습니다.\n\n' +
      '신청번호: ' + e.no + '\n상태: ' + 지출상태라벨_(e.status) + '\n총액: ' + 돈표시_(e.total) + '\n' +
      (e.cheque ? 'Cheque 번호: ' + e.cheque + (e.chequeDate ? ' (' + e.chequeDate + ')' : '') + '\n' : '') +
      (message ? '\n[회계팀 안내]\n' + message + '\n' : '') +
      '\n토론토영락교회 청년1부 회계팀'
  });
}

/** 커미티 화면에서 신청자에게 다시 안내 메일을 보냅니다 */
function resendExpenseMail(key, no, message) {
  requireAcct_(key);
  var at = 지출행찾기_(no);
  if (!at) throw new Error('신청 건을 찾을 수 없습니다.');
  var e = 지출한건_(at.values);
  if (!e.email) throw new Error('신청자 이메일이 없습니다.');
  지출상태메일_(e, String(message || '').trim());
  return { ok: true };
}

/** 교적 시트의 생년월일 칸이 날짜형으로 바뀌어버린 경우, 한 번 실행해서 텍스트로 되돌립니다 */
function 교적생년월일정리__원래() {
  var sh = sheet_(SHEET_교적);
  var v = sh.getDataRange().getValues();
  var fixed = 0;

  for (var i = 1; i < v.length; i++) {
    var raw = v[i][D_생일];
    var normalized = 날짜문자열_(raw);
    if (raw instanceof Date || String(raw) !== normalized) {
      sh.getRange(i + 1, D_생일 + 1).setNumberFormat('@').setValue(normalized);
      fixed++;
    }
  }
  HOST.alert(fixed + '개 행의 생년월일 형식을 정리했습니다.');
}

/**
 * 기존 새가족 시트(새가족ID 기반)를 이름 기반으로 옮깁니다.
 * 메뉴에서 한 번만 실행하세요. 실행 전 시트 사본을 만들어두시길 권합니다.
 */
function 새가족시트정리() {
  // 실행 전 확인은 관리 작업(/tasks) 화면에서 받습니다
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var 이름맵 = {};   // 기존 새가족ID -> 이름
  var log = [];

  // 1) 새가족 시트
  var sh = ss.getSheetByName(SHEET_새가족);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getDataRange().getValues();
    var head = v[0].map(function (x) { return String(x).trim(); });
    if (head[0] === '새가족ID') {
      var out = [];
      for (var i = 1; i < v.length; i++) {
        var r = v[i];
        var id = String(r[0]).trim(), nm = String(r[1]).trim();
        if (!nm) continue;
        이름맵[id] = nm;
        var contact = [r[4], r[5], r[6]].map(function (x) { return String(x || '').trim(); })
          .filter(function (x) { return x; }).join(' · ');
        out.push([nm, r[2], 날짜문자열_(r[3]), contact, r[7], r[8], r[9], r[10], r[11], r[12],
                  날짜문자열_(r[13]), r[14] || '진행중', r[15], 날짜문자열_(r[16])]);
      }
      sh.clear();
      sh.getRange(1, 1, 1, 14).setValues([['이름', '성별', '생년월일', '연락처', '수세여부',
        '이전출석교회', '직업', '활동계획', '특징', '전담담당자', '등록일', '상태', '배정셀', '배정일']])
        .setFontWeight('bold');
      if (out.length) sh.getRange(2, 1, out.length, 14).setValues(out);
      sh.setFrozenRows(1);
      log.push('새가족 ' + out.length + '행');
    }
  }

  // 2) 과정 / 추적 / 연락
  function 옮기기(sheetName, headers, idCol, mapper) {
    var s2 = ss.getSheetByName(sheetName);
    if (!s2 || s2.getLastRow() < 2) return;
    var vv = s2.getDataRange().getValues();
    if (String(vv[0][0]).trim() !== '기록ID') return;
    var rows = [];
    for (var i = 1; i < vv.length; i++) {
      var nm = 이름맵[String(vv[i][idCol]).trim()];
      if (!nm) continue;
      rows.push(mapper(vv[i], nm));
    }
    s2.clear();
    s2.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (rows.length) s2.getRange(2, 1, rows.length, headers.length).setValues(rows);
    s2.setFrozenRows(1);
    log.push(sheetName + ' ' + rows.length + '행');
  }

  옮기기(SHEET_새가족과정,
    ['이름', '주차', '진행일자', '담당자', '신앙배경', '신앙이해도', '성격분위기', '호응도',
     '공동체관심', '섬김관심', '다음참석전망', '노트', '작성시각'], 1,
    function (r, nm) {
      return [nm, r[2], 날짜문자열_(r[3]), r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13]];
    });

  옮기기(SHEET_새가족추적,
    ['이름', '확인월', '정착상태', '메모', '작성자', '작성시각'], 1,
    function (r, nm) { return [nm, r[2], r[3], r[4], r[5], r[6]]; });

  옮기기(SHEET_새가족연락,
    ['이름', '일자', '담당자', '내용', '작성시각'], 1,
    function (r, nm) { return [nm, 날짜문자열_(r[2]), r[3], r[4], r[5]]; });

  캐시비움_();
  HOST.alert('정리 완료\n\n' + (log.length ? log.join('\n') : '변경할 데이터가 없었습니다.'));
}



/* =========================================================
   시트를 고치는데 캐시비움_ 을 부르지 않던 함수들 — 끝나면 꼭 캐시를 비웁니다
   ========================================================= */
function changeCellEmail() {
  try { return changeCellEmail__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function submitTeamReport() {
  try { return submitTeamReport__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function saveTeamComment() {
  try { return saveTeamComment__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function submitReport() {
  try { return submitReport__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function purgeReport_() {
  try { return purgeReport___원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function writeCellTab_() {
  try { return writeCellTab___원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function saveComment() {
  try { return saveComment__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function sendReminders_() {
  try { return sendReminders___원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function sendSundayNudges_() {
  try { return sendSundayNudges___원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function 지출이력_() {
  try { return 지출이력___원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function 교적생년월일정리() {
  try { return 교적생년월일정리__원래.apply(this, arguments); } finally { 캐시비움_(); }
}
function 최초설정() {
  try { return 최초설정__원래.apply(this, arguments); } finally { 캐시비움_(); }
}


/* =========================================================
   18. 주보
   ---------------------------------------------------------
   · 누구나(로그인 없이) 게시된 주보를 봅니다   ?page=bulletin
   · 주보팀(교적 역할 '주보팀') · 커미티만 편집합니다  ?page=bulletin&edit=1
   · 한 주에 한 줄 — 내용은 JSON 으로 '내용' 칸부터 나눠 담습니다 (한 칸 5만 자 제한)
   · 경배와 찬양 · 결단찬양은 찬양방송팀 허브 콘티에서,
     대표기도 · 뒷정리는 주보 스케줄 표에서 자동으로 불러옵니다
   ========================================================= */

var SHEET_주보 = '주보';
var SHEET_대표기도 = '대표기도스케줄';
var SHEET_뒷정리 = '뒷정리스케줄';
var HEAD_주보 = ['날짜', '상태', '제목', '수정자', '수정시각', '내용'];
var BU_날짜 = 0, BU_상태 = 1, BU_제목 = 2, BU_수정자 = 3, BU_시각 = 4, BU_내용 = 5;
var HEAD_대표기도 = ['날짜', '이름', '메모'];
var HEAD_뒷정리 = ['날짜', '담당', '메모'];
var 주보조각 = 40000;

역할종류.push('주보팀');

function 주보시트_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = createSheet_(ss, name, head);
  캐시비움_();
  return sh;
}

function 주일인가_(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return false;
  var d = parseYmd_(ymd);
  return !isNaN(d.getTime()) && d.getDay() === 0 && ymd_(d) === ymd;
}

/** 오늘이 주일이면 오늘, 아니면 다가오는 주일 */
function 주보다가오는주일_() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return ymd_(d);
}

/** 권 · 호 — 권은 해마다 (2026년 = 제 50권), 호는 그해 몇 번째 주일인지 (2026.09.20 = 38호) */
function 주보권호_(date) {
  var d = parseYmd_(date);
  if (isNaN(d.getTime())) return { vol: '', no: '' };
  var base = Number(설정값_('주보권기준연도')) || 1976;
  var first = new Date(d.getFullYear(), 0, 1);
  first.setDate(first.getDate() + (7 - first.getDay()) % 7);
  return { vol: d.getFullYear() - base, no: Math.round((d.getTime() - first.getTime()) / 604800000) + 1 };
}

function 주보제목_(date, occasion) {
  var p = String(date || '').split('-');
  occasion = String(occasion || '').trim();
  return p.join('.') + ' ' + (occasion ? occasion + ' ' : '') + '주일예배';
}

/* 주보 권한
   · 편집자 — 주보를 고치고 임시저장 (설정 '주보편집자', 또는 교적 역할 '주보팀')
   · 게시자 — 편집 + 게시 · 게시된 주보 수정 · 삭제 · 편집자/게시자 지정 (설정 '주보게시자')
   · 커미티 · 관리자키 — 게시자와 같습니다 */
function 주보명단_(key) {
  return String(설정값_(key) || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/** 이 사람의 주보 권한 → { edit, publish } (없으면 둘 다 false) */
function 주보권한이름_(name) {
  name = String(name || '').trim();
  if (!name) return { edit: false, publish: false };
  var roles = 포털역할_(name).roles;
  var pub = roles.indexOf('커미티') !== -1 || 주보명단_('주보게시자').indexOf(name) !== -1;
  var edit = pub || roles.indexOf('주보팀') !== -1 || 주보명단_('주보편집자').indexOf(name) !== -1;
  return { edit: edit, publish: pub };
}

function 주보등급_(token) {
  if (isAdmin_(token)) return { name: '커미티', edit: true, publish: true };
  var me = 포털본인_(token);
  if (!me) throw new Error(구글만안내);
  var g = 주보권한이름_(me.name);
  if (!g.edit) throw new Error('주보 편집 권한이 없습니다. 주보 게시자나 커미티에 지정을 부탁해 주세요.');
  return { name: me.name, edit: true, publish: g.publish };
}

/** 편집 권한 → 이름 */
function 주보권한_(token) { return 주보등급_(token).name; }

function 주보게시권한_(token) {
  var g = 주보등급_(token);
  if (!g.publish) throw new Error('게시 권한이 없습니다. 주보 게시자에게 부탁해 주세요.');
  return g.name;
}

function 주보사람들_() {
  return {
    editors: 주보명단_('주보편집자'), publishers: 주보명단_('주보게시자'),
    roleEditors: Object.keys(교적맵_()).filter(function (n) {
      return String(교적맵_()[n].roleTags || '').split(',').map(function (x) { return x.trim(); }).indexOf('주보팀') !== -1;
    }),
    people: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
  };
}

/** 편집자 · 게시자 지정 (게시 권한이 있는 분만) */
function saveBulletinPeople(token, editors, publishers) {
  주보게시권한_(token);
  var 교적 = 교적맵_();
  var clean = function (list) {
    var out = [];
    (list || []).forEach(function (n) {
      n = String(n || '').trim();
      if (!n || out.indexOf(n) !== -1) return;
      if (!교적[n]) throw new Error(n + ' — 교적에서 찾지 못했습니다.');
      out.push(n);
    });
    return out;
  };
  var pubs = clean(publishers);
  var eds = clean(editors).filter(function (n) { return pubs.indexOf(n) === -1; });
  설정저장_('주보편집자', eds.join(', '));
  설정저장_('주보게시자', pubs.join(', '));
  return 주보사람들_();
}

/* ---- 저장된 주보 읽기 ---- */

function 주보행들_() {
  return rows_(SHEET_주보).map(function (r) {
    var date = 날짜문자열_(r[BU_날짜]);
    if (!date) return null;
    var json = '';
    for (var i = BU_내용; i < r.length; i++) {
      var part = String(r[i] == null ? '' : r[i]);
      if (part.charAt(0) === "'") part = part.slice(1);
      json += part;
    }
    return {
      date: date, status: String(r[BU_상태] || '').trim() || '임시',
      title: String(r[BU_제목] || '').trim(), by: String(r[BU_수정자] || '').trim(),
      at: r[BU_시각] instanceof Date ? Utilities.formatDate(r[BU_시각], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[BU_시각] || ''),
      json: json
    };
  }).filter(function (x) { return x; });
}

function 주보풀기_(row) {
  if (!row || !row.json) return null;
  try {
    var b = JSON.parse(row.json);
    b.date = row.date; b.status = row.status; b.updatedBy = row.by; b.updatedAt = row.at;
    b.title = 주보제목_(row.date, b.occasion);
    var vn = 주보권호_(row.date); b.vol = vn.vol; b.no = vn.no;
    return b;
  } catch (e) { return null; }
}

function 주보찾기_(date) {
  var list = 주보행들_();
  for (var i = 0; i < list.length; i++) if (list[i].date === date) return list[i];
  return null;
}

/* ---- 누구나 — 게시된 주보 ---- */

function 게시주보목록_() {
  // 너무 앞선 날짜(다음다음 주)는 아직 보여주지 않습니다
  var 한계 = parseYmd_(주보다가오는주일_());
  한계.setDate(한계.getDate() + 7);
  var max = ymd_(한계);
  return 주보행들_().filter(function (r) { return r.status === '게시' && r.date <= max; })
    .sort(function (a, b) { return b.date.localeCompare(a.date); });
}

/** 로그인 없이 — date 가 비면 가장 최근 게시본 */
function getBulletin(date) {
  var list = 게시주보목록_();
  date = String(date || '').trim();
  var row = null;
  if (date) row = list.filter(function (r) { return r.date === date; })[0] || null;
  if (!row) {
    // 다가오는 주일 이전 것 중 가장 가까운 것 → 없으면 가장 최근
    var up = 주보다가오는주일_();
    row = list.filter(function (r) { return r.date <= up; })[0] || list[0] || null;
  }
  return {
    bulletin: row ? 주보풀기_(row) : null,
    dates: list.slice(0, 40).map(function (r) { return { date: r.date, title: 주보제목_(r.date, (주보풀기_(r) || {}).occasion) }; })
  };
}

/* ---- 편집 ---- */

/* [key, 이름, 기본값, 일어서서] */
var 주보기본순서 = [
  ['creed', '신앙의 고백', '사도신경', 0],
  ['call', '예배의 부름', '', 0],
  ['praise', '경배와 찬양', '', 0],
  ['prayer', '대표기도', '', 0],
  ['offering', '봉헌기도', '강산 목사', 1],
  ['reading', '성경교독', '', 1],
  ['sermon', '설교말씀', '', 0],
  ['final', '찬양 및 합심기도', '', 0],
  ['benediction', '축도', '강산 목사', 0],
  ['fellowship', '청년부 소식 및 광고', '', 0]
];
/* 예전 이름 → 새 이름 */
var 주보이름바꿈 = { '광고 및 봉헌': ['봉헌기도', '강산 목사', 1], '광고 및 교제': ['청년부 소식 및 광고', null, 0] };
/* 주마다 그대로 이어 쓰는 칸 */
var 주보유지칸 = ['creed', 'offering', 'benediction'];

function 주보새틀_(date) {
  var prev = 주보행들_().filter(function (r) { return r.date < date; })
    .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
  var p = prev ? 주보풀기_(prev) : null;

  var order;
  if (p && p.order && p.order.length) {
    order = p.order.map(function (o) {
      var it = { key: o.key || '', label: o.label || '', value: 주보유지칸.indexOf(o.key) !== -1 ? (o.value || '') : '', stand: !!o.stand };
      var ch = 주보이름바꿈[it.label];
      if (ch) { it.label = ch[0]; if (ch[1] !== null) it.value = ch[1]; it.stand = !!ch[2]; }
      if (it.key === 'reading' && o.stand === undefined) it.stand = true;
      return it;
    });
  } else {
    order = 주보기본순서.map(function (x) { return { key: x[0], label: x[1], value: x[2], stand: !!x[3] }; });
  }

  var b = {
    date: date, occasion: '', order: order, cleanup: '',
    bible: { title: '', ref: '', text: '', textEn: '' },
    study: { mode: 'text', title: '', ref: '', sections: [{ heading: '', body: '' }], file: null, link: '', linkLabel: '' },
    news: {
      scheduleTitle: '', schedule: '', events: 주보일정이어받기_(p, date),
      prayers: p && p.news ? (p.news.prayers || []) : [],
      announcements: [{ title: '환영 인사', body: 기본환영문, link: '', qr: 'auto', qrImage: null }]
    },
    servants: p && p.servants ? p.servants : 주보기본섬김이_(),
    status: '새 주보'
  };
  var auto = 주보자동값_(date);
  b.order.forEach(function (o) {
    if (o.key === 'praise' && auto.praise) o.value = auto.praise;
    if (o.key === 'final' && auto.final) o.value = auto.final;
    if (o.key === 'prayer' && auto.prayer) o.value = auto.prayer;
  });
  if (auto.cleanup) b.cleanup = auto.cleanup;
  b.news.newfamily = auto.newfamily;
  b.title = 주보제목_(date, '');
  var vn = 주보권호_(date); b.vol = vn.vol; b.no = vn.no;
  return b;
}

/** 지난 주보의 일정 가운데 아직 지나지 않은 것만 이어받습니다 (예전 한 줄 입력도 나눠 읽습니다) */
function 주보일정이어받기_(p, date) {
  if (!p || !p.news) return [];
  var list = (p.news.events || []).slice();
  if (!list.length && p.news.schedule) {
    String(p.news.schedule).split(/\n+/).forEach(function (ln) {
      var m = /^\s*([0-9]{1,2}[./][0-9]{1,2}(?:\s*-\s*[0-9]{1,2}(?:[./][0-9]{1,2})?)?)\s+(.+)$/.exec(ln);
      if (m) list.push({ date: m[1].replace(/\s/g, ''), name: m[2].trim() });
      else if (ln.trim()) list.push({ date: '', name: ln.trim() });
    });
  }
  var d = parseYmd_(date), 기준 = (d.getMonth() + 1) * 100 + d.getDate();
  return list.filter(function (x) {
    var m = /^(\d{1,2})[./](\d{1,2})(?:-(\d{1,2})(?:[./](\d{1,2}))?)?/.exec(String(x.date || ''));
    if (!m) return true;                               // 매주 금요일 … 같은 줄은 그대로
    var em = m[4] ? Number(m[3]) : Number(m[1]), ed = m[4] ? Number(m[4]) : (m[3] ? Number(m[3]) : Number(m[2]));
    var 끝 = em * 100 + ed;
    return 끝 >= 기준 || (d.getMonth() >= 9 && em <= 2);  // 가을에 적은 1 · 2월 일정은 내년 것
  });
}

var 기본환영문 = '토론토 영락교회 청년부 예배에 오신 모든 분들을 주님의 이름으로 환영합니다. ' +
  '처음 오셨거나 등록을 원하시는 분들은 목사님 또는 새가족팀에게 문의해 주세요.';

function 주보기본섬김이_() {
  var y = new Date().getFullYear() % 100, m = new Date().getMonth();
  var 시작 = m >= 8 ? y : y - 1;           // 9월에 새 회기
  var g = 주보섬김이자동_();
  return {
    heading: 시작 + '-' + (시작 + 1) + ' 섬김이들',
    groups: g,
    newcomer: 기본환영문,
    place: ''
  };
}

/** 이름에 형제 · 자매를 붙입니다 (이미 직분이 있으면 그대로) */
function 주보호칭_(name) {
  name = String(name || '').trim();
  if (!name) return '';
  if (/(목사|전도사|강도사|사모|선교사|장로|권사|집사|형제|자매)$/.test(name)) return name;
  var p = 교적맵_()[name];
  if (p && p.gender === '남') return name + ' 형제';
  if (p && p.gender === '여') return name + ' 자매';
  return name;
}

/**
 * 새가족 소식 — 주보 날짜 D 기준 지난 한 주(D-7 ~ D-1)
 *  · 새로 오신 분: 새가족 과정 1주차를 한 분 (또는 그 주에 등록한 분)
 *  · 셀 배정: 양육팀이 그 주에 셀을 배정한 분
 */
function 주보새가족_(date) {
  var d = parseYmd_(date);
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7), b = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  var from = ymd_(a), to = ymd_(b);
  var inWeek = function (v) { var x = 날짜문자열_(v); return /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= from && x <= to; };
  var first = [], seen = {}, assigned = [];
  try {
    rows_(SHEET_새가족과정).forEach(function (r) {
      var n = String(r[NP_이름] || '').trim();
      if (!n || seen[n]) return;
      if (Number(String(r[NP_주차] || '').replace(/[^0-9]/g, '')) === 1 && inWeek(r[NP_일자])) { seen[n] = 1; first.push(n); }
    });
    rows_(SHEET_새가족).forEach(function (r) {
      var n = String(r[NF_이름] || '').trim();
      if (!n) return;
      if (!seen[n] && inWeek(r[NF_등록일])) { seen[n] = 1; first.push(n); }
      var cell = String(r[NF_배정셀] || '').trim();
      if (cell && inWeek(r[NF_배정일])) assigned.push({ name: n, cell: cell });
    });
  } catch (e) {}
  var 호칭 = function (n) {
    var 새 = rows_(SHEET_새가족).filter(function (r) { return String(r[NF_이름]).trim() === n; })[0];
    var g = 새 ? String(새[NF_성별] || '').trim() : '';
    if (g === '남') return n + ' 형제';
    if (g === '여') return n + ' 자매';
    return 주보호칭_(n);
  };
  return {
    first: first.map(호칭).join(', '),
    assigned: assigned.map(function (x) { return { name: 호칭(x.name), cell: x.cell }; })
  };
}

/** 찬양 콘티 · 대표기도 · 뒷정리 스케줄에서 그 주 값을 찾습니다 */
function 주보자동값_(date) {
  var out = { praise: '', final: '', prayer: '', cleanup: '', newfamily: 주보새가족_(date) };
  try {
    var 곡줄 = function (list) {
      return list.sort(function (a, b) { return a.seq - b.seq; })
        .filter(function (s) { return s.title; })
        .map(function (s) { return s.title; });        // 폰에서 길지 않게 제목만
    };
    var praise = 곡줄(콘티목록_(date, '콘티'));
    var fin = 콘티목록_(date, '결단').filter(function (s) { return s.title; }).map(function (s) { return s.title; });
    out.praise = praise.join('\n');
    out.final = fin.join(', ');
  } catch (e) {}
  rows_(SHEET_대표기도).forEach(function (r) {
    if (날짜문자열_(r[0]) === date && String(r[1] || '').trim()) out.prayer = 주보호칭_(r[1]);
  });
  rows_(SHEET_뒷정리).forEach(function (r) {
    if (날짜문자열_(r[0]) === date && String(r[1] || '').trim()) out.cleanup = String(r[1]).trim();
  });
  return out;
}

/** 섬김이 — 시스템(역할 · 사역팀 · 셀목록)에서 채우기 */
function 주보섬김이자동_() {
  var 교적 = 교적맵_();
  var kakao = function (n) { return (교적[n] && 교적[n].kakao) || ''; };
  var 커미티 = Object.keys(교적).filter(function (n) {
    try { return 포털역할_(n).roles.indexOf('커미티') !== -1; } catch (e) { return false; }
  }).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  var teams = 사역팀목록_().filter(function (t) { return t.leader; });
  var leaders = getCells().map(function (c) { return c.leader; }).filter(function (n) { return n; })
    .sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  return [
    { ko: '커미티', en: 'COMMITTEE', items: 커미티.map(function (n) { return { name: n, title: '', part: '', contact: kakao(n) }; }) },
    { ko: '사역팀', en: 'TEAM MINISTRY', items: teams.map(function (t) { return { name: t.leader, title: '', part: t.name, contact: kakao(t.leader) }; }) },
    { ko: '셀장', en: 'SMALL GROUP LEADERS', items: leaders.map(function (n) { return { name: n, title: '', part: '', contact: '' }; }) }
  ];
}

function 주보스케줄_(name, head) {
  return rows_(name).map(function (r) {
    return { date: 날짜문자열_(r[0]), name: String(r[1] || '').trim(), memo: String(r[2] || '').trim() };
  }).filter(function (x) { return x.date; })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function 주보목록_() {
  return 주보행들_().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 60)
    .map(function (r) { return { date: r.date, status: r.status, title: r.title, by: r.by, at: r.at }; });
}

function 주보주일목록_() {
  var out = [], d = parseYmd_(주보다가오는주일_());
  d.setDate(d.getDate() - 7 * 12);
  for (var i = 0; i < 12 + 1 + 16; i++) { out.push(ymd_(d)); d.setDate(d.getDate() + 7); }
  return out;
}

/** 편집기 첫 화면 */
function bulletinEditorInit(token) {
  var who = 주보권한_(token);
  주보시트_(SHEET_주보, HEAD_주보); 주보시트_(SHEET_대표기도, HEAD_대표기도); 주보시트_(SHEET_뒷정리, HEAD_뒷정리);
  var g = 주보등급_(token);
  var date = 주보다가오는주일_();
  return {
    me: who, canPublish: g.publish, sundays: 주보주일목록_(), defaultDate: date, list: 주보목록_(),
    team: 주보사람들_(), volBase: Number(설정값_('주보권기준연도')) || 1976,
    draft: getBulletinDraft(token, date)
  };
}

/** 그 주 주보 — 저장된 게 있으면 그것, 없으면 새 틀 (자동 불러오기 포함) */
function getBulletinDraft(token, date) {
  주보권한_(token);
  date = String(date || '').trim();
  if (!주일인가_(date)) throw new Error('주일 날짜를 골라주세요.');
  var row = 주보찾기_(date);
  var b = row ? 주보풀기_(row) : null;
  return b || 주보새틀_(date);
}

/** 편집기의 '자동 불러오기' */
function bulletinAutoFill(token, date) {
  주보권한_(token);
  if (!주일인가_(date)) throw new Error('주일 날짜를 골라주세요.');
  return 주보자동값_(date);
}

function bulletinServantsFromSystem(token) {
  주보권한_(token);
  return 주보섬김이자동_();
}

/** 저장 — publish: true 면 게시(누구나 봄), false 면 임시저장 */
function saveBulletin(token, data, publish) {
  var g = 주보등급_(token), who = g.name;
  data = data || {};
  var date = String(data.date || '').trim();
  if (!주일인가_(date)) throw new Error('주일 날짜를 골라주세요.');
  if (publish && !g.publish) throw new Error('게시 권한이 없습니다. 임시저장한 뒤 주보 게시자에게 게시를 부탁해 주세요.');
  var 지금 = 주보찾기_(date);
  if (!g.publish && 지금 && 지금.status === '게시') {
    throw new Error('이미 게시된 주보는 게시 권한이 있는 분만 고칠 수 있습니다.');
  }

  var keep = {};
  ['occasion', 'order', 'cleanup', 'bible', 'study', 'news', 'servants'].forEach(function (k) {
    if (data.hasOwnProperty(k)) keep[k] = data[k];
  });
  keep.occasion = String(keep.occasion || '').trim().slice(0, 30);
  keep.order = (keep.order || []).filter(function (o) { return o && String(o.label || '').trim(); }).map(function (o) {
    return { key: String(o.key || '').slice(0, 20), label: String(o.label).trim().slice(0, 30), value: String(o.value || '').slice(0, 2000), stand: !!o.stand };
  });
  var json = JSON.stringify(keep);
  if (json.length > 주보조각 * 10) throw new Error('주보 내용이 너무 깁니다. 성경 본문이나 셀 교재를 줄여 주세요.');

  var parts = [];
  for (var i = 0; i < json.length; i += 주보조각) parts.push("'" + json.slice(i, i + 주보조각));
  var status = publish ? '게시' : '임시';
  var row = [date, status, 주보제목_(date, keep.occasion), who,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')].concat(parts);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 주보시트_(SHEET_주보, HEAD_주보), v = sh.getDataRange().getValues();
    var at = 0, width = Math.max(sh.getLastColumn(), row.length);
    for (var r = 1; r < v.length; r++) if (날짜문자열_(v[r][BU_날짜]) === date) { at = r + 1; break; }
    while (row.length < width) row.push('');
    if (!at) at = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, row.length).setValues([row]);
  } finally { lock.releaseLock(); }
  캐시비움_();
  // 새로 게시된 주보는 알림을 켠 모두에게 알려줍니다
  if (publish && !(지금 && 지금.status === '게시')) {
    알림보내기_('주보', '*', {
      title: '이번 주 주보가 나왔습니다',
      body: 주보제목_(date, keep.occasion),
      url: 앱주소_() + '?page=bulletin', tag: '주보'
    });
  }
  return { ok: true, status: status, list: 주보목록_(), bulletin: 주보풀기_(주보찾기_(date)) };
}

/** 게시 취소 — 누구나 보던 주보를 다시 임시 상태로 */
function unpublishBulletin(token, date) {
  var who = 주보게시권한_(token);
  var sh = 주보시트_(SHEET_주보, HEAD_주보), v = sh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) {
    if (날짜문자열_(v[r][BU_날짜]) === date) {
      sh.getRange(r + 1, BU_상태 + 1).setValue('임시');
      sh.getRange(r + 1, BU_수정자 + 1).setValue(who);
      sh.getRange(r + 1, BU_시각 + 1).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    }
  }
  캐시비움_();
  return 주보목록_();
}

function deleteBulletin(token, date) {
  주보게시권한_(token);
  var sh = 주보시트_(SHEET_주보, HEAD_주보), v = sh.getDataRange().getValues();
  for (var r = v.length - 1; r >= 1; r--) if (날짜문자열_(v[r][BU_날짜]) === date) sh.deleteRow(r + 1);
  캐시비움_();
  return 주보목록_();
}

/* ---- 대표기도 · 뒷정리 스케줄 ---- */

function getBulletinSchedules(token) {
  주보권한_(token);
  주보시트_(SHEET_대표기도, HEAD_대표기도); 주보시트_(SHEET_뒷정리, HEAD_뒷정리);
  return {
    prayer: 주보스케줄_(SHEET_대표기도), cleanup: 주보스케줄_(SHEET_뒷정리),
    people: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); }),
    cells: getCells().map(function (c) { return c.name; }),
    teams: 사역팀목록_().map(function (t) { return t.name; })
  };
}

/** kind: 'prayer' | 'cleanup' — 표 전체를 새로 씁니다 */
function saveBulletinSchedule(token, kind, rows) {
  주보권한_(token);
  var name = kind === 'cleanup' ? SHEET_뒷정리 : SHEET_대표기도;
  var head = kind === 'cleanup' ? HEAD_뒷정리 : HEAD_대표기도;
  var clean = [], seen = {};
  (rows || []).forEach(function (x) {
    var d = String(x && x.date || '').trim(), n = String(x && x.name || '').trim();
    if (!d && !n) return;
    if (!주일인가_(d)) throw new Error((d || '(빈 날짜)') + ' — 주일 날짜만 넣을 수 있습니다.');
    if (!n) throw new Error(d + ' — ' + (kind === 'cleanup' ? '담당 셀/팀' : '이름') + '을 넣어주세요.');
    if (seen[d]) throw new Error(d + ' 이 두 번 들어가 있습니다.');
    seen[d] = 1;
    clean.push([d, n, String(x.memo || '').trim()]);
  });
  clean.sort(function (a, b) { return a[0].localeCompare(b[0]); });
  var sh = 주보시트_(name, head);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (clean.length) {
    sh.getRange(2, 1, clean.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, clean.length, head.length).setValues(clean);
  }
  캐시비움_();
  return getBulletinSchedules(token);
}

/* ---- 파일 (셀 교재 PDF · QR 이미지) ---- */

function 주보폴더_(date) {
  var id = 설정값_('주보자료폴더'), root = null;
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) {} }
  if (!root) { root = DriveApp.createFolder('청년부 주보 자료'); 설정저장_('주보자료폴더', root.getId()); }
  var it = root.getFoldersByName(date);
  return it.hasNext() ? it.next() : root.createFolder(date);
}

function uploadBulletinFile(token, date, fileName, dataUrl) {
  주보권한_(token);
  if (!주일인가_(date)) throw new Error('주일 날짜를 먼저 골라주세요.');
  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다.');
  if (!/^(application\/pdf|image\/(png|jpe?g|gif|webp))$/.test(m[1])) throw new Error('PDF 또는 이미지 파일만 올릴 수 있습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('20MB 이하 파일만 올릴 수 있습니다.');
  var safe = String(fileName || 'file').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  var file = 주보폴더_(date).createFile(Utilities.newBlob(bytes, m[1], safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fid = file.getId();
  return {
    id: fid, name: safe, mime: m[1],
    url: 'https://drive.google.com/file/d/' + fid + '/view',
    embed: 'https://drive.google.com/file/d/' + fid + '/preview',
    image: 'https://lh3.googleusercontent.com/d/' + fid + '=w800'
  };
}

/* =========================================================
   19. 공용 — 표를 엑셀(xlsx)로
   sheets: [{ name, head: [...], rows: [[...]] }]
   ========================================================= */
function 표엑셀_(fname, sheets) {
  var tmp = null;
  try {
    tmp = SpreadsheetApp.create(fname);
    sheets.forEach(function (t, i) {
      var sh = i === 0 ? tmp.getSheets()[0] : tmp.insertSheet(t.name);
      if (i === 0) sh.setName(t.name);
      sh.getRange(1, 1, 1, t.head.length).setValues([t.head])
        .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
      if (t.rows.length) {
        sh.getRange(2, 1, t.rows.length, t.head.length).setNumberFormat('@');
        sh.getRange(2, 1, t.rows.length, t.head.length).setValues(t.rows.map(function (r) {
          return t.head.map(function (_, j) { return r[j] == null ? '' : String(r[j]); });
        }));
      }
      sh.setFrozenRows(1);
      for (var c = 1; c <= t.head.length; c++) sh.setColumnWidth(c, t.widths && t.widths[c - 1] ? t.widths[c - 1] : 130);
    });
    SpreadsheetApp.flush();
    var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + HOST.accessToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return { name: fname + '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        b64: Utilities.base64Encode(res.getBlob().getBytes()) };
    }
  } catch (e) {
    // 아래 CSV 로
  } finally {
    if (tmp) { try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e2) {} }
  }
  var t0 = sheets[0];
  var csv = [t0.head].concat(t0.rows).map(function (r) {
    return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  return { name: fname + '.csv', mime: 'text/csv;charset=utf-8', b64: Utilities.base64Encode('﻿' + csv, Utilities.Charset.UTF_8), fallback: true };
}

/** 찬양 아카이브 → 엑셀 (화면에서 고른 기간의 곡 목록을 그대로) */
function worshipArchiveExport(token, label, rows) {
  찬양권한_(token);
  rows = (rows || []).slice(0, 5000).map(function (r) { return (r || []).slice(0, 12); });
  var head = ['날짜', '예배', '구분', '순서', '곡 제목', '원곡팀', 'Key', 'BPM', '인도', '링크'];
  return 표엑셀_('찬양콘티_' + String(label || '').replace(/[\\\/:*?"<>|]/g, '') + '_' + ymd_(new Date()),
    [{ name: '콘티', head: head, rows: rows, widths: [95, 150, 60, 50, 220, 150, 55, 55, 110, 240] }]);
}

/** 콘티 여러 곡을 한 번에 — 빈 콘티를 처음 만들 때 한 곡씩 저장하지 않도록 */
function saveWorshipSongs(token, date, kind, songs) {
  requireWorshipEdit_(token);
  date = 날짜문자열_(date);
  kind = 구분정리_(kind);
  var list = (songs || []).map(function (s) {
    s = s || {};
    return { title: String(s.title || '').trim(), team: String(s.team || '').trim(),
      key: String(s.key || '').trim(), link: String(s.link || '').trim(), note: String(s.note || '').trim(),
      bpm: String(s.bpm || '').trim().slice(0, 10), form: String(s.form || '').trim().slice(0, 120), solo: s.solo || [] };
  }).filter(function (s) { return s.title; }).slice(0, 30);
  if (!list.length) throw new Error('찬양 제목을 하나 이상 입력해주세요.');
  var max = 0;
  콘티목록_(date, kind).forEach(function (s) { max = Math.max(max, s.seq); });
  var rows = list.map(function (s, i) {
    return [date, max + i + 1, s.title, s.team, s.key, s.link, s.note, kind, s.bpm, s.form, 솔로쓰기_(s.solo)];
  });
  시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, function () { return false; }, rows);
  return 한주_(date);
}

/* ---------- 제자훈련 종이 출석부 (Letter 한 장) ---------- */
function discipleshipSheetPdf(key, date) {
  requireAdmin_(key);
  var cfg = 훈련설정_(), dates = 훈련일정_(cfg);
  date = String(date || '').trim();
  if (dates.indexOf(date) === -1) {
    var today = ymd_(new Date());
    date = dates.filter(function (d) { return d <= today; }).pop() || dates[0];
  }
  var no = dates.indexOf(date) + 1;
  var 출결 = 훈련출결맵_();
  var 지난 = dates.filter(function (d) { return d < date; });
  var list = rows_(SHEET_제자훈련).map(function (r) { return String(r[훈련_이름] || '').trim(); })
    .filter(function (n) { return n; }).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
    .map(function (n) {
      var mine = 출결[n] || {};
      var present = 지난.filter(function (d) { return mine[d] === '출석'; }).length;
      return { name: n, present: present, held: 지난.length, now: mine[date] || '' };
    });
  if (!list.length) throw new Error('훈련 명단이 비어 있습니다.');

  var half = Math.ceil(list.length / 2);
  var 칸 = function (p) {
    if (!p) return '<td class="bx e"></td><td class="nm"></td><td class="rt"></td>';
    var rate = p.held ? Math.round(p.present / p.held * 100) : null;
    return '<td class="bx">' + (p.now === '출석' ? '✓' : '') + '</td><td class="nm">' + esc_(p.name) + '</td>' +
      '<td class="rt">' + (p.held ? p.present + '/' + p.held + ' <span>(' + rate + '%)</span>' : '—') + '</td>';
  };
  var rows = '';
  for (var i = 0; i < half; i++) rows += '<tr>' + 칸(list[i]) + '<td class="gap"></td>' + 칸(list[i + half]) + '</tr>';
  var small = list.length > 44;
  var d = parseYmd_(date), WD = ['일', '월', '화', '수', '목', '금', '토'];

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page { size: 8.5in 11in; margin: 0.5in 0.55in; }' +
    'body { font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; color: #1A1917; margin: 0; }' +
    '.org { font-size: 8.5pt; color: #8B857C; letter-spacing: 2pt; font-weight: 700; }' +
    'h1 { font-size: 20pt; margin: 4px 0 2px; font-weight: 800; }' +
    '.sub { font-size: 10.5pt; color: #55504A; margin-bottom: 10px; }' +
    'table { width: 100%; border-collapse: collapse; }' +
    'td { padding: ' + (small ? '3px' : '5px') + ' 4px; font-size: ' + (small ? '10pt' : '11.5pt') + '; border-bottom: 1px solid #DAD6CF; vertical-align: middle; }' +
    'td.bx { width: 16px; height: 16px; border: 1.6px solid #1A1917; text-align: center; font-size: 10pt; padding: 0; }' +
    'td.bx.e { border: none; }' +
    'td.nm { padding-left: 8px; font-weight: 700; width: 25%; }' +
    'td.rt { text-align: right; color: #55504A; font-size: ' + (small ? '9pt' : '10pt') + '; width: 17%; }' +
    'td.rt span { color: #8B857C; }' +
    'td.gap { width: 4%; border: none; }' +
    '.foot { margin-top: 10px; font-size: 8.5pt; color: #8B857C; }' +
    '</style></head><body>' +
    '<div class="org">TORONTO YOUNGNAK CHURCH · YOUNG ADULTS</div>' +
    '<h1>제자훈련 출석부 · ' + no + '주차</h1>' +
    '<div class="sub">' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD[d.getDay()] + ') · 명단 ' + list.length + '명 · 옆 숫자는 지난 모임까지 출석</div>' +
    '<table>' + rows + '</table>' +
    '<div class="foot">수료 기준 ' + cfg.passRate + '% · 전체 ' + cfg.weeks + '주 · 출력 ' + ymd_(new Date()) + '</div>' +
    '</body></html>';
  return PDF응답_(html, '제자훈련출석부_' + no + '주차_' + date);
}


/* ---------- 누구나 — 청년부 공개 일정 (로그인 없이) ---------- */
function getOpenCalendar(ym) {
  ym = /^\d{4}-\d{2}$/.test(String(ym || '')) ? ym : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var r = 일정읽기_('공개', ym);
  return { ym: r.ym || ym, configured: !!r.configured, error: r.error || '', name: r.name || '',
    events: (r.events || []).map(function (e) {
      return { title: e.title, allDay: e.allDay, date: e.date, time: e.time, endDate: e.endDate, endTime: e.endTime, where: e.where, desc: e.desc };
    }) };
}


/** /bfile/<id> — 주보에 올라간 파일만 */
function 주보파일허용_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return false;
  return 주보행들_().some(function (r) { return r.json.indexOf('"' + id + '"') !== -1; });
}

/** /audio/<id> 로 흘려보내도 되는 파일인지 — 찬양 녹음에 올라온 파일만 */
function 녹음파일허용_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return false;
  return rows_(SHEET_찬양녹음).some(function (r) {
    return String(r[WR_파일] || '').trim() === id || String(r[WR_링크] || '').indexOf(id) !== -1;
  });
}

/* =========================================================
   20. 셀 신청 · 셀 편성
   ---------------------------------------------------------
   · 포털 '셀 신청 및 교적확인' — 커미티가 셀 신청을 열면 모두에게,
     새가족팀이 '셀 신청 허용' 한 새가족에게는 언제든 열립니다.
     제출하면 교적에 바로 반영됩니다 (새가족은 교적에 새로 올라갑니다).
   · 셀 신청 관리 (커미티) — 셀년도 · 셀 개설 · 신청 현황 · 요주인물 ·
     자동 배정 · 드래그로 조정 · 확정 · 공개 · 새 셀년도 시작(셀목록 · 셀원명단 교체)
     공개 전에는 커미티 외에는 아무도 볼 수 없습니다.
   ========================================================= */

var SHEET_셀신청 = '셀신청';
var HEAD_셀신청 = ['셀년도', '이름', '이메일', '제출시각', '셀참여', '체류신분', '부모님성함', '문의', '구분', '자료', '수정시각'];
var CA_년도 = 0, CA_이름 = 1, CA_이메일 = 2, CA_시각 = 3, CA_참여 = 4, CA_체류 = 5, CA_부모 = 6, CA_문의 = 7,
    CA_구분 = 8, CA_자료 = 9, CA_수정 = 10;
var SHEET_셀편성 = '셀편성';
var HEAD_셀편성 = ['셀년도', '상태', '수정자', '수정시각', '자료'];
var CP_년도 = 0, CP_상태 = 1, CP_수정자 = 2, CP_시각 = 3, CP_자료 = 4;
var SHEET_셀요주 = '셀요주인물';
var HEAD_셀요주 = ['이름', '메모', '작성자', '시각'];
var SHEET_셀이전명단 = '셀명단보관';

var 체류신분목록 = ['시민권', '영주권', '비자', '방문자'];
var 세례목록 = ['성인세례', '유아세례 + 성인입교', '유아세례', '카톨릭 세례', '카톨릭 세례 + 입교', '없음'];

function 셀신청안내(year) {
  var y = String(year || 셀년도_()).split('-');
  return y[0] + '-' + y[1] + ' 셀 모임은 ' + y[0] + '년 9월부터 ' + y[1] + '년 8월까지 진행됩니다.\n\n' +
    '자율 모임 기간: 1월, 2월, 7월, 8월에는 자율적으로 또래 모임, 특별 프로그램, 양육 훈련 등이 운영됩니다.\n\n' +
    '참여 대상: 새가족 교육을 마치고 토론토 영락교회 청년1부 예배에 참여 중인 모든 분\n\n' +
    '셀 모임은 말씀과 기도 안에서 서로의 삶과 공동체를 굳건히 세워가는 데 중점을 두고 있습니다.\n' +
    '단순한 친목이나 멤버 관리를 넘어, 신실하게 공동체에 헌신하고자 하는 분들을 환영합니다.';
}
function 셀원약속() {
  return {
    intro: '셀 모임을 신청하는 모든 분은 아래 내용을 성실하게 이행해 주시기를 부탁드립니다.',
    items: [
      ['예배와 셀 참여', '매주 주일 예배와 셀 모임에 꾸준히 참석해야 합니다. (한 달 기준, 절반 이상 참여가 어려운 경우 셀 신청이 제한될 수 있습니다. 직업적 특성으로 인해 어려움이 있다면 담당 목회자와 상의해 주시기 바랍니다.)'],
      ['사전 고지', '예배나 셀 참여가 어려운 상황이 발생하면, 사전에 셀 리더에게 미리 알려주세요.'],
      ['모임 방향 존중', '성경 공부를 중심으로 하는 셀 모임의 방향성을 존중하고 적극적으로 참여해 주세요.'],
      ['운영 원칙 준수', '각 셀에서 정한 운영 원칙(단체 채팅방, 아웃팅 등)을 지켜주세요.'],
      ['진솔한 나눔', '한 달에 한 번 진행되는 삶과 기도 제목 나눔에 진솔하게 참여해 주세요.']
    ],
    outro: '이러한 방향성에 동의하고 함께 성장해 나갈 모든 청년들을 셀 모임에 초대합니다.'
  };
}

/** 셀년도 이름 — 설정의 '셀신청년도', 없으면 날짜로 (6월부터는 다음 해 시작) */
function 셀년도_() {
  var y = String(설정값_('셀신청년도') || '').trim();
  if (/^\d{4}-\d{4}$/.test(y)) return y;
  var d = new Date(), Y = d.getFullYear();
  return d.getMonth() >= 5 ? Y + '-' + (Y + 1) : (Y - 1) + '-' + Y;
}
/** 지금 운영 중인 셀년도 (9월에 새 셀년도가 시작됩니다) */
function 운영셀년도_() {
  var d = new Date(), Y = d.getFullYear();
  return d.getMonth() >= 8 ? Y + '-' + (Y + 1) : (Y - 1) + '-' + Y;
}
/** 지금 셀목록 · 셀원명단 그대로의 편성 (셀장은 셀원 목록에서 뺍니다) */
function 지금편성_() {
  return getCells().map(function (c) {
    return { name: c.name, leader: c.leader, members: c.members.filter(function (m) { return m !== c.leader; }) };
  });
}
function 셀신청열림_() { return String(설정값_('셀신청오픈') || 'OFF').toUpperCase() === 'ON'; }

/** 새가족 시트에서 셀 신청이 허용된 분인지 (이메일 또는 이름) */
function 새가족셀허용_(email, name) {
  email = String(email || '').trim().toLowerCase(); name = String(name || '').trim();
  return 새가족목록_().some(function (n) {
    return n.cellApp && ((email && String(n.email || '').toLowerCase() === email) || (name && n.name === name));
  });
}
function 새가족인가_(name, email) {
  email = String(email || '').trim().toLowerCase();
  return 새가족목록_().some(function (n) {
    return n.status !== '중단' && n.status !== '셀배정완료' && (n.name === name || (email && String(n.email || '').toLowerCase() === email));
  });
}

/** 토큰 → 신청하는 분 */
function 셀신청자_(token) {
  if (String(token || '').indexOf(새가족접두) === 0) {
    var nf = 새가족본인_(token);
    return { kind: 'newcomer', nf: nf, name: nf.name, email: nf.email, allowed: nf.cellApp, committee: false };
  }
  var me = requirePortal_(token);
  var com = 포털역할_(me.name).roles.indexOf('커미티') !== -1;
  return { kind: 'member', me: me, name: me.name, email: me.email, committee: com,
    allowed: 셀신청열림_() || 새가족셀허용_(me.email, me.name) };
}

function 셀신청행들_() {
  return rows_(SHEET_셀신청).filter(function (r) { return String(r[CA_이름]).trim(); }).map(function (r) {
    var d = {};
    try { d = JSON.parse(String(r[CA_자료] || '{}')); } catch (e) {}
    return {
      year: String(r[CA_년도]).trim(), name: String(r[CA_이름]).trim(), email: String(r[CA_이메일] || '').trim().toLowerCase(),
      at: r[CA_시각] instanceof Date ? Utilities.formatDate(r[CA_시각], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[CA_시각] || ''),
      join: String(r[CA_참여] || '').trim(), residency: String(r[CA_체류] || '').trim(), parents: String(r[CA_부모] || '').trim(),
      question: String(r[CA_문의] || '').trim(), kind: String(r[CA_구분] || '').trim(), data: d
    };
  });
}
function 내셀신청_(year, name, email) {
  email = String(email || '').toLowerCase();
  var hit = null;
  셀신청행들_().forEach(function (a) {
    if (a.year === year && (a.name === name || (email && a.email === email))) hit = a;
  });
  return hit;
}

/** 포털 버튼 상태 — open(누구나) · locked(커미티에게만 흐리게) · hidden */
function 셀신청상태_(who) {
  var year = 셀년도_();
  var mine = 내셀신청_(year, who.name, who.email);
  return {
    state: who.allowed ? 'open' : (who.committee ? 'locked' : 'hidden'),
    year: year,
    submitted: mine ? { at: mine.at, join: mine.join } : null
  };
}

/** 공개된 셀 편성에서 내 셀 */
function 내셀_(name) {
  var plans = 셀편성들_().filter(function (p) { return p.status === '공개'; })
    .sort(function (a, b) { return b.year.localeCompare(a.year); });
  if (!plans.length) return null;
  var p = plans[0], hit = null;
  (p.plan.cells || []).forEach(function (c) {
    if (c.leader === name || (c.members || []).indexOf(name) !== -1) hit = c;
  });
  if (!hit) return null;
  var 교적 = 교적맵_();
  return { year: p.year, cell: hit.name, leader: hit.leader,
    members: (hit.members || []).filter(function (m) { return m !== hit.leader; }).map(function (m) {
      return { name: m, gender: (교적[m] || {}).gender || '' };
    }) };
}

/* 주소 한 줄 ↔ 칸 나누기 */
function 주소합치기_(a) {
  var street = String(a.street || '').trim(), unit = String(a.unit || '').trim(), city = String(a.city || '').trim();
  var postal = 우편입력_(a.postal);
  if (postal.length === 6) postal = postal.slice(0, 3) + ' ' + postal.slice(3);
  return [street + (unit ? ' #' + unit.replace(/^#/, '') : ''), city, postal].filter(function (x) { return x; }).join(', ');
}
function 주소나누기_(s) {
  s = String(s || '').trim();
  var out = { street: '', unit: '', city: '', postal: '' };
  if (!s) return out;
  var m = /([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)/.exec(s);
  if (m) { out.postal = (m[1] + ' ' + m[2]).toUpperCase(); s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim(); }
  s = s.replace(/[,\s]*(ON|Ontario)\s*$/i, '').replace(/[,\s]+$/, '');
  var parts = s.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  if (parts.length) {
    var st = parts[0], u = /\s#\s*([\w-]+)$/.exec(st) || /^(?:Unit|Suite|Apt\.?)\s*([\w-]+)[,\s]+/i.exec(st);
    if (u) { out.unit = u[1]; st = st.replace(u[0], ' ').trim(); }
    out.street = st;
    if (parts.length > 1) out.city = parts[parts.length - 1];
  }
  return out;
}

/** 신청서 첫 화면 */
function cellAppInit(token) {
  var who = 셀신청자_(token);
  if (!who.allowed) throw new Error('지금은 셀 신청 기간이 아닙니다.');
  var year = 셀년도_();
  var prev = 내셀신청_(year, who.name, who.email);
  var pd = (prev && prev.data) || {};
  var f;
  if (who.kind === 'newcomer') {
    var nf = who.nf;
    var bap = { '없음': '없음', '유아세례': '유아세례' }[nf.baptized] || '';
    f = { name: nf.name, gender: nf.gender, birthday: nf.birthday, phone: nf.contact, kakao: nf.kakao, email: nf.email,
      address: { street: '', unit: '', city: '', postal: '' }, cell: '새가족', baptized: bap, parents: '', residency: '',
      joinedAt: ymd_(new Date()), engFirst: '', engLast: '', envelopeNo: '', envelopeRequest: null };
  } else {
    var me = who.me;
    var cell = '';
    rows_(SHEET_셀원명단).forEach(function (x) { if (!cell && String(x[1]).trim() === me.name) cell = String(x[0]).trim(); });
    if (!cell && 새가족인가_(me.name, me.email)) cell = '새가족';
    var eng = String(me.engName || '').trim().split(/\s+/);
    f = { name: me.name, gender: me.gender, birthday: me.birthday, phone: me.phone, kakao: me.kakao, email: me.email,
      address: 주소나누기_(me.address), cell: cell || '셀 없음', baptized: me.baptized, parents: me.parents, residency: me.residency,
      joinedAt: me.joinedAt, engFirst: eng.length > 1 ? eng.slice(0, -1).join(' ') : (eng[0] || ''), engLast: eng.length > 1 ? eng[eng.length - 1] : '',
      envelopeNo: me.envelopeNo, envelopeRequest: 헌금신청상태_(me.name) };
  }
  if (pd.engFirst) { f.engFirst = pd.engFirst; f.engLast = pd.engLast; }
  if (pd.address && who.kind === 'newcomer') f.address = pd.address;
  return {
    year: year, form: f, prev: prev ? { at: prev.at, join: prev.join, question: prev.question } : null,
    options: { residency: 체류신분목록, baptized: 세례목록 },
    notice: 셀신청안내(year), promise: 셀원약속(), envelopeRules: 헌금조건(),
    kind: who.kind
  };
}

function submitCellApp(token, d) {
  var who = 셀신청자_(token);
  if (!who.allowed) throw new Error('지금은 셀 신청 기간이 아닙니다.');
  d = d || {};
  var t = function (k, max) { return String(d[k] == null ? '' : d[k]).trim().slice(0, max || 200); };
  var engFirst = t('engFirst', 60), engLast = t('engLast', 60);
  if (!engFirst || !engLast) throw new Error('영문 이름(First Name, Last Name)을 입력해주세요.');
  if (!/^[A-Za-z][A-Za-z .'\-]*$/.test(engFirst + ' ' + engLast)) throw new Error('영문 이름은 여권에 적힌 대로 영어로 입력해주세요.');
  var phone = 전화모양_(t('phone', 30));
  if (!phone) throw new Error('전화번호를 입력해주세요. (교적에 등록할 때 꼭 필요합니다)');
  var kakao = t('kakao', 60);
  var a = d.address || {};
  var addr = { street: String(a.street || '').trim().slice(0, 120), unit: String(a.unit || '').trim().slice(0, 20),
    city: String(a.city || '').trim().slice(0, 60), postal: 우편입력_(a.postal) };
  if (!addr.street || !addr.city) throw new Error('주소(Street, City)를 입력해주세요.');
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(addr.postal)) throw new Error('Postal Code 를 확인해주세요. 예: M2H 2E1');
  var residency = t('residency');
  if (체류신분목록.indexOf(residency) === -1) throw new Error('캐나다 체류 신분을 골라주세요.');
  var baptized = t('baptized');
  if (세례목록.indexOf(baptized) === -1) throw new Error('세례 여부를 골라주세요.');
  var parents = t('parents', 80), question = t('question', 2000);
  var join = t('join');
  if (join !== 'Yes' && join !== 'No') throw new Error('셀 참여 여부(Yes / No)를 골라주세요.');
  var address = 주소합치기_(addr);
  var engName = engFirst + ' ' + engLast;
  var year = 셀년도_();

  var name = who.name, email = who.email, newToken = '';
  if (who.kind === 'newcomer') {
    var 기존 = 교적맵_()[name];
    if (기존 && String(기존.email || '').toLowerCase() !== String(email).toLowerCase()) {
      throw new Error('교적에 같은 이름(' + name + ')이 이미 있습니다. 커미티에 문의해주세요.');
    }
    var nf = who.nf;
    교적저장_(name, { phone: phone, kakao: kakao, email: email, birthday: nf.birthday, gender: nf.gender, baptized: baptized,
      engName: engName, address: address, joinedAt: ymd_(new Date()), residency: residency, parents: parents });
  } else {
    교적저장_(name, { phone: phone, kakao: kakao, baptized: baptized, engName: engName, address: address,
      residency: residency, parents: parents });
  }
  캐시비움_();
  newToken = 포털토큰_(name, 전화키_(phone), 우편확인사용_() ? 우편키_(address) : '');

  // 신청서 저장 (같은 해 · 같은 분이면 고칩니다)
  var sh = 주보시트_(SHEET_셀신청, HEAD_셀신청);
  var data = { engFirst: engFirst, engLast: engLast, phone: phone, kakao: kakao, address: addr, residency: residency,
    baptized: baptized, parents: parents, join: join, question: question, cell: t('cell', 40) };
  var now = new Date();
  var row = [year, name, String(email || '').toLowerCase(), now, join, residency, parents, question,
    who.kind === 'newcomer' ? '새가족' : '교적', JSON.stringify(data), now];
  var v = sh.getDataRange().getValues(), at = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][CA_년도]).trim() === year && (String(v[i][CA_이름]).trim() === name ||
        (email && String(v[i][CA_이메일] || '').toLowerCase() === String(email).toLowerCase()))) { at = i + 1; break; }
  }
  if (at) { row[CA_시각] = v[at - 1][CA_시각] || now; sh.getRange(at, 1, 1, row.length).setValues([row]); }
  else sh.appendRow(row);
  캐시비움_();

  // 커미티 휴대폰으로 알려줍니다
  알림보내기_('셀신청', 역할인사람_('커미티'), {
    title: '셀 신청이 들어왔습니다',
    body: name + ' — ' + join + (who.kind === 'newcomer' ? ' (새가족)' : ''),
    url: 앱주소_() + '?page=cells', tag: '셀신청'
  });

  // 헌금봉투번호 신청 (없는 분만)
  var envMsg = '';
  if (d.envelope) {
    try { requestEnvelope(newToken, !!d.envelopeAgree); envMsg = '헌금봉투번호 신청을 회계팀에 보냈습니다.'; }
    catch (e) { envMsg = e.message || ''; }
  }
  return { ok: true, token: newToken, join: join, year: year, envelope: envMsg, becameMember: who.kind === 'newcomer' };
}

/* ---------------- 커미티 — 셀 신청 관리 ---------------- */

function 셀편성들_() {
  return rows_(SHEET_셀편성).filter(function (r) { return String(r[CP_년도]).trim(); }).map(function (r) {
    var json = '';
    for (var i = CP_자료; i < r.length; i++) {
      var part = String(r[i] == null ? '' : r[i]);
      if (part.charAt(0) === "'") part = part.slice(1);
      json += part;
    }
    var plan = { cells: [] };
    try { plan = JSON.parse(json || '{"cells":[]}'); } catch (e) {}
    return { year: String(r[CP_년도]).trim(), status: String(r[CP_상태] || '작성중').trim(), by: String(r[CP_수정자] || ''),
      at: r[CP_시각] instanceof Date ? Utilities.formatDate(r[CP_시각], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[CP_시각] || ''),
      plan: plan };
  });
}
function 셀편성_(year) { return 셀편성들_().filter(function (p) { return p.year === year; })[0] || null; }
function 셀편성저장_(year, plan, status, by) {
  var sh = 주보시트_(SHEET_셀편성, HEAD_셀편성);
  var json = JSON.stringify(plan || { cells: [] });
  var parts = [];
  for (var i = 0; i < json.length; i += 주보조각) parts.push("'" + json.slice(i, i + 주보조각));
  var row = [year, status, by || '', new Date()].concat(parts);
  var v = sh.getDataRange().getValues(), at = 0;
  for (var r = 1; r < v.length; r++) if (String(v[r][CP_년도]).trim() === year) { at = r + 1; break; }
  if (!at) { sh.appendRow([year]); at = sh.getLastRow(); }
  var width = Math.max(row.length, v.length ? v[0].length : row.length);
  while (row.length < width) row.push('');
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  sh.getRange(at, 1).setNumberFormat('@');
  sh.getRange(at, 1, 1, row.length).setValues([row]);
  캐시비움_();
}

function 요주목록_() {
  return rows_(SHEET_셀요주).filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    return { name: String(r[0]).trim(), memo: String(r[1] || '').trim(), by: String(r[2] || '').trim() };
  });
}

/** 셀년도 'A-B' 의 바로 앞 셀년도(작년 9월 ~ 올해 8월) 셀 출석률 — 이름별 */
function 지난셀출석_(year) {
  var a = Number(String(year).split('-')[0]) || new Date().getFullYear();
  var from = (a - 1) + '-09-01', to = a + '-08-31';
  var stat = {};
  rows_(SHEET_출결기록).forEach(function (r) {
    var d = 날짜문자열_(r[A_DATE]);
    if (!d || d < from || d > to) return;
    var n = String(r[A_NAME]).trim();
    if (!n) return;
    var s = stat[n] || (stat[n] = { present: 0, total: 0 });
    s.total++;
    if (출석인정_(r[A_STATUS], r[A_REASON])) s.present++;
  });
  Object.keys(stat).forEach(function (n) { stat[n].rate = stat[n].total ? Math.round(stat[n].present / stat[n].total * 100) : null; });
  return { from: from, to: to, stat: stat };
}

function 만나이_(birthday) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday || ''));
  if (!m) return null;
  var t = new Date(), age = t.getFullYear() - Number(m[1]);
  if (t.getMonth() + 1 < Number(m[2]) || (t.getMonth() + 1 === Number(m[2]) && t.getDate() < Number(m[3]))) age--;
  return age >= 0 && age < 120 ? age : null;
}

function cellAdminInit(key, year) {
  requireAdmin_(key);
  year = /^\d{4}-\d{4}$/.test(String(year || '')) ? String(year) : 셀년도_();
  var 교적 = 교적맵_();
  var att = 지난셀출석_(year);
  var curCell = {};
  rows_(SHEET_셀원명단).forEach(function (x) { var n = String(x[1]).trim(); if (n && !curCell[n]) curCell[n] = String(x[0]).trim(); });
  var nfs = 새가족목록_();
  var people = {};
  var person = function (name) {
    if (people[name]) return people[name];
    var p = 교적[name] || {}, nf = nfs.filter(function (n) { return n.name === name; })[0];
    var st = att.stat[name];
    return (people[name] = {
      name: name, gender: p.gender || (nf && nf.gender) || '', age: 만나이_(p.birthday || (nf && nf.birthday)),
      birthday: p.birthday || (nf && nf.birthday) || '', cell: curCell[name] || '',
      newcomer: !!(nf && nf.status !== '중단' && nf.status !== '셀배정완료'),
      rate: st ? st.rate : null, present: st ? st.present : 0, total: st ? st.total : 0,
      inDirectory: !!교적[name], phone: p.phone || (nf && nf.contact) || '', email: p.email || (nf && nf.email) || ''
    });
  };
  Object.keys(교적).forEach(person);
  var apps = 셀신청행들_().filter(function (a) { return a.year === year; }).map(function (a) {
    var p = person(a.name);
    return { name: a.name, email: a.email, at: a.at, join: a.join, residency: a.residency, parents: a.parents,
      question: a.question, kind: a.kind, data: a.data };
  });
  var plan = 셀편성_(year), live = false;
  // 지금 운영 중인 셀년도 — 실제 셀목록 · 셀원명단을 그대로 보여주고, 고치면 바로 반영합니다
  if (year === 운영셀년도_() && (!plan || plan.status === '전환완료')) {
    live = true;
    plan = { status: '운영중', by: '', at: '', plan: { cells: 지금편성_(), extra: [] } };
  }
  var years = 셀편성들_().map(function (p) { return p.year; });
  if (years.indexOf(운영셀년도_()) === -1) years.push(운영셀년도_());
  if (years.indexOf(year) === -1) years.push(year);
  if (years.indexOf(셀년도_()) === -1) years.push(셀년도_());
  years.sort();
  return {
    year: year, years: years, open: 셀신청열림_(), openYear: 셀년도_(),
    attendanceRange: [att.from, att.to],
    people: Object.keys(people).map(function (k) { return people[k]; }),
    apps: apps,
    plan: plan ? { status: plan.status, by: plan.by, at: plan.at, cells: plan.plan.cells || [], extra: plan.plan.extra || [] } : null,
    live: live, liveYear: 운영셀년도_(),
    flags: 요주목록_(),
    cellsNow: getCells().map(function (c) { return { name: c.name, leader: c.leader, members: c.members }; })
  };
}

function setCellAppOpen(key, on, year) {
  requireAdmin_(key);
  if (year) {
    if (!/^\d{4}-\d{4}$/.test(String(year))) throw new Error('셀년도는 2026-2027 처럼 적어주세요.');
    설정저장_('셀신청년도', String(year));
  }
  설정저장_('셀신청오픈', on ? 'ON' : 'OFF');
  return { open: 셀신청열림_(), openYear: 셀년도_() };
}

/** status: 작성중 · 확정 · 공개 */
function saveCellPlan(key, year, cells, status, extra) {
  requireAdmin_(key);
  if (!/^\d{4}-\d{4}$/.test(String(year || ''))) throw new Error('셀년도를 확인해주세요.');
  status = ['작성중', '확정', '공개', '운영중'].indexOf(status) !== -1 ? status : '작성중';
  var cur = 셀편성_(year);
  var isLive = year === 운영셀년도_() && (!cur || cur.status === '전환완료');
  if (status === '운영중' && !isLive) throw new Error('지금 운영 중인 셀년도만 바로 반영할 수 있습니다.');
  if (cur && cur.status === '전환완료' && !isLive) throw new Error('이미 새 셀년도로 전환한 편성입니다.');
  var seen = {}, names = {};
  cells = (cells || []).map(function (c) {
    var nm = String(c.name || '').trim();
    if (!nm) throw new Error('이름 없는 셀이 있습니다.');
    if (names[nm]) throw new Error('셀 이름이 겹칩니다: ' + nm);
    names[nm] = 1;
    var leader = String(c.leader || '').trim();
    var members = (c.members || []).map(function (m) { return String(m || '').trim(); }).filter(function (m) {
      if (!m || m === leader || seen[m]) return false;
      seen[m] = 1; return true;
    });
    return { name: nm, leader: leader, members: members };
  });
  cells.forEach(function (c) { if (c.leader && seen[c.leader]) throw new Error(c.leader + '님이 셀장이면서 다른 셀의 셀원으로 들어가 있습니다.'); });
  extra = (extra || []).map(function (m) { return String(m || '').trim(); }).filter(function (m) { return m && !seen[m]; });
  if (status === '운영중') {
    if (!cells.length) throw new Error('셀이 없습니다.');
    셀명단바꾸기_(year, cells, '셀 편성 관리에서 수정');
    return cellAdminInit(key, year);
  }
  셀편성저장_(year, { cells: cells, extra: extra }, status, whoami_());
  return cellAdminInit(key, year);
}

function setCellFlag(key, name, on, memo) {
  requireAdmin_(key);
  name = String(name || '').trim();
  if (!name) throw new Error('이름이 없습니다.');
  var sh = 주보시트_(SHEET_셀요주, HEAD_셀요주), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]).trim() === name) sh.deleteRow(i + 1);
  if (on) sh.appendRow([name, String(memo || '').trim().slice(0, 500), whoami_(), new Date()]);
  캐시비움_();
  return 요주목록_();
}

/** 신청을 커미티가 지웁니다 (잘못 들어간 경우) */
function deleteCellApp(key, year, name) {
  requireAdmin_(key);
  var sh = 주보시트_(SHEET_셀신청, HEAD_셀신청), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][CA_년도]).trim() === year && String(v[i][CA_이름]).trim() === name) sh.deleteRow(i + 1);
  }
  캐시비움_();
  return cellAdminInit(key, year);
}

/**
 * 새 셀년도 시작 — 공개한 편성으로 셀목록 · 셀원명단을 바꿉니다.
 * 바꾸기 전 명단은 '셀명단보관' 시트에 그대로 남겨 둡니다.
 */
function applyCellPlan(key, year) {
  requireAdmin_(key);
  var p = 셀편성_(year);
  if (!p) throw new Error('편성이 없습니다.');
  if (p.status !== '공개') throw new Error('공개한 편성만 새 셀년도로 전환할 수 있습니다.');
  var cells = p.plan.cells || [];
  if (!cells.length) throw new Error('셀이 없습니다.');
  셀명단바꾸기_(year, cells, year + ' 새 셀년도 시작');
  셀편성저장_(year, p.plan, '전환완료', whoami_());
  캐시비움_();
  return cellAdminInit(key, year);
}

/**
 * 셀목록 · 셀원명단을 이 편성으로 바꿉니다.
 * 바꾸기 전 명단은 '셀명단보관' 에, 달라진 셀원은 '명단변경기록' 에 남깁니다.
 * (셀장은 지금처럼 셀원명단에도 함께 넣습니다)
 */
function 셀명단바꾸기_(year, cells, why) {
  var 교적 = 교적맵_();
  var 이전 = getCells();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var bk = 주보시트_(SHEET_셀이전명단, ['보관시각', '셀년도', '셀이름', '셀장', '셀원이름']);
  var keep = [];
  이전.forEach(function (c) {
    if (!c.members.length) keep.push([stamp, year, c.name, c.leader, '']);
    c.members.forEach(function (m) { keep.push([stamp, year, c.name, c.leader, m]); });
  });
  if (keep.length) bk.getRange(bk.getLastRow() + 1, 1, keep.length, 5).setValues(keep);

  var rooms = {}, before = {}, after = {};
  이전.forEach(function (c) { rooms[c.name] = c.room || ''; c.members.forEach(function (m) { before[c.name + '||' + m] = 1; }); });
  var 목록 = sheet_(SHEET_셀목록), 명단 = sheet_(SHEET_셀원명단);
  if (목록.getLastRow() > 1) 목록.getRange(2, 1, 목록.getLastRow() - 1, Math.max(4, 목록.getLastColumn())).clearContent();
  if (명단.getLastRow() > 1) 명단.getRange(2, 1, 명단.getLastRow() - 1, Math.max(2, 명단.getLastColumn())).clearContent();
  var rows1 = cells.map(function (c) { return [c.name, c.leader, ((교적[c.leader] || {}).email || ''), rooms[c.name] || '']; });
  if (rows1.length) 목록.getRange(2, 1, rows1.length, 4).setValues(rows1);
  var rows2 = [];
  cells.forEach(function (c) {
    if (c.leader) { rows2.push([c.name, c.leader]); after[c.name + '||' + c.leader] = 1; }
    c.members.forEach(function (m) { rows2.push([c.name, m]); after[c.name + '||' + m] = 1; });
  });
  if (rows2.length) 명단.getRange(2, 1, rows2.length, 2).setValues(rows2);

  var log = [], now = new Date();
  Object.keys(before).forEach(function (k) { if (!after[k]) { var x = k.split('||'); log.push([now, x[0], x[1], '제거', why, whoami_()]); } });
  Object.keys(after).forEach(function (k) { if (!before[k]) { var x = k.split('||'); log.push([now, x[0], x[1], '추가', why, whoami_()]); } });
  var lg = sheet_(SHEET_명단변경);
  if (lg && log.length) lg.getRange(lg.getLastRow() + 1, 1, log.length, 6).setValues(log);
  캐시비움_();
}

/* =========================================================
   알림 (푸시) — 휴대폰 · 컴퓨터로 바로 가는 알림
   ---------------------------------------------------------
   · 기기마다 한 줄씩 '알림기기' 시트에 저장합니다.
   · 아이폰은 "홈 화면에 추가" 한 뒤에만 켤 수 있습니다 (애플 정책).
   · 어떤 알림을 보낼지는 커미티가 관리 화면에서 켜고 끕니다.
   ========================================================= */

var SHEET_푸시 = '알림기기';
var HEAD_푸시 = ['이름', '이메일', '기기', '구독', '등록일', '마지막알림', '상태'];
var PS_이름 = 0, PS_이메일 = 1, PS_기기 = 2, PS_구독 = 3, PS_등록 = 4, PS_마지막 = 5, PS_상태 = 6;

/** 알림 종류 — 커미티가 켜고 끕니다 (기본은 모두 켜짐) */
function 알림종류_() {
  return [
    { key: '셀보고', name: '셀보고 독려', who: '셀장', help: '셀보고서를 아직 안 쓰신 셀장에게 (이메일 리마인더와 같이 나갑니다)' },
    { key: '팀보고', name: '사역팀 · 지출 결재', who: '팀장 · 회계팀', help: '지출 신청이 올라오거나 결재가 필요할 때' },
    { key: '주보', name: '새 주보 · 공지', who: '알림을 켠 모두', help: '주보가 새로 게시되면' },
    { key: '새가족', name: '새가족 등록', who: '새가족팀 · 커미티', help: '새가족이 등록하거나 내용을 고쳤을 때' },
    { key: '셀신청', name: '셀 신청', who: '커미티', help: '셀 신청서가 들어왔을 때' },
    { key: '공지', name: '커미티 직접 보내기', who: '고르는 대로', help: '관리 화면에서 손으로 보내는 알림' }
  ];
}

function 알림켜짐_(kind) {
  return String(설정값_('알림_' + kind) || 'ON').trim().toUpperCase() !== 'OFF';
}

/** 서명 열쇠 한 쌍 — 없으면 처음 한 번 만들어 설정 시트에 둡니다 */
function 푸시열쇠_() {
  var pub = String(설정값_('푸시공개키') || '').trim();
  var pri = String(설정값_('푸시비밀키') || '').trim();
  if (pub && pri) return { publicKey: pub, privateKey: pri };
  var k = HOST.vapid();
  if (!k || !k.publicKey) throw new Error('알림 열쇠를 만들지 못했습니다.');
  설정저장_('푸시공개키', k.publicKey);
  설정저장_('푸시비밀키', k.privateKey);
  return k;
}

/** 화면이 구독할 때 쓰는 공개 열쇠 */
function pushKey() {
  try { return 푸시열쇠_().publicKey; } catch (e) { return ''; }
}

function 푸시시트_() {
  var sh = 주보시트_(SHEET_푸시, HEAD_푸시);
  // 빈 시트를 미리 만들어 두신 경우 — 머리글이 없으면 채워 넣습니다
  try {
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEAD_푸시.length).setValues([HEAD_푸시]);
      캐시비움_();
    }
  } catch (e) {}
  return sh;
}

function 푸시행들_() {
  return rows_(SHEET_푸시).filter(function (r) {
    return String(r[PS_구독] || '').trim() && String(r[PS_상태] || '').trim() !== '삭제';
  }).map(function (r) {
    var sub = null;
    try { sub = JSON.parse(String(r[PS_구독])); } catch (e) {}
    return { name: String(r[PS_이름] || '').trim(), email: String(r[PS_이메일] || '').trim().toLowerCase(),
      device: String(r[PS_기기] || '').trim(), sub: sub, at: 날짜문자열_(r[PS_등록]) };
  }).filter(function (x) { return x.sub && x.sub.endpoint; });
}

/** 기기 이름을 알아보기 쉽게 */
function 기기이름_(ua) {
  ua = String(ua || '');
  var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기기';
  var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? os + ' · ' + br : os;
}

/** 토큰 → 알림을 켜는 분 (교적 교인 · 새가족 모두) */
function 알림본인_(token) {
  if (String(token || '').indexOf(새가족접두) === 0) {
    var nf = 새가족본인_(token);
    return { name: nf.name, email: String(nf.email || '').toLowerCase() };
  }
  var me = requirePortal_(token);
  return { name: me.name, email: String(me.email || '').toLowerCase() };
}

/** 이 기기에서 알림 켜기 */
function savePushDevice(token, sub, ua) {
  var who = 알림본인_(token);
  sub = sub || {};
  var ep = String(sub.endpoint || '').trim();
  if (!ep) throw new Error('알림 정보를 받지 못했습니다. 다시 시도해주세요.');
  var json = JSON.stringify({ endpoint: ep, keys: sub.keys || {}, expirationTime: null });
  if (json.length > 4000) throw new Error('알림 정보가 너무 깁니다.');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 푸시시트_(), v = sh.getDataRange().getValues(), at = 0;
    for (var i = 1; i < v.length; i++) {
      var s = String(v[i][PS_구독] || '');
      if (s.indexOf(ep) !== -1) { at = i + 1; break; }
    }
    var row = [who.name, who.email, 기기이름_(ua), json, ymd_(new Date()), '', '켜짐'];
    if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); at = sh.getLastRow(); }
    sh.getRange(at, PS_등록 + 1).setNumberFormat('@').setValue(ymd_(new Date()));
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, name: who.name, devices: 내기기수_(who.name) };
}

/** 이 기기에서 알림 끄기 */
function deletePushDevice(token, endpoint) {
  알림본인_(token);
  var ep = String(endpoint || '').trim();
  if (!ep) return { ok: true };
  푸시지우기_([ep]);
  return { ok: true };
}

function 푸시지우기_(endpoints) {
  if (!endpoints || !endpoints.length) return;
  var sh = 푸시시트_(), v = sh.getDataRange().getValues(), kill = [];
  for (var i = 1; i < v.length; i++) {
    var s = String(v[i][PS_구독] || '');
    for (var j = 0; j < endpoints.length; j++) {
      if (s.indexOf(endpoints[j]) !== -1) { kill.push(i + 1); break; }
    }
  }
  kill.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  if (kill.length) 캐시비움_();
}

function 내기기수_(name) {
  return 푸시행들_().filter(function (x) { return x.name === name; }).length;
}

/**
 * 알림 보내기.
 *   names : ['김현세', ...] 또는 '*' (알림을 켠 모두)
 *   msg   : { title, body, url, tag }
 */
function 푸시보내기_(names, msg) {
  msg = msg || {};
  var rows = 푸시행들_();
  if (names !== '*') {
    var want = {};
    (names || []).forEach(function (n) { if (n) want[String(n).trim()] = 1; });
    rows = rows.filter(function (x) { return want[x.name]; });
  }
  if (!rows.length) return { sent: 0, failed: 0 };

  var key;
  try { key = 푸시열쇠_(); } catch (e) { return { sent: 0, failed: 0, error: e.message }; }

  var payload = {
    title: String(msg.title || '토론토영락교회 청년1부').slice(0, 80),
    body: String(msg.body || '').slice(0, 300),
    url: String(msg.url || (앱주소_() + '?page=portal')),
    tag: String(msg.tag || 'yn'), keep: !!msg.keep
  };

  var out = { sent: 0, failed: 0 }, dead = [];
  // 한 번에 너무 많이 보내면 오래 걸려서 100개씩 끊어 보냅니다
  for (var s = 0; s < rows.length; s += 100) {
    var part = rows.slice(s, s + 100);
    var res;
    try {
      res = HOST.push({ subscriptions: part.map(function (x) { return x.sub; }), payload: payload,
        publicKey: key.publicKey, privateKey: key.privateKey, subject: 푸시주소_() });
    } catch (e) { out.failed += part.length; continue; }
    (res && res.results || []).forEach(function (r, i) {
      if (r && r.ok) out.sent++;
      else { out.failed++; if (r && r.gone) dead.push(part[i].sub.endpoint); }
    });
  }
  if (dead.length) { try { 푸시지우기_(dead); } catch (e) {} }
  return out;
}

function 푸시주소_() {
  var m = String(설정값_('알림이메일') || 설정값_('보내는이메일') || '').trim();
  return 'mailto:' + (m && m.indexOf('@') !== -1 ? m : 'noreply@ynchurch.com');
}

/** 알림 종류를 확인하고 보냅니다 (꺼져 있으면 아무 일도 하지 않습니다) */
function 알림_(kind, names, msg) {
  try {
    if (!알림켜짐_(kind)) return { sent: 0, off: true };
    return 푸시보내기_(names, msg);
  } catch (e) { return { sent: 0, failed: 0, error: e.message }; }
}

/** 역할로 사람 찾기 — '커미티' · '새가족팀' · '회계팀' 등 */
function 역할인사람_(role) {
  var map = 역할맵_(), out = [];
  Object.keys(map).forEach(function (n) { if (map[n][role]) out.push(n); });
  return out;
}

/* ---- 관리 화면 ---- */

function pushAdminInit(token) {
  if (!커미티토큰_(token)) throw new Error('알림 설정은 커미티만 볼 수 있습니다.');
  var rows = 푸시행들_();
  var byName = {};
  rows.forEach(function (x) { (byName[x.name] = byName[x.name] || []).push(x.device); });
  var people = Object.keys(byName).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
    .map(function (n) { return { name: n, devices: byName[n] }; });
  var kinds = 알림종류_().map(function (k) {
    return { key: k.key, name: k.name, who: k.who, help: k.help, on: 알림켜짐_(k.key), mail: 메일켜짐_(k.key) };
  });
  var roles = 역할맵_(), leaders = [], teamLeads = [], com = [];
  Object.keys(roles).forEach(function (n) {
    if (roles[n]['셀장']) leaders.push(n);
    if (roles[n]['팀장']) teamLeads.push(n);
    if (roles[n]['커미티']) com.push(n);
  });
  return {
    kinds: kinds, people: people, total: rows.length,
    ready: !!String(설정값_('푸시공개키') || '').trim(),
    groups: { 전체: people.length, 셀장: leaders.length, 팀장: teamLeads.length, 커미티: com.length },
    schedule: 알림일정목록_(),
    days: 알림요일,
    targets: 알림대상목록_(),
    notices: 공지들_(),
    deadlines: 마감들_(),
    missionTeams: (function () { try { return 선교팀목록_().map(function (t) { return t.name; }); } catch (e) { return []; } })(),
    workTeams: 사역팀목록_().map(function (t) { return t.name; }),
    missionItems: 선교마감항목(),
    reminderOn: String(설정값_('리마인더사용') || 'ON').toUpperCase() !== 'OFF'
  };
}

function savePushSetting(token, kind, on) {
  if (!커미티토큰_(token)) throw new Error('알림 설정은 커미티만 바꿀 수 있습니다.');
  var ok = 알림종류_().some(function (k) { return k.key === kind; });
  if (!ok) throw new Error('없는 알림 종류입니다.');
  설정저장_('알림_' + kind, on ? 'ON' : 'OFF');
  return pushAdminInit(token);
}

/** 커미티가 직접 보내는 알림 */
function sendPushNow(token, target, title, body, url) {
  if (!커미티토큰_(token)) throw new Error('알림은 커미티만 보낼 수 있습니다.');
  if (!알림켜짐_('공지')) throw new Error('"커미티 직접 보내기" 알림이 꺼져 있습니다. 먼저 켜주세요.');
  title = String(title || '').trim();
  body = String(body || '').trim();
  if (!title) throw new Error('제목을 입력해주세요.');

  var names;
  target = String(target || '전체').trim();
  if (target === '전체') names = '*';
  else if (target === '셀장' || target === '팀장' || target === '커미티') names = 역할인사람_(target);
  else names = target.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });

  var r = 푸시보내기_(names, { title: title, body: body, url: url || (앱주소_() + '?page=portal'), tag: 'notice', keep: true });
  if (r.error) throw new Error(r.error);
  return r;
}

/** 내 알림 상태 (포털에서 씁니다) */
function myPushState(token) {
  var who = 알림본인_(token);
  return { name: who.name, devices: 내기기수_(who.name), ready: !!String(설정값_('푸시공개키') || '').trim() };
}

/**
 * 시트를 지금 당장 다시 읽습니다 — 구글시트에서 직접 고친 내용을 바로 반영할 때.
 * (평소에는 서버가 몇 초마다 알아서 확인합니다)
 */
function refreshNow(token) {
  var ok = false;
  try { ok = isAdmin_(token) || 마스터_(token) || !!포털본인_(token) || !!새가족본인_(token); } catch (e) {}
  if (!ok) throw new Error('다시 로그인해주세요.');
  try { HOST.forget(); } catch (e) {}      // 메모리에 들고 있던 시트 값을 버립니다
  캐시비움_();
  return { ok: true, at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss') };
}

/* =========================================================
   신청서 — 수련회 · 제자훈련 · 티셔츠 · 바베큐 등 무엇이든
   ---------------------------------------------------------
   · 커미티와 팀장이 문항을 직접 만들고 켜고 끕니다.
   · 로그인한 교인과 새가족이 신청합니다 (이름 · 연락처는 교적에서 자동).
   · 문항 종류 — 객관식 하나 · 복수선택 · 주관식 · 긴글 · 날짜 · 숫자 · 파일 · 동의 · 안내글
   ========================================================= */

var SHEET_신청서 = '신청서';
var HEAD_신청서 = ['ID', '제목', '상태', '담당', '만든이', '만든날', '수정시각', '내용'];
var FM_ID = 0, FM_제목 = 1, FM_상태 = 2, FM_담당 = 3, FM_만든이 = 4, FM_만든날 = 5, FM_수정 = 6, FM_내용 = 7;

var SHEET_신청답 = '신청내역';
var HEAD_신청답 = ['신청서ID', '이름', '이메일', '연락처', '성별', '셀', '제출시각', '수정시각', '답변'];
var FA_폼 = 0, FA_이름 = 1, FA_이메일 = 2, FA_연락 = 3, FA_성별 = 4, FA_셀 = 5, FA_제출 = 6, FA_수정 = 7, FA_답 = 8;

var 신청서조각 = 40000;
var 신청서상태 = ['준비중', '받는중', '마감', '보관'];

/** 문항 종류 — 화면과 서버가 함께 씁니다 */
function 문항종류() {
  return [
    { key: 'choice', name: '객관식 (하나만)', icon: '◉', opts: true },
    { key: 'checks', name: '복수선택 (여러 개)', icon: '☑', opts: true },
    { key: 'text', name: '주관식 (한 줄)', icon: '✎', opts: false },
    { key: 'long', name: '주관식 (여러 줄)', icon: '≡', opts: false },
    { key: 'number', name: '숫자 입력', icon: '#', opts: false },
    { key: 'date', name: '날짜 고르기', icon: '📅', opts: false },
    { key: 'file', name: '파일 첨부', icon: '📎', opts: false },
    { key: 'agree', name: '동의합니다', icon: '✔', opts: false },
    { key: 'section', name: '안내글 (답 없음)', icon: 'ℹ', opts: false }
  ];
}

function 신청서시트_() {
  var sh = 주보시트_(SHEET_신청서, HEAD_신청서);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_신청서.length).setValues([HEAD_신청서]); 캐시비움_(); } } catch (e) {}
  return sh;
}
function 신청답시트_() {
  var sh = 주보시트_(SHEET_신청답, HEAD_신청답);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_신청답.length).setValues([HEAD_신청답]); 캐시비움_(); } } catch (e) {}
  return sh;
}

/** 조각난 JSON 을 다시 붙입니다 (주보와 같은 방식) */
function 신청서풀기_(r) {
  if (!r) return null;
  var parts = [];
  for (var i = FM_내용; i < r.length; i++) {
    var s = String(r[i] == null ? '' : r[i]);
    if (s.charAt(0) === "'") s = s.slice(1);
    parts.push(s);
  }
  var body = {};
  try { body = JSON.parse(parts.join('')) || {}; } catch (e) { body = {}; }
  return {
    id: String(r[FM_ID] || '').trim(),
    title: String(r[FM_제목] || '').trim(),
    status: String(r[FM_상태] || '준비중').trim(),
    team: String(r[FM_담당] || '').trim(),
    owner: String(r[FM_만든이] || '').trim(),
    at: 날짜문자열_(r[FM_만든날]),
    edited: String(r[FM_수정] || ''),
    desc: String(body.desc || ''),
    questions: body.questions || [],
    openAt: String(body.openAt || ''),
    closeAt: String(body.closeAt || ''),
    target: String(body.target || '모두'),
    editable: body.editable !== false,
    showCount: !!body.showCount,
    limit: Number(body.limit) || 0,
    notify: !!body.notify,
    mail: !!body.mail,
    autoClose: body.autoClose !== false
  };
}

function 신청서들_() {
  return rows_(SHEET_신청서).filter(function (r) { return String(r[FM_ID]).trim(); })
    .map(신청서풀기_);
}

function 신청서찾기_(id) {
  id = String(id || '').trim();
  var hit = null;
  신청서들_().forEach(function (f) { if (f.id === id) hit = f; });
  return hit;
}

/** 지금 신청을 받고 있는지 (상태 + 기간) */
function 신청받는중_(f) {
  if (!f || f.status !== '받는중') return false;
  var today = ymd_(new Date());
  if (f.openAt && today < f.openAt) return false;
  if (f.closeAt && today > f.closeAt) return false;
  return true;
}

function 신청마감사유_(f) {
  if (!f) return '';
  var today = ymd_(new Date());
  if (f.status === '마감') return '신청이 마감되었습니다.';
  if (f.status !== '받는중') return '아직 신청을 받고 있지 않습니다.';
  if (f.openAt && today < f.openAt) return f.openAt + ' 부터 신청할 수 있습니다.';
  if (f.closeAt && today > f.closeAt) return f.closeAt + ' 에 신청이 끝났습니다.';
  return '';
}

/* ---- 권한 ---- */

/** 신청서를 만들고 결과를 볼 수 있는 분 — 커미티 · 팀장 */
function 신청서관리자_(token) {
  if (isAdmin_(token) || 마스터_(token)) {
    return { name: '커미티', committee: true, teams: 사역팀목록_().map(function (t) { return t.name; }) };
  }
  var me = requirePortal_(token);
  var r = 포털역할_(me.name);
  var com = r.roles.indexOf('커미티') !== -1;
  if (!com && r.roles.indexOf('팀장') === -1) throw new Error('신청서는 커미티와 팀장만 만들 수 있습니다.');
  return { name: me.name, committee: com, teams: com ? 사역팀목록_().map(function (t) { return t.name; }) : r.teams };
}

function 신청서만질수있나_(who, f) {
  if (!f) return false;
  if (who.committee) return true;
  if (f.owner === who.name) return true;
  return !!(f.team && who.teams.indexOf(f.team) !== -1);
}

/** 신청하는 분 — 교적 교인 또는 새가족 */
function 폼신청자_(token) {
  if (String(token || '').indexOf(새가족접두) === 0) {
    var nf = 새가족본인_(token);
    return { kind: 'newcomer', name: nf.name, email: String(nf.email || ''), phone: String(nf.contact || ''),
      gender: nf.gender || '', birthday: nf.birthday || '', cell: '새가족' };
  }
  var me = requirePortal_(token);
  var cell = '';
  rows_(SHEET_셀원명단).forEach(function (x) { if (!cell && String(x[1]).trim() === me.name) cell = String(x[0]).trim(); });
  return { kind: 'member', name: me.name, email: String(me.email || ''), phone: String(me.phone || ''),
    gender: me.gender || '', birthday: me.birthday || '', cell: cell };
}

/* ---- 저장 ---- */

function 답행들_(formId) {
  formId = String(formId || '').trim();
  return rows_(SHEET_신청답).filter(function (r) {
    return String(r[FA_폼]).trim() === formId && String(r[FA_이름]).trim();
  }).map(function (r) {
    var a = {};
    try { a = JSON.parse(String(r[FA_답] || '{}')) || {}; } catch (e) {}
    return {
      name: String(r[FA_이름] || '').trim(), email: String(r[FA_이메일] || '').trim(),
      phone: String(r[FA_연락] || '').trim(), gender: String(r[FA_성별] || '').trim(),
      cell: String(r[FA_셀] || '').trim(),
      at: String(r[FA_제출] || ''), edited: String(r[FA_수정] || ''), answers: a
    };
  });
}

function 내답_(formId, name, email) {
  email = String(email || '').toLowerCase();
  var hit = null;
  답행들_(formId).forEach(function (a) {
    if (a.name === name || (email && a.email.toLowerCase() === email)) hit = a;
  });
  return hit;
}

/* ---- 화면이 부르는 함수 (신청하는 쪽) ---- */

/** 포털 첫 화면 — 지금 신청할 수 있는 신청서 목록 */
function myForms(token) {
  var who;
  try { who = 폼신청자_(token); } catch (e) { return { list: [] }; }
  var mineAll = {};
  var out = [];
  신청서들_().forEach(function (f) {
    if (f.status === '준비중' || f.status === '보관') return;
    if (f.target === '교인' && who.kind !== 'member') return;
    if (f.target === '새가족' && who.kind !== 'newcomer') return;
    var mine = 내답_(f.id, who.name, who.email);
    if (f.status === '마감' && !mine) return;              // 마감된 건 낸 사람에게만 보입니다
    out.push({
      id: f.id, title: f.title, desc: f.desc, open: 신청받는중_(f),
      why: 신청마감사유_(f), closeAt: f.closeAt, editable: f.editable,
      submitted: mine ? { at: mine.at, edited: mine.edited } : null,
      count: f.showCount ? 답행들_(f.id).length : null
    });
  });
  return { list: out };
}

/** 신청서 한 장 열기 */
function formOpen(token, id) {
  var who = 폼신청자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (f.status === '준비중' || f.status === '보관') throw new Error('아직 열리지 않은 신청서입니다.');
  if (f.target === '교인' && who.kind !== 'member') throw new Error('교적에 등록된 분만 신청할 수 있습니다.');
  if (f.target === '새가족' && who.kind !== 'newcomer') throw new Error('새가족만 신청할 수 있는 신청서입니다.');
  var mine = 내답_(f.id, who.name, who.email);
  var full = f.limit > 0 && 답행들_(f.id).length >= f.limit && !mine;
  return {
    form: { id: f.id, title: f.title, desc: f.desc, questions: f.questions, closeAt: f.closeAt, editable: f.editable },
    open: 신청받는중_(f) && !full,
    why: full ? ('신청 인원(' + f.limit + '명)이 다 찼습니다.') : 신청마감사유_(f),
    me: { name: who.name, email: who.email, phone: who.phone, cell: who.cell, gender: who.gender },
    mine: mine ? { at: mine.at, edited: mine.edited, answers: mine.answers } : null
  };
}

/** 답 하나를 문항 규칙에 맞게 다듬고 확인합니다 */
function 답정리_(q, v) {
  var t = q.type;
  if (t === 'section') return null;
  var need = !!q.req;

  if (t === 'checks') {
    var arr = (v && v.length ? v : []).map(function (x) { return String(x).slice(0, 200); }).slice(0, 40);
    if (need && !arr.length) throw new Error('"' + q.label + '" 을(를) 골라주세요.');
    if (q.max && arr.length > q.max) throw new Error('"' + q.label + '" 은 ' + q.max + '개까지 고를 수 있습니다.');
    return arr;
  }
  if (t === 'agree') {
    var ok = !!v;
    if (need && !ok) throw new Error('"' + q.label + '" 에 동의해주셔야 신청할 수 있습니다.');
    return ok;
  }
  if (t === 'file') {
    var fs = (v && v.length ? v : []).slice(0, 8).map(function (x) {
      return { id: String(x.id || '').slice(0, 80), name: String(x.name || '').slice(0, 120) };
    }).filter(function (x) { return x.id; });
    if (need && !fs.length) throw new Error('"' + q.label + '" 파일을 올려주세요.');
    return fs;
  }
  if (t === 'number') {
    var s = String(v == null ? '' : v).trim();
    if (!s) { if (need) throw new Error('"' + q.label + '" 을(를) 입력해주세요.'); return ''; }
    var n = Number(s);
    if (!isFinite(n)) throw new Error('"' + q.label + '" 은 숫자로 입력해주세요.');
    if (q.min !== '' && q.min != null && n < Number(q.min)) throw new Error('"' + q.label + '" 은 ' + q.min + ' 이상이어야 합니다.');
    if (q.max !== '' && q.max != null && n > Number(q.max)) throw new Error('"' + q.label + '" 은 ' + q.max + ' 이하여야 합니다.');
    return n;
  }
  if (t === 'date') {
    var d = String(v || '').trim();
    if (!d) { if (need) throw new Error('"' + q.label + '" 날짜를 골라주세요.'); return ''; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('"' + q.label + '" 날짜 형식을 확인해주세요.');
    return d;
  }
  // choice · text · long
  var str = String(v == null ? '' : v).trim().slice(0, t === 'long' ? 4000 : 500);
  if (need && !str) throw new Error('"' + q.label + '" 을(를) 입력해주세요.');
  return str;
}

function submitForm(token, id, answers) {
  var who = 폼신청자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청받는중_(f)) throw new Error(신청마감사유_(f) || '지금은 신청을 받지 않습니다.');
  if (f.target === '교인' && who.kind !== 'member') throw new Error('교적에 등록된 분만 신청할 수 있습니다.');
  if (f.target === '새가족' && who.kind !== 'newcomer') throw new Error('새가족만 신청할 수 있는 신청서입니다.');

  answers = answers || {};
  var mine = 내답_(f.id, who.name, who.email);
  if (mine && !f.editable) throw new Error('이미 신청하셨습니다. 고치시려면 담당자에게 말씀해주세요.');
  if (!mine && f.limit > 0 && 답행들_(f.id).length >= f.limit) throw new Error('신청 인원(' + f.limit + '명)이 다 찼습니다.');

  var clean = {};
  (f.questions || []).forEach(function (q) {
    if (q.type === 'section') return;
    var v = 답정리_(q, answers[q.id]);
    if (v !== null) clean[q.id] = v;
  });

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 신청답시트_(), v2 = sh.getDataRange().getValues(), at = 0;
    for (var i = 1; i < v2.length; i++) {
      if (String(v2[i][FA_폼]).trim() !== f.id) continue;
      var nm = String(v2[i][FA_이름]).trim(), em = String(v2[i][FA_이메일] || '').trim().toLowerCase();
      if (nm === who.name || (who.email && em === who.email.toLowerCase())) { at = i + 1; break; }
    }
    var row = [f.id, who.name, who.email, who.phone, who.gender, who.cell,
      at ? (String(v2[at - 1][FA_제출] || now)) : now, at ? now : '', JSON.stringify(clean)];
    if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); at = sh.getLastRow(); }
    sh.getRange(at, FA_제출 + 1).setNumberFormat('@').setValue(row[FA_제출]);
  } finally { lock.releaseLock(); }
  캐시비움_();

  // 담당자에게 알림
  var 지금수 = 답행들_(f.id).length;
  if (f.notify) {
    var to = [];
    if (f.owner && f.owner !== '커미티') to.push(f.owner);
    if (f.team) {
      사역팀목록_().forEach(function (t) { if (t.name === f.team && t.leader) to.push(t.leader); });
    }
    if (!to.length) to = 역할인사람_('커미티');
    var msg = { title: f.title + ' 신청이 들어왔습니다',
      body: who.name + '님' + (mine ? ' (고침)' : '') + (f.limit ? ' · ' + 지금수 + '/' + f.limit + '명' : ' · 모두 ' + 지금수 + '명'),
      url: 앱주소_() + '?page=forms', tag: 'form-' + f.id };
    알림_('공지', to, msg);
    if (f.mail) {
      try {
        var mto = 이름메일_(to);
        if (mto.length) {
          MailApp.sendEmail({ to: mto.join(','), name: '토론토영락교회 청년1부',
            subject: '[신청] ' + msg.title, htmlBody: 알림메일본문_(msg) });
        }
      } catch (e) {}
    }
  }

  // 정원이 다 차면 스스로 마감합니다
  var closed = false;
  if (f.autoClose !== false && f.limit > 0 && 지금수 >= f.limit && f.status === '받는중') {
    try {
      var sh2 = 신청서시트_(), v3 = sh2.getDataRange().getValues();
      for (var k = 1; k < v3.length; k++) {
        if (String(v3[k][FM_ID]).trim() === f.id) { sh2.getRange(k + 1, FM_상태 + 1).setValue('마감'); break; }
      }
      캐시비움_();
      closed = true;
      var own = [];
      if (f.owner && f.owner !== '커미티') own.push(f.owner);
      if (!own.length) own = 역할인사람_('커미티');
      알림_('공지', own, { title: f.title + ' 정원이 찼습니다', body: 지금수 + '명 신청 · 자동으로 마감했습니다',
        url: 앱주소_() + '?page=forms', tag: 'form-full-' + f.id });
    } catch (e) {}
  }
  return { ok: true, at: now, edited: !!mine, closed: closed, count: 지금수 };
}

/** 신청 취소 */
function cancelForm(token, id) {
  var who = 폼신청자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청받는중_(f)) throw new Error('지금은 고치거나 취소할 수 없습니다. 담당자에게 말씀해주세요.');
  var sh = 신청답시트_(), v = sh.getDataRange().getValues(), at = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][FA_폼]).trim() !== f.id) continue;
    var nm = String(v[i][FA_이름]).trim(), em = String(v[i][FA_이메일] || '').trim().toLowerCase();
    if (nm === who.name || (who.email && em === who.email.toLowerCase())) { at = i + 1; break; }
  }
  if (at) { sh.deleteRow(at); 캐시비움_(); }
  return { ok: true };
}

/** 신청서에 올리는 파일 */
function formUpload(token, id, fileName, dataUrl) {
  폼신청자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청받는중_(f)) throw new Error('지금은 신청을 받지 않습니다.');
  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다.');
  if (!/^(application\/pdf|image\/(png|jpe?g|gif|webp|heic))$/.test(m[1])) {
    throw new Error('사진(JPG · PNG) 또는 PDF 파일만 올릴 수 있습니다.');
  }
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('파일 한 개는 10MB까지 올릴 수 있습니다.');
  var safe = String(fileName || 'file').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  var file = 신청서폴더_(f).createFile(Utilities.newBlob(bytes, m[1], safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), name: safe, url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}

function 신청서폴더_(f) {
  var id = 설정값_('신청서폴더'), root = null;
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) {} }
  if (!root) { root = DriveApp.createFolder('청년부 신청서 첨부'); 설정저장_('신청서폴더', root.getId()); }
  var name = (f.title || f.id).replace(/[\\\/:*?"<>|]/g, '_').slice(0, 60);
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/* ---- 화면이 부르는 함수 (만드는 쪽 — 커미티 · 팀장) ---- */

function formAdminInit(token) {
  var who = 신청서관리자_(token);
  var list = 신청서들_().filter(function (f) { return 신청서만질수있나_(who, f); })
    .map(function (f) {
      var rows = 답행들_(f.id);
      return { id: f.id, title: f.title, status: f.status, team: f.team, owner: f.owner,
        at: f.at, openAt: f.openAt, closeAt: f.closeAt, target: f.target, limit: f.limit,
        count: rows.length, live: 신청받는중_(f), why: 신청마감사유_(f), qn: (f.questions || []).length,
        full: !!(f.limit && rows.length >= f.limit) };
    })
    .sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
  return {
    list: list, me: who.name, committee: who.committee, teams: who.teams,
    types: 문항종류(), statuses: 신청서상태,
    targets: 알림대상목록_(),
    myTemplates: 내본보기들_()
  };
}

function formGet(token, id) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('이 신청서를 볼 권한이 없습니다.');
  return { form: f, count: 답행들_(f.id).length };
}

/** 새로 만들거나 고칩니다 */
function formSave(token, data) {
  var who = 신청서관리자_(token);
  data = data || {};
  var title = String(data.title || '').trim().slice(0, 80);
  if (!title) throw new Error('신청서 제목을 입력해주세요.');

  var id = String(data.id || '').trim();
  var old = id ? 신청서찾기_(id) : null;
  if (id && !old) throw new Error('없는 신청서입니다.');
  if (old && !신청서만질수있나_(who, old)) throw new Error('이 신청서를 고칠 권한이 없습니다.');
  if (!id) id = 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  var seen = {};
  var qs = (data.questions || []).slice(0, 60).map(function (q, i) {
    q = q || {};
    var type = String(q.type || 'text');
    if (!문항종류().some(function (t) { return t.key === type; })) type = 'text';
    var qid = String(q.id || '').trim().slice(0, 20) || ('q' + (i + 1));
    while (seen[qid]) qid = qid + '_';
    seen[qid] = 1;
    var opts = (q.opts || []).slice(0, 40).map(function (o) { return String(o).trim().slice(0, 120); })
      .filter(function (o) { return o; });
    if ((type === 'choice' || type === 'checks') && !opts.length) opts = ['예', '아니오'];
    return {
      id: qid, type: type,
      label: String(q.label || '').trim().slice(0, 150) || ('문항 ' + (i + 1)),
      help: String(q.help || '').trim().slice(0, 500),
      req: !!q.req, opts: opts, other: !!q.other,
      min: q.min === '' || q.min == null ? '' : Number(q.min),
      max: q.max === '' || q.max == null ? '' : Number(q.max),
      unit: String(q.unit || '').trim().slice(0, 12)
    };
  });

  var body = {
    desc: String(data.desc || '').trim().slice(0, 3000),
    questions: qs,
    openAt: /^\d{4}-\d{2}-\d{2}$/.test(String(data.openAt || '')) ? data.openAt : '',
    closeAt: /^\d{4}-\d{2}-\d{2}$/.test(String(data.closeAt || '')) ? data.closeAt : '',
    target: ['모두', '교인', '새가족'].indexOf(String(data.target)) !== -1 ? String(data.target) : '모두',
    editable: data.editable !== false,
    showCount: !!data.showCount,
    limit: Math.max(0, Math.min(Number(data.limit) || 0, 9999)),
    notify: !!data.notify,
    mail: !!data.mail,
    autoClose: data.autoClose !== false
  };
  var status = 신청서상태.indexOf(String(data.status)) !== -1 ? String(data.status) : (old ? old.status : '준비중');
  var team = String(data.team || '').trim().slice(0, 40);
  if (team && !who.committee && who.teams.indexOf(team) === -1) team = who.teams[0] || '';

  var json = JSON.stringify(body);
  if (json.length > 신청서조각 * 6) throw new Error('신청서 내용이 너무 깁니다. 문항을 줄여주세요.');
  var parts = [];
  for (var i2 = 0; i2 < json.length; i2 += 신청서조각) parts.push("'" + json.slice(i2, i2 + 신청서조각));

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 신청서시트_(), v = sh.getDataRange().getValues(), at = 0;
    for (var r = 1; r < v.length; r++) if (String(v[r][FM_ID]).trim() === id) { at = r + 1; break; }
    var row = [id, title, status, team, old ? old.owner : who.name, old ? old.at : ymd_(new Date()), now].concat(parts);
    var width = Math.max(sh.getLastColumn(), row.length);
    while (row.length < width) row.push('');
    if (!at) at = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, row.length).setValues([row]);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, id: id, admin: formAdminInit(token) };
}

function formSetStatus(token, id, status) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  if (신청서상태.indexOf(String(status)) === -1) throw new Error('알 수 없는 상태입니다.');
  var sh = 신청서시트_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][FM_ID]).trim() === f.id) { sh.getRange(i + 1, FM_상태 + 1).setValue(status); break; }
  }
  캐시비움_();
  return formAdminInit(token);
}

function formDelete(token, id) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  var sh = 신청서시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][FM_ID]).trim() === f.id) sh.deleteRow(i + 1);
  var ash = 신청답시트_(), av = ash.getDataRange().getValues();
  for (var j = av.length - 1; j >= 1; j--) if (String(av[j][FA_폼]).trim() === f.id) ash.deleteRow(j + 1);
  캐시비움_();
  return formAdminInit(token);
}

/** 신청 결과 — 표와 간단한 집계 */
function formResults(token, id) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  var rows = 답행들_(f.id).sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });

  // 객관식 · 복수선택은 몇 명이 골랐는지 세어 줍니다
  var stats = [];
  (f.questions || []).forEach(function (q) {
    if (q.type !== 'choice' && q.type !== 'checks') return;
    var cnt = {}, none = 0;
    (q.opts || []).forEach(function (o) { cnt[o] = 0; });
    rows.forEach(function (a) {
      var v = a.answers[q.id];
      if (q.type === 'checks') {
        if (!v || !v.length) { none++; return; }
        v.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; });
      } else {
        if (!v) { none++; return; }
        cnt[v] = (cnt[v] || 0) + 1;
      }
    });
    stats.push({ id: q.id, label: q.label, type: q.type, none: none,
      items: Object.keys(cnt).map(function (k) { return { name: k, n: cnt[k] }; }) });
  });

  // 숫자 문항은 합계도 (티셔츠 몇 장, 인원 몇 명 등)
  (f.questions || []).forEach(function (q) {
    if (q.type !== 'number') return;
    var sum = 0, n = 0;
    rows.forEach(function (a) {
      var v = Number(a.answers[q.id]);
      if (isFinite(v) && a.answers[q.id] !== '') { sum += v; n++; }
    });
    stats.push({ id: q.id, label: q.label, type: 'number', sum: sum, n: n, unit: q.unit || '' });
  });

  return { form: { id: f.id, title: f.title, questions: f.questions, status: f.status, limit: f.limit },
    rows: rows, stats: stats, count: rows.length };
}

/** 신청자 한 명 지우기 (잘못 들어온 신청) */
function formDropAnswer(token, id, name) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f || !신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  var sh = 신청답시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][FA_폼]).trim() === f.id && String(v[i][FA_이름]).trim() === String(name).trim()) sh.deleteRow(i + 1);
  }
  캐시비움_();
  return formResults(token, id);
}

/** 결과를 엑셀로 */
function formExport(token, id) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f || !신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  var rows = 답행들_(f.id).sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
  var qs = (f.questions || []).filter(function (q) { return q.type !== 'section'; });

  var H = ['이름', '연락처', '이메일', '성별', '셀', '제출시각'].concat(qs.map(function (q) { return q.label; }));
  var data = rows.map(function (a) {
    return [a.name, a.phone, a.email, a.gender, a.cell, a.at].concat(qs.map(function (q) {
      var v = a.answers[q.id];
      if (q.type === 'checks') return (v || []).join(', ');
      if (q.type === 'agree') return v ? '동의' : '';
      if (q.type === 'file') return (v || []).map(function (x) { return x.name; }).join(', ');
      return v == null ? '' : String(v);
    }));
  });

  var fname = (f.title || '신청서').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 40) + '_' + ymd_(new Date());
  var tmp = null;
  try {
    tmp = SpreadsheetApp.create(fname);
    var sh = tmp.getSheets()[0];
    sh.setName('신청 결과');
    sh.getRange(1, 1, 1, H.length).setValues([H])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF');
    if (data.length) sh.getRange(2, 1, data.length, H.length).setValues(data);
    sh.setFrozenRows(1);
    for (var c = 1; c <= H.length; c++) sh.setColumnWidth(c, c <= 6 ? 110 : 180);
    SpreadsheetApp.flush();
    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + HOST.accessToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return { name: fname + '.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        b64: Utilities.base64Encode(res.getBlob().getBytes()), count: rows.length };
    }
  } catch (e) {
  } finally {
    if (tmp) { try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e2) {} }
  }
  var csv = [H].concat(data).map(function (r) {
    return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  return { name: fname + '.csv', mime: 'text/csv;charset=utf-8',
    b64: Utilities.base64Encode('﻿' + csv, Utilities.Charset.UTF_8), count: rows.length, fallback: true };
}

/** 본보기 — 처음 만드실 때 고르실 수 있는 틀 */
function formTemplates() {
  return [
    { key: 'retreat', name: '수련회 신청', icon: '⛺',
      desc: '참가 여부 · 차량 · 식사 · 입금 확인까지 한 번에',
      form: { title: '수련회 신청', desc: '', target: '모두', questions: [
        { type: 'choice', label: '참가 여부', req: true, opts: ['전체 참석', '부분 참석', '참석 어려움'] },
        { type: 'choice', label: '차량', req: true, opts: ['차량 있음 (같이 탈 수 있음)', '차량 있음 (자리 없음)', '차량 없음 — 태워주세요'] },
        { type: 'checks', label: '식사 알레르기 · 못 먹는 음식', opts: ['없음', '돼지고기', '소고기', '해산물', '견과류', '유제품'] },
        { type: 'text', label: '비상 연락처 (이름 · 전화번호)', req: true },
        { type: 'agree', label: '수련회 기간 중 안내에 따르겠습니다', req: true }
      ] } },
    { key: 'tshirt', name: '티셔츠 주문', icon: '👕',
      desc: '사이즈와 수량을 받고 합계를 자동으로 세어 줍니다',
      form: { title: '티셔츠 주문', desc: '', target: '모두', questions: [
        { type: 'choice', label: '사이즈', req: true, opts: ['XS', 'S', 'M', 'L', 'XL', '2XL'] },
        { type: 'number', label: '수량', req: true, min: 1, max: 10, unit: '장' },
        { type: 'text', label: '등에 넣을 이름 (영문)' }
      ] } },
    { key: 'bbq', name: '바베큐 인원 조사', icon: '🍖',
      desc: '참석 인원과 준비물을 간단히',
      form: { title: '바베큐 인원 조사', desc: '', target: '모두', questions: [
        { type: 'choice', label: '참석하시나요?', req: true, opts: ['네, 갑니다', '아직 모르겠어요', '못 갑니다'] },
        { type: 'number', label: '함께 오시는 인원 (본인 포함)', req: true, min: 1, max: 10, unit: '명' },
        { type: 'checks', label: '가져올 수 있는 것', opts: ['고기', '음료', '과일', '간식', '아이스박스', '돗자리'] }
      ] } },
    { key: 'training', name: '제자훈련 신청', icon: '📖',
      desc: '기수 · 요일 · 신앙 배경',
      form: { title: '제자훈련 신청', desc: '', target: '교인', questions: [
        { type: 'choice', label: '원하시는 요일', req: true, opts: ['화요일 저녁', '목요일 저녁', '토요일 오전'] },
        { type: 'long', label: '신청 이유 · 기대하는 점', req: true },
        { type: 'agree', label: '매주 참석하고 과제를 성실히 하겠습니다', req: true }
      ] } },
    { key: 'fund', name: '펀드레이징 인원 조사', icon: '💰',
      desc: '봉사 가능 시간과 역할',
      form: { title: '펀드레이징 인원 조사', desc: '', target: '모두', questions: [
        { type: 'checks', label: '봉사 가능한 시간', req: true, opts: ['토요일 오전', '토요일 오후', '주일 오전', '주일 오후'] },
        { type: 'checks', label: '맡을 수 있는 일', opts: ['음식 준비', '판매', '정리 · 청소', '홍보 · 사진', '운반'] },
        { type: 'text', label: '하고 싶은 말' }
      ] } },
    { key: 'team', name: '사역팀 지원', icon: '🙌',
      desc: '팀 지원 · 세례 확인 · 가능한 시간까지',
      form: { title: '사역팀 지원', desc: '', target: '교인', questions: [
        { type: 'choice', label: '지원하는 팀', req: true, opts: ['찬양팀', '방송팀', '미디어팀', '예배준비팀', '쉐마', '새가족팀', '원주민팀', '홍보팀'] },
        { type: 'text', label: '맡고 싶은 자리 (악기 · 파트 등)', help: '예: 건반, 드럼, 영상, 사진' },
        { type: 'choice', label: '세례 · 입교 여부', req: true,
          help: '교적에 있는 내용을 확인차 여쭙습니다. 사역에 따라 필요할 수 있습니다.',
          opts: ['성인세례 / 입교', '유아세례만', '아직 받지 않음', '잘 모르겠음'] },
        { type: 'checks', label: '섬길 수 있는 시간', req: true,
          opts: ['주일 오전 (예배 전)', '주일 오후', '토요일', '평일 저녁'] },
        { type: 'long', label: '해온 경험이 있다면 알려주세요', help: '없어도 괜찮습니다' },
        { type: 'long', label: '지원 이유 · 하고 싶은 말' },
        { type: 'agree', label: '팀 모임과 섬김에 성실히 참여하겠습니다', req: true }
      ] } },
    { key: 'blank', name: '빈 신청서', icon: '+', desc: '처음부터 직접 만들기',
      form: { title: '', desc: '', target: '모두', questions: [] } }
  ];
}

/* =========================================================
   내 할 일 — 포털 첫 화면에 "지금 처리할 것" 을 모아 보여줍니다
   ---------------------------------------------------------
   네 갈래로 모읍니다.
     do     — 내가 내야 하는 것 (셀보고 · 팀보고 · 서류 · 신청서 마감)
     track  — 내가 신청한 것의 진행 상황 (지출 · 헌금봉투 · 셀 신청)
     role   — 내가 맡은 역할로 처리할 것 (새가족 배정 · 결재 대기 등)
     notice — 커미티 공지
   끝난 일은 저절로 사라지고, 본인이 손으로 치울 수도 있습니다.
   ========================================================= */

var SHEET_할일숨김 = '할일숨김';
var HEAD_할일숨김 = ['이름', '항목', '숨긴시각'];

var SHEET_공지 = '포털공지';
var HEAD_공지 = ['ID', '제목', '내용', '대상', '링크', '올린이', '올린날', '마감날'];
var NO_ID = 0, NO_제목 = 1, NO_내용 = 2, NO_대상 = 3, NO_링크 = 4, NO_올린이 = 5, NO_날 = 6, NO_마감 = 7;

function 할일숨김시트_() {
  var sh = 주보시트_(SHEET_할일숨김, HEAD_할일숨김);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_할일숨김.length).setValues([HEAD_할일숨김]); 캐시비움_(); } } catch (e) {}
  return sh;
}
function 공지시트_() {
  var sh = 주보시트_(SHEET_공지, HEAD_공지);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_공지.length).setValues([HEAD_공지]); 캐시비움_(); } } catch (e) {}
  return sh;
}

function 숨긴것_(name) {
  var out = {};
  rows_(SHEET_할일숨김).forEach(function (r) {
    if (String(r[0]).trim() === String(name).trim()) out[String(r[1]).trim()] = 1;
  });
  return out;
}

/** 할 일 하나를 손으로 치웁니다 */
function hideTodo(token, id) {
  var who;
  try { who = 폼신청자_(token); } catch (e) { throw new Error('다시 로그인해주세요.'); }
  id = String(id || '').trim().slice(0, 80);
  if (!id) return { ok: true };
  var sh = 할일숨김시트_();
  sh.appendRow([who.name, id, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')]);
  캐시비움_();
  return { ok: true };
}

/** 치운 것을 모두 되돌립니다 */
function showAllTodos(token) {
  var who = 폼신청자_(token);
  var sh = 할일숨김시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]).trim() === who.name) sh.deleteRow(i + 1);
  캐시비움_();
  return { ok: true };
}

/* ---- 공지 ---- */

function 공지들_() {
  var today = ymd_(new Date());
  return rows_(SHEET_공지).filter(function (r) { return String(r[NO_ID]).trim(); }).map(function (r) {
    return { id: String(r[NO_ID]).trim(), title: String(r[NO_제목] || '').trim(),
      body: String(r[NO_내용] || '').trim(), target: String(r[NO_대상] || '전체').trim(),
      url: String(r[NO_링크] || '').trim(), by: String(r[NO_올린이] || '').trim(),
      at: 날짜문자열_(r[NO_날]), until: 날짜문자열_(r[NO_마감]) };
  }).filter(function (n) { return !n.until || n.until >= today; });
}

/** 공지 올리기 (커미티) — 알림 관리 화면에서 함께 씁니다 */
function addNotice(token, title, body, target, url, until) {
  if (!커미티토큰_(token)) throw new Error('공지는 커미티만 올릴 수 있습니다.');
  title = String(title || '').trim().slice(0, 100);
  if (!title) throw new Error('공지 제목을 입력해주세요.');
  var id = 'N' + Date.now().toString(36);
  공지시트_().appendRow([id, title, String(body || '').trim().slice(0, 2000),
    String(target || '전체').trim(), String(url || '').trim(),
    커미티이름_(token), ymd_(new Date()),
    /^\d{4}-\d{2}-\d{2}$/.test(String(until || '')) ? until : '']);
  캐시비움_();
  return { ok: true, id: id };
}

function 커미티이름_(token) {
  try { var me = 포털본인_(token); if (me) return me.name; } catch (e) {}
  return '커미티';
}

function deleteNotice(token, id) {
  if (!커미티토큰_(token)) throw new Error('공지는 커미티만 지울 수 있습니다.');
  var sh = 공지시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][NO_ID]).trim() === String(id).trim()) sh.deleteRow(i + 1);
  캐시비움_();
  return { ok: true };
}

function listNotices(token) {
  폼신청자_(token);
  return { list: 공지들_(), canEdit: 커미티토큰_(token) };
}

/* ---- 할 일 모으기 ---- */

function 할일하나_(o) {
  return { id: o.id, kind: o.kind, icon: o.icon || '', title: o.title, sub: o.sub || '',
    url: o.url || '', tone: o.tone || 'info', hideable: o.hideable !== false, step: o.step || null,
    del: o.del || '' };
}

/**
 * 내 할 일 — 포털 첫 화면에 쭉 나열합니다.
 * (교적 교인만. 새가족은 신청서와 셀 신청만 봅니다)
 */
function 내할일_(token) {
  var out = [];
  var who;
  try { who = 폼신청자_(token); } catch (e) { return out; }
  var base = 앱주소_() || '';
  var hidden = 숨긴것_(who.name);
  var today = ymd_(new Date());

  var r = null, 커미티 = false;
  if (who.kind === 'member') {
    r = 포털역할_(who.name);
    커미티 = r.roles.indexOf('커미티') !== -1;
  }

  /* --- 1) 공지 --- */
  공지들_().forEach(function (n) {
    if (n.target && n.target !== '전체' && who.kind === 'member') {
      if (r.roles.indexOf(n.target) === -1 && r.teams.indexOf(n.target) === -1 && r.cells.indexOf(n.target) === -1) return;
    }
    var it = 할일하나_({ id: 'notice-' + n.id, kind: 'notice', icon: '📢',
      title: n.title, sub: n.body || (n.by ? n.by + ' 올림' : ''), url: n.url, tone: 'notice' });
    if (커미티) it.del = n.id;          // 커미티는 모두에게서 내릴 수 있습니다
    out.push(it);
  });

  if (who.kind === 'member') {
    /* --- 2) 셀 보고서 --- */
    if (r.cells.length) {
      var 이번주 = ymd_(이번주기준_());
      var 낸셀 = {};
      rows_(SHEET_응답원본).forEach(function (x) {
        if (ymd_(x[R_DATE]) === 이번주) 낸셀[String(x[R_CELL]).trim()] = true;
      });
      r.cells.forEach(function (c) {
        if (낸셀[c]) return;
        out.push(할일하나_({ id: 'cell-' + c + '-' + 이번주, kind: 'do', icon: '📋',
          title: c + ' 셀모임 보고서', sub: 월일_(이번주) + ' 모임 — 아직 안 내셨습니다',
          url: base + '?page=leader&t=' + encodeURIComponent(token), tone: 'urgent', hideable: false }));
      });
    }

    /* --- 3) 사역팀 보고서 --- */
    if (r.teams.length) {
      var 달 = today.slice(0, 7);
      var 낸팀 = {};
      rows_(SHEET_사역보고서).forEach(function (x) {
        var p = String(x[TR_기준월] || '').slice(0, 7);
        if (p === 달) 낸팀[String(x[TR_팀]).trim()] = true;
      });
      r.teams.forEach(function (t) {
        if (낸팀[t]) return;
        out.push(할일하나_({ id: 'team-' + t + '-' + 달, kind: 'do', icon: '⭐',
          title: t + ' 사역 보고서', sub: 달.replace('-', '년 ') + '월 보고서를 아직 안 내셨습니다',
          url: base + '?page=team&t=' + encodeURIComponent(token), tone: 'warn' }));
      });
    }

    /* --- 4) 선교팀 서류 --- */
    rows_(SHEET_선교팀원).forEach(function (x) {
      if (String(x[MM_이름]).trim() !== who.name) return;
      var team = String(x[MM_팀]).trim();
      var 빠진 = [];
      if (!예아니오_(x[MM_waiver])) 빠진.push('서약서');
      if (!예아니오_(x[MM_여권])) 빠진.push('여권 사본');
      if (!빠진.length) return;
      out.push(할일하나_({ id: 'mis-' + team + '-doc', kind: 'do', icon: '🌏',
        title: team + ' 서류', sub: 빠진.join(' · ') + ' 아직 안 내셨습니다',
        url: base + '?page=mission&t=' + encodeURIComponent(token), tone: 'warn' }));
    });

    /* --- 4-2) 커미티가 정한 마감 (선교팀 · 사역팀) --- */
    try {
      var 내선교 = {};
      rows_(SHEET_선교팀원).forEach(function (x2) {
        if (String(x2[MM_이름]).trim() === who.name) 내선교[String(x2[MM_팀]).trim()] = String(x2[MM_역할] || '');
      });
      마감들_().forEach(function (d) {
        var mine = (d.kind === '사역') ? (r.teams.indexOf(d.team) !== -1)
          : (내선교[d.team] !== undefined && /팀장|회계|서기/.test(내선교[d.team] || ''));
        if (!mine) return;
        var days = Math.round((parseYmd_(d.due) - parseYmd_(today)) / 86400000);
        if (days > 14) return;
        out.push(할일하나_({ id: 'due-' + d.team + '-' + d.item, kind: 'do', icon: '\u23F0',
          title: d.team + ' · ' + d.item,
          sub: days < 0 ? ('마감 ' + (-days) + '일 지남 (' + d.due + ')')
            : days === 0 ? ('오늘 마감 (' + d.due + ')') : (d.due + ' 마감 · ' + days + '일 남음'),
          url: 앱주소_() + (d.kind === '사역' ? '?page=team' : '?page=mission&t=' + encodeURIComponent(token)),
          tone: days <= 0 ? 'urgent' : (days <= 3 ? 'warn' : 'info') }));
      });
    } catch (e) {}

    /* --- 5) 지출 신청 진행 상황 --- */
    var 상태표 = {};
    지출상태목록().forEach(function (s) { 상태표[s.code] = s.label; });
    var 단계순 = ['In Review', 'Pending Hardcopy Receipt', 'Action Required', 'Approved', 'Paid'];
    지출목록_().forEach(function (e) {
      if (String(e.name || '').trim() !== who.name) return;
      if (e.status === 'Closed') return;
      var done = (e.status === 'Paid');
      if (done && hidden['exp-' + e.no]) return;
      var idx = 단계순.indexOf(e.status);
      out.push(할일하나_({ id: 'exp-' + e.no, kind: 'track', icon: '💳',
        title: '지출환급 #' + e.no + ' · $' + e.total,
        sub: (상태표[e.status] || e.status) + (e.status === 'Action Required' ? ' — 확인해주세요' : ''),
        url: base + '?page=expense', tone: e.status === 'Action Required' ? 'urgent' : (done ? 'ok' : 'info'),
        step: { now: idx < 0 ? 0 : idx + 1, all: 5, done: done } }));
    });

    /* --- 6) 헌금봉투 --- */
    var env = 헌금신청상태_(who.name);
    if (env && env.status === '발급중' && !hidden['env-' + (env.at || '')]) {
      out.push(할일하나_({ id: 'env-' + (env.at || ''), kind: 'track', icon: '✉️',
        title: '헌금봉투번호 신청', sub: '발급 준비 중입니다 · ' + (env.at || ''),
        url: base + '?page=portal', tone: 'info' }));
    }
  }

  /* --- 7) 셀 신청 --- */
  var ca = null;
  try {
    ca = 셀신청상태_(who.kind === 'newcomer'
      ? { kind: 'newcomer', name: who.name, email: who.email, allowed: 새가족셀허용_(who.email, who.name), committee: false }
      : { kind: 'member', name: who.name, email: who.email, committee: 커미티,
          allowed: 셀신청열림_() || 새가족셀허용_(who.email, who.name) });
  } catch (e) {}
  if (ca && ca.state === 'open' && !ca.submitted) {
    out.push(할일하나_({ id: 'cellapp-' + ca.year, kind: 'do', icon: '🤝',
      title: ca.year + ' 셀 신청', sub: '아직 신청하지 않으셨습니다', url: '', tone: 'warn' }));
  }

  /* --- 8) 신청서 마감 임박 --- */
  try {
    (myForms(token).list || []).forEach(function (f) {
      if (!f.open || f.submitted || !f.closeAt) return;
      var d = (parseYmd_(f.closeAt) - parseYmd_(today)) / 86400000;
      if (d > 7 || d < 0) return;
      out.push(할일하나_({ id: 'form-' + f.id, kind: 'do', icon: '📝',
        title: f.title, sub: (d <= 0 ? '오늘 마감' : d < 1 ? '오늘까지' : Math.round(d) + '일 뒤 마감') + ' — 아직 신청 전',
        url: '', tone: d <= 1 ? 'urgent' : 'warn' }));
    });
  } catch (e) {}

  /* --- 9) 내가 맡은 역할로 처리할 것 --- */
  if (who.kind === 'member') {
    var 새가족팀 = r.roles.indexOf('새가족팀') !== -1;
    var 회계팀 = r.roles.indexOf('회계팀') !== -1;

    if (새가족팀 || 커미티) {
      var nf = 새가족전체_();
      var 배정 = nf.filter(function (n) { return n.stage === '셀배정대상'; });
      if (배정.length && !hidden['nf-assign-' + today]) {
        out.push(할일하나_({ id: 'nf-assign-' + today, kind: 'role', icon: '🌱',
          title: '셀 배정을 기다리는 새가족 ' + 배정.length + '명',
          sub: 배정.slice(0, 4).map(function (n) { return n.name; }).join(', ') + (배정.length > 4 ? ' 외' : ''),
          url: base + '?page=newfamily&t=' + encodeURIComponent(token), tone: 'warn' }));
      }
      var 새로 = nf.filter(function (n) {
        return n.joinedAt && (parseYmd_(today) - parseYmd_(n.joinedAt)) / 86400000 <= 7 && n.completedWeeks === 0;
      });
      if (새로.length && !hidden['nf-new-' + today]) {
        out.push(할일하나_({ id: 'nf-new-' + today, kind: 'role', icon: '👋',
          title: '이번 주 새로 등록한 새가족 ' + 새로.length + '명',
          sub: 새로.map(function (n) { return n.name; }).join(', ') + ' — 담당자를 정해주세요',
          url: base + '?page=newfamily&t=' + encodeURIComponent(token), tone: 'info' }));
      }
    }

    if (회계팀 || 커미티) {
      var 대기 = 지출목록_().filter(function (e) { return e.status === 'In Review'; });
      if (대기.length && !hidden['exp-review-' + today]) {
        out.push(할일하나_({ id: 'exp-review-' + today, kind: 'role', icon: '🧾',
          title: '검토를 기다리는 지출 신청 ' + 대기.length + '건',
          sub: 대기.slice(0, 3).map(function (e) { return e.name + ' $' + e.total; }).join(' · '),
          url: base + '?page=admin&scope=acct&key=' + encodeURIComponent(회계키_()), tone: 'warn' }));
      }
    }

    if (커미티) {
      var 신청수 = 0;
      try { 신청수 = 셀신청행들_().filter(function (a) { return a.year === 셀년도_(); }).length; } catch (e) {}
      if (신청수 && 셀신청열림_() && !hidden['cellapp-in-' + today]) {
        out.push(할일하나_({ id: 'cellapp-in-' + today, kind: 'role', icon: '📥',
          title: '셀 신청 ' + 신청수 + '건 들어옴',
          sub: '편성 화면에서 확인하실 수 있습니다',
          url: base + '?page=cells&key=' + encodeURIComponent(설정값_('관리자키') || ''), tone: 'info' }));
      }
    }
  }

  return out.filter(function (x) { return !(x.hideable && hidden[x.id]); });
}

/** 화면에서 따로 부를 때 */
function myTodos(token) {
  return { list: 내할일_(token) };
}

/** 할 일에서 메뉴 아이콘에 붙일 알림 숫자를 뽑습니다 */
function 포털뱃지_(todos) {
  var b = {};
  var add = function (k, n) { if (k) b[k] = (b[k] || 0) + (n || 1); };
  (todos || []).forEach(function (t) {
    var id = t.id || '';
    if (id.indexOf('cell-') === 0) { add('leader'); add('a-cell'); }
    else if (id.indexOf('team-') === 0) { add('team'); add('a-team'); }
    else if (id.indexOf('mis-') === 0) { add('mission'); add('a-mis'); }
    else if (id.indexOf('exp-review-') === 0) { add('acct'); add('a-acct'); }
    else if (id.indexOf('exp-') === 0) { if (t.tone === 'urgent') add('expense'); }
    else if (id.indexOf('nf-') === 0) { add('newfamily'); add('a-nf'); }
    else if (id.indexOf('form-') === 0) add('forms');
    else if (id.indexOf('due-') === 0) { add('mission'); add('team'); }
    else if (id.indexOf('cellapp-in-') === 0) add('a-cells');
  });
  return b;
}

/** 지출환급신청서를 팀장 말고 누구나 낼 수 있게 열어둘지 (회계팀이 정합니다) */
function 지출공개_() { return String(설정값_('지출신청공개') || 'OFF').trim().toUpperCase() === 'ON'; }

function setExpenseOpen(key, on) {
  requireAcct_(key);
  설정저장_('지출신청공개', on ? 'ON' : 'OFF');
  return { ok: true, on: 지출공개_() };
}

function getExpenseOpen(key) {
  requireAcct_(key);
  return { on: 지출공개_() };
}

/* =========================================================
   알림 2단계 — 보내는 시각 · 이메일 함께 보내기 · 받는 사람 분류 · 마감 알림
   ========================================================= */

var 알림작업 = [
  { fn: '미제출리마인더', name: '셀보고 독려', help: '지난 주일 보고서를 안 낸 셀장에게', def: '월 08:00' },
  { fn: '주일독려', name: '주일 셀보고 독려', help: '주일 저녁, 그날 보고서를 아직 안 낸 셀장에게', def: '일 16:30' },
  { fn: '마감알림', name: '마감 알림', help: '사역팀 보고 · 선교팀 서류 마감을 앞두고', def: '매일 09:00' }
];
var 알림요일 = ['일', '월', '화', '수', '목', '금', '토', '매일'];

/** 설정에 저장된 발송 일정 — 서버 시계가 읽어갑니다 */
function 알림일정_() {
  var out = {};
  알림작업.forEach(function (j) {
    out[j.fn] = String(설정값_('알림일정_' + j.fn) || j.def).trim();
  });
  return out;
}

function 알림일정목록_() {
  var cur = 알림일정_();
  return 알림작업.map(function (j) {
    var v = String(cur[j.fn] || j.def);
    var off = v.toUpperCase() === 'OFF';
    var m = /^(\S+)\s+(\d{1,2}):(\d{2})$/.exec(v);
    return { fn: j.fn, name: j.name, help: j.help, off: off,
      day: m ? m[1] : '월', hour: m ? Number(m[2]) : 8, minute: m ? Number(m[3]) : 0, raw: v };
  });
}

function saveNotifySchedule(token, fn, day, hour, minute, off) {
  if (!커미티토큰_(token)) throw new Error('알림 설정은 커미티만 바꿀 수 있습니다.');
  if (!알림작업.some(function (j) { return j.fn === fn; })) throw new Error('없는 알림입니다.');
  if (off) { 설정저장_('알림일정_' + fn, 'OFF'); return { ok: true, schedule: 알림일정목록_() }; }
  day = String(day || '월').trim();
  if (알림요일.indexOf(day) === -1) throw new Error('요일을 골라주세요.');
  var h = Math.max(0, Math.min(23, Number(hour) || 0));
  var mi = Math.max(0, Math.min(59, Number(minute) || 0));
  설정저장_('알림일정_' + fn, day + ' ' + ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2));
  return { ok: true, schedule: 알림일정목록_() };
}

/* ---- 이메일도 같이 보내기 ---- */

function 메일켜짐_(kind) {
  return String(설정값_('알림메일_' + kind) || 'OFF').trim().toUpperCase() === 'ON';
}

function saveNotifyMail(token, kind, on) {
  if (!커미티토큰_(token)) throw new Error('알림 설정은 커미티만 바꿀 수 있습니다.');
  설정저장_('알림메일_' + kind, on ? 'ON' : 'OFF');
  return pushAdminInit(token);
}

/** 이름 목록 → 이메일 목록 (교적에서) */
function 이름메일_(names) {
  if (names === '*') {
    var all = [];
    var 교적 = 교적맵_();
    Object.keys(교적).forEach(function (n) { if (교적[n].email) all.push(교적[n].email); });
    return all;
  }
  var 교적2 = 교적맵_(), out = [];
  (names || []).forEach(function (n) {
    var d = 교적2[n];
    if (d && d.email) out.push(d.email);
  });
  return out.filter(function (x, i) { return out.indexOf(x) === i; });
}

/** 알림 한 번 — 푸시 + (켜져 있으면) 이메일 */
function 알림보내기_(kind, names, msg) {
  var r = 알림_(kind, names, msg);
  if (메일켜짐_(kind)) {
    try {
      var to = 이름메일_(names);
      if (to.length) {
        MailApp.sendEmail({
          to: to.join(','), name: '토론토영락교회 청년1부',
          subject: '[청년1부] ' + (msg.title || ''),
          htmlBody: 알림메일본문_(msg)
        });
        r.mail = to.length;
      }
    } catch (e) { r.mailError = e.message; }
  }
  return r;
}

function 알림메일본문_(msg) {
  var url = msg.url || (앱주소_() + '?page=portal');
  return '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;">' +
    '<h2 style="color:#D2511F;margin:0 0 8px;">' + esc_(msg.title || '') + '</h2>' +
    (msg.body ? '<p style="color:#333;font-size:15px;line-height:1.75;white-space:pre-wrap;margin:0 0 18px;">' +
      esc_(msg.body) + '</p>' : '') +
    '<a href="' + esc_(url) + '" style="display:inline-block;background:#D2511F;color:#fff;' +
      'text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:700;">포털에서 보기</a>' +
    '<p style="color:#999;font-size:12px;margin-top:22px;">토론토영락교회 청년1부</p></div>';
}

/* ---- 받는 사람 분류 ---- */

/** 알림을 보낼 수 있는 그룹 목록 (화면의 드롭다운) */
function 알림대상목록_() {
  var out = [
    { key: '전체', name: '알림 켠 모두', n: 푸시행들_().length },
    { key: '셀장', name: '셀장', n: 역할인사람_('셀장').length },
    { key: '팀장', name: '팀장', n: 역할인사람_('팀장').length },
    { key: '커미티', name: '커미티', n: 역할인사람_('커미티').length },
    { key: '새가족팀', name: '새가족팀', n: 역할인사람_('새가족팀').length },
    { key: '회계팀', name: '회계팀', n: 역할인사람_('회계팀').length }
  ];
  // 사역팀별
  사역팀목록_().forEach(function (t) {
    out.push({ key: '팀:' + t.name, name: t.name, n: t.members.length + (t.leader ? 1 : 0), group: '사역팀' });
  });
  // 셀별
  getCells().forEach(function (c) {
    out.push({ key: '셀:' + c.name, name: c.name, n: c.members.length, group: '셀' });
  });
  // 선교팀별
  try {
    선교팀목록_().forEach(function (t) {
      out.push({ key: '선교:' + t.name, name: t.name, n: (t.members || []).length, group: '선교팀' });
    });
  } catch (e) {}
  // 신청서에 신청한 사람들 (수련회 참석자 · 제자훈련 신청자 등)
  try {
    신청서들_().forEach(function (f) {
      if (f.status === '보관') return;
      var n = 답행들_(f.id).length;
      if (!n) return;
      out.push({ key: '신청:' + f.id, name: f.title + ' 신청자', n: n, group: '신청서' });
    });
  } catch (e) {}
  // 제자훈련
  try {
    var tr = rows_(SHEET_제자훈련).filter(function (r) { return String(r[0] || '').trim(); }).length;
    if (tr) out.push({ key: '제자훈련', name: '제자훈련 참석자', n: tr, group: '기타' });
  } catch (e) {}
  return out;
}

/** 그룹 키 → 이름 목록 */
function 대상사람_(key) {
  key = String(key || '전체').trim();
  if (key === '전체') return '*';
  if (['셀장', '팀장', '커미티', '새가족팀', '회계팀'].indexOf(key) !== -1) return 역할인사람_(key);
  if (key.indexOf('팀:') === 0) {
    var tn = key.slice(2), out = [];
    사역팀목록_().forEach(function (t) {
      if (t.name !== tn) return;
      if (t.leader) out.push(t.leader);
      (t.members || []).forEach(function (m) { out.push(m.name || m); });
    });
    return out;
  }
  if (key.indexOf('셀:') === 0) {
    var cn = key.slice(2), o2 = [];
    getCells().forEach(function (c) {
      if (c.name !== cn) return;
      if (c.leader) o2.push(c.leader);
      (c.members || []).forEach(function (m) { o2.push(m); });
    });
    return o2;
  }
  if (key.indexOf('선교:') === 0) {
    var mn = key.slice(3), o3 = [];
    rows_(SHEET_선교팀원).forEach(function (r) {
      if (String(r[MM_팀]).trim() === mn) o3.push(String(r[MM_이름]).trim());
    });
    return o3;
  }
  if (key.indexOf('신청:') === 0) {
    return 답행들_(key.slice(3)).map(function (a) { return a.name; });
  }
  if (key === '제자훈련') {
    return rows_(SHEET_제자훈련).map(function (r) { return String(r[0] || '').trim(); })
      .filter(function (x) { return x; });
  }
  // 이름을 직접 적은 경우
  return key.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/* ---- 지금 바로 보내기 ---- */

/**
 * 셀장에게 지금 보냅니다.
 *   mode 'ask'  — "이번 주 보고서를 올려주세요" (독촉 아님, 먼저 부탁)
 *   mode 'nudge'— "아직 안 내셨습니다" (안 낸 셀장에게만)
 */
function sendCellNoticeNow(token, mode) {
  if (!커미티토큰_(token)) throw new Error('커미티만 보낼 수 있습니다.');
  var 키 = ymd_(이번주기준_());
  var 제출됨 = {};
  rows_(SHEET_응답원본).forEach(function (r) { if (ymd_(r[R_DATE]) === 키) 제출됨[String(r[R_CELL]).trim()] = true; });

  var 받는사람 = [], 셀이름 = [];
  getCells().forEach(function (c) {
    if (!c.leader) return;
    if (mode === 'nudge' && 제출됨[c.name]) return;
    받는사람.push(c.leader);
    셀이름.push(c.name);
  });
  if (!받는사람.length) return { sent: 0, none: true, msg: mode === 'nudge' ? '모든 셀이 보고서를 냈습니다.' : '셀장이 없습니다.' };

  var r = 알림보내기_('셀보고', 받는사람, {
    title: mode === 'nudge' ? '셀보고서를 기다리고 있습니다' : '이번 주 셀보고서를 올려주세요',
    body: 월일_(키) + ' 셀모임 보고서' + (mode === 'nudge' ? ' — 아직 올라오지 않았습니다.' : ' 를 올려주세요.'),
    url: 앱주소_() + '?page=leader', tag: '셀보고', keep: true
  });
  return { sent: r.sent || 0, mail: r.mail || 0, people: 받는사람.length, cells: 셀이름 };
}

/**
 * 팀장에게 지금 보냅니다.
 *   mode 'ask'  — "이번 달 사역 보고서를 올려주세요"
 *   mode 'nudge'— 아직 안 낸 팀장에게만
 */
function sendTeamNoticeNow(token, mode) {
  if (!커미티토큰_(token)) throw new Error('커미티만 보낼 수 있습니다.');
  var 달 = ymd_(new Date()).slice(0, 7);
  var 낸팀 = {};
  rows_(SHEET_사역보고서).forEach(function (r) {
    if (String(r[TR_기준월] || '').slice(0, 7) === 달) 낸팀[String(r[TR_팀]).trim()] = true;
  });
  var 받는사람 = [], 팀 = [];
  사역팀목록_().forEach(function (t) {
    if (!t.leader) return;
    if (mode === 'nudge' && 낸팀[t.name]) return;
    받는사람.push(t.leader);
    팀.push(t.name);
  });
  if (!받는사람.length) return { sent: 0, none: true, msg: mode === 'nudge' ? '모든 팀이 보고서를 냈습니다.' : '팀장이 없습니다.' };

  var 달표시 = 달.slice(0, 4) + '년 ' + Number(달.slice(5, 7)) + '월';
  var r = 알림보내기_('팀보고', 받는사람, {
    title: mode === 'nudge' ? '사역 보고서를 기다리고 있습니다' : 달표시 + ' 사역 보고서를 올려주세요',
    body: 달표시 + ' 팀 보고서' + (mode === 'nudge' ? ' 가 아직 올라오지 않았습니다.' : ' 를 올려주세요.'),
    url: 앱주소_() + '?page=team', tag: '팀보고', keep: true
  });
  return { sent: r.sent || 0, mail: r.mail || 0, people: 받는사람.length, teams: 팀 };
}

/* ---- 공지 보내기 (포털 + 푸시 + 이메일) ---- */

/**
 * 커미티 공지 — 포털 첫 화면에 남기고, 고른 대로 푸시 · 이메일도 보냅니다.
 */
function sendNotice(token, d) {
  if (!커미티토큰_(token)) throw new Error('공지는 커미티만 보낼 수 있습니다.');
  d = d || {};
  var title = String(d.title || '').trim().slice(0, 100);
  if (!title) throw new Error('제목을 입력해주세요.');
  var body = String(d.body || '').trim().slice(0, 2000);
  var target = String(d.target || '전체').trim();
  var url = String(d.url || '').trim();
  var until = /^\d{4}-\d{2}-\d{2}$/.test(String(d.until || '')) ? d.until : '';

  var who = 대상사람_(target);
  var out = { push: 0, mail: 0, portal: false };

  // 1) 포털 첫 화면에 남기기
  if (d.portal !== false) {
    var id = 'N' + Date.now().toString(36);
    공지시트_().appendRow([id, title, body, target, url, 커미티이름_(token), ymd_(new Date()), until]);
    캐시비움_();
    out.portal = true;
    out.id = id;
  }

  // 2) 푸시
  if (d.push !== false && 알림켜짐_('공지')) {
    var p = 푸시보내기_(who, { title: title, body: body,
      url: url || (앱주소_() + '?page=portal'), tag: 'notice', keep: true });
    out.push = p.sent || 0;
  }

  // 3) 이메일
  if (d.mail) {
    try {
      var to = 이름메일_(who);
      if (to.length) {
        MailApp.sendEmail({ to: to.join(','), name: '토론토영락교회 청년1부',
          subject: '[청년1부] ' + title, htmlBody: 알림메일본문_({ title: title, body: body, url: url }) });
        out.mail = to.length;
      }
    } catch (e) { out.mailError = e.message; }
  }
  return out;
}

/* ---- 선교팀 · 사역팀 마감 ---- */

var SHEET_마감 = '마감일';
var HEAD_마감 = ['구분', '대상', '항목', '마감일', '메모', '정한이', '정한날'];
var DL_구분 = 0, DL_대상 = 1, DL_항목 = 2, DL_날 = 3, DL_메모 = 4, DL_by = 5, DL_at = 6;

function 마감시트_() {
  var sh = 주보시트_(SHEET_마감, HEAD_마감);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_마감.length).setValues([HEAD_마감]); 캐시비움_(); } } catch (e) {}
  return sh;
}

/** 선교팀이 내야 하는 것들 */
function 선교마감항목() { return ['예산안', '지출 결산', '핸드북', '선교 보고서', '서약서 · 여권']; }

function 마감들_() {
  return rows_(SHEET_마감).filter(function (r) { return String(r[DL_대상]).trim() && String(r[DL_항목]).trim(); })
    .map(function (r) {
      return { kind: String(r[DL_구분] || '선교').trim(), team: String(r[DL_대상]).trim(),
        item: String(r[DL_항목]).trim(), due: 날짜문자열_(r[DL_날]),
        memo: String(r[DL_메모] || '').trim(), by: String(r[DL_by] || '').trim() };
    }).filter(function (x) { return x.due; })
    .sort(function (a, b) { return a.due.localeCompare(b.due); });
}

function saveDeadline(token, kind, team, item, due, memo) {
  if (!커미티토큰_(token)) throw new Error('마감일은 커미티만 정할 수 있습니다.');
  team = String(team || '').trim(); item = String(item || '').trim();
  if (!team || !item) throw new Error('팀과 항목을 골라주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due || ''))) throw new Error('마감일을 골라주세요.');
  var sh = 마감시트_(), v = sh.getDataRange().getValues(), at = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][DL_대상]).trim() === team && String(v[i][DL_항목]).trim() === item) { at = i + 1; break; }
  }
  var row = [String(kind || '선교').trim(), team, item, due, String(memo || '').trim().slice(0, 200),
    커미티이름_(token), ymd_(new Date())];
  if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); at = sh.getLastRow(); }
  sh.getRange(at, DL_날 + 1).setNumberFormat('@').setValue(due);
  캐시비움_();
  return { ok: true, list: 마감들_() };
}

function deleteDeadline(token, team, item) {
  if (!커미티토큰_(token)) throw new Error('커미티만 지울 수 있습니다.');
  var sh = 마감시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][DL_대상]).trim() === String(team).trim() && String(v[i][DL_항목]).trim() === String(item).trim()) sh.deleteRow(i + 1);
  }
  캐시비움_();
  return { ok: true, list: 마감들_() };
}

/** 그 팀에서 알림을 받을 사람 (선교팀은 팀장 · 회계 · 서기, 사역팀은 팀장) */
function 마감받는사람_(d) {
  if (d.kind === '사역') {
    var out = [];
    사역팀목록_().forEach(function (t) { if (t.name === d.team && t.leader) out.push(t.leader); });
    return out;
  }
  var o2 = [];
  rows_(SHEET_선교팀원).forEach(function (r) {
    if (String(r[MM_팀]).trim() !== d.team) return;
    var roles = String(r[MM_역할] || '');
    if (/팀장|회계|서기/.test(roles)) o2.push(String(r[MM_이름]).trim());
  });
  if (!o2.length) {
    rows_(SHEET_선교팀원).forEach(function (r) {
      if (String(r[MM_팀]).trim() === d.team) o2.push(String(r[MM_이름]).trim());
    });
  }
  return o2;
}

/**
 * 마감 알림 — 매일 한 번 돕니다.
 * 7일 전 · 3일 전 · 당일에 알리고, 지나면 독촉합니다 (3일마다).
 */
function 마감알림() {
  if (String(설정값_('리마인더사용') || 'ON').toUpperCase() === 'OFF') return { sent: 0 };
  var today = ymd_(new Date());
  var sent = 0;
  마감들_().forEach(function (d) {
    var days = Math.round((parseYmd_(d.due) - parseYmd_(today)) / 86400000);
    var 알릴까 = (days === 7 || days === 3 || days === 0 || (days < 0 && days % 3 === 0));
    if (!알릴까) return;
    var who = 마감받는사람_(d);
    if (!who.length) return;
    var 늦음 = days < 0;
    var r = 알림보내기_(늦음 ? '팀보고' : '팀보고', who, {
      title: d.team + ' · ' + d.item + (늦음 ? ' 제출이 늦었습니다' : (days === 0 ? ' 오늘 마감입니다' : ' 마감 ' + days + '일 전')),
      body: '마감일 ' + d.due + (d.memo ? '\n' + d.memo : ''),
      url: 앱주소_() + (d.kind === '사역' ? '?page=team' : '?page=mission'),
      tag: 'due-' + d.team + '-' + d.item, keep: true
    });
    sent += r.sent || 0;
  });
  return { sent: sent };
}

/** 커미티가 손으로 지금 독촉 */
function sendDeadlineNow(token, team, item) {
  if (!커미티토큰_(token)) throw new Error('커미티만 보낼 수 있습니다.');
  var hit = null;
  마감들_().forEach(function (d) {
    if (d.team === String(team).trim() && d.item === String(item).trim()) hit = d;
  });
  if (!hit) throw new Error('없는 마감입니다.');
  var who = 마감받는사람_(hit);
  if (!who.length) return { sent: 0, none: true, msg: '알릴 사람이 없습니다. 팀원을 먼저 넣어주세요.' };
  var today = ymd_(new Date());
  var days = Math.round((parseYmd_(hit.due) - parseYmd_(today)) / 86400000);
  var r = 알림보내기_('팀보고', who, {
    title: hit.team + ' · ' + hit.item + (days < 0 ? ' 제출이 늦었습니다' : (days === 0 ? ' 오늘 마감입니다' : ' 마감 ' + days + '일 전')),
    body: '마감일 ' + hit.due + (hit.memo ? '\n' + hit.memo : ''),
    url: 앱주소_() + (hit.kind === '사역' ? '?page=team' : '?page=mission'),
    tag: 'due-' + hit.team + '-' + hit.item, keep: true
  });
  return { sent: r.sent || 0, mail: r.mail || 0, people: who.length };
}

/* =========================================================
   신청서 2단계 — 오픈 알림 · 이메일 · 정원 자동마감 · 내 본보기
   ========================================================= */

var SHEET_신청양식 = '신청서본보기';
var HEAD_신청양식 = ['ID', '이름', '설명', '만든이', '만든날', '내용'];
var FT_ID = 0, FT_이름 = 1, FT_설명 = 2, FT_만든이 = 3, FT_날 = 4, FT_내용 = 5;

function 신청양식시트_() {
  var sh = 주보시트_(SHEET_신청양식, HEAD_신청양식);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_신청양식.length).setValues([HEAD_신청양식]); 캐시비움_(); } } catch (e) {}
  return sh;
}

/** 우리 청년부가 만들어 둔 본보기 */
function 내본보기들_() {
  return rows_(SHEET_신청양식).filter(function (r) { return String(r[FT_ID]).trim(); }).map(function (r) {
    var parts = [];
    for (var i = FT_내용; i < r.length; i++) {
      var s = String(r[i] == null ? '' : r[i]);
      if (s.charAt(0) === "'") s = s.slice(1);
      parts.push(s);
    }
    var body = {};
    try { body = JSON.parse(parts.join('')) || {}; } catch (e) {}
    return { key: 'my:' + String(r[FT_ID]).trim(), id: String(r[FT_ID]).trim(),
      name: String(r[FT_이름] || '').trim(), desc: String(r[FT_설명] || '').trim(),
      by: String(r[FT_만든이] || '').trim(), at: 날짜문자열_(r[FT_날]),
      icon: '⭐', mine: true, form: body };
  });
}

/** 지금 신청서를 본보기로 저장합니다 */
function saveFormTemplate(token, formId, name, desc) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(formId);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  name = String(name || f.title || '').trim().slice(0, 60);
  if (!name) throw new Error('본보기 이름을 적어주세요.');

  var body = { title: f.title, desc: f.desc, target: f.target, questions: f.questions,
    editable: f.editable, showCount: f.showCount, notify: f.notify, mail: f.mail,
    limit: f.limit, autoClose: f.autoClose };
  var json = JSON.stringify(body);
  var parts = [];
  for (var i = 0; i < json.length; i += 신청서조각) parts.push("'" + json.slice(i, i + 신청서조각));

  var id = 'T' + Date.now().toString(36);
  var sh = 신청양식시트_();
  var row = [id, name, String(desc || '').trim().slice(0, 120), who.name, ymd_(new Date())].concat(parts);
  sh.appendRow(row);
  캐시비움_();
  return { ok: true, id: id, list: 내본보기들_() };
}

function deleteFormTemplate(token, id) {
  var who = 신청서관리자_(token);
  var sh = 신청양식시트_(), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][FT_ID]).trim() !== String(id).trim()) continue;
    if (!who.committee && String(v[i][FT_만든이]).trim() !== who.name) throw new Error('만든 분과 커미티만 지울 수 있습니다.');
    sh.deleteRow(i + 1);
  }
  캐시비움_();
  return { ok: true, list: 내본보기들_() };
}

/** 기본 본보기 + 우리가 만든 본보기 */
function formTemplatesAll(token) {
  var mine = [];
  try { 신청서관리자_(token); mine = 내본보기들_(); } catch (e) {}
  return { builtin: formTemplates(), mine: mine };
}

/** 신청서를 열 때 알리기 */
function announceForm(token, id, target, opts) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  opts = opts || {};
  var names = 대상사람_(target || (f.target === '새가족' ? '전체' : '전체'));
  var url = 앱주소_() + '?page=portal';
  var body = (f.desc ? f.desc.split('\n')[0].slice(0, 120) : '') +
    (f.closeAt ? (f.desc ? '\n' : '') + f.closeAt + ' 까지 신청해주세요.' : '');

  var out = { push: 0, mail: 0, portal: false };
  if (opts.push !== false) {
    var p = 푸시보내기_(names, { title: f.title + ' 신청을 받습니다', body: body, url: url,
      tag: 'form-' + f.id, keep: true });
    out.push = p.sent || 0;
  }
  if (opts.mail) {
    try {
      var to = 이름메일_(names);
      if (to.length) {
        MailApp.sendEmail({ to: to.join(','), name: '토론토영락교회 청년1부',
          subject: '[청년1부] ' + f.title + ' 신청을 받습니다',
          htmlBody: 알림메일본문_({ title: f.title + ' 신청을 받습니다', body: body, url: url }) });
        out.mail = to.length;
      }
    } catch (e) { out.mailError = e.message; }
  }
  if (opts.portal) {
    공지시트_().appendRow(['N' + Date.now().toString(36), f.title + ' 신청을 받습니다', body,
      String(target || '전체'), url, 커미티이름_(token), ymd_(new Date()), f.closeAt || '']);
    캐시비움_();
    out.portal = true;
  }
  return out;
}
