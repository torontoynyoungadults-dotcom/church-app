/**
 * 콘티 도구 (Hub v4) — 유튜브 검색 · 악보 이미지 검색 · @세션 태그 · 카카오톡 콘티 요약
 * ------------------------------------------------------------
 *  · 순수 함수(태그 풀이 · 카톡 글 · 버전 이름)와 화면 조립(mountSongForm)이 한 파일에 있습니다 (시험은 순수 함수를 node 에서 부릅니다).
 *  · @태그 이름표 표(ALIASES)는 서버 logic/worship5.js 의 멘션별칭_ 과 같아야 합니다 — scripts/test-hub4.js 가 두 곳의 풀이를 비교합니다.
 *  · 기존 콘티 화면(Worship.html)은 그대로 두고, 이 파일이 없어도 오류 없이 예전처럼 동작합니다 (호출하는 쪽이 window.YNConti 를 확인).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNConti = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ============================================================ @태그 */
  var ALIASES = [
    { keys: ['lead'], names: ['인도자', '인도', '리드', '리더'] },
    { keys: ['piano'], names: ['메인건반', '피아노'] },
    { keys: ['synth'], names: ['세컨건반', '세컨', '신디', '신스', '신디사이저'] },
    { keys: ['piano', 'synth'], names: ['건반', '키보드'] },
    { keys: ['drum'], names: ['드럼', '드럼머'] },
    { keys: ['bass'], names: ['베이스'] },
    { keys: ['egt'], names: ['일렉', '일렉기타', '전기기타'] },
    { keys: ['agt'], names: ['어쿠', '어쿠기타', '어쿠스틱', '통기타'] },
    { keys: ['egt', 'agt'], names: ['기타'] },
    { keys: ['mvocal'], names: ['남싱', '남성싱어', '남자싱어', '남보컬'] },
    { keys: ['fvocal'], names: ['여싱', '여성싱어', '여자싱어', '여보컬'] },
    { keys: ['mvocal', 'fvocal'], names: ['싱어', '싱어팀', '보컬', '코러스'] },
    { keys: ['media'], names: ['음향', '사운드', '엔지니어'] },
    { keys: ['ppt'], names: ['ppt', '피피티', '자막'] },
    { keys: ['codi'], names: ['코디'] },
    { keys: ['lead', 'piano', 'synth', 'drum', 'bass', 'egt', 'agt', 'mvocal', 'fvocal'], names: ['찬양팀', '밴드'] },
    { keys: ['media', 'ppt', 'codi'], names: ['방송팀', '방송'] },
    { all: true, names: ['전체', '모두', 'all'] }
  ];
  /** 태그 칩에 보여 줄 자리 (편성 자리 키 → 이름) — 태그를 누르면 이 이름이 글에 들어갑니다 */
  var POS = [
    { key: 'lead', tag: '인도자' }, { key: 'piano', tag: '피아노' }, { key: 'synth', tag: '신디' }, { key: 'drum', tag: '드럼' }, { key: 'bass', tag: '베이스' },
    { key: 'egt', tag: '일렉' }, { key: 'agt', tag: '어쿠' }, { key: 'mvocal', tag: '남싱' }, { key: 'fvocal', tag: '여싱' },
    { key: 'media', tag: '음향' }, { key: 'ppt', tag: 'PPT' }, { key: 'codi', tag: '코디' }
  ];
  var GROUP = { lead: 'v', mvocal: 'v', fvocal: 'v', piano: 'k', synth: 'k', drum: 'r', bass: 'r', egt: 'g', agt: 'g', media: 'b', ppt: 'b', codi: 'b' };

  /** 글 속의 @태그 조각 — @ 앞은 글머리 · 공백 · 문장부호여야 함 (이메일 주소는 태그가 아님) */
  function pieces(text) {
    var out = [], re = /(^|[^A-Za-z0-9_])@([A-Za-z0-9가-힣_]+)/g, m;
    text = String(text || '');
    while ((m = re.exec(text))) out.push({ raw: m[2], index: m.index + m[1].length });
    return out;
  }
  /** 태그 뒤에 조사가 붙어도 알아봄 ("@일렉은") — 알려진 이름 중 가장 긴 앞부분. 같은 길이면 사람 이름이 먼저. 한 글자 이름은 쓰지 않음 */
  function resolveTag(raw, roster) {
    var low = String(raw || '').toLowerCase(), best = null, i;
    (roster || []).forEach(function (n) {
      var nl = String(n).toLowerCase();
      if (nl.length >= 2 && low.indexOf(nl) === 0 && (!best || nl.length >= best.len)) best = { len: nl.length, kind: 'name', name: n };
    });
    for (i = 0; i < ALIASES.length; i++) {
      for (var j = 0; j < ALIASES[i].names.length; j++) {
        var nm = ALIASES[i].names[j], nl2 = nm.toLowerCase();
        if (nl2.length >= 2 && low.indexOf(nl2) === 0 && (!best || nl2.length > best.len)) best = { len: nl2.length, kind: ALIASES[i].all ? 'all' : 'pos', keys: ALIASES[i].keys || [], label: nm };
      }
    }
    return best;
  }
  /** ctx = { slots: { 자리키: [이름…] }, roster: [이름…] } → 태그 하나의 풀이 */
  function describe(raw, ctx) {
    ctx = ctx || {};
    var slots = ctx.slots || {}, f = resolveTag(raw, ctx.roster), names = [], keys = [], kind = 'none', label = '', len = String(raw).length;
    if (f) {
      len = f.len; kind = f.kind; label = f.kind === 'name' ? f.name : f.label;
      if (f.kind === 'name') names = [f.name];
      else {
        keys = (f.kind === 'all' ? Object.keys(slots) : f.keys).slice();
        keys.forEach(function (k) { (slots[k] || []).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); }); });
      }
    }
    return { tag: '@' + String(raw).slice(0, len), len: len, kind: kind, keys: keys, names: names, label: label };
  }
  /** 글 → 태그 목록 (서버 멘션분석_ 과 같은 결과: tag · kind · keys · names · label · line) */
  function analyze(text, ctx) {
    var lines = String(text || '').split(/\r?\n/), out = [];
    pieces(text).forEach(function (p) {
      var d = describe(p.raw, ctx), acc = 0, line = '';
      for (var i = 0; i < lines.length; i++) { if (p.index >= acc && p.index <= acc + lines[i].length) { line = lines[i]; break; } acc += lines[i].length + 1; }
      out.push({ tag: d.tag, kind: d.kind, keys: d.keys, names: d.names, label: d.label, line: line.replace(/^\s*[-•·*]\s*/, '').trim().slice(0, 200) });
    });
    return out;
  }
  /** 글을 [{ t:'text', s } | { t:'tag', s, d }] 로 쪼갬 — 화면 배지용 */
  function segments(text, ctx) {
    text = String(text || '');
    var out = [], at = 0;
    pieces(text).forEach(function (p) {
      if (p.index < at) return;
      var d = describe(p.raw, ctx), end = p.index + 1 + d.len;
      if (p.index > at) out.push({ t: 'text', s: text.slice(at, p.index) });
      out.push({ t: 'tag', s: text.slice(p.index, end), d: d });
      at = end;
    });
    if (at < text.length) out.push({ t: 'text', s: text.slice(at) });
    return out;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function badgeClass(d) { return 'cn-mt ' + (d.kind === 'none' ? 'cn-mt-none' : d.kind === 'all' ? 'cn-mt-all' : d.kind === 'name' ? 'cn-mt-name' : 'cn-mt-' + (GROUP[d.keys[0]] || 'x')); }
  function namesText(names) { return names.length <= 2 ? names.join(', ') : names[0] + ' 외 ' + (names.length - 1); }
  /** 설명 글 → 안전한 HTML (태그는 배지로, 나머지는 그대로 · 줄바꿈은 CSS white-space) */
  function noteHtml(text, ctx) {
    return segments(text, ctx).map(function (g) {
      if (g.t === 'text') return esc(g.s);
      var d = g.d, who = d.names.length ? '<span class="cn-mt-who">' + esc(namesText(d.names)) + '</span>' : '';
      var tip = d.kind === 'none' ? '알 수 없는 태그입니다' : (d.names.length ? d.names.join(', ') : '이번 주 편성에 배정된 사람이 없습니다');
      return '<span class="' + badgeClass(d) + (d.kind !== 'none' && !d.names.length ? ' cn-mt-empty' : '') + '" title="' + esc(tip) + '">' + esc(g.s) + who + '</span>';
    }).join('');
  }

  /* ============================================================ 카카오톡 콘티 요약 */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateLabel(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    return m ? '[' + m[1] + '년 ' + m[2] + '월 ' + m[3] + '일]' : '[' + String(ymd || '') + ']';
  }
  /** 기록해 둔 링크 그대로 — 주소가 아니라 영상 번호만 적어 둔 경우에만 주소로 바꿈 */
  function ytLink(link) {
    link = String(link || '').trim();
    if (!link) return '';
    if (/^[A-Za-z0-9_-]{11}$/.test(link)) return 'https://youtu.be/' + link;
    return link;
  }
  function one(v, dash) { v = String(v == null ? '' : v).trim(); return v || (dash || ''); }
  function namesOf(slots, key) { var a = ((slots || {})[key] || []).filter(Boolean); return a.length ? a.join(', ') : '-'; }
  /**
   * 카카오톡에 붙여 넣는 콘티 글 — 형식은 요청서의 한국어 템플릿 그대로:
   *   [YYYY년 MM월 DD일] 주일예배 콘티 / 인도자 | 남싱 | 메인건반 | 세컨건반 | 일렉 | 베이스 | 드럼 / #번호. 곡 - 버전/팀 (Key) / 송폼 · 곡 설명 · YouTube / [결단찬양]
   * 비어 있는 줄(송폼 · 설명 · 링크)은 뺍니다. 사람이 안 정해진 자리는 "-".
   * W = 한 주 자료 ({ date, day, event, session, slots, songs[], finals[] })
   */
  function kakaoText(W) {
    W = W || {};
    var slots = W.slots || {}, out = [];
    var what = W.event && W.event.name ? W.event.name + (W.session && W.session.label ? ' · ' + W.session.label : '') : '주일예배';
    out.push(dateLabel(W.day || W.date) + ' ' + what + ' 콘티');
    out.push('');
    out.push(['인도자: ' + namesOf(slots, 'lead'), '남싱: ' + namesOf(slots, 'mvocal'), '메인건반: ' + namesOf(slots, 'piano'), '세컨건반: ' + namesOf(slots, 'synth'),
      '일렉: ' + namesOf(slots, 'egt'), '베이스: ' + namesOf(slots, 'bass'), '드럼: ' + namesOf(slots, 'drum')].join(' | '));
    (W.songs || []).forEach(function (s, i) {
      out.push('');
      out.push('#' + (i + 1) + '. ' + one(s.title) + (one(s.team) ? ' - ' + one(s.team) : '') + (one(s.key) ? ' (Key: ' + one(s.key) + ')' : ''));
      if (one(s.form)) out.push('- 송폼: ' + one(s.form));
      var note = String(s.note || '').replace(/\r/g, '').split('\n').map(function (x) { return x.replace(/\s+$/, ''); }).filter(function (x, k, a) { return x || (k > 0 && k < a.length - 1); });
      if (note.join('').trim()) out.push('- 곡 설명: ' + note.join('\n  ').trim());
      if (ytLink(s.link)) out.push('- YouTube: ' + ytLink(s.link));
    });
    var fin = (W.finals || []).filter(function (s) { return one(s.title); });
    if (fin.length) {
      out.push('');
      out.push('[결단찬양]');
      fin.forEach(function (s, i) {
        if (i) out.push('');
        out.push('# ' + one(s.title) + (one(s.key) ? ' (Key: ' + one(s.key) + ')' : ''));
        if (ytLink(s.link)) out.push('- YouTube: ' + ytLink(s.link));
      });
    }
    return out.join('\n');
  }
  /** 클립보드 복사 — 안 되면 옛 방식(선택 + copy) · 그래도 안 되면 false (화면이 글을 펼쳐 손으로 복사하게 안내) */
  function copy(text) {
    function legacy() {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta); ta.focus(); ta.select(); try { ta.setSelectionRange(0, text.length); } catch (e) {}
        var ok = document.execCommand('copy'); document.body.removeChild(ta); return !!ok;
      } catch (e) { return false; }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  }

  /* ============================================================ 유튜브 결과 이름 */
  function ytId(url) { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/.exec(String(url || '')); return m ? m[1] : ''; }
  function cleanChannel(c) { return String(c || '').replace(/\s*-\s*Topic$/i, '').replace(/\s*(VEVO|Official( Channel)?|공식(\s*채널)?)$/i, '').trim(); }
  var VERSION_WORDS = [[/live|라이브|콘서트|concert/i, 'Live'], [/acoustic|어쿠스틱/i, 'Acoustic'], [/instrumental|\binst\b|\bmr\b|반주|연주/i, 'Inst'],
    [/piano|피아노/i, 'Piano'], [/lyrics?|가사/i, 'Lyrics'], [/cover|커버/i, 'Cover'], [/official (audio|mv|video)|공식/i, 'Official']];
  /** "마커스 · Live · 2019" — 팀 · 버전 칸에 들어갈 짧은 이름 (같은 곡의 여러 버전을 구분) */
  function versionLabel(it) {
    it = it || {}; var ch = cleanChannel(it.channel), tag = '';
    for (var i = 0; i < VERSION_WORDS.length; i++) if (VERSION_WORDS[i][0].test(String(it.title || ''))) { tag = VERSION_WORDS[i][1]; break; }
    return [ch, tag, String(it.at || '').slice(0, 4)].filter(Boolean).join(' · ').slice(0, 40);
  }
  function fmtDur(sec) { sec = Math.round(Number(sec) || 0); if (!sec) return ''; var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s); }
  function fmtViews(n) { n = Number(n) || 0; if (!n) return ''; if (n >= 10000) return (Math.round(n / 1000) / 10) + '만 회'; return n + '회'; }

  /* ============================================================ 화면 (콘티 곡 편집 안) */
  function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  function fire(inp) { try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
  function safeHttps(u) { u = String(u || ''); return /^https:\/\//i.test(u) ? u : ''; }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  var LS_AUTO = 'yn.cn.autoOpen';
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장이 막혀 있어도 동작 */ } }

  /**
   * 곡 편집 칸에 붙입니다 (여러 번 불려도 한 번만).
   * ctx = { kind, token, date, callServer, week: () => 한 주 자료, roster: () => [이름], applyQuiet(week), openPractice(fileId), pickFile(kind) }
   */
  function mountSongForm(ctx) {
    var title = $('sTitle'), team = $('sTeam'), link = $('sLink'), note = $('sNote');
    if (!title || !link) return;
    var ytBtn = $('cnYtBtn'), ytBox = $('cnYt'), imBtn = $('cnImgBtn'), imBox = $('cnImg');
    if (ytBox && !ytBox.getAttribute('data-on')) { ytBox.setAttribute('data-on', '1'); mountYoutube(ctx, { title: title, team: team, link: link, btn: ytBtn, box: ytBox }); }
    if (imBox && !imBox.getAttribute('data-on')) { imBox.setAttribute('data-on', '1'); mountImages(ctx, { title: title, team: team, btn: imBtn, box: imBox }); }
    var mb = $('cnMention');
    if (mb && note && !mb.getAttribute('data-on')) { mb.setAttribute('data-on', '1'); mountMentions(ctx, note, mb); }
  }

  /* ---- 유튜브 ---- */
  function mountYoutube(ctx, e) {
    var S = { open: false, items: [], next: '', busy: false, q: '', sel: null };
    function head() {
      return '<div class="cn-bar"><input type="search" class="cn-q" id="cnYtQ" placeholder="곡 제목 · 팀 (여러 버전이 나옵니다)" enterkeyhint="search" autocomplete="off">' +
        '<button type="button" class="cn-go" data-act="go">검색</button></div>';
    }
    function render() {
      var h = '';
      if (S.sel) {
        h += '<div class="cn-picked"><span class="ok">✔ 연결됨</span> <b>' + esc(S.sel.title) + '</b> <span class="sub">' + esc(S.sel.channel) + '</span>' +
          '<div class="cn-picked-act">' + (S.sel.pre ? '' : '<button type="button" class="cn-mini" data-act="applyTeam" title="팀 · 원곡 칸에 이 버전 이름을 넣습니다">팀 · 버전 칸에 넣기 (' + esc(versionLabel(S.sel)) + ')</button>') +
          '<button type="button" class="cn-mini" data-act="unlink">연결 해제</button></div></div>';
      }
      if (S.open) {
        h += '<div class="cn-panel">' + head() + '<div class="cn-msg" id="cnYtMsg" role="status"></div><div class="cn-grid" id="cnYtGrid"></div><div class="cn-more" id="cnYtMore"></div></div>';
      }
      e.box.innerHTML = h;
      if (S.open) {
        var q = $('cnYtQ'); q.value = S.q; q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); search(false); } });
        paintGrid();
      }
      if (e.btn) { e.btn.setAttribute('aria-expanded', S.open ? 'true' : 'false'); e.btn.classList.toggle('on', S.open); }
    }
    function msg(t, bad) { var m = $('cnYtMsg'); if (m) { m.textContent = t || ''; m.className = 'cn-msg' + (bad ? ' bad' : ''); } }
    function paintGrid() {
      var g = $('cnYtGrid'); if (!g) return;
      g.innerHTML = S.items.map(function (it) {
        var sub = [it.channel, String(it.at || '').slice(0, 4), fmtDur(it.dur), fmtViews(it.views)].filter(Boolean).map(esc).join(' · ');
        var th = safeHttps(it.thumb);
        return '<div class="cn-card" data-id="' + esc(it.id) + '"><div class="cn-thumb" data-act="prev">' + (th ? '<img src="' + esc(th) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
          '<span class="cn-play" aria-hidden="true">▶</span></div>' +
          '<div class="cn-ct"><div class="cn-title">' + esc(it.title) + '</div><div class="cn-sub">' + sub + '</div>' +
          '<div class="cn-act"><button type="button" class="cn-mini" data-act="prev">▶ 미리듣기</button>' +
          '<a class="cn-mini" href="https://www.youtube.com/watch?v=' + esc(it.id) + '" target="_blank" rel="noopener">YouTube에서 열기</a>' +
          '<button type="button" class="cn-pick" data-act="pick">선택</button></div></div></div>';
      }).join('');
      var mo = $('cnYtMore'); if (mo) mo.innerHTML = S.next ? '<button type="button" class="cn-mini" data-act="more">더 보기</button>' : '';
    }
    function search(more) {
      var q = ($('cnYtQ') && $('cnYtQ').value || '').trim(); if (!q || S.busy) return;
      if (!more) { S.q = q; S.items = []; S.next = ''; paintGrid(); }
      S.busy = true; msg('검색하는 중…');
      ctx.callServer('worshipYoutubeSearch', [ctx.token, q, more ? S.next : ''], function (r) {
        S.busy = false;
        if (!r || !r.ok) {
          msg((r && r.msg) || '검색하지 못했습니다.', true);
          if (r && r.openUrl) { var m = $('cnYtMsg'); if (m) m.insertAdjacentHTML('beforeend', ' <a href="' + esc(r.openUrl) + '" target="_blank" rel="noopener">유튜브에서 직접 찾기 ↗</a>'); }
          return;
        }
        S.items = S.items.concat(r.items || []); S.next = r.next || '';
        msg(S.items.length ? '' : '검색 결과가 없습니다. 검색어를 바꿔 보세요.');
        paintGrid();
      }, function (er) { S.busy = false; msg((er && er.message) || '검색하지 못했습니다.', true); });
    }
    function stop() { var p = e.box.querySelector('.cn-thumb.playing'); if (p) { p.innerHTML = p.getAttribute('data-html') || ''; p.classList.remove('playing'); } }
    function preview(card) {
      var id = card.getAttribute('data-id'), th = card.querySelector('.cn-thumb');
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id) || !th) return;
      if (th.classList.contains('playing')) { stop(); return; }
      stop(); th.setAttribute('data-html', th.innerHTML); th.classList.add('playing');
      th.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1" title="YouTube 미리보기" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    }
    function pick(card) {
      var id = card.getAttribute('data-id'), it = null;
      S.items.forEach(function (x) { if (x.id === id) it = x; });
      if (!it) return;
      e.link.value = 'https://youtu.be/' + it.id; fire(e.link);
      S.sel = it; S.open = false;
      if (e.team && !e.team.value.trim()) { e.team.value = versionLabel(it); fire(e.team); }
      render();
    }
    e.box.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!t || !e.box.contains(t)) return;
      var act = t.getAttribute('data-act'), card = t.closest('.cn-card');
      if (act === 'go') search(false);
      else if (act === 'more') search(true);
      else if (act === 'prev' && card) { ev.preventDefault(); preview(card); }
      else if (act === 'pick' && card) pick(card);
      else if (act === 'applyTeam' && S.sel && e.team) { e.team.value = versionLabel(S.sel); fire(e.team); }
      else if (act === 'unlink') { e.link.value = ''; fire(e.link); S.sel = null; render(); }
    });
    if (e.btn) e.btn.addEventListener('click', function () {
      S.open = !S.open;
      if (S.open && !S.q) S.q = [e.title.value.trim(), e.team && e.team.value.trim()].filter(Boolean).join(' ');
      if (!S.open) stop();
      render();
      if (S.open) { var q = $('cnYtQ'); if (q) { try { q.focus(); } catch (x) {} } if (S.q && !S.items.length) search(false); }
    });
    // 이미 링크가 있는 곡이면 "연결됨" 줄을 미리 보여 줌 (제목은 모르므로 주소만)
    if (e.link.value && ytId(e.link.value)) { S.sel = { title: '지금 연결된 영상', channel: 'youtu.be/' + ytId(e.link.value), id: ytId(e.link.value), at: '', pre: true }; }
    render();
  }

  /* ---- 악보 이미지 ---- */
  function mountImages(ctx, e) {
    var S = { open: false, items: [], next: 0, busy: false, q: '', importing: '' };
    function render() {
      if (!S.open) { e.box.innerHTML = ''; if (e.btn) { e.btn.setAttribute('aria-expanded', 'false'); e.btn.classList.remove('on'); } return; }
      e.box.innerHTML = '<div class="cn-panel"><div class="cn-bar"><input type="search" class="cn-q" id="cnImQ" placeholder="곡 제목 + 악보" enterkeyhint="search" autocomplete="off">' +
        '<button type="button" class="cn-go" data-act="go">검색</button></div>' +
        '<label class="cn-auto"><input type="checkbox" id="cnAuto"' + (lsGet(LS_AUTO, '1') === '1' ? ' checked' : '') + '> 가져오면 바로 악보 화면(필기 캔버스)으로 열기</label>' +
        '<div class="cn-msg" id="cnImMsg" role="status"></div><div class="cn-grid cn-imgs" id="cnImGrid"></div><div class="cn-more" id="cnImMore"></div></div>';
      var q = $('cnImQ'); q.value = S.q; q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); search(false); } });
      $('cnAuto').addEventListener('change', function () { lsSet(LS_AUTO, this.checked ? '1' : '0'); });
      paintGrid();
      if (e.btn) { e.btn.setAttribute('aria-expanded', 'true'); e.btn.classList.add('on'); }
    }
    function msg(t, bad, html) { var m = $('cnImMsg'); if (!m) return; m.className = 'cn-msg' + (bad ? ' bad' : ''); if (html) m.innerHTML = html; else m.textContent = t || ''; }
    function paintGrid() {
      var g = $('cnImGrid'); if (!g) return;
      g.innerHTML = S.items.map(function (it, i) {
        var th = safeHttps(it.thumb) || safeHttps(it.url), size = it.w && it.h ? it.w + '×' + it.h : '';
        return '<div class="cn-card cn-imgcard" data-i="' + i + '"><button type="button" class="cn-imgthumb" data-act="zoom" aria-label="크게 보기"><img src="' + esc(th) + '" alt="' + esc(it.title) + '" loading="lazy" referrerpolicy="no-referrer"></button>' +
          '<div class="cn-ct"><div class="cn-sub">' + [esc(host(it.page || it.url)), esc(size)].filter(Boolean).join(' · ') + '</div>' +
          '<div class="cn-act"><button type="button" class="cn-mini" data-act="zoom">확대</button><button type="button" class="cn-pick" data-act="pick"' + (S.importing ? ' disabled' : '') + '>' +
          (S.importing === it.url ? '가져오는 중…' : '선택') + '</button></div></div></div>';
      }).join('');
      var mo = $('cnImMore'); if (mo) mo.innerHTML = S.next ? '<button type="button" class="cn-mini" data-act="more">더 보기</button>' : '';
    }
    function search(more) {
      var q = ($('cnImQ') && $('cnImQ').value || '').trim(); if (!q || S.busy) return;
      if (!more) { S.q = q; S.items = []; S.next = 0; paintGrid(); }
      S.busy = true; msg('검색하는 중…');
      ctx.callServer('worshipScoreImageSearch', [ctx.token, q, more ? S.next : 1], function (r) {
        S.busy = false;
        if (!r || !r.ok) { msg('', true, esc((r && r.msg) || '검색하지 못했습니다.') + (r && r.openUrl ? ' <a href="' + esc(r.openUrl) + '" target="_blank" rel="noopener">구글에서 직접 찾기 ↗</a>' : '')); return; }
        S.items = S.items.concat(r.items || []); S.next = r.next || 0;
        msg(S.items.length ? '' : '검색 결과가 없습니다. 검색어를 바꿔 보세요.');
        paintGrid();
      }, function (er) { S.busy = false; msg((er && er.message) || '검색하지 못했습니다.', true); });
    }
    function failure(text, it) {
      msg('', true, esc(text || '그림을 가져오지 못했습니다.') + ' <button type="button" class="cn-mini" data-act="upload">직접 올리기</button>' +
        (it && it.page && safeHttps(it.page) ? ' <a class="cn-mini" href="' + esc(it.page) + '" target="_blank" rel="noopener">출처 페이지 열기 ↗</a>' : ''));
    }
    function importIt(it) {
      if (!it || S.importing) return;
      S.importing = it.url; paintGrid(); msg('악보를 가져오는 중… (서버가 그림을 받아 저장합니다)');
      ctx.callServer('worshipImportScoreImage', [ctx.token, ctx.date, ctx.kind, it.url, e.title.value.trim(), it.page || ''], function (r) {
        S.importing = ''; paintGrid();
        if (!r || !r.ok) { failure(r && r.msg, it); return; }
        try { ctx.applyQuiet && ctx.applyQuiet(r.week); } catch (x) { /* 목록은 저장하면 새로 그려집니다 */ }
        if (r.fileId && ctx.openPractice && $('cnAuto') && $('cnAuto').checked) { msg('악보로 저장했습니다 ✔ 필기 화면을 엽니다…'); ctx.openPractice(r.fileId); }
        else msg('', false, '악보로 저장했습니다 ✔ ' + (r.fileId && ctx.openPractice ? '<button type="button" class="cn-mini" data-act="open" data-fid="' + esc(r.fileId) + '">필기 화면으로 열기</button>' : '"악보" 칸에서 확인하세요.'));
      }, function (er) { S.importing = ''; paintGrid(); failure((er && er.message) || '', it); });
    }
    function zoom(it) {
      var lb = document.createElement('div'); lb.className = 'cn-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true');
      lb.innerHTML = '<div class="cn-lb-in"><div class="cn-lb-img"><img alt="" referrerpolicy="no-referrer"></div><div class="cn-lb-act"><button type="button" class="cn-mini" data-lb="close">닫기</button>' +
        '<button type="button" class="cn-pick" data-lb="pick">이 악보 가져오기</button></div></div>';
      var im = lb.querySelector('img'); im.src = safeHttps(it.url) || safeHttps(it.thumb); im.onerror = function () { if (safeHttps(it.thumb) && im.src !== it.thumb) im.src = it.thumb; };
      function close() { try { document.removeEventListener('keydown', onKey); lb.remove(); } catch (x) {} }
      function onKey(ev) { if (ev.key === 'Escape') close(); }
      lb.addEventListener('click', function (ev) {
        var t = ev.target; if (t === lb) return close();
        var a = t.closest ? t.closest('[data-lb]') : null; if (!a) return;
        if (a.getAttribute('data-lb') === 'pick') { close(); importIt(it); } else close();
      });
      document.addEventListener('keydown', onKey); document.body.appendChild(lb);
      var cb = lb.querySelector('[data-lb="close"]'); if (cb) try { cb.focus(); } catch (x) {}
    }
    e.box.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!t || !e.box.contains(t)) return;
      var act = t.getAttribute('data-act'), card = t.closest('.cn-card'), it = card ? S.items[Number(card.getAttribute('data-i'))] : null;
      if (act === 'go') search(false);
      else if (act === 'more') search(true);
      else if (act === 'zoom' && it) zoom(it);
      else if (act === 'pick' && it) importIt(it);
      else if (act === 'upload') { if (ctx.pickFile) ctx.pickFile(ctx.kind); }
      else if (act === 'open') { if (ctx.openPractice) ctx.openPractice(t.getAttribute('data-fid')); }
    });
    if (e.btn) e.btn.addEventListener('click', function () {
      S.open = !S.open;
      if (S.open && !S.q) S.q = [e.title.value.trim(), e.team && e.team.value.trim(), '악보'].filter(Boolean).join(' ');
      render();
      if (S.open) { var q = $('cnImQ'); if (q) { try { q.focus(); } catch (x) {} } if (e.title.value.trim() && !S.items.length) search(false); }
    });
  }

  /* ---- @태그 넣기 칩 + 지금 누가 받는지 미리보기 ---- */
  function mountMentions(ctx, note, box) {
    function week() { return (ctx.week && ctx.week()) || {}; }
    function ctxOf() { var w = week(); return { slots: w.slots || {}, roster: (ctx.roster && ctx.roster()) || [] }; }
    function chips() {
      var w = week(), slots = w.slots || {}, seen = {}, h = '';
      POS.forEach(function (p) {
        var who = (slots[p.key] || []).filter(Boolean);
        h += '<button type="button" class="cn-chip' + (who.length ? '' : ' off') + '" data-ins="@' + esc(p.tag) + '" title="' + esc(who.length ? who.join(', ') : '이번 주 배정 없음') + '">@' + esc(p.tag) + '</button>';
        who.forEach(function (n) { seen[n] = 1; });
      });
      Object.keys(seen).sort().forEach(function (n) { h += '<button type="button" class="cn-chip name" data-ins="@' + esc(n) + '">@' + esc(n) + '</button>'; });
      return h;
    }
    function preview() {
      var list = analyze(note.value, ctxOf()), seen = {}, h = '';
      list.forEach(function (m) {
        if (seen[m.tag]) return; seen[m.tag] = 1;
        var d = { kind: m.kind, keys: m.keys };
        h += '<div class="cn-pv"><span class="' + badgeClass(d) + '">' + esc(m.tag) + '</span> ' +
          (m.kind === 'none' ? '<span class="cn-warn">알 수 없는 태그 — 자리(@일렉) 또는 팀원 이름을 써 주세요</span>'
            : m.names.length ? '→ ' + esc(m.names.join(', ')) + ' <span class="cn-dim">(포털 "내 할 일"에 뜹니다)</span>'
              : '<span class="cn-warn">이번 주 편성에 배정된 사람이 없어요 — 편성을 먼저 정하면 전달됩니다</span>') + '</div>';
      });
      var p = $('cnMentionPv'); if (p) p.innerHTML = h;
    }
    box.innerHTML = '<div class="cn-chips" role="group" aria-label="세션 태그 넣기"><span class="cn-chips-t">@ 태그</span>' + chips() + '</div><div id="cnMentionPv" class="cn-pvs" aria-live="polite"></div>';
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-ins]') : null; if (!b) return;
      var ins = b.getAttribute('data-ins'), v = note.value, s = note.selectionStart == null ? v.length : note.selectionStart, en = note.selectionEnd == null ? s : note.selectionEnd;
      var before = v.slice(0, s), sp = before && !/\s$/.test(before) ? ' ' : '';
      note.value = before + sp + ins + ' ' + v.slice(en);
      var pos = (before + sp + ins + ' ').length; note.focus(); try { note.setSelectionRange(pos, pos); } catch (x) {}
      fire(note); preview();
    });
    note.addEventListener('input', preview);
    preview();
  }

  return { ALIASES: ALIASES, POS: POS, pieces: pieces, resolveTag: resolveTag, describe: describe, analyze: analyze, segments: segments, noteHtml: noteHtml,
    kakaoText: kakaoText, copy: copy, ytId: ytId, ytLink: ytLink, versionLabel: versionLabel, cleanChannel: cleanChannel, fmtDur: fmtDur, fmtViews: fmtViews, mountSongForm: mountSongForm };
}));
