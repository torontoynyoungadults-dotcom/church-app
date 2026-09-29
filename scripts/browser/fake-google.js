/**
 * 시험용 가짜 구글 (시트 + 드라이브) — 진짜 구글에 연결하지 않고 lib/google.js · logic/app.js 를 그대로 돌려 보기 위한 것입니다.
 * 메모리 안에서만 동작하고, 어떤 호출이 어느 시트로 갔는지 log 에 남깁니다.
 * (구현한 API 만 지원합니다 — 앱이 쓰는 것과 db-setup.js 가 쓰는 것)
 */
const MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
const BASE_TIME = Date.UTC(2026, 8, 28, 12, 0, 0);

function unquote(range) {
  const m = /^'((?:[^']|'')*)'(?:!.*)?$/.exec(range);
  return m ? { title: m[1].replace(/''/g, "'"), a1: range.indexOf('!') >= 0 ? range.slice(range.indexOf('!') + 1) : '' } : { title: range, a1: '' };
}
function colIndex(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function parseA1(a1) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
  if (!m) throw new Error('fake: A1 범위를 읽지 못했습니다: ' + a1);
  return { c: colIndex(m[1]), r: Number(m[2]) };
}

class FakeGoogle {
  constructor() {
    this.books = new Map();
    this.clock = 0;
    this.nextId = 1;
    this.log = [];
    this.fail = null;
    this.files = new Map();     // 드라이브 폴더 · 파일 (시트가 아닌 것): id → { id, name, mimeType, parents, createdTime, modifiedTime, size, bytes, trashed }
  }
  tick() { this.clock++; return new Date(BASE_TIME + this.clock * 1000).toISOString(); }
  newId(prefix) { return prefix + String(this.nextId++).padStart(6, '0') + 'xxxxxxxxxxxxxxxxxxxxxxxx'; }

  /** 시트(통합문서) 만들기. tabs = { 탭이름: [[행],[행]…] } */
  addBook(name, tabs, parent) {
    const b = { id: this.newId('bk'), name, parent: parent || '', tz: 'America/Toronto', modified: this.tick(), sheets: [], nextSheetId: 100 };
    this.books.set(b.id, b);
    Object.keys(tabs || { 'Sheet1': [] }).forEach((t) => this.addTab(b, t, (tabs || {})[t] || []));
    return b;
  }
  addTab(b, title, values) {
    const st = { id: b.nextSheetId++, title, values: values.map((r) => r.slice()), rows: Math.max(1000, values.length), cols: 26 };
    b.sheets.push(st);
    return st;
  }
  book(id) { const b = this.books.get(id); if (!b) throw new Error('fake: 시트 ' + id + ' 를 찾을 수 없습니다'); return b; }
  tab(b, title) { const s = b.sheets.find((x) => x.title === title); if (!s) throw new Error('fake: "' + title + '" 탭이 없습니다 (' + b.name + ')'); return s; }
  props(b, st) { return { sheetId: st.id, title: st.title, index: b.sheets.indexOf(st), gridProperties: { rowCount: st.rows, columnCount: st.cols } }; }
  touch(b) { b.modified = this.tick(); }
  /** 사람이 시트를 직접 고친 것처럼 값을 바꿉니다 (앱을 거치지 않음) */
  editByHand(bookId, tabTitle, r, c, value) {
    const st = this.tab(this.book(bookId), tabTitle);
    while (st.values.length < r) st.values.push([]);
    const row = st.values[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = value;
    this.touch(this.book(bookId));
  }
  /** 탭 값 (시험에서 확인용) */
  values(bookId, tabTitle) { return this.tab(this.book(bookId), tabTitle).values.map((r) => r.slice()); }
  byName(part) { return Array.from(this.books.values()).find((b) => b.name.indexOf(part) !== -1); }
  count(filter) { return this.log.filter(filter).length; }

  /* ------------------------------------------------ 브리지 인터페이스 */
  sheets(method, params) { return this.dispatch('sheets', method, params || {}); }
  drive(method, params, extra) { return this.dispatch('drive', method, params || {}, extra); }
  calendar() { return {}; }
  call(op) { return op === 'token' ? 'fake-token' : null; }

  dispatch(svc, method, p, extra) {
    if (this.fail && this.fail(svc, method, p)) throw new Error('fake: 일부러 실패시킴 ' + method);
    const id = p.spreadsheetId || p.fileId || '';
    this.log.push({ svc, method, id, write: /batchUpdate|create|copyTo|delete|update/.test(method) && !/values\.batchGet/.test(method) });
    const fn = this['m_' + method.replace(/\./g, '_')];
    if (!fn) throw new Error('fake: 지원하지 않는 API: ' + svc + '.' + method);
    return fn.call(this, p, extra);
  }

  /** 드라이브에 폴더 · 파일을 직접 만들어 둡니다 (시험 준비용). created 는 ISO 문자열 또는 Date */
  addFolder(name, parent, created) { return this.addFile({ name, parent, mimeType: 'application/vnd.google-apps.folder', created }); }
  addFile(o) {
    const id = this.newId('fl');
    const t = o.created ? new Date(o.created).toISOString() : this.tick();
    const bytes = o.bytes ? Buffer.from(o.bytes) : Buffer.alloc(0);
    const f = { id, name: o.name, mimeType: o.mimeType || 'application/octet-stream', parents: o.parent ? [o.parent] : [], createdTime: t, modifiedTime: t, size: String(bytes.length), bytes, trashed: false };
    this.files.set(id, f);
    return f;
  }
  fileMeta(f) { return { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents.slice(), createdTime: f.createdTime, modifiedTime: f.modifiedTime, size: f.size, trashed: f.trashed, webViewLink: 'https://drive.google.com/file/d/' + f.id + '/view?usp=drivesdk' }; }

  m_spreadsheets_get(p) {
    const b = this.book(p.spreadsheetId);
    return { properties: { title: b.name, timeZone: b.tz }, sheets: b.sheets.map((s) => ({ properties: this.props(b, s) })) };
  }
  m_spreadsheets_values_batchGet(p) {
    const b = this.book(p.spreadsheetId);
    return {
      valueRanges: p.ranges.map((rg) => {
        const { title } = unquote(rg);
        const st = this.tab(b, title);
        const rows = st.values.map((r) => r.slice());
        while (rows.length && rows[rows.length - 1].every((v) => v === '' || v == null)) rows.pop();
        return { range: rg, values: rows };
      }),
    };
  }
  m_spreadsheets_values_batchUpdate(p) {
    const b = this.book(p.spreadsheetId);
    p.requestBody.data.forEach((d) => {
      const { title, a1 } = unquote(d.range);
      const st = this.tab(b, title);
      const at = parseA1(a1);
      d.values.forEach((row, i) => {
        const r = at.r - 1 + i;
        while (st.values.length <= r) st.values.push([]);
        const target = st.values[r];
        while (target.length < at.c - 1) target.push('');
        row.forEach((v, j) => { target[at.c - 1 + j] = v; });
        st.rows = Math.max(st.rows, r + 1);
        st.cols = Math.max(st.cols, at.c - 1 + row.length);
      });
    });
    this.touch(b);
    return {};
  }
  m_spreadsheets_batchUpdate(p) {
    const b = this.book(p.spreadsheetId);
    p.requestBody.requests.forEach((q) => {
      if (q.addSheet) {
        const pr = q.addSheet.properties;
        if (b.sheets.some((s) => s.title === pr.title)) throw new Error('fake: 이미 있는 탭 ' + pr.title);
        const st = this.addTab(b, pr.title, []);
        if (pr.sheetId) st.id = pr.sheetId;
      } else if (q.appendDimension) {
        const st = b.sheets.find((s) => s.id === q.appendDimension.sheetId);
        if (q.appendDimension.dimension === 'ROWS') st.rows += q.appendDimension.length; else st.cols += q.appendDimension.length;
      } else if (q.updateSheetProperties) {
        const pr = q.updateSheetProperties.properties;
        const st = b.sheets.find((s) => s.id === pr.sheetId);
        if (pr.title !== undefined && /title/.test(q.updateSheetProperties.fields)) {
          if (b.sheets.some((s) => s !== st && s.title === pr.title)) throw new Error('fake: 이름이 겹칩니다 ' + pr.title);
          st.title = pr.title;
        }
      } else if (q.deleteDimension) {
        const r = q.deleteDimension.range, st = b.sheets.find((s) => s.id === r.sheetId);
        if (r.dimension === 'ROWS') { st.values.splice(r.startIndex, r.endIndex - r.startIndex); st.rows -= (r.endIndex - r.startIndex); }
      } else if (q.insertDimension) {
        const r = q.insertDimension.range, st = b.sheets.find((s) => s.id === r.sheetId);
        if (r.dimension === 'COLUMNS') st.values.forEach((row) => { if (row.length > r.startIndex) row.splice(r.startIndex, 0, ...new Array(r.endIndex - r.startIndex).fill('')); });
        st.cols += r.endIndex - r.startIndex;
      } else if (q.updateCells) {
        const r = q.updateCells.range, st = b.sheets.find((s) => s.id === r.sheetId);
        if (/userEnteredValue|^\*$/.test(q.updateCells.fields)) {
          if (r.startRowIndex === undefined) st.values = [];
          else for (let i = r.startRowIndex; i < r.endRowIndex; i++) if (st.values[i]) for (let j = r.startColumnIndex; j < r.endColumnIndex; j++) if (j < st.values[i].length) st.values[i][j] = '';
        }
      } else if (q.deleteSheet) {
        if (b.sheets.length < 2) throw new Error('fake: 마지막 남은 탭은 지울 수 없습니다');
        b.sheets.splice(b.sheets.findIndex((s) => s.id === q.deleteSheet.sheetId), 1);
      } else if (q.updateSpreadsheetProperties) {
        if (q.updateSpreadsheetProperties.properties.timeZone) b.tz = q.updateSpreadsheetProperties.properties.timeZone;
      }
      // repeatCell · updateDimensionProperties(서식) 은 값에 영향이 없으므로 무시합니다
    });
    this.touch(b);
    return {};
  }
  m_spreadsheets_sheets_copyTo(p) {
    const src = this.book(p.spreadsheetId), dst = this.book(p.requestBody.destinationSpreadsheetId);
    const st = src.sheets.find((s) => s.id === p.sheetId);
    if (!st) throw new Error('fake: 복사할 탭이 없습니다');
    let title = 'Copy of ' + st.title, n = 2;
    while (dst.sheets.some((s) => s.title === title)) title = 'Copy of ' + st.title + ' ' + n++;
    const copy = this.addTab(dst, title, st.values);
    this.touch(dst);
    return this.props(dst, copy);
  }
  m_files_list(p) {
    const q = p.q || '';
    const m = /'([^']+)' in parents/.exec(q);
    const folder = m ? m[1] : '';
    const nameM = /name = '((?:[^'\\]|\\.)*)'/.exec(q);
    const name = nameM ? nameM[1].replace(/\\(.)/g, '$1') : '';
    const wantFolder = /mimeType = 'application\/vnd\.google-apps\.folder'/.test(q);
    const notFolder = /mimeType != 'application\/vnd\.google-apps\.folder'/.test(q);
    const books = wantFolder ? [] : Array.from(this.books.values()).filter((b) => b.parent === folder && (!name || b.name === name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((b) => ({ id: b.id, name: b.name, modifiedTime: b.modified, mimeType: MIME_SHEET }));
    const FOLDER = 'application/vnd.google-apps.folder';
    const files = Array.from(this.files.values()).filter((f) => !f.trashed && f.parents.indexOf(folder) >= 0 && (!name || f.name === name) &&
      (!wantFolder || f.mimeType === FOLDER) && (!notFolder || f.mimeType !== FOLDER)).map((f) => this.fileMeta(f));
    return { files: books.concat(files) };
  }
  m_files_get(p, extra) {
    const f = this.files.get(p.fileId);
    if (f) {
      if (p.alt === 'media') return { bytes: Buffer.from(f.bytes) };
      return this.fileMeta(f);
    }
    const b = this.book(p.fileId);
    return { id: b.id, name: b.name, modifiedTime: b.modified, mimeType: MIME_SHEET };
  }
  m_files_create(p, extra) {
    const r = p.requestBody;
    if (r.mimeType && r.mimeType !== MIME_SHEET) {
      const bytes = extra && extra.media && extra.media.data ? Buffer.from(extra.media.data) : Buffer.alloc(0);
      return this.fileMeta(this.addFile({ name: r.name, parent: (r.parents || [])[0], mimeType: r.mimeType, bytes }));
    }
    const b = this.addBook(r.name, { 'Sheet1': [] }, (r.parents || [])[0] || '');
    return { id: b.id, name: b.name };
  }
  m_files_update(p) {
    const f = this.files.get(p.fileId);
    if (!f) return { id: p.fileId };
    const r = p.requestBody || {};
    if (r.trashed != null) f.trashed = !!r.trashed;
    if (r.name) f.name = r.name;
    return this.fileMeta(f);
  }
  m_permissions_create() { return {}; }
}

module.exports = { FakeGoogle, MIME_SHEET };
