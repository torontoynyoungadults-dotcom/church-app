/**
 * v6 — "다른 분 화면 보기"를 그분과 똑같이 (교인 · 새가족)
 * ============================================================
 * 예전: 그분의 로그인 표(토큰)를 만들 수 있을 때만(교인은 교적 전화번호, 새가족은 이메일) 알림 · 신청서를 실어 보냈습니다.
 *       전화번호 · 이메일이 없는 분은 알림 · 신청서가 빈 화면이었습니다.
 * 이제: 표 없이도 "그분으로" 계산합니다 — 폼신청자_ 가 특별한 표(보기토큰6_)를 받으면 그분 정보를 돌려줍니다.
 *       이 표는 서버 안에서 한 번의 계산 동안만 쓰이고(요청이 끝나면 사라짐) 브라우저로 나가지 않습니다.
 * 또, 커미티가 그분 화면에서 신청서 · 투표를 눌러 "그분에게 보이는 그대로"(선택지 · 그분이 낸 답) 볼 수 있게 합니다 — 보기 전용.
 */
var 보기토큰6_ = '\u0000VIEW6';
var 보기대상6_ = null;

function 보기로계산6_(who, fn) {
  var before = 보기대상6_;
  보기대상6_ = who;
  try { return fn(보기토큰6_); } finally { 보기대상6_ = before; }
}

function 보기교인6_(me, name) {
  var cell = '';
  rows_(SHEET_셀원명단).forEach(function (x) { if (!cell && String(x[1]).trim() === name) cell = String(x[0]).trim(); });
  return { kind: 'member', name: name, email: String((me && me.email) || ''), phone: String((me && me.phone) || ''),
    gender: (me && me.gender) || '', birthday: (me && me.birthday) || '', cell: cell };
}

function 보기새가족6_(nf) {
  return { kind: 'newcomer', name: nf.name, email: String(nf.email || ''), phone: String(nf.phone || nf.contact || ''),
    gender: nf.gender || '', birthday: nf.birthday || '', cell: '새가족', nf: nf };
}

/** 알림 · 신청서 · 셀 신청 · 뱃지를 그분으로 계산해 out 에 채웁니다 */
function 보기자료채우기6_(out, who) {
  보기로계산6_(who, function (T) {
    var todos = [];
    try { todos = 내할일_(T); } catch (e) { todos = []; }
    todos.forEach(function (t) { if (t.url) t.url = String(t.url).replace(encodeURIComponent(T), '').replace(T, ''); });   // 보기용 표는 링크에 남기지 않음
    out.todos = todos;
    try { out.forms = myForms(T); } catch (e) { out.forms = { list: [] }; }
    try { out.badges = 포털뱃지_(todos); } catch (e) {}
    try {
      out.cellApp = who.kind === 'newcomer'
        ? 셀신청상태_({ kind: 'newcomer', nf: who.nf, email: who.email, name: who.name, allowed: 새가족셀허용_(who.email, who.name), committee: false })
        : 셀신청상태_({ kind: 'member', name: who.name, email: who.email, committee: false, allowed: 셀신청열림_() || 새가족셀허용_(who.email, who.name) });
    } catch (e) {}
    try { out.myCell = 내셀_(who.name); } catch (e) {}
  });
  return out;
}

/** 커미티 — 그분 화면에서 신청서 · 투표를 눌렀을 때: 그분에게 보이는 그대로 (보기 전용) */
function formOpenAs(token, name, kind, id) {
  var me = requirePortal_(token);
  if (포털역할_(me.name).roles.indexOf('커미티') === -1) throw new Error('커미티만 볼 수 있습니다.');
  name = String(name || '').trim();
  var who;
  if (kind === 'newcomer') {
    var nf = 새가족하나_(name);
    if (!nf) throw new Error(name + ' — 새가족 명단에서 찾지 못했습니다.');
    who = 보기새가족6_(nf);
  } else {
    var m = 교적맵_()[name];
    if (!m) throw new Error(name + ' — 교적에서 찾지 못했습니다.');
    who = 보기교인6_(m, name);
  }
  var r = 보기로계산6_(who, function (T) { return formOpen(T, id); });
  r.viewOnly = true;
  r.viewAs = name;
  return r;
}
