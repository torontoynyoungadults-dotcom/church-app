/**
 * v6 — 설문조사 · 투표 (각종 Form 관리)
 * ============================================================
 * 이 파일은 logic/app.js · forms2.js · forms3.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * 신청서와 같은 시트(DB09 신청서 · 신청내역) · 같은 문항 부품(객관식 · 복수선택 · 별점 · 글 …)을 그대로 씁니다.
 * 새 시트 · 새 칸은 없습니다 — 신청서 본문 JSON 에 아래 값만 더합니다 (없으면 예전 신청서 그대로):
 *   kind     : 'form'(신청서, 기본) | 'survey'(설문 · 투표)
 *   audience : ['팀:찬양1팀', '팀장', '셀:3셀', '사람:홍길동', …] — 누가 보고 참여하나 (비어 있으면 예전처럼 모두)
 *   survey   : { anonymous, results:'after'|'always'|'hidden', allowAdd }   (설문일 때만)
 *     · anonymous — 결과 · 엑셀에 이름 · 연락처가 나오지 않습니다 (한 사람 한 번 · 고치기를 위해 시트에는 남음)
 *     · results   — 참여자도 결과 보기: 'after' 참여한 뒤 · 'always' 언제나 · 'hidden' 만든 사람만
 *     · allowAdd  — 참여자가 고르기 문항에 선택지를 더할 수 있음 (카카오톡 투표의 "항목 추가")
 *   · 다시 투표(고치기) = 예전 "낸 뒤에도 고칠 수 있게"(editable) · 마감 = 닫는 날 · 참여 인원 공개 = showCount 그대로.
 *
 * 권한: 커미티 = 모든 대상(전체 · 역할(팀장 · 셀장 · 커미티 …) · 팀 · 셀 · 선교팀 · 한 사람)
 *       팀장   = 자기 팀(팀:우리팀)과 그 팀 사람만. 팀장이 만드는 설문은 대상을 비우면 자기 팀으로 정합니다.
 * 화면에서 부를 수 있는 함수: surveyResults (참여자용 결과) · surveyRemind (아직 안 한 분께 다시 알림) · surveyAudience (대상 인원 미리 보기)
 */

var 설문결과공개6_ = ['after', 'always', 'hidden'];
var 설문대상형식6_ = /^(셀장|팀장|커미티|새가족팀|회계팀|제자훈련|팀:.{1,40}|셀:.{1,40}|선교:.{1,40}|사람:.{1,40})$/;
var 설문추가한도6_ = 30;                                     // 참여자가 더한 선택지 포함, 한 문항 선택지 최대

/** 저장할 때 — 종류 · 대상 · 설문 설정을 다듬고 권한을 확인합니다 → { kind, audience, survey } */
function 폼대상정리6_(data, who, old) {
  data = data || {};
  var kind = data.kind === 'survey' ? 'survey' : (data.kind == null && old ? (old.kind || 'form') : 'form');
  var raw = Array.isArray(data.audience) ? data.audience : (data.audience == null && old ? (old.audience || []) : []);
  var seen = {}, aud = [];
  raw.forEach(function (k) {
    k = String(k || '').trim();
    if (!k || k === '전체' || seen[k] || !설문대상형식6_.test(k)) return;
    seen[k] = 1; aud.push(k);
  });
  aud = aud.slice(0, 30);
  if (!who.committee) {
    var mine = {};
    who.teams.forEach(function (t) { mine['팀:' + t] = 1; });
    var people = {};
    try { 공유후보사람3_(who).forEach(function (n) { people['사람:' + n] = 1; }); } catch (e) {}
    var bad = aud.filter(function (k) { return !mine[k] && !people[k]; });
    if (bad.length) throw new Error('팀장은 우리 팀과 우리 팀 사람만 대상으로 고를 수 있습니다. (' + bad.join(', ') + ')');
    if (kind === 'survey' && !aud.length) aud = who.teams.map(function (t) { return '팀:' + t; });
  }
  var s = data.survey || (old && old.survey) || {};
  var survey = kind === 'survey' ? {
    anonymous: !!s.anonymous,
    results: 설문결과공개6_.indexOf(String(s.results)) !== -1 ? String(s.results) : 'after',
    allowAdd: !!s.allowAdd
  } : null;
  return { kind: kind, audience: aud, survey: survey };
}

/** 이 사람이 대상인가 (대상이 비어 있으면 모두) */
function 폼대상인가6_(f, who) {
  var aud = (f && f.audience) || [];
  if (!aud.length) return true;
  if (!who || who.kind === 'newcomer') return false;
  var r = 대상사람들3_(aud);
  if (r === '*') return true;
  return (r || []).indexOf(who.name) !== -1;
}

/** 대상 사람 이름들 (대상이 없으면 null = 모두) */
function 폼대상사람들6_(f) {
  var aud = (f && f.audience) || [];
  if (!aud.length) return null;
  var r = 대상사람들3_(aud);
  return r === '*' ? null : (r || []);
}

/** 익명 설문 — 결과 · 엑셀에서 누가 냈는지 가립니다 (순서도 섞어 제출 순서로 짐작하지 못하게 이름 순이 아닌 답 순) */
function 익명행들6_(rows) {
  return rows.map(function (a, i) {
    return { name: '익명 ' + (i + 1), email: '', phone: '', gender: '', cell: '', at: String(a.at || '').slice(0, 10), edited: '', answers: a.answers, status: a.status, anon: true };
  });
}

/** 참여 현황 — 대상이 정해져 있으면 전체 · 참여 · 아직 (익명이면 이름 없이 수만) */
function 참여현황6_(f, rows) {
  var names = 폼대상사람들6_(f);
  if (!names) return null;
  var done = {};
  rows.forEach(function (a) { if (a.status !== '취소') done[a.name] = 1; });
  var pending = names.filter(function (n) { return !done[n]; });
  var anon = !!(f.survey && f.survey.anonymous);
  return { total: names.length, done: names.length - pending.length, pending: anon ? [] : pending.slice(0, 300), pendingN: pending.length, anonymous: anon };
}

/** 참여자가 더한 선택지 — 고르기 문항에 없는 답을 선택지로 넣고 신청서에 저장합니다 (설문 · allowAdd 일 때만) */
function 선택지더하기6_(f, answers, whoName) {
  if (!f || f.kind !== 'survey' || !f.survey) return f;
  if (!f.survey.allowAdd) {                                   // 항목 추가를 허용하지 않은 투표는 없는 선택지를 받지 않습니다
    (f.questions || []).forEach(function (q) {
      if (q.type !== 'choice' && q.type !== 'checks') return;
      var v = answers[q.id], picks = Array.isArray(v) ? v : (v ? [v] : []);
      picks.forEach(function (x) {
        x = String(x || '').trim();
        if (!x || (q.opts || []).indexOf(x) !== -1 || (q.other && /^기타\s*:/.test(x))) return;
        throw new Error('"' + q.label + '" 에 없는 항목입니다: ' + x.slice(0, 30));
      });
    });
    return f;
  }
  var changed = false;
  var qs = (f.questions || []).map(function (q) {
    if (q.type !== 'choice' && q.type !== 'checks') return q;
    var v = answers[q.id], picks = Array.isArray(v) ? v : (v ? [v] : []);
    var opts = (q.opts || []).slice(), add = [];
    picks.forEach(function (x) {
      x = String(x || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!x || /^기타\s*:/.test(x) || opts.indexOf(x) !== -1 || add.indexOf(x) !== -1) return;
      add.push(x);
    });
    if (!add.length) return q;
    if (opts.length + add.length > 설문추가한도6_) throw new Error('"' + q.label + '" 의 선택지가 너무 많습니다 (최대 ' + 설문추가한도6_ + '개).');
    changed = true;
    var nq = Object.assign({}, q, { opts: opts.concat(add) });
    nq.added = (q.added || []).concat(add.map(function (x) { return { t: x, by: whoName }; })).slice(-설문추가한도6_);
    return nq;
  });
  if (!changed) return f;
  신청서본문고치기6_(f.id, function (body) { body.questions = qs; });
  return Object.assign({}, f, { questions: qs });
}

/** 신청서 본문 JSON 을 읽어 고쳐 다시 저장합니다 (다른 값은 그대로) */
function 신청서본문고치기6_(id, fix) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 신청서시트_(), v = sh.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][FM_ID]).trim() !== id) continue;
      var parts = [];
      for (var i = FM_내용; i < v[r].length; i++) { var s = String(v[r][i] == null ? '' : v[r][i]); if (s.charAt(0) === "'") s = s.slice(1); parts.push(s); }
      var body = {};
      try { body = JSON.parse(parts.join('')) || {}; } catch (e) { throw new Error('신청서 내용을 읽지 못했습니다.'); }
      fix(body);
      var json = JSON.stringify(body);
      if (json.length > 신청서조각 * 6) throw new Error('신청서 내용이 너무 깁니다.');
      var out = [];
      for (var k = 0; k < json.length; k += 신청서조각) out.push("'" + json.slice(k, k + 신청서조각));
      var width = Math.max(v[r].length - FM_내용, out.length);
      while (out.length < width) out.push('');
      sh.getRange(r + 1, FM_내용 + 1, 1, out.length).setValues([out]);
      break;
    }
  } finally { lock.releaseLock(); }
  캐시비움_();
}

/* ---------------------------------------------------------------- 화면이 부르는 함수 */

/** 참여자용 결과 (카카오톡 투표처럼 막대 · 퍼센트 · 익명이 아니면 누가 골랐는지) */
function surveyResults(token, id) {
  var who = 폼신청자_(token);
  var f = 신청서찾기_(id);
  if (!f || f.kind !== 'survey') throw new Error('없는 투표입니다.');
  if (f.status === '준비중') throw new Error('아직 열리지 않은 투표입니다.');
  if (!폼대상인가6_(f, who)) throw new Error('이 투표의 대상이 아닙니다.');
  var cfg = f.survey || {};
  var mine = 내답_(f.id, who.name, who.email);
  if (cfg.results === 'hidden') throw new Error('이 투표의 결과는 만든 사람만 봅니다.');
  if (cfg.results !== 'always' && !mine && 신청받는중_(f)) throw new Error('참여한 뒤에 결과를 볼 수 있습니다.');
  var rows = 답행들_(f.id).filter(function (a) { return a.status !== '취소'; });
  var stats = 결과집계2_(f, rows);
  var voters = {};
  if (!cfg.anonymous) {
    (f.questions || []).forEach(function (q) {
      if (q.type !== 'choice' && q.type !== 'checks') return;
      var m = {};
      rows.forEach(function (a) { 고른것들2_(a.answers[q.id]).forEach(function (x) { var k = /^기타\s*:/.test(x) ? (String(q.otherLabel || '').trim() || 기타기본이름2_) : x; (m[k] = m[k] || []).push(a.name); }); });
      voters[q.id] = m;
    });
  }
  var st = 참여현황6_(f, 답행들_(f.id));
  return {
    form: { id: f.id, title: f.title, questions: (f.questions || []).map(function (q) { return { id: q.id, type: q.type, label: q.label, opts: q.opts, other: q.other, otherLabel: q.otherLabel, scale: q.scale }; }), closeAt: f.closeAt },
    stats: stats, count: rows.length, voters: voters, anonymous: !!cfg.anonymous,
    mine: mine ? { answers: mine.answers } : null, open: 신청받는중_(f),
    total: st ? st.total : null
  };
}

/** 아직 참여하지 않은 대상에게 다시 알림 (만든 사람 · 커미티) */
function surveyRemind(token, id, opts) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('권한이 없습니다.');
  if (!신청받는중_(f)) throw new Error('받는 중인 설문 · 신청서만 다시 알릴 수 있습니다.');
  var st = 참여현황6_(f, 답행들_(f.id));
  if (!st) throw new Error('대상을 정한 설문 · 신청서만 "아직 안 한 분"을 찾을 수 있습니다. 대상을 먼저 정해주세요.');
  var done = {};
  답행들_(f.id).forEach(function (a) { if (a.status !== '취소') done[a.name] = 1; });
  var pending = (폼대상사람들6_(f) || []).filter(function (n) { return !done[n]; });
  if (!pending.length) return { sent: 0, pending: 0 };
  opts = opts || {};
  var survey = f.kind === 'survey';
  var msg = { title: (survey ? '[투표] ' : '[신청] ') + f.title, body: '아직 ' + (survey ? '참여' : '신청') + '하지 않으셨어요.' + (f.closeAt ? ' ' + f.closeAt + ' 까지' : ''),
    url: 앱주소_() + '?page=portal&form=' + encodeURIComponent(f.id), tag: 'form-remind-' + f.id };
  var p = 알림_('공지', pending, msg);
  var mail = 0;
  if (opts.mail) {
    try { var to = 이름메일_(pending); if (to.length) { MailApp.sendEmail({ to: to.join(','), name: '토론토영락교회 청년1부', subject: msg.title, htmlBody: 알림메일본문_(msg) }); mail = to.length; } } catch (e) {}
  }
  return { sent: (p && p.sent) || 0, pending: pending.length, mail: mail };
}

/** 관리 화면 — 고른 대상이 몇 명인지 미리 보기 */
function surveyAudience(token, keys) {
  var who = 신청서관리자_(token);
  var fake = 폼대상정리6_({ kind: 'form', audience: keys || [] }, who, null);
  if (!fake.audience.length) return { n: null, keys: [] };
  var r = 대상사람들3_(fake.audience);
  return { n: r === '*' ? null : (r || []).length, keys: fake.audience };
}

/** 설문 · 투표 본보기 (관리 화면 "만들기" 에 신청서 본보기와 함께) */
function 설문본보기6_() {
  var S = function (anon, results, add) { return { anonymous: !!anon, results: results || 'after', allowAdd: !!add }; };
  return [
    { key: 'vote', name: '간단 투표', icon: '🗳️', desc: '하나 고르기 · 결과 바로 보기 (카카오톡 투표처럼)',
      form: { title: '투표', kind: 'survey', survey: S(false, 'after', true), questions: [
        { type: 'choice', label: '하나를 골라주세요', req: true, opts: ['항목 1', '항목 2', '항목 3'] }] } },
    { key: 'date', name: '날짜 · 시간 정하기', icon: '📅', desc: '되는 날을 모두 고르기 · 가장 많은 날 확인',
      form: { title: '모임 날짜 정하기', kind: 'survey', survey: S(false, 'always', true), questions: [
        { type: 'checks', label: '가능한 날을 모두 골라주세요', req: true, opts: ['토요일 오전', '토요일 오후', '주일 예배 후', '평일 저녁'] },
        { type: 'text', label: '하고 싶은 말 (선택)' }] } },
    { key: 'yesno', name: '찬반 · 참석 여부', icon: '👍', desc: '찬성 / 반대 / 잘 모르겠음 — 익명',
      form: { title: '의견을 여쭙니다', kind: 'survey', survey: S(true, 'after', false), questions: [
        { type: 'choice', label: '어떻게 생각하시나요?', req: true, opts: ['찬성', '반대', '잘 모르겠음'] },
        { type: 'long', label: '의견이 있으면 적어주세요 (선택)' }] } },
    { key: 'satisfy', name: '만족도 조사', icon: '⭐', desc: '별점 · 좋았던 점 · 아쉬운 점 — 익명, 결과는 만든 사람만',
      form: { title: '만족도 조사', kind: 'survey', survey: S(true, 'hidden', false), questions: [
        { type: 'rating', label: '전체적으로 얼마나 만족하셨나요?', req: true, scale: 5, variant: 'star', lowLabel: '아쉬움', highLabel: '아주 좋음' },
        { type: 'long', label: '좋았던 점' }, { type: 'long', label: '아쉬웠던 점 · 바라는 점' }] } },
    { key: 'menu', name: '메뉴 · 장소 고르기', icon: '🍽️', desc: '여러 개 고르기 · 참여자가 항목 추가',
      form: { title: '메뉴 투표', kind: 'survey', survey: S(false, 'after', true), questions: [
        { type: 'checks', label: '먹고 싶은 메뉴를 모두 골라주세요', req: true, opts: ['한식', '중식', '양식', '분식'] }] } },
    { key: 'team', name: '우리 팀 설문', icon: '🙋', desc: '팀장님용 — 우리 팀만 · 연습 시간 · 의견',
      form: { title: '우리 팀 설문', kind: 'survey', survey: S(false, 'after', false), questions: [
        { type: 'checks', label: '연습에 올 수 있는 시간', req: true, opts: ['토요일 오전', '토요일 오후', '주일 예배 전', '주일 예배 후'] },
        { type: 'rating', label: '요즘 팀 분위기는?', scale: 5, variant: 'face' },
        { type: 'long', label: '팀장에게 하고 싶은 말 (선택)' }] } }
  ];
}
