/**
 * 관리 작업 — 예전 구글 시트 메뉴('셀보고 관리')에 있던 것들
 * 주소: https://<앱주소>/tasks  (관리자키를 넣고 실행)
 */
const TASKS = [
  { id: 'setup', fn: '최초설정', label: '최초 설정 (시트 생성)', desc: '없는 시트와 칸을 만들어 둡니다. 이미 있는 데이터는 건드리지 않습니다.' },
  { id: 'check', fn: '설정확인', label: '설정 · 링크 확인', desc: '나눠줄 링크와 관리자키를 보여줍니다.' },
  { id: 'expense-preview', fn: '지출신청미리보기', label: '지출 신청서 미리보기 메일', desc: '관리자이메일로 접수 확인 메일 견본을 보냅니다.' },
  { id: 'birthday', fn: '교적생년월일정리', label: '교적 생년월일 정리', desc: '날짜형으로 바뀐 생년월일을 글자(yyyy-MM-dd)로 되돌립니다.' },
  { id: 'nf-migrate', fn: '새가족시트정리', label: '새가족 시트 구조 정리 (1회)', desc: '옛 새가족ID 구조를 이름 기준으로 바꿉니다. 먼저 스프레드시트 사본을 만들어 두세요.', danger: true },
  { id: 'sunday-on', fn: '주일독려트리거설치', label: '주일 제출 안내 켜기 (오후 4:30)', desc: '리마인더사용을 ON 으로 바꿉니다.' },
  { id: 'monday-on', fn: '리마인더트리거설치', label: '월요일 리마인더 켜기 (오전 8시)', desc: '리마인더사용을 ON 으로 바꿉니다.' },
  { id: 'sunday-preview', fn: '주일독려미리보기', label: '주일 제출 안내 미리보기', desc: '관리자이메일로 견본 메일을 보냅니다.' },
  { id: 'monday-preview', fn: '리마인더미리보기', label: '월요일 리마인더 미리보기', desc: '관리자이메일로 견본 메일을 보냅니다.' },
];

const find = (id) => TASKS.find((t) => t.id === id) || null;

function page() {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = TASKS.map((t) =>
    '<div class="t"><div><b>' + esc(t.label) + '</b><p>' + esc(t.desc) + '</p></div>' +
    '<button data-id="' + t.id + '"' + (t.danger ? ' data-danger="1"' : '') + '>실행</button></div>').join('');
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>관리 작업</title>
<link rel="icon" href="/logo.png">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif; background: #F4F2EE; color: #1C1C1C; margin: 0; }
  .w { max-width: 560px; margin: 0 auto; padding: 28px 16px 60px; }
  h1 { font-size: 21px; margin: 0 0 4px; } .sub { color: #6E6962; font-size: 13.5px; margin: 0 0 18px; line-height: 1.6; }
  input { width: 100%; box-sizing: border-box; padding: 12px 13px; font-size: 15px; border: 1px solid #DAD5CD; border-radius: 10px; margin-bottom: 16px; }
  .t { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid #E8E4DD; border-radius: 12px; padding: 13px 14px; margin-bottom: 8px; }
  .t div { flex: 1; min-width: 0; } .t b { font-size: 14.5px; } .t p { margin: 3px 0 0; font-size: 12.5px; color: #6E6962; line-height: 1.55; }
  button { flex: none; background: #1C1C1C; color: #fff; border: none; border-radius: 9px; padding: 9px 15px; font-size: 13px; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .45; }
  pre { white-space: pre-wrap; word-break: break-all; background: #fff; border: 1px solid #E8E4DD; border-radius: 12px; padding: 14px; font-size: 13px; line-height: 1.7; min-height: 20px; }
  .err { color: #A82F16; }
</style></head><body><div class="w">
<h1>관리 작업</h1>
<p class="sub">예전 구글 시트의 '셀보고 관리' 메뉴입니다. 설정 시트의 <b>관리자키</b>를 넣고 실행하세요.</p>
<input id="key" type="password" placeholder="관리자키 (yn-…)" autocomplete="off">
${rows}
<pre id="out"></pre>
</div>
<script>
  var q = new URLSearchParams(location.search);
  var keyBox = document.getElementById('key');
  keyBox.value = q.get('key') || sessionStorage.getItem('ynTaskKey') || '';
  var out = document.getElementById('out');
  document.querySelectorAll('button[data-id]').forEach(function (b) {
    b.onclick = function () {
      var key = keyBox.value.trim();
      if (!key) { out.className = 'err'; out.textContent = '관리자키를 넣어주세요.'; return; }
      if (b.dataset.danger && !confirm('스프레드시트 사본을 만들어 두셨나요? 계속할까요?')) return;
      try { sessionStorage.setItem('ynTaskKey', key); } catch (e) {}
      b.disabled = true; out.className = ''; out.textContent = '실행 중…';
      fetch('/tasks/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, task: b.dataset.id }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          out.className = d.ok ? '' : 'err';
          out.textContent = d.ok ? d.messages.join('\\n\\n') : d.error;
        })
        .catch(function (e) { out.className = 'err'; out.textContent = String(e); })
        .then(function () { b.disabled = false; });
    };
  });
</script></body></html>`;
}

module.exports = { page, find, TASKS };
