/**
 * 행사 예산 — 엑셀 파일 만들기 · 읽기 (브라우저 · Node 공용)
 * ============================================================
 * 서버(logic/eventbudget-io.js)는 엑셀 파일을 직접 다루지 않습니다.
 *   내려받기: 서버의 budgetTemplateData 결과  →  build()  →  .xlsx (SheetJS, 이미 public/vendor/xlsx.mini.min.js 로 들어 있음)
 *   올리기  : .xlsx  →  parse()  →  JSON  →  서버의 budgetImportPreview / budgetImportApply
 * 파일에는 행사 번호와 "버전"이 숨은 시트(_meta)와 안내 시트에 함께 들어가, 올릴 때 내려받은 뒤 바뀌었는지 알아봅니다.
 *
 * 사용: YNBudgetXlsx.build(XLSX, tplData) → { wb, filename }      YNBudgetXlsx.parse(XLSX, arrayBuffer) → payload
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNBudgetXlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'YNN-BUDGET-1';
  var LINE_HEAD = ['항목ID', '구분', '분류', '항목명', '예산액', '메모'];
  var TX_HEAD = ['거래ID', '날짜', '구분', '예산항목', '내용', '금액', '결제수단', '메모', '지출신청번호'];

  function safeName(s) { return String(s || '행사').replace(/[\\\/:*?"<>|\[\]]/g, '_').trim().slice(0, 40) || '행사'; }

  function build(XLSX, tpl) {
    var wb = XLSX.utils.book_new();
    var ev = tpl.event || {};

    var guide = [
      ['행사 예산 엑셀 — ' + (ev.name || '')],
      [],
      ['행사 번호', ev.id || ''],
      ['내려받은 시각', tpl.generatedAt || ''],
      ['파일 버전', ev.version],
      [],
      ['사용 방법'],
      ['1. "예산" 시트에서 예산 항목을, "거래" 시트에서 실제 거래를 고치거나 새 줄을 더합니다.'],
      ['2. 새 줄은 맨 앞 ID 칸을 비워 두세요. 저장하면 ID 가 자동으로 붙습니다. 기존 줄의 ID 는 지우거나 바꾸지 마세요.'],
      ['3. 구분은 "지출" 또는 "수입" 중 하나입니다. 날짜는 2026-09-30 처럼 적어주세요 (오늘보다 뒤 날짜는 안 됩니다).'],
      ['4. "거래" 시트의 예산항목 칸에는 예산 시트의 항목명(또는 항목ID)을 적습니다. 비워 두면 "미분류" 입니다.'],
      ['5. 금액은 숫자만 적어주세요 (1,200 또는 1200.50).'],
      ['6. 다시 앱의 [엑셀 올리기]로 올리면 먼저 미리보기가 나오고, 확인한 뒤에 저장됩니다. 오류가 하나라도 있으면 아무것도 저장되지 않습니다.'],
      ['7. 결제수단 예: ' + (tpl.methods || []).join(' · ')],
      ['8. 지출신청번호 칸은 환급신청서에서 가져온 거래에 자동으로 붙는 값이라 고칠 수 없습니다.'],
      ['※ 이 안내 시트와 _meta 시트는 지우지 마세요 (내려받은 뒤 다른 사람이 고쳤는지 확인하는 데 씁니다).']
    ];
    var wsG = XLSX.utils.aoa_to_sheet(guide);
    wsG['!cols'] = [{ wch: 18 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsG, '안내');

    var lrows = [LINE_HEAD].concat((tpl.lines || []).map(function (l) { return [l.id, l.kind, l.category, l.name, Number(l.amount) || 0, l.memo]; }));
    var wsL = XLSX.utils.aoa_to_sheet(lrows);
    wsL['!cols'] = [{ wch: 9 }, { wch: 7 }, { wch: 14 }, { wch: 26 }, { wch: 13 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsL, '예산');

    var trows = [TX_HEAD].concat((tpl.txs || []).map(function (t) {
      return [t.id, t.date, t.kind, t.lineName || t.lineId || '', t.detail, Number(t.amount) || 0, t.method, t.note, t.expNo];
    }));
    var wsT = XLSX.utils.aoa_to_sheet(trows);
    wsT['!cols'] = [{ wch: 9 }, { wch: 12 }, { wch: 7 }, { wch: 22 }, { wch: 34 }, { wch: 13 }, { wch: 12 }, { wch: 26 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsT, '거래');

    var wsM = XLSX.utils.aoa_to_sheet([['format', FORMAT], ['eventId', ev.id || ''], ['version', ev.version], ['generatedAt', tpl.generatedAt || '']]);
    XLSX.utils.book_append_sheet(wb, wsM, '_meta');
    wb.Workbook = { Sheets: [{}, {}, {}, { Hidden: 1 }] };                  // _meta 는 숨김

    return { wb: wb, filename: '행사예산_' + safeName(ev.name) + '_v' + ev.version + '.xlsx' };
  }

  /** 엑셀 날짜(일련번호 · Date · 글자)를 2026-09-30 로 */
  function ymd(XLSX, v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return String(v);
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    }
    if (typeof v === 'number') {
      var d = XLSX.SSF.parse_date_code(v);
      if (d && d.y) return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
      return String(v);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    return s;
  }

  function money(v) {
    if (typeof v === 'number') return v;
    if (v == null) return '';
    var s = String(v).trim().replace(/[$,\s]/g, '');
    return s;                                                                // 숫자가 아니면 서버가 "금액이 숫자가 아닙니다" 로 알려줍니다
  }
  function text(v) { return v == null ? '' : String(v).trim(); }

  function sheetRows(XLSX, ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true }); }

  function checkHead(rows, expected, label, problems) {
    var head = (rows[0] || []).map(text);
    var miss = expected.filter(function (h, i) { return head[i] !== h; });
    if (miss.length) problems.push('"' + label + '" 시트의 첫 줄(머리글)이 내려받은 파일과 다릅니다: ' + expected.join(' | ') + ' 순서를 그대로 두세요.');
    return !miss.length;
  }

  function parse(XLSX, data) {
    var wb = XLSX.read(data, { type: 'array', cellDates: false });
    var problems = [], out = { format: '', eventId: '', version: null, lines: null, txs: null, problems: problems };

    var meta = wb.Sheets['_meta'] && sheetRows(XLSX, wb.Sheets['_meta']);
    if (meta) {
      meta.forEach(function (r) {
        var k = text(r[0]);
        if (k === 'format') out.format = text(r[1]);
        else if (k === 'eventId') out.eventId = text(r[1]);
        else if (k === 'version') { var n = parseInt(r[1], 10); out.version = isNaN(n) ? null : n; }
      });
    } else if (wb.Sheets['안내']) {                                          // 숨은 시트가 지워졌으면 안내 시트에서 찾아봅니다
      sheetRows(XLSX, wb.Sheets['안내']).forEach(function (r) {
        if (text(r[0]) === '행사 번호') out.eventId = text(r[1]);
        if (text(r[0]) === '파일 버전') { var n = parseInt(r[1], 10); out.version = isNaN(n) ? null : n; }
      });
      out.format = FORMAT;
    }
    if (!out.format) problems.push('이 프로그램에서 내려받은 엑셀 파일이 아닙니다 (_meta / 안내 시트가 없습니다).');

    if (wb.Sheets['예산']) {
      var lr = sheetRows(XLSX, wb.Sheets['예산']);
      if (checkHead(lr, LINE_HEAD, '예산', problems)) {
        out.lines = [];
        for (var i = 1; i < lr.length; i++) {
          var r = lr[i];
          out.lines.push({ row: i + 1, id: text(r[0]), kind: text(r[1]), category: text(r[2]), name: text(r[3]), amount: r[4] === '' ? '' : money(r[4]), memo: text(r[5]) });
        }
      }
    }
    if (wb.Sheets['거래']) {
      var tr = sheetRows(XLSX, wb.Sheets['거래']);
      if (checkHead(tr, TX_HEAD, '거래', problems)) {
        out.txs = [];
        for (var j = 1; j < tr.length; j++) {
          var t = tr[j];
          out.txs.push({ row: j + 1, id: text(t[0]), date: ymd(XLSX, t[1]), kind: text(t[2]), line: text(t[3]), detail: text(t[4]),
            amount: t[5] === '' ? '' : money(t[5]), method: text(t[6]), note: text(t[7]) });
        }
      }
    }
    if (out.lines === null && out.txs === null && !problems.length) problems.push('"예산" 또는 "거래" 시트를 찾지 못했습니다.');
    return out;
  }

  return { FORMAT: FORMAT, LINE_HEAD: LINE_HEAD, TX_HEAD: TX_HEAD, build: build, parse: parse, ymd: ymd };
});
