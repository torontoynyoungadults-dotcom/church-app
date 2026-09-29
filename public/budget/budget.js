/**
 * 행사 예산 · 정산 화면 (views/Budget.html)
 * 서버 함수: budgetInit · budgetGetEvent · budgetSaveEvent · budgetSaveLine · budgetSaveTx · budgetDeleteTx · budgetSettle · budgetReopen
 *           budgetTemplateData · budgetImportPreview · budgetImportApply · budgetPullReimbursements · budgetReportPdf · budgetReportHtml
 *           acctAccessList · acctAccessSave · acctAccessDelete · budgetHistory      (logic/eventbudget.js · eventbudget-io.js)
 * 이 화면은 버튼을 숨기기만 합니다 — 실제 권한 확인은 서버가 요청마다 다시 합니다.
 */
(function () {
  'use strict';
  var PREFILL = window.__PREFILL__ || {};
  var $ = function (id) { return document.getElementById(id); };
  var S = { init: null, ev: null, tab: 'lines', busy: 0, accessCache: null };
  var KEY = '';

  /* ---------------------------------------------------------------- 도구 */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    var p = Math.abs(n).toFixed(2).split('.');
    return (n < 0 ? '-' : '') + '$' + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + p[1];
  }
  function signed(n) { n = Math.round((Number(n) || 0) * 100) / 100; return (n > 0 ? '+' : '') + money(n); }
  function cls(n) { return n > 0 ? 'bd-pos' : (n < 0 ? 'bd-neg' : ''); }
  function toast(msg, isErr) {
    var t = $('toast'); t.textContent = msg; t.className = 'bd-toast on' + (isErr ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = 'bd-toast'; }, isErr ? 6000 : 2600);
  }
  function api(name, args) {
    return new Promise(function (resolve, reject) {
      callServer(name, args, resolve, function (e) { reject(e instanceof Error ? e : new Error((e && e.message) || String(e || '처리하지 못했습니다.'))); });
    });
  }
  function fail(e) { toast((e && e.message) || '처리하지 못했습니다.', true); }
  function findKey() {
    if (PREFILL.key) return PREFILL.key;
    if (PREFILL.t) return PREFILL.t;
    try { var q = new URLSearchParams(location.search).get('t'); if (q) return q; } catch (e) {}
    try { var s = sessionStorage.getItem('ynPortalToken'); if (s) return s; } catch (e) {}
    try { var k = JSON.parse(localStorage.getItem('ynPortalKeep') || 'null'); if (k && k.t && k.until > Date.now()) return k.t; } catch (e) {}
    return '';
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function b64ToBlob(b64, mime) {
    var bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function loadScript(src, ready) {
    return new Promise(function (resolve, reject) {
      if (ready()) return resolve();
      var s = document.createElement('script'); s.src = src; s.onload = function () { ready() ? resolve() : reject(new Error('스크립트를 불러오지 못했습니다.')); };
      s.onerror = function () { reject(new Error('스크립트를 불러오지 못했습니다: ' + src)); }; document.head.appendChild(s);
    });
  }
  var LV = ['', '조회', '입력', '정산', '관리'];
  function lvChip(l) { return '<span class="bd-chip lv' + l + '">' + esc(LV[l] || '없음') + ' 권한</span>'; }
  function stBadge(s) { return '<span class="bd-badge s' + ({ '예산작성': 0, '진행중': 1, '정산완료': 2 }[s] || 0) + '">' + esc(s) + '</span>'; }
  function bar(actual, budget) {
    var rate = budget > 0 ? actual / budget : (actual > 0 ? 2 : 0), over = budget > 0 ? actual > budget : actual > 0;
    return '<div class="bd-bar' + (over ? ' over' : (budget > 0 && rate >= .999 ? ' ok' : '')) + '"><i style="width:' + Math.min(100, Math.round(rate * 100)) + '%"></i></div>';
  }
  function today() { return (S.init && S.init.today) || new Date().toISOString().slice(0, 10); }

  /* ---------------------------------------------------------------- 모달 */
  function openModal(html) { $('modalBody').innerHTML = html; $('modal').className = 'bd-modal on'; var f = $('modalBody').querySelector('input,select,textarea'); if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30); }
  function closeModal() { $('modal').className = 'bd-modal'; $('modalBody').innerHTML = ''; }
  $('modal').addEventListener('mousedown', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------------------------------------------------------------- 시작 */
  function boot() {
    KEY = findKey();
    $('btnBack').onclick = function () { if (S.ev) showList(); else location.href = (PREFILL._home || '/?page=portal'); };
    if (!KEY) { $('evGrid').innerHTML = '<div class="bd-empty" style="grid-column:1/-1;">로그인이 필요합니다. 포털에서 다시 들어와 주세요.</div>'; return; }
    if (PREFILL.init) return start(PREFILL.init);
    if (PREFILL.err) { showDenied(PREFILL.err); return; }
    api('budgetInit', [KEY]).then(start, function (e) { showDenied(e.message); });
  }
  function showDenied(msg) {
    $('evGrid').innerHTML = '<div class="bd-card" style="grid-column:1/-1;"><h2>들어갈 수 없습니다</h2><p class="bd-sub">' + esc(msg || '회계 권한이 없습니다.') +
      '</p><p class="bd-sub">회계 권한이 필요하면 커미티 또는 회계팀에 요청해주세요.</p></div>';
  }
  function start(init) {
    S.init = init;
    var me = init.me || {};
    $('meChip').style.display = ''; $('meChip').textContent = (me.name || '') + (me.full ? ' · 전체 관리' : '');
    $('btnNewEvent').style.display = me.canCreate ? '' : 'none';
    $('fltStatus').innerHTML = '<option value="">모든 상태</option>' + init.statuses.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var years = {}; init.events.forEach(function (e) { years[e.year] = 1; });
    var ys = Object.keys(years).sort().reverse();
    $('fltYear').innerHTML = '<option value="">모든 연도</option>' + ys.map(function (y) { return '<option>' + esc(y) + '</option>'; }).join('');
    ['fltYear', 'fltStatus'].forEach(function (id) { $(id).onchange = renderList; });
    $('fltText').oninput = renderList;
    $('btnNewEvent').onclick = function () { eventForm(null); };
    renderList();
    var h = (location.hash || '').replace('#', '');
    if (h && init.events.some(function (e) { return e.id === h; })) openEvent(h);
  }
  window.addEventListener('popstate', function () {
    var h = (location.hash || '').replace('#', '');
    if (h && S.init) openEvent(h, true); else showList(true);
  });

  /* ---------------------------------------------------------------- 목록 */
  function renderList() {
    var y = $('fltYear').value, st = $('fltStatus').value, q = $('fltText').value.trim().toLowerCase();
    var list = S.init.events.filter(function (e) { return (!y || e.year === y) && (!st || e.status === st) && (!q || e.name.toLowerCase().indexOf(q) !== -1); });
    if (!list.length) {
      $('evGrid').innerHTML = '<div class="bd-empty" style="grid-column:1/-1;">' + (S.init.events.length ? '조건에 맞는 행사가 없습니다.' : '볼 수 있는 행사가 아직 없습니다.' + (S.init.me.canCreate ? ' 오른쪽 위 [＋ 새 행사]로 시작하세요.' : '')) + '</div>';
      return;
    }
    $('evGrid').innerHTML = list.map(function (e) {
      var t = e.totals;
      return '<button type="button" class="bd-ev" data-act="open" data-id="' + esc(e.id) + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div class="nm">' + esc(e.name) + '</div>' + stBadge(e.status) + '</div>' +
        '<div class="mt">' + esc(e.year) + '년' + (e.dept ? ' · ' + esc(e.dept) : '') + (e.owner ? ' · 담당 ' + esc(e.owner) : '') + ' · ' + lvChip(e.level) + '</div>' +
        bar(t.actualExpense, t.budgetExpense) +
        '<div class="bd-nums"><span>지출 <b>' + money(t.actualExpense) + '</b> / ' + money(t.budgetExpense) + '</span><span>' + (t.expenseRate == null ? '—' : t.expenseRate + '%') + '</span></div>' +
        '<div class="bd-nums"><span>순손익 <b class="' + cls(t.actualNet) + '">' + signed(t.actualNet) + '</b></span><span>' + e.txCount + '건' + (e.unassignedCount ? ' · <span class="bd-warn">미분류 ' + e.unassignedCount + '</span>' : '') + '</span></div>' +
        '</button>';
    }).join('');
  }
  function showList(fromPop) {
    S.ev = null; $('viewEvent').style.display = 'none'; $('viewList').style.display = '';
    $('topSub').textContent = ''; if (!fromPop && location.hash) history.pushState(null, '', location.pathname + location.search);
    api('budgetInit', [KEY]).then(function (i) { S.init.events = i.events; S.init.me = i.me; renderList(); }, function () {});
  }

  /* ---------------------------------------------------------------- 행사 상세 */
  function openEvent(id, fromPop) {
    api('budgetGetEvent', [KEY, id]).then(function (d) {
      S.ev = d; S.tab = S.tab || 'lines';
      $('viewList').style.display = 'none'; $('viewEvent').style.display = '';
      if (!fromPop && location.hash !== '#' + id) history.pushState(null, '', location.pathname + location.search + '#' + id);
      renderEvent(); window.scrollTo(0, 0);
    }, fail);
  }
  function reload(msg) {
    return api('budgetGetEvent', [KEY, S.ev.event.id]).then(function (d) { S.ev = d; renderEvent(); if (msg) toast(msg); }, fail);
  }
  function apply(d, msg) { S.ev = d; renderEvent(); if (msg) toast(msg); }

  function renderEvent() {
    var d = S.ev, e = d.event, t = d.totals, can = d.can;
    $('topSub').textContent = e.name;
    $('evHead').innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;">' +
        '<div><div style="font-size:21px;font-weight:850;letter-spacing:-.02em;">' + esc(e.name) + ' ' + stBadge(e.status) + '</div>' +
        '<div class="bd-sub" style="margin-top:4px;">' + esc(e.id) + ' · ' + esc(e.year) + '년' + (e.dept ? ' · ' + esc(e.dept) : '') + (e.owner ? ' · 담당 ' + esc(e.owner) : '') +
        (e.start ? ' · ' + esc(e.start) + (e.end && e.end !== e.start ? ' ~ ' + esc(e.end) : '') : '') + ' · ' + lvChip(d.level) + '</div>' +
        (e.memo ? '<div class="bd-sub bd-dim" style="margin-top:4px;">' + esc(e.memo) + '</div>' : '') + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          '<button class="bd-b sm" data-act="xlsx-down" type="button">⤓ 엑셀 내려받기</button>' +
          (d.level >= 2 ? '<button class="bd-b sm" data-act="xlsx-up" type="button">⤒ 엑셀 올리기</button>' : '') +
          '<button class="bd-b sm" data-act="pdf" data-kind="budget" type="button">PDF 예산서</button>' +
          '<button class="bd-b sm" data-act="pdf" data-kind="transactions" type="button">PDF 거래내역</button>' +
          '<button class="bd-b sm" data-act="pdf" data-kind="settlement" type="button">PDF 정산서</button>' +
          (can.manage ? '<button class="bd-b sm" data-act="edit-event" type="button">행사 정보</button>' : '') +
        '</div></div><p class="bd-msg" id="headMsg"></p>';
    $('evTiles').innerHTML =
      tile('지출 예산', money(t.budgetExpense)) + tile('실지출', money(t.actualExpense), t.overBudget ? 'neg' : '') +
      tile('지출 잔액', signed(t.expenseRemaining), cls(t.expenseRemaining) === 'bd-pos' ? 'pos' : (t.expenseRemaining < 0 ? 'neg' : '')) +
      tile('수입 (실적/예산)', money(t.actualIncome) + ' / ' + money(t.budgetIncome)) +
      tile('순손익', signed(t.actualNet), t.actualNet > 0 ? 'pos' : (t.actualNet < 0 ? 'neg' : ''));
    var tabs = [['lines', '예산'], ['tx', '거래 ' + d.transactions.length], ['settle', '정산'], ['history', '이력']];
    if (can.access) tabs.push(['access', '접근 권한']);
    $('evTabs').innerHTML = tabs.map(function (x) { return '<button type="button" role="tab" class="bd-tab' + (S.tab === x[0] ? ' on' : '') + '" data-act="tab" data-tab="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('');
    renderTab();
  }
  function tile(k, v, c) { return '<div class="bd-tile"><div class="k">' + esc(k) + '</div><div class="v ' + (c || '') + '">' + v + '</div></div>'; }

  function renderTab() {
    var f = { lines: tabLines, tx: tabTx, settle: tabSettle, history: tabHistory, access: tabAccess }[S.tab] || tabLines;
    f();
  }

  /* -- 예산 탭 -- */
  function tabLines() {
    var d = S.ev, can = d.can;
    var part = function (kind) {
      var ls = d.lines.filter(function (l) { return l.kind === kind; });
      var sumB = 0, sumA = 0; ls.forEach(function (l) { sumB += l.budget; sumA += l.actual; });
      return '<tr class="grp"><td colspan="6">' + esc(kind) + ' 예산</td></tr>' + (ls.length ? ls.map(function (l) {
        return '<tr><td>' + esc(l.category) + '</td><td><b>' + esc(l.name) + '</b>' + (l.memo ? '<div class="bd-dim" style="font-size:12px;">' + esc(l.memo) + '</div>' : '') + '</td>' +
          '<td class="r">' + money(l.budget) + '</td><td class="r">' + money(l.actual) + '</td>' +
          '<td class="r ' + (l.kind === '지출' ? cls(l.diff) : cls(l.diff)) + '">' + signed(l.diff) + '</td>' +
          '<td style="min-width:110px;">' + bar(l.actual, l.budget) + '<div class="bd-dim" style="font-size:11.5px;text-align:right;">' + (l.rate == null ? '—' : l.rate + '%') + ' · ' + l.count + '건' +
          (can.manage ? ' <button class="bd-b sm" data-act="edit-line" data-id="' + esc(l.id) + '" type="button">수정</button>' : '') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="6" class="bd-dim">항목이 없습니다.</td></tr>') +
        '<tr class="tot"><td></td><td>합계</td><td class="r">' + money(sumB) + '</td><td class="r">' + money(sumA) + '</td><td class="r">' + signed(kind === '지출' ? sumB - sumA : sumA - sumB) + '</td><td></td></tr>';
    };
    var un = d.unassigned;
    $('tabBody').innerHTML = '<div class="bd-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h2 style="margin:0;">예산 대 실적</h2>' +
      (can.manage ? '<button class="bd-b pri sm" data-act="add-line" type="button">＋ 예산 항목</button>' : '') + '</div>' +
      '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>분류</th><th>항목</th><th class="r">예산</th><th class="r">실적</th><th class="r">차이</th><th>집행</th></tr></thead><tbody>' +
      part('지출') + part('수입') +
      (un.count ? '<tr><td></td><td class="bd-warn"><b>(미분류)</b> 항목이 연결되지 않은 거래 ' + un.count + '건</td><td class="r">—</td><td class="r">' + money(un.expense + un.income) + '</td><td></td><td></td></tr>' : '') +
      '</tbody></table></div>' + (!d.lines.length ? '<div class="bd-empty">' + (can.manage ? '[＋ 예산 항목]으로 예산을 적거나, 엑셀로 한 번에 올릴 수 있습니다.' : '아직 예산 항목이 없습니다.') + '</div>' : '') + '</div>';
  }

  /* -- 거래 탭 -- */
  function tabTx() {
    var d = S.ev, can = d.can, nameOf = {};
    d.lines.forEach(function (l) { nameOf[l.id] = l.name; });
    var fl = S.txFilter || '', rows = d.transactions.filter(function (t) { return !fl || (fl === '_none' ? !nameOf[t.lineId] : t.lineId === fl); });
    var run = 0, sum = 0;
    rows.forEach(function (t) { sum += t.kind === '지출' ? -t.amount : t.amount; });
    $('tabBody').innerHTML = '<div class="bd-card"><div class="bd-tools" style="margin-bottom:10px;">' +
      '<h2 style="margin:0;">거래 내역</h2><span class="sp"></span>' +
      '<select id="txFilter" aria-label="항목 필터"><option value="">모든 항목</option>' + d.lines.map(function (l) { return '<option value="' + esc(l.id) + '"' + (fl === l.id ? ' selected' : '') + '>' + esc(l.kind) + ' · ' + esc(l.name) + '</option>'; }).join('') +
      '<option value="_none"' + (fl === '_none' ? ' selected' : '') + '>(미분류)</option></select>' +
      (can.edit ? '<button class="bd-b sm" data-act="pull" type="button">환급신청서 가져오기</button><button class="bd-b pri sm" data-act="add-tx" type="button">＋ 거래</button>' : '') + '</div>' +
      '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>날짜</th><th>구분</th><th>예산 항목</th><th>내용</th><th class="r">금액</th><th class="r">누계</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (t) {
        run += t.kind === '지출' ? -t.amount : t.amount;
        return '<tr><td style="white-space:nowrap;">' + esc(t.date) + '</td><td class="' + (t.kind === '수입' ? 'bd-pos' : '') + '">' + esc(t.kind) + '</td>' +
          '<td>' + (nameOf[t.lineId] ? esc(nameOf[t.lineId]) : '<span class="bd-warn">(미분류)</span>') + '</td>' +
          '<td>' + esc(t.detail) + '<div class="bd-dim" style="font-size:12px;">' + esc([t.method, t.note, t.expNo, t.by].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="r">' + (t.kind === '수입' ? '+' : '-') + money(t.amount) + '</td><td class="r bd-dim">' + signed(run) + '</td>' +
          '<td>' + (can.edit ? '<button class="bd-b sm" data-act="edit-tx" data-id="' + esc(t.id) + '" type="button">수정</button>' : '') + '</td></tr>';
      }).join('') + '<tr class="tot"><td colspan="4">' + (fl ? '필터 합계' : '합계') + ' (수입 − 지출)</td><td class="r ' + cls(sum) + '">' + signed(sum) + '</td><td colspan="2"></td></tr>'
        : '<tr><td colspan="7" class="bd-empty">거래가 없습니다.</td></tr>') + '</tbody></table></div></div>';
    $('txFilter').onchange = function () { S.txFilter = this.value; tabTx(); };
  }

  /* -- 정산 탭 -- */
  function tabSettle() {
    var d = S.ev, e = d.event, t = d.totals, can = d.can, un = d.unassigned;
    var rows = d.lines.map(function (l) {
      return '<tr><td>' + esc(l.kind) + '</td><td>' + esc(l.name) + '</td><td class="r">' + money(l.budget) + '</td><td class="r">' + money(l.actual) + '</td><td class="r ' + cls(l.diff) + '">' + signed(l.diff) + '</td><td class="r">' + (l.rate == null ? '—' : l.rate + '%') + '</td></tr>';
    }).join('');
    var last = d.settlements.length ? d.settlements[d.settlements.length - 1] : null;
    $('tabBody').innerHTML = '<div class="bd-card"><h2>' + (e.status === '정산완료' ? '정산 확정됨' : '정산 (가정산 — 아직 확정 전)') + '</h2>' +
      (e.status === '정산완료' ? '<p class="bd-sub">' + esc(e.settledAt) + ' · ' + esc(e.settledBy) + (e.settleMemo ? ' · ' + esc(e.settleMemo) : '') + '</p>' : '') +
      '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>구분</th><th>항목</th><th class="r">예산</th><th class="r">실적</th><th class="r">차이</th><th class="r">집행률</th></tr></thead><tbody>' + rows +
      (un.count ? '<tr><td></td><td class="bd-warn">(미분류) ' + un.count + '건</td><td></td><td class="r">' + money(un.expense + un.income) + '</td><td></td><td></td></tr>' : '') +
      '<tr class="tot"><td colspan="2">지출</td><td class="r">' + money(t.budgetExpense) + '</td><td class="r">' + money(t.actualExpense) + '</td><td class="r ' + cls(t.expenseRemaining) + '">' + signed(t.expenseRemaining) + '</td><td></td></tr>' +
      '<tr class="tot"><td colspan="2">수입</td><td class="r">' + money(t.budgetIncome) + '</td><td class="r">' + money(t.actualIncome) + '</td><td></td><td></td></tr>' +
      '<tr class="tot"><td colspan="3">최종 순손익 (실수입 − 실지출)</td><td class="r ' + cls(t.actualNet) + '" colspan="3" style="text-align:right;">' + signed(t.actualNet) + '</td></tr></tbody></table></div>' +
      (e.status !== '정산완료' && can.settle ? '<div style="margin-top:14px;"><div class="bd-f"><label for="stMemo">정산 메모</label><textarea id="stMemo" rows="2" maxlength="300" placeholder="예: 잔액은 청년부 통장으로 이월"></textarea></div>' +
        (un.count ? '<label class="bd-chk"><input type="checkbox" id="stUn"> 미분류 거래 ' + un.count + '건이 있어도 그대로 정산합니다</label>' : '') +
        '<div class="bd-actions" style="justify-content:flex-start;"><button class="bd-b pri" data-act="settle" type="button">정산 확정</button></div>' +
        '<p class="bd-sub bd-dim">확정하면 그 순간의 예산 · 실적이 기록으로 남고 거래 · 예산 수정이 잠깁니다. 필요하면 정산 권한자가 다시 열 수 있습니다.</p></div>' : '') +
      (e.status === '정산완료' && can.reopen ? '<div class="bd-actions" style="justify-content:flex-start;"><button class="bd-b bad" data-act="reopen" type="button">정산 다시 열기</button></div>' : '') +
      (e.status !== '정산완료' && !can.settle ? '<p class="bd-sub bd-dim">정산 확정은 회계 "정산" 이상 권한이 필요합니다.</p>' : '') + '</div>' +
      '<div class="bd-card"><h2>정산 기록</h2>' + (d.settlements.length ? '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>번호</th><th>확정 시각</th><th>확정자</th><th class="r">실지출</th><th class="r">순손익</th><th>메모</th></tr></thead><tbody>' +
        d.settlements.slice().reverse().map(function (s) { return '<tr><td>' + esc(s.no) + '</td><td>' + esc(s.at) + '</td><td>' + esc(s.by) + '</td><td class="r">' + money(s.actualExpense) + '</td><td class="r ' + cls(s.net) + '">' + signed(s.net) + '</td><td>' + esc(s.memo) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="bd-empty">확정된 정산이 아직 없습니다.</div>') + '</div>';
  }

  /* -- 이력 탭 -- */
  function tabHistory() {
    $('tabBody').innerHTML = '<div class="bd-card"><h2>변경 이력</h2><div class="bd-empty">불러오는 중…</div></div>';
    api('budgetHistory', [KEY, S.ev.event.id]).then(function (h) {
      $('tabBody').innerHTML = '<div class="bd-card"><h2>변경 이력</h2>' + (h.length ? '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>시각</th><th>사람</th><th>동작</th><th>내용</th></tr></thead><tbody>' +
        h.map(function (x) { return '<tr><td style="white-space:nowrap;">' + esc(x.at) + '</td><td>' + esc(x.by) + '</td><td>' + esc(x.action) + '</td><td class="bd-dim">' + esc(x.text) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="bd-empty">기록이 없습니다.</div>') + '</div>';
    }, fail);
  }

  /* -- 접근 권한 탭 -- */
  function tabAccess() {
    $('tabBody').innerHTML = '<div class="bd-card"><h2>접근 권한</h2><div class="bd-empty">불러오는 중…</div></div>';
    api('acctAccessList', [KEY, S.ev.event.id]).then(function (a) { S.accessCache = a; drawAccess(a); }, fail);
  }
  function drawAccess(a) {
    var full = S.init.me.full, eid = S.ev.event.id;
    var lv = ['조회', '입력', '정산', '관리', '차단'];
    $('tabBody').innerHTML = '<div class="bd-card"><h2>이 행사의 접근 권한</h2>' +
      '<p class="bd-sub">사람마다 등급을 정합니다. <b>조회</b> 보기·내려받기 / <b>입력</b> 거래 기록·엑셀 올리기 / <b>정산</b> 정산 확정·다시 열기 / <b>관리</b> 예산 항목·행사 정보·접근 권한. <b>차단</b>은 다른 권한보다 우선합니다.' +
      ' 관리자키 · 회계팀 키를 가진 분은 언제나 모든 행사의 관리 권한입니다. 기본으로 커미티 · 회계팀 역할은 "조회"만 됩니다.</p>' +
      '<div class="bd-scroll"><table class="bd-table"><thead><tr><th>이름</th><th>범위</th><th>등급</th><th>만료일</th><th>메모</th><th></th></tr></thead><tbody>' +
      (a.rows.length ? a.rows.map(function (r) {
        var locked = r.global && !full;
        return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + (r.global ? '<span class="bd-chip">모든 행사</span>' : '이 행사') + '</td><td>' +
          '<select data-act="acc-level" data-name="' + esc(r.name) + '" data-eid="' + esc(r.eventId) + '" data-until="' + esc(r.until) + '" data-memo="' + esc(r.memo) + '"' + (locked ? ' disabled' : '') + ' aria-label="' + esc(r.name) + ' 등급">' +
          lv.map(function (l) { return '<option' + (l === r.level ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></td>' +
          '<td>' + esc(r.until || '—') + '</td><td class="bd-dim">' + esc(r.memo) + '</td><td>' +
          (locked ? '' : '<button class="bd-b bad sm" data-act="acc-del" data-name="' + esc(r.name) + '" data-eid="' + esc(r.eventId) + '" type="button">빼기</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="bd-empty">개인 권한이 아직 없습니다. 아래에서 추가하세요.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="bd-card"><h2>사람 추가 · 등급 바꾸기</h2>' +
      '<div class="bd-row2"><div class="bd-f"><label for="acName">이름 (교적)<em>*</em></label><input type="text" id="acName" list="acPeople" autocomplete="off" placeholder="홍길동"><datalist id="acPeople">' +
      a.people.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist></div>' +
      '<div class="bd-f"><label for="acLevel">등급<em>*</em></label><select id="acLevel">' + lv.map(function (l) { return '<option' + (l === '입력' ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="bd-row2"><div class="bd-f"><label for="acUntil">만료일 (선택)</label><input type="date" id="acUntil"></div>' +
      '<div class="bd-f"><label for="acMemo">메모 (선택)</label><input type="text" id="acMemo" maxlength="200" placeholder="예: 재정팀장"></div></div>' +
      (full ? '<label class="bd-chk"><input type="checkbox" id="acAll"> 이 사람에게 <b>모든 행사</b>에 같은 등급을 줍니다</label>' : '') +
      '<div class="bd-actions" style="justify-content:flex-start;"><button class="bd-b pri" data-act="acc-add" type="button">저장</button></div><p class="bd-msg" id="acMsg"></p></div>';
  }

  /* ---------------------------------------------------------------- 폼 */
  function eventForm(ev) {
    var e = ev || {};
    var depts = (S.init.depts || []).map(function (x) { return '<option' + (x === e.dept ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    openModal('<h3>' + (ev ? '행사 정보' : '새 행사') + '</h3>' +
      '<div class="bd-f"><label for="efName">행사 이름<em>*</em></label><input type="text" id="efName" maxlength="80" value="' + esc(e.name) + '" placeholder="예: 2026 가을 수련회"></div>' +
      '<div class="bd-row2"><div class="bd-f"><label for="efYear">연도<em>*</em></label><input type="text" id="efYear" maxlength="4" value="' + esc(e.year || String(new Date().getFullYear())) + '"></div>' +
      '<div class="bd-f"><label for="efDept">부서 / 팀</label><select id="efDept"><option value="">선택 안 함</option>' + depts + '</select></div></div>' +
      '<div class="bd-row2"><div class="bd-f"><label for="efStart">시작일</label><input type="date" id="efStart" value="' + esc(e.start) + '"></div><div class="bd-f"><label for="efEnd">종료일</label><input type="date" id="efEnd" value="' + esc(e.end) + '"></div></div>' +
      '<div class="bd-f"><label for="efOwner">담당자 (교적 이름)</label><input type="text" id="efOwner" maxlength="40" value="' + esc(e.owner) + '"></div>' +
      '<div class="bd-f"><label for="efMemo">메모</label><textarea id="efMemo" rows="2" maxlength="500">' + esc(e.memo) + '</textarea></div><p class="bd-msg err" id="mMsg"></p>' +
      '<div class="bd-actions">' + (ev && S.ev.can.manage ? '<button class="bd-b bad" data-act="del-event" type="button" style="margin-right:auto;">행사 지우기</button>' : '') +
      '<button class="bd-b" data-act="close" type="button">취소</button><button class="bd-b pri" data-act="save-event" data-id="' + esc(e.id || '') + '" type="button">저장</button></div>');
  }
  function lineForm(l) {
    l = l || { kind: '지출' };
    var used = l.id && (S.ev.lines.filter(function (x) { return x.id === l.id; })[0] || {}).count;
    openModal('<h3>' + (l.id ? '예산 항목 수정' : '예산 항목 추가') + '</h3>' +
      '<div class="bd-row2"><div class="bd-f"><label for="lfKind">구분<em>*</em></label><select id="lfKind"><option' + (l.kind === '지출' ? ' selected' : '') + '>지출</option><option' + (l.kind === '수입' ? ' selected' : '') + '>수입</option></select></div>' +
      '<div class="bd-f"><label for="lfCat">분류</label><input type="text" id="lfCat" maxlength="40" value="' + esc(l.category) + '" placeholder="식비 · 숙박 · 교통…"></div></div>' +
      '<div class="bd-f"><label for="lfName">항목명<em>*</em></label><input type="text" id="lfName" maxlength="80" value="' + esc(l.name) + '"></div>' +
      '<div class="bd-f"><label for="lfAmt">예산액<em>*</em></label><input type="number" id="lfAmt" step="0.01" min="0" inputmode="decimal" value="' + esc(l.budget != null ? l.budget : '') + '"></div>' +
      '<div class="bd-f"><label for="lfMemo">메모</label><input type="text" id="lfMemo" maxlength="200" value="' + esc(l.memo) + '"></div><p class="bd-msg err" id="mMsg"></p>' +
      '<div class="bd-actions">' + (l.id ? '<button class="bd-b bad" data-act="del-line" data-id="' + esc(l.id) + '" type="button" style="margin-right:auto;">' + (used ? '지울 수 없음 (거래 ' + used + '건)' : '지우기') + '</button>' : '') +
      '<button class="bd-b" data-act="close" type="button">취소</button><button class="bd-b pri" data-act="save-line" data-id="' + esc(l.id || '') + '" type="button">저장</button></div>');
    if (l.id && used) $('modalBody').querySelector('[data-act="del-line"]').disabled = true;
  }
  function txForm(t) {
    t = t || { kind: '지출', date: today() };
    var d = S.ev;
    var opts = function (kind) { return d.lines.filter(function (l) { return l.kind === kind; }).map(function (l) { return '<option value="' + esc(l.id) + '"' + (t.lineId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join(''); };
    openModal('<h3>' + (t.id ? '거래 수정' : '거래 기록') + '</h3>' +
      '<div class="bd-row2"><div class="bd-f"><label for="tfDate">날짜<em>*</em></label><input type="date" id="tfDate" max="' + esc(today()) + '" value="' + esc(t.date) + '"></div>' +
      '<div class="bd-f"><label for="tfKind">구분<em>*</em></label><select id="tfKind"><option' + (t.kind === '지출' ? ' selected' : '') + '>지출</option><option' + (t.kind === '수입' ? ' selected' : '') + '>수입</option></select></div></div>' +
      '<div class="bd-f"><label for="tfLine">예산 항목</label><select id="tfLine"></select></div>' +
      '<div class="bd-f"><label for="tfDetail">내용<em>*</em></label><input type="text" id="tfDetail" maxlength="200" value="' + esc(t.detail) + '" placeholder="예: 점심 도시락"></div>' +
      '<div class="bd-row2"><div class="bd-f"><label for="tfAmt">금액<em>*</em></label><input type="number" id="tfAmt" step="0.01" min="0" inputmode="decimal" value="' + esc(t.amount != null ? t.amount : '') + '"></div>' +
      '<div class="bd-f"><label for="tfMethod">결제수단</label><select id="tfMethod"><option value=""></option>' + (S.init.methods || []).map(function (m) { return '<option' + (m === t.method ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="bd-f"><label for="tfNote">증빙 메모</label><input type="text" id="tfNote" maxlength="200" value="' + esc(t.note) + '" placeholder="영수증 번호 · 보관 위치 등"></div><p class="bd-msg err" id="mMsg"></p>' +
      '<div class="bd-actions">' + (t.id ? '<button class="bd-b bad" data-act="del-tx" data-id="' + esc(t.id) + '" type="button" style="margin-right:auto;">지우기</button>' : '') +
      '<button class="bd-b" data-act="close" type="button">취소</button><button class="bd-b pri" data-act="save-tx" data-id="' + esc(t.id || '') + '" type="button">저장</button></div>');
    var fill = function () {
      var k = $('tfKind').value, keep = t.lineId;
      $('tfLine').innerHTML = '<option value="">(미분류)</option>' + opts(k);
      if (keep && d.lines.some(function (l) { return l.id === keep && l.kind === k; })) $('tfLine').value = keep;
    };
    fill(); $('tfKind').onchange = function () { t.lineId = ''; fill(); };
  }
  function mMsg(m) { var x = $('mMsg'); if (x) x.textContent = m || ''; }
  function busyBtn(btn, on) { if (btn) { btn.disabled = !!on; } }

  /* ---------------------------------------------------------------- 엑셀 · PDF */
  function loadXLSX() { return loadScript('/vendor/xlsx.mini.min.js', function () { return !!window.XLSX; }); }

  function xlsxDown() {
    toast('엑셀 파일을 만드는 중…');
    Promise.all([loadXLSX(), api('budgetTemplateData', [KEY, S.ev.event.id])]).then(function (r) {
      var out = window.YNBudgetXlsx.build(window.XLSX, r[1]);
      var bytes = window.XLSX.write(out.wb, { type: 'array', bookType: 'xlsx' });
      saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), out.filename);
      toast('내려받았습니다: ' + out.filename);
    }).catch(fail);
  }

  var IMP = { payload: null, fileName: '' };
  function xlsxUp() { var f = $('fileXlsx'); f.value = ''; f.click(); }
  $('fileXlsx').addEventListener('change', function () { var f = $('fileXlsx'); if (f.files && f.files[0]) readXlsx(f.files[0]); });
  function readXlsx(file) {
    toast('파일을 읽는 중…');
    Promise.all([loadXLSX(), new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); }; fr.readAsArrayBuffer(file); })])
      .then(function (r) {
        var p = window.YNBudgetXlsx.parse(window.XLSX, r[1]);
        if (p.problems.length) {
          openModal('<h3>엑셀 올리기</h3><div class="bd-errs">' + p.problems.map(function (x) { return '<div>· ' + esc(x) + '</div>'; }).join('') + '</div><div class="bd-actions"><button class="bd-b" data-act="close" type="button">닫기</button></div>');
          return;
        }
        IMP = { payload: p, fileName: file.name }; previewImport();
      }).catch(fail);
  }
  function previewImport() {
    var modeEl = document.querySelector('input[name="impMode"]:checked'), mode = modeEl ? modeEl.value : 'merge';
    api('budgetImportPreview', [KEY, S.ev.event.id, IMP.payload, { mode: mode }]).then(function (pv) { drawImport(pv, mode); }, fail);
  }
  function drawImport(pv, mode) {
    var L = pv.lines, T = pv.txs, none = !(L.add + L.update + L.remove + T.add + T.update + T.remove);
    var box = function (k, o) { return '<div class="bd-diff"><div><b>' + o.add + '</b>' + k + ' 추가</div><div><b>' + o.update + '</b>수정</div><div><b>' + o.same + '</b>그대로</div><div><b class="' + (o.remove ? 'bd-neg' : '') + '">' + o.remove + '</b>삭제</div></div>'; };
    var samples = function (title, arr, f) { return arr.length ? '<div class="bd-sub" style="margin:4px 0;"><b>' + title + '</b><br>' + arr.slice(0, 6).map(f).join('<br>') + (arr.length > 6 ? '<br>…' : '') + '</div>' : ''; };
    openModal('<h3>엑셀 올리기 — 미리보기</h3><p class="bd-sub">' + esc(IMP.fileName) + '</p>' +
      '<div class="bd-radio"><label><input type="radio" name="impMode" value="merge"' + (mode === 'merge' ? ' checked' : '') + '> 합치기 (파일에 없는 줄은 그대로 둠)</label>' +
      '<label><input type="radio" name="impMode" value="replace"' + (mode === 'replace' ? ' checked' : '') + '> 바꾸기 (파일에 없는 줄은 삭제)</label></div>' +
      (IMP.payload.lines ? '<div class="bd-sub"><b>예산 항목</b></div>' + box('', L) : '') + (IMP.payload.txs ? '<div class="bd-sub"><b>거래</b></div>' + box('', T) : '') +
      samples('새 예산 항목', L.addSample, function (x) { return esc(x.row) + '행 · ' + esc(x.kind) + ' ' + esc(x.name) + ' ' + money(x.amount); }) +
      samples('바뀌는 예산 항목', L.updateSample, function (x) { return esc(x.id) + ' ' + esc(x.name) + ': ' + money(x.from) + ' → ' + money(x.to); }) +
      samples('새 거래', T.addSample, function (x) { return esc(x.row) + '행 · ' + esc(x.date) + ' ' + esc(x.detail) + ' ' + money(x.amount); }) +
      samples('바뀌는 거래', T.updateSample, function (x) { return esc(x.id) + ' ' + esc(x.detail) + ': ' + money(x.from) + ' → ' + money(x.to); }) +
      samples('삭제되는 항목', L.removeSample, function (x) { return esc(x.id) + ' ' + esc(x.name); }) +
      samples('삭제되는 거래', T.removeSample, function (x) { return esc(x.id) + ' ' + esc(x.detail) + ' ' + money(x.amount); }) +
      (pv.errorCount ? '<div class="bd-errs"><b>오류 ' + pv.errorCount + '건 — 고친 뒤 다시 올려주세요. (하나라도 있으면 아무것도 저장되지 않습니다)</b>' + pv.errors.map(function (e) { return '<div>· ' + (e.sheet ? esc(e.sheet) + ' ' + esc(e.row) + '행: ' : '') + esc(e.message) + '</div>'; }).join('') + '</div>' : '') +
      (pv.warnings.length ? '<div class="bd-warns">' + pv.warnings.map(function (w) { return '<div>⚠ ' + esc(w) + '</div>'; }).join('') + '</div>' : '') +
      (pv.stale ? '<label class="bd-chk"><input type="checkbox" id="impStale"> 다른 사람의 변경 위에 덮어써도 됩니다</label>' : '') +
      (mode === 'replace' && (L.remove || T.remove) ? '<label class="bd-chk"><input type="checkbox" id="impDel"> 위 삭제 항목을 정말 지웁니다</label>' : '') +
      '<div class="bd-actions"><button class="bd-b" data-act="close" type="button">취소</button><button class="bd-b pri" id="impGo" data-act="imp-apply" type="button"' + (!pv.ok || none ? ' disabled' : '') + '>저장</button></div><p class="bd-msg err" id="mMsg"></p>');
    Array.prototype.forEach.call(document.querySelectorAll('input[name="impMode"]'), function (r) { r.onchange = previewImport; });
  }
  function impApply(btn) {
    var modeEl = document.querySelector('input[name="impMode"]:checked'), mode = modeEl ? modeEl.value : 'merge';
    var stale = $('impStale'), del = $('impDel');
    if (stale && !stale.checked) return mMsg('"다른 사람의 변경 위에 덮어써도 됩니다"를 체크해주세요.');
    if (del && !del.checked) return mMsg('삭제 확인을 체크해주세요.');
    busyBtn(btn, true);
    api('budgetImportApply', [KEY, S.ev.event.id, IMP.payload, { mode: mode, acceptStale: !!(stale && stale.checked) }]).then(function () {
      closeModal(); reload('엑셀 내용을 저장했습니다.');
    }, function (e) { busyBtn(btn, false); mMsg(e.message); });
  }

  function pdf(kind, btn) {
    var id = S.ev.event.id; busyBtn(btn, true); toast('PDF를 만드는 중…');
    api('budgetReportPdf', [KEY, id, kind]).then(function (r) {
      saveBlob(b64ToBlob(r.b64, r.mime || 'application/pdf'), r.name || ('report-' + kind + '.pdf')); toast('PDF를 내려받았습니다.');
    }, function () {
      // 서버 PDF 변환이 막힌 경우 — 같은 내용을 인쇄 화면으로 열어 "PDF로 저장"
      return api('budgetReportHtml', [KEY, id, kind]).then(function (h) {
        var w = window.open('', '_blank');
        if (w) { w.document.open(); w.document.write(h.html); w.document.close(); w.focus(); setTimeout(function () { try { w.print(); } catch (e) {} }, 500); toast('인쇄 창에서 "PDF로 저장"을 선택하세요.'); }
        else saveBlob(new Blob([h.html], { type: 'text/html;charset=utf-8' }), (h.filename || 'report') + '.html');
      });
    }).catch(fail).then(function () { busyBtn(btn, false); });
  }

  function pull() {
    api('budgetPullReimbursements', [KEY, S.ev.event.id, true]).then(function (r) {
      if (!r.count) { toast('가져올 환급신청이 없습니다. (회계팀이 신청서의 "예산"에 이 행사 이름을 지정하고 승인 · 지급한 건만 옵니다)'); return; }
      var lines = S.ev.lines.filter(function (l) { return l.kind === '지출'; });
      openModal('<h3>환급신청서 가져오기</h3><p class="bd-sub">이 행사로 배정된 승인 · 지급 완료 환급신청 <b>' + r.count + '건 / ' + money(r.total) + '</b>을 거래로 가져옵니다. 날짜는 영수증(항목)마다의 지출일입니다.</p>' +
        '<div class="bd-scroll" style="max-height:220px;overflow-y:auto;"><table class="bd-table"><tbody>' + r.items.map(function (x) { return '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.detail) + '<div class="bd-dim" style="font-size:12px;">' + esc(x.expNo) + ' · ' + esc(x.applicant) + '</div></td><td class="r">' + money(x.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="bd-f" style="margin-top:10px;"><label for="pullLine">예산 항목에 연결 (선택)</label><select id="pullLine"><option value="">(미분류로 가져오기)</option>' + lines.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('') + '</select></div><p class="bd-msg err" id="mMsg"></p>' +
        '<div class="bd-actions"><button class="bd-b" data-act="close" type="button">취소</button><button class="bd-b pri" data-act="pull-go" type="button">가져오기</button></div>');
    }, fail);
  }

  /* ---------------------------------------------------------------- 클릭 처리 (한 곳) */
  function num(id) { return $(id).value; }
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
    var a = el.getAttribute('data-act'), id = el.getAttribute('data-id'), d = S.ev;
    switch (a) {
      case 'open': return openEvent(id);
      case 'tab': S.tab = el.getAttribute('data-tab'); return renderEvent();
      case 'close': return closeModal();
      case 'edit-event': return eventForm(d.event);
      case 'save-event':
        busyBtn(el, true);
        return api('budgetSaveEvent', [KEY, { id: id, name: num('efName'), year: num('efYear'), dept: num('efDept'), start: num('efStart'), end: num('efEnd'), owner: num('efOwner'), memo: num('efMemo') }]).then(function (r) {
          closeModal(); if (id) apply(r, '저장했습니다.'); else { S.tab = 'lines'; api('budgetInit', [KEY]).then(function (i) { S.init.events = i.events; openEvent(r.event.id); toast('행사를 만들었습니다. 예산 항목을 추가하세요.'); }); }
        }, function (e) { busyBtn(el, false); mMsg(e.message); });
      case 'del-event':
        if (!confirm('이 행사와 예산 · 거래를 모두 지웁니다. 되돌릴 수 없습니다. 지울까요?')) return;
        return api('budgetDeleteEvent', [KEY, d.event.id]).then(function () { closeModal(); toast('지웠습니다.'); showList(); }, function (e) { mMsg(e.message); });
      case 'add-line': return lineForm(null);
      case 'edit-line': return lineForm(d.lines.filter(function (l) { return l.id === id; })[0]);
      case 'save-line':
        busyBtn(el, true);
        return api('budgetSaveLine', [KEY, d.event.id, { id: id, kind: num('lfKind'), category: num('lfCat'), name: num('lfName'), amount: num('lfAmt'), memo: num('lfMemo') }]).then(function (r) { closeModal(); apply(r, '저장했습니다.'); }, function (e) { busyBtn(el, false); mMsg(e.message); });
      case 'del-line':
        if (!confirm('이 예산 항목을 지울까요?')) return;
        return api('budgetDeleteLine', [KEY, d.event.id, id]).then(function (r) { closeModal(); apply(r, '지웠습니다.'); }, function (e) { mMsg(e.message); });
      case 'add-tx': return txForm(null);
      case 'edit-tx': return txForm(d.transactions.filter(function (t) { return t.id === id; })[0]);
      case 'save-tx':
        busyBtn(el, true);
        return api('budgetSaveTx', [KEY, d.event.id, { id: id, date: num('tfDate'), kind: num('tfKind'), lineId: num('tfLine'), detail: num('tfDetail'), amount: num('tfAmt'), method: num('tfMethod'), note: num('tfNote') }]).then(function (r) { closeModal(); apply(r, '저장했습니다.'); }, function (e) { busyBtn(el, false); mMsg(e.message); });
      case 'del-tx':
        if (!confirm('이 거래를 지울까요?')) return;
        return api('budgetDeleteTx', [KEY, d.event.id, id]).then(function (r) { closeModal(); apply(r, '지웠습니다.'); }, function (e) { mMsg(e.message); });
      case 'xlsx-down': return xlsxDown();
      case 'xlsx-up': return xlsxUp();
      case 'imp-apply': return impApply(el);
      case 'pdf': return pdf(el.getAttribute('data-kind'), el);
      case 'pull': return pull();
      case 'pull-go':
        busyBtn(el, true);
        return api('budgetPullReimbursements', [KEY, d.event.id, false, $('pullLine').value]).then(function (r) { closeModal(); reload(r.count + '건을 가져왔습니다.'); }, function (e) { busyBtn(el, false); mMsg(e.message); });
      case 'settle':
        if (!confirm('정산을 확정할까요? 확정하면 거래 · 예산 수정이 잠깁니다.')) return;
        busyBtn(el, true);
        return api('budgetSettle', [KEY, d.event.id, ($('stMemo') || {}).value || '', !!($('stUn') && $('stUn').checked)]).then(function (r) { apply(r, '정산을 확정했습니다.'); }, function (e) { busyBtn(el, false); toast(e.message, true); });
      case 'reopen':
        var why = prompt('정산을 다시 여는 이유를 적어주세요. (기록에 남습니다)');
        if (why == null) return;
        return api('budgetReopen', [KEY, d.event.id, why]).then(function (r) { apply(r, '정산을 다시 열었습니다.'); }, fail);
      case 'acc-add':
        var nm = $('acName').value.trim(), lv = $('acLevel').value, all = $('acAll') && $('acAll').checked;
        if (!nm) return ($('acMsg').textContent = '이름을 적어주세요.');
        return api('acctAccessSave', [KEY, nm, all ? '*' : d.event.id, lv, $('acUntil').value, $('acMemo').value]).then(function (r) { S.accessCache = r; drawAccess(r); toast('저장했습니다.'); }, function (e) { $('acMsg').className = 'bd-msg err'; $('acMsg').textContent = e.message; });
      case 'acc-del':
        if (!confirm(el.getAttribute('data-name') + ' 님의 접근 권한을 뺄까요?')) return;
        return api('acctAccessDelete', [KEY, el.getAttribute('data-name'), el.getAttribute('data-eid')]).then(function (r) { drawAccess(r); toast('뺐습니다.'); }, fail);
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'acc-level') {
      api('acctAccessSave', [KEY, el.getAttribute('data-name'), el.getAttribute('data-eid'), el.value, el.getAttribute('data-until'), el.getAttribute('data-memo')])
        .then(function (r) { S.accessCache = r; drawAccess(r); toast('등급을 바꿨습니다.'); }, function (e) { toast(e.message, true); tabAccess(); });
    }
  });

  boot();
})();
