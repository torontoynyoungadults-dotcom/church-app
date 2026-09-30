/**
 * Step 11 — 메뉴 재편(Teva Apps) · 화면 보기 1:1 · 새가족 포털 편집 · 알림/이메일 분리 · HTML 이메일 · 미리보기
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 함수를 지우지 않고 새 함수만 더합니다.
 *
 *  ▣ 화면에서 부를 수 있는 새 함수
 *    notificationPreview(token, spec)       푸시 알림 + HTML 이메일 미리보기 (커미티) — 보내기 전 확인용
 *    newcomerPortalAdminInit(token)         새가족 포털 편집 화면 첫 자료 (커미티 · 새가족팀)
 *    saveNewcomerPortalConfig(token, cfg)   새가족 포털 설정 저장 (커미티 · 새가족팀)
 *    resetNewcomerPortalConfig(token)       기본값으로 되돌리기
 *
 *  ▣ app.js 가 부르는 도우미 (밑줄 끝 — 화면에서는 못 부름)
 *    알림푸시문구11_(msg)          푸시는 짧게 (제목 40자 · 본문 100자)
 *    알림메일템플릿11_(msg)        머리말 · 카드 본문 · 버튼 · 꼬리말이 있는 HTML 이메일
 *    새가족포털설정11_()           새가족 포털 설정 (없으면 기본값)
 *    메뉴묶기11_(목록)             포털 메뉴 이름 · 하위 메뉴 정리
 */

/* ============================================================
   1. 푸시는 짧게
   ============================================================ */

function 자르기11_(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s;
}

/** 푸시 문구 — 제목 40자 · 본문은 줄을 " · " 로 이어 붙여 100자까지. 긴 내용은 이메일 · 포털 공지에 그대로 실립니다 */
function 알림푸시문구11_(msg) {
  msg = msg || {};
  var out = {};
  for (var k in msg) out[k] = msg[k];
  out.title = 자르기11_(msg.title || '', 40);
  var lines = String(msg.body == null ? '' : msg.body).split(/\r?\n/).map(function (x) { return x.replace(/^\s+|\s+$/g, ''); })
    .filter(function (x) { return x; });
  out.body = 자르기11_(lines.join(' \u00B7 '), 100);
  return out;
}

/* ============================================================
   2. HTML 이메일 템플릿 — 머리말 · 카드 본문 · 버튼 · 꼬리말
   ------------------------------------------------------------
   표 · 인라인 스타일만 씁니다 (지메일 · 애플 메일 · 아웃룩에서 같은 모양).
   msg: { title, body, url, note, label, cta }
     note  : 커미티가 알림 종류별로 적어 둔 안내 문구 (있으면 카드 아래 강조 상자)
     label : 카드 위 작은 분류 이름 (예: "셀보고 독려")
     cta   : 버튼 글자 (기본 "포털에서 확인하기")
   ============================================================ */

function 알림메일템플릿11_(msg) {
  msg = msg || {};
  var url = String(msg.url || (앱주소_() + '?page=portal'));
  var title = esc_(msg.title || '');
  var label = String(msg.label || '').trim();
  var cta = String(msg.cta || '포털에서 확인하기').trim();

  // 본문 — 빈 줄은 문단, 한 줄 바꿈은 <br>
  var paras = String(msg.body == null ? '' : msg.body).replace(/\r/g, '').split(/\n{2,}/)
    .map(function (p) { return p.replace(/^\s+|\s+$/g, ''); }).filter(function (p) { return p; })
    .map(function (p) {
      return '<p style="margin:0 0 14px;font-size:15px;line-height:1.85;color:#3A3631;">' + esc_(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');

  var note = String(msg.note || '').trim();
  var noteBox = note
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 4px;">' +
        '<tr><td style="background:#FBF3EE;border-left:4px solid #EE5622;border-radius:6px;padding:12px 14px;' +
        'font-size:13.5px;line-height:1.8;color:#5A3A2C;">' + esc_(note).replace(/\n/g, '<br>') + '</td></tr></table>'
    : '';

  var preheader = 자르기11_(String(msg.body || msg.title || '').replace(/\s+/g, ' '), 90);

  return '' +
  '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta name="color-scheme" content="light only"><title>' + title + '</title></head>' +
  '<body style="margin:0;padding:0;background:#E9E6E0;">' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#E9E6E0;">' + esc_(preheader) + '</div>' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E9E6E0;">' +
  '<tr><td align="center" style="padding:26px 12px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;' +
      'font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Malgun Gothic\',\'Noto Sans KR\',Arial,sans-serif;">' +

    /* 머리말 */
    '<tr><td style="background:#141414;border-radius:16px 16px 0 0;padding:26px 26px 22px;text-align:center;">' +
      '<div style="font-size:11px;letter-spacing:.22em;color:#F08A5D;font-weight:700;">YNTORONTO &middot; YOUNG ADULTS</div>' +
      '<div style="font-size:21px;font-weight:800;color:#FFFFFF;margin-top:8px;line-height:1.4;">토론토영락교회 청년1부</div>' +
    '</td></tr>' +
    '<tr><td style="background:#EE5622;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>' +

    /* 카드 본문 */
    '<tr><td style="background:#FFFFFF;padding:30px 28px 26px;">' +
      (label ? '<div style="display:inline-block;background:#FBE9E1;color:#C4431A;font-size:12px;font-weight:800;' +
        'padding:4px 12px;border-radius:99px;margin-bottom:14px;">' + esc_(label) + '</div>' : '') +
      '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.5;color:#1A1917;font-weight:800;letter-spacing:-0.01em;">' + title + '</h1>' +
      paras + noteBox +
      /* 버튼 */
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 6px;"><tr>' +
        '<td align="center" bgcolor="#EE5622" style="border-radius:10px;">' +
          '<a href="' + esc_(url) + '" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;' +
          'color:#FFFFFF;text-decoration:none;border-radius:10px;">' + esc_(cta) + '</a>' +
        '</td></tr></table>' +
      '<p style="margin:14px 0 0;text-align:center;font-size:12px;line-height:1.7;color:#8A857D;">' +
        '버튼이 열리지 않으면 아래 주소를 복사해 브라우저에 붙여 넣어주세요.<br>' +
        '<a href="' + esc_(url) + '" style="color:#8A857D;word-break:break-all;">' + esc_(url) + '</a></p>' +
    '</td></tr>' +

    /* 꼬리말 */
    '<tr><td style="background:#141414;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center;' +
      'font-size:11px;color:#8C867D;line-height:1.9;">' + CHURCH_FOOTER +
      '<br><span style="color:#6A655E;">이 메일은 청년1부 알림 설정에 따라 자동으로 발송되었습니다.</span></td></tr>' +

    '</table></td></tr></table></body></html>';
}

/* ============================================================
   3. 미리보기 — 보내기 전에 푸시와 이메일이 어떻게 보이는지
   ------------------------------------------------------------
   spec: { kind?, title?, body?, url?, note? }
     kind 가 있으면 그 알림 종류의 샘플 문구 · 저장된 안내 문구를 바탕으로 하고, title/body 가 있으면 그것을 씁니다.
   아무것도 보내지 않고 시트에도 쓰지 않습니다.
   ============================================================ */

function notificationPreview(token, spec) {
  if (!커미티토큰_(token)) throw new Error('미리보기는 커미티만 볼 수 있습니다.');
  spec = spec || {};
  var kind = String(spec.kind || '').trim();
  var kinds = 알림종류_(), kd = null;
  kinds.forEach(function (k) { if (k.key === kind) kd = k; });
  if (kind && !kd) throw new Error('없는 알림 종류입니다.');

  var base = kd ? 알림샘플_(kind) : {};
  var title = String(spec.title != null && String(spec.title).trim() ? spec.title : (base.title || '(제목)')).trim().slice(0, 100);
  var body = String(spec.body != null && (String(spec.body).trim() || spec.title != null) ? spec.body : (base.body || '')).trim().slice(0, 2000);
  var url = 딥링크정규화_(spec.url) || (앱주소_() + '?page=portal');
  var note = spec.note != null ? String(spec.note).trim().slice(0, 300) : (kd ? 알림문구_(kind) : '');   // 저장 전 문구도 미리 볼 수 있게

  var msg = { title: title, body: body, url: url };
  var push = 알림푸시문구11_(msg);
  var mail = { title: title, body: body, url: url, note: note, label: kd ? kd.name : '' };
  return {
    kind: kind,
    kindName: kd ? kd.name : '',
    push: { app: '토론토영락교회 청년1부', title: push.title, body: push.body, url: url, chars: { title: push.title.length, body: push.body.length } },
    email: { from: '토론토영락교회 청년1부', subject: '[청년1부] ' + title, html: 알림메일템플릿11_(mail), note: note }
  };
}

/* ============================================================
   4. 새가족 포털 설정 — 새가족이 보는 첫 화면의 글 · 위젯 · 순서
   ------------------------------------------------------------
   저장: 설정 시트 '새가족포털설정' 한 칸에 JSON (새 시트 · 새 열 없음)
   모양: { title, message, showStatus, todosTitle, widgets:[{id,on}], notice:{title,text,label,url}, links:[{label,url}] }
   위젯: welcome(환영 카드) · notice(안내) · cellapp(셀 신청) · mycell(내 셀) · todos(알림) · forms(신청서) · links(바로가기) · edit(내 정보 고치기)
   ============================================================ */

var 새가족포털위젯11_ = [
  { id: 'welcome', name: '환영 카드', help: '이름 인사 · 등록일 · 상태 · 안내 문구', fixed: true },
  { id: 'notice', name: '안내 카드', help: '커미티가 직접 쓰는 공지 한 장 (버튼 링크 가능)' },
  { id: 'cellapp', name: '셀 신청 버튼', help: '셀 신청이 열려 있을 때만 나타납니다' },
  { id: 'mycell', name: '내 셀 카드', help: '셀이 배정된 뒤에 나타납니다' },
  { id: 'todos', name: '알림', help: '공지 · 신청서 · 할 일' },
  { id: 'forms', name: '신청서', help: '새가족이 낼 수 있는 신청서 목록' },
  { id: 'links', name: '바로가기', help: '주보 · 일정 · 묵상 · 직접 넣은 링크' },
  { id: 'edit', name: '내 등록 정보 고치기', help: '새가족 등록 내용을 다시 고치는 버튼' }
];

function 새가족포털기본11_() {
  return {
    v: 1,
    title: '{name}님, 환영합니다',
    message: '새가족 교육(4주)을 마치면 셀(소그룹)에 참여하실 수 있습니다.',
    showStatus: true,
    todosTitle: '알림',
    widgets: 새가족포털위젯11_.map(function (w) { return { id: w.id, on: ['welcome', 'cellapp', 'mycell', 'todos', 'forms', 'edit'].indexOf(w.id) !== -1 }; }),   // 기본은 예전 화면과 같음 (안내 · 바로가기는 꺼짐)
    notice: { title: '', text: '', label: '', url: '' },
    links: [
      { label: '주보 보기', url: '?page=bulletin' },
      { label: '청년부 일정', url: '?page=calendar' }
    ]
  };
}

/** 링크 — ?page=… (이 사이트 안) 또는 http(s):// 만 허용 */
function 새가족포털주소11_(v) {
  v = String(v == null ? '' : v).trim().slice(0, 300);
  if (!v) return '';
  if (/^\?page=[a-z]+([&=A-Za-z0-9_%.\-]*)$/.test(v)) return v;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v;
  return '';
}

/** 저장 · 읽기 공통 정리 — 알 수 없는 위젯은 버리고 빠진 위젯은 뒤에 덧붙입니다 (새 기능이 생겨도 옛 설정이 깨지지 않게) */
function 새가족포털정리11_(raw) {
  var d = 새가족포털기본11_();
  raw = (raw && typeof raw === 'object') ? raw : {};
  var out = {
    v: 1,
    title: 자르기11_(raw.title != null ? raw.title : d.title, 60),
    message: String(raw.message != null ? raw.message : d.message).replace(/\s+$/, '').slice(0, 300),
    showStatus: raw.showStatus === undefined ? d.showStatus : !!raw.showStatus,
    todosTitle: 자르기11_(raw.todosTitle != null ? raw.todosTitle : d.todosTitle, 20) || d.todosTitle,
    widgets: [],
    notice: { title: '', text: '', label: '', url: '' },
    links: []
  };
  if (!out.title) out.title = d.title;

  var known = {};
  새가족포털위젯11_.forEach(function (w) { known[w.id] = w; });
  var seen = {};
  (Object.prototype.toString.call(raw.widgets) === '[object Array]' ? raw.widgets : []).forEach(function (w) {
    if (!w || !known[w.id] || seen[w.id]) return;
    seen[w.id] = 1;
    out.widgets.push({ id: w.id, on: known[w.id].fixed ? true : !!w.on });
  });
  d.widgets.forEach(function (w) { if (!seen[w.id]) out.widgets.push({ id: w.id, on: w.on }); });

  var n = (raw.notice && typeof raw.notice === 'object') ? raw.notice : {};
  out.notice = {
    title: 자르기11_(n.title, 60),
    text: String(n.text == null ? '' : n.text).replace(/\s+$/, '').slice(0, 600),
    label: 자르기11_(n.label, 20),
    url: 새가족포털주소11_(n.url)
  };

  (Object.prototype.toString.call(raw.links) === '[object Array]' ? raw.links : []).forEach(function (l) {
    if (out.links.length >= 6 || !l) return;
    var label = 자르기11_(l.label, 20), url = 새가족포털주소11_(l.url);
    if (label && url) out.links.push({ label: label, url: url });
  });
  return out;
}

function 새가족포털설정11_() {
  var raw = null;
  try { raw = JSON.parse(String(설정값_('새가족포털설정') || '')); } catch (e) { raw = null; }
  return 새가족포털정리11_(raw);
}

function 새가족포털관리자11_(token) {
  if (커미티토큰_(token)) return;
  var ok = false;
  try { requireNewFamily_(token); ok = true; } catch (e) { ok = false; }
  if (!ok) throw new Error('새가족 포털 화면은 새가족팀 · 커미티만 바꿀 수 있습니다.');
}

function newcomerPortalAdminInit(token) {
  새가족포털관리자11_(token);
  return {
    config: 새가족포털설정11_(),
    defaults: 새가족포털기본11_(),
    catalog: 새가족포털위젯11_,
    canEdit: true
  };
}

function saveNewcomerPortalConfig(token, cfg) {
  새가족포털관리자11_(token);
  var clean = 새가족포털정리11_(cfg);
  설정저장_('새가족포털설정', JSON.stringify(clean));
  return { ok: true, config: clean };
}

function resetNewcomerPortalConfig(token) {
  새가족포털관리자11_(token);
  var d = 새가족포털정리11_(null);
  설정저장_('새가족포털설정', JSON.stringify(d));
  return { ok: true, config: d };
}

/* ============================================================
   5. 포털 메뉴 이름 · 하위 메뉴 (Teva Apps)
   ------------------------------------------------------------
   메뉴 key 는 그대로입니다 (권한 · 메뉴 순서 · 개인 허용이 key 로 이어져 있음). 이름 · 하위 메뉴만 바뀝니다.
     leader → 셀모임        (셀 보고서 · 셀원 정보 · 대리 제출)
     team   → 사역팀        (팀 보고서 · 팀원 관리 · 지출환급신청 [바로 가기])
     budget → 수련회 · 선교 예산/정산
     forms  → 각종 Form 관리
   지출환급신청은 사역팀 안으로 들어갑니다 — 사역팀 메뉴가 없는 분(지출 공개로 들어온 분)에게는 예전처럼 따로 보입니다.
   ============================================================ */


function 메뉴묶기11_(목록) {
  /* v2: 하위 메뉴는 포털에 따로 펼치지 않습니다. 타일은 그 페이지로 바로 가고,
     셀모임 · 사역팀 페이지 안의 위쪽 탭(셀 보고서 | 셀원 정보 | 대리 제출 / 팀 보고서 | 팀원 관리 | 지출환급신청)으로 나뉩니다. */
  var by = {};
  목록.forEach(function (it) { by[it.key] = it; });

  if (by.leader) { by.leader.title = '셀모임'; by.leader.desc = '셀 보고서 · 셀원 정보 · 대리 제출'; }

  var out = 목록;
  if (by.team) {
    by.team.title = '사역팀';
    by.team.desc = '팀 보고서 · 팀원 관리 · 지출환급신청';
    out = 목록.filter(function (it) { return it.key !== 'expense'; });     // 사역팀 페이지의 탭으로 들어갔습니다
  }
  if (by.budget) { by.budget.title = '수련회 · 선교 예산/정산'; by.budget.desc = '예산 · 거래 · 정산 · 엑셀 · PDF'; }
  if (by.forms) { by.forms.title = '각종 Form 관리'; by.forms.desc = '신청서 · 설문조사 · 인원조사 만들기'; }
  return out;
}


/* ============================================================
   6. 새가족 화면 보기 · 편집 미리보기 도우미
   ============================================================ */

/** 새가족의 첫 화면 자료를 만들 수 없을 때(이메일 없음 · 교적 등록 등) 쓰는 최소 자료 */
function 새가족홈대체11_(nf) {
  var home = {
    token: '', name: nf.name, email: nf.email || '', joinedAt: nf.joinedAt || '', status: nf.status || '진행중',
    mine: null, cellApp: {}, myCell: null, forms: { list: [] }, todos: [], portalCfg: 새가족포털설정11_()
  };
  try { home.myCell = 내셀_(nf.name); } catch (e) {}
  return home;
}

/** 편집 화면의 미리보기 — 실제 포털 화면(?page=portal&nfpreview=1&t=…)에 실어 보낼 견본 자료. 새가족팀 · 커미티만 */
function 새가족미리보기11_(p) {
  p = p || {};
  if (!p.nfpreview || !p.t) return null;
  try { 새가족포털관리자11_(String(p.t)); } catch (e) { return null; }
  var y = new Date().getFullYear();
  var today = ymd_(new Date());
  return {
    home: {
      token: '', name: '홍길동', email: 'sample@example.com', joinedAt: today, status: '진행중', mine: null,
      cellApp: { state: 'open', year: String(y), submitted: null },
      myCell: { year: String(y), cell: '1셀', leader: '김셀장', members: [{ name: '이하나' }, { name: '박믿음' }, { name: '최소망' }] },
      forms: { list: [{ id: 'sample', title: '수련회 신청', open: true, desc: '이번 수련회에 참석하실 분은 신청해 주세요.', submitted: false }] },
      todos: [
        { id: 'sample-1', kind: 'do', tone: 'urgent', icon: '📝', title: '셀 신청을 해주세요', sub: '신청을 받고 있습니다' },
        { id: 'sample-2', kind: 'info', tone: 'info', icon: '📣', title: '이번 주 주보가 나왔습니다', sub: '' }
      ],
      portalCfg: 새가족포털설정11_()
    },
    cfg: 새가족포털설정11_()
  };
}
