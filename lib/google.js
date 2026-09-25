/**
 * 구글 시트 · 드라이브 · 캘린더 · 메일 도우미
 * ------------------------------------------------------------
 * 업무 로직(logic/app.js)은 SpreadsheetApp · DriveApp · CalendarApp · MailApp ·
 * UrlFetchApp · Utilities · CacheService … 같은 이름으로 일을 시킵니다.
 * 여기서 그 이름들을 구글 공식 API(googleapis)와 Gmail SMTP 로 똑같이 만들어 줍니다.
 *
 * 속도를 위해
 *  - 시트는 한 번에 통째로 읽어 서버 메모리에 둡니다 (API 두 번).
 *  - 쓰기는 모아 두었다가 한 번에 보냅니다 (요청이 끝날 때, 또는 읽기 직전에).
 *  - 누가 시트를 직접 고치면 드라이브의 '수정 시각'이 바뀌므로, 그걸 보고 다시 읽습니다.
 */
const crypto = require('crypto');
const bridge = require('./bridge');
const { formatDate, serialToDate, dateToSheetText } = require('./dates');

const TZ = () => process.env.TZ || 'America/Toronto';

/* =========================================================
   캐시 (예전 CacheService) — 서버 메모리
   ========================================================= */
const cacheStore = new Map();
const Cache = {
  get(k) {
    const e = cacheStore.get(String(k));
    if (!e) return null;
    if (e.exp < Date.now()) { cacheStore.delete(String(k)); return null; }
    return e.v;
  },
  put(k, v, ttl) {
    const sec = Math.max(1, Math.min(Number(ttl) || 600, 21600));
    cacheStore.set(String(k), { v: String(v), exp: Date.now() + sec * 1000 });
  },
  getAll(keys) { const o = {}; (keys || []).forEach((k) => { const v = Cache.get(k); if (v !== null) o[k] = v; }); return o; },
  putAll(obj, ttl) { Object.keys(obj || {}).forEach((k) => Cache.put(k, obj[k], ttl)); },
  remove(k) { cacheStore.delete(String(k)); },
  removeAll(keys) { (keys || []).forEach((k) => cacheStore.delete(String(k))); },
};
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of cacheStore) if (e.exp < now) cacheStore.delete(k);
}, 10 * 60 * 1000).unref();

/* =========================================================
   시트 — 한 스프레드시트를 메모리에 들고 있는 책
   ========================================================= */
function quote(title) { return "'" + String(title).replace(/'/g, "''") + "'"; }
function colName(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function a1(r, c) { return colName(c) + r; }

function hexColor(h) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h || '').trim());
  if (!m) return null;
  return { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255 };
}

function numberFormatOf(f) {
  f = String(f);
  if (f === '@') return { type: 'TEXT', pattern: '@' };
  if (/%/.test(f)) return { type: 'PERCENT', pattern: f };
  if (/[yd]/i.test(f) && /[hHs]/.test(f)) return { type: 'DATE_TIME', pattern: f };
  if (/[yd]/i.test(f)) return { type: 'DATE', pattern: f };
  if (/^[Hhms:\s]+$/.test(f)) return { type: 'TIME', pattern: f };
  return { type: 'NUMBER', pattern: f };
}

function toCell(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : dateToSheetText(v);
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : String(v);
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  return String(v);
}

class Book {
  constructor(id) {
    this.id = id;
    this.meta = null;            // { title, timeZone }
    this.sheets = new Map();     // title -> 시트 상태
    this.loadedAll = false;
    this.ops = [];               // 아직 안 보낸 쓰기 (순서대로)
  }

  ensureMeta() {
    if (this.meta) return;
    const d = bridge.sheets('spreadsheets.get', {
      spreadsheetId: this.id,
      fields: 'properties(title,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)))',
    });
    this.setMeta(d);
  }

  setMeta(d) {
    this.meta = { title: d.properties.title, timeZone: d.properties.timeZone };
    this.sheets = new Map();
    (d.sheets || []).forEach((s) => {
      const p = s.properties, g = p.gridProperties || {};
      this.sheets.set(p.title, {
        id: p.sheetId, title: p.title, index: p.index,
        rows: g.rowCount || 0, cols: g.columnCount || 0,
        grid: null, dirty: false, stale: false,
      });
    });
    this.loadedAll = false;
  }

  invalidate() { this.meta = null; this.sheets = new Map(); this.loadedAll = false; }

  /** 시트 여러 개를 한 번에 읽습니다 (숫자로 한 번, 날짜를 가려내려고 글자로 한 번) */
  loadGrids(list) {
    if (!list.length) return;
    const CHUNK = 60;
    for (let i = 0; i < list.length; i += CHUNK) {
      const part = list.slice(i, i + CHUNK);
      const ranges = part.map((st) => quote(st.title));
      const base = { spreadsheetId: this.id, ranges, valueRenderOption: 'UNFORMATTED_VALUE', majorDimension: 'ROWS' };
      const raw = bridge.sheets('spreadsheets.values.batchGet', Object.assign({ dateTimeRenderOption: 'SERIAL_NUMBER' }, base));
      const txt = bridge.sheets('spreadsheets.values.batchGet', Object.assign({ dateTimeRenderOption: 'FORMATTED_STRING' }, base));
      part.forEach((st, k) => {
        const a = (raw.valueRanges[k] && raw.valueRanges[k].values) || [];
        const b = (txt.valueRanges[k] && txt.valueRanges[k].values) || [];
        st.grid = a.map((row, r) => row.map((v, c) => {
          if (v === undefined || v === null) return '';
          if (typeof v === 'number' && b[r] && typeof b[r][c] === 'string') return serialToDate(v);
          return v;
        }));
        st.stale = false;
        st.dirty = false;
      });
    }
  }

  /** 값을 읽기 전에 — 이 시트에 안 보낸 쓰기가 있으면 먼저 보내고 새로 읽습니다 */
  fresh(st) {
    if (st.dirty) this.flush();
    this.local(st);
  }

  /** 크기(마지막 행 등)만 필요할 때 — 메모리 값을 그대로 씁니다 */
  local(st) {
    if (st.grid && (!st.stale || st.dirty)) return;
    if (this.ops.length) this.flush();
    // 처음이면 시트 전체를, 그 뒤로는 바뀐 시트만 다시 읽습니다
    const need = [];
    for (const s of this.sheets.values()) {
      if (s.dirty) continue;
      if (s === st || s.stale || (!this.loadedAll && s.grid === null)) need.push(s);
    }
    this.loadGrids(need);
    this.loadedAll = true;
  }

  push(op) { this.ops.push(op); }

  flush() {
    if (!this.ops.length) return;
    const ops = this.ops;
    this.ops = [];
    try {
      let i = 0;
      while (i < ops.length) {
        const type = ops[i].type;
        const group = [];
        while (i < ops.length && ops[i].type === type) group.push(ops[i++]);
        if (type === 'values') {
          for (let j = 0; j < group.length; j += 400) {
            bridge.sheets('spreadsheets.values.batchUpdate', {
              spreadsheetId: this.id,
              requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: group.slice(j, j + 400).map((g) => ({ range: g.range, majorDimension: 'ROWS', values: g.values })),
              },
            });
          }
        } else {
          for (let j = 0; j < group.length; j += 400) {
            bridge.sheets('spreadsheets.batchUpdate', {
              spreadsheetId: this.id,
              requestBody: { requests: group.slice(j, j + 400).map((g) => g.req) },
            });
          }
        }
      }
    } catch (e) {
      // 일부만 들어갔을 수 있으니 전부 새로 읽게 합니다
      for (const s of this.sheets.values()) { s.stale = true; s.dirty = false; }
      this.wrote = true;
      throw e;
    }
    for (const s of this.sheets.values()) if (s.dirty) { s.dirty = false; s.stale = true; }
    this.wrote = true;
  }
}

/* ---------- 앱이 쓰는 스프레드시트 하나는 계속 들고 있습니다 ---------- */
const store = {
  book: null,
  lastCheck: 0,
  knownModified: '',
  active() {
    const id = process.env.SPREADSHEET_ID;
    if (!id) throw new Error('SPREADSHEET_ID 환경 변수가 없습니다.');
    if (!this.book || this.book.id !== id) this.book = new Book(id);
    return this.book;
  },
  /** 누가 시트를 직접 고쳤는지 확인 (몇 초에 한 번만) */
  checkExternal() {
    const every = Number(process.env.SHEET_CHECK_SECONDS || 10) * 1000;
    if (Date.now() - this.lastCheck < every) return;
    this.lastCheck = Date.now();
    const book = this.active();
    let m = '';
    try {
      m = bridge.drive('files.get', { fileId: book.id, fields: 'modifiedTime', supportsAllDrives: true }).modifiedTime || '';
    } catch (e) { return; }
    if (this.knownModified && m && m !== this.knownModified) this.resetAll();
    if (m) this.knownModified = m;
  },
  /** 우리가 쓴 뒤 — 지금 수정 시각을 기억해 두어 우리 쓰기를 남의 수정으로 착각하지 않게 합니다 */
  afterWrite() {
    try {
      const m = bridge.drive('files.get', { fileId: this.active().id, fields: 'modifiedTime', supportsAllDrives: true }).modifiedTime;
      if (m) this.knownModified = m;
      this.lastCheck = Date.now();
    } catch (e) { /* 다음 확인 때 맞춰집니다 */ }
  },
  resetAll() {
    if (this.book) this.book.invalidate();
    cacheStore.clear();
  },
};

/* =========================================================
   실행 한 번(요청 한 번)마다 새로 만드는 도우미 묶음
   ========================================================= */
function makeServices(exec) {
  exec.books = exec.books || new Set();
  const use = (book) => { exec.books.add(book); return book; };

  /* ---------------- Blob ---------------- */
  class Blob {
    constructor(data, contentType, name) {
      this._b = toBuffer(data);
      this._t = contentType || null;
      this._n = name || null;
    }
    getBytes() { return Buffer.from(this._b); }
    getDataAsString(cs) { return this._b.toString(/ascii/i.test(cs || '') ? 'latin1' : 'utf8'); }
    getContentType() { return this._t; }
    setContentType(t) { this._t = t; return this; }
    getName() { return this._n; }
    setName(n) { this._n = n; return this; }
    setBytes(b) { this._b = toBuffer(b); return this; }
    setDataFromString(s) { this._b = Buffer.from(String(s), 'utf8'); return this; }
    copyBlob() { return new Blob(this._b, this._t, this._n); }
    getBlob() { return this; }
    isGoogleType() { return false; }
    getAs(mime) {
      if (!mime || mime === this._t) return this.copyBlob();
      if (mime === 'application/pdf' && /html|text\/plain/i.test(this._t || '')) return htmlToPdf(this);
      throw new Error(this._t + ' 파일을 ' + mime + ' 로 바꿀 수 없습니다.');
    }
  }
  function toBuffer(d) {
    if (d == null) return Buffer.alloc(0);
    if (Buffer.isBuffer(d)) return d;
    if (d instanceof Uint8Array) return Buffer.from(d);
    if (Array.isArray(d)) return Buffer.from(d.map((x) => x & 255));
    if (d instanceof Blob) return d.getBytes();
    return Buffer.from(String(d), 'utf8');
  }
  function baseName(n) { return String(n || 'file').replace(/\.[^.]+$/, ''); }

  /** HTML → PDF: 구글 문서로 한 번 올렸다가 PDF 로 받아 옵니다 (Apps Script 와 같은 방식) */
  function htmlToPdf(blob) {
    const made = bridge.drive('files.create', {
      requestBody: { name: baseName(blob.getName()) + ' (임시)', mimeType: 'application/vnd.google-apps.document' },
      fields: 'id',
    }, { media: { mimeType: 'text/html', data: blob.getBytes() } });
    try {
      const r = bridge.drive('files.export', { fileId: made.id, mimeType: 'application/pdf' }, { binary: true });
      return new Blob(r.bytes, 'application/pdf', baseName(blob.getName()) + '.pdf');
    } finally {
      try { bridge.drive('files.delete', { fileId: made.id }); } catch (e) { /* 임시 문서 — 남아도 무해 */ }
    }
  }

  /* ---------------- 시트 ---------------- */
  class Range {
    constructor(book, st, r, c, nr, nc) {
      if (!(r >= 1 && c >= 1 && nr >= 1 && nc >= 1)) {
        throw new Error('범위가 올바르지 않습니다: 행 ' + r + ', 열 ' + c + ', ' + nr + '행 ' + nc + '열');
      }
      Object.assign(this, { book, st, r, c, nr, nc });
    }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    getNumRows() { return this.nr; }
    getNumColumns() { return this.nc; }
    getLastRow() { return this.r + this.nr - 1; }
    getLastColumn() { return this.c + this.nc - 1; }
    getSheet() { return new Sheet(this.book, this.st); }
    getA1Notation() { return a1(this.r, this.c) + (this.nr > 1 || this.nc > 1 ? ':' + a1(this.r + this.nr - 1, this.c + this.nc - 1) : ''); }
    gridRange() {
      return { sheetId: this.st.id, startRowIndex: this.r - 1, endRowIndex: this.r - 1 + this.nr,
        startColumnIndex: this.c - 1, endColumnIndex: this.c - 1 + this.nc };
    }

    getValues() {
      this.book.fresh(this.st);
      const g = this.st.grid, out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = g[this.r - 1 + i] || [], o = [];
        for (let j = 0; j < this.nc; j++) {
          const v = row[this.c - 1 + j];
          o.push(v === undefined || v === null ? '' : v);
        }
        out.push(o);
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    getDisplayValues() {
      return this.getValues().map((r) => r.map((v) => (v instanceof Date ? formatDate(v, TZ(), 'yyyy-MM-dd HH:mm:ss') : String(v))));
    }
    getDisplayValue() { return this.getDisplayValues()[0][0]; }

    setValues(values) {
      if (!Array.isArray(values) || values.length !== this.nr) {
        throw new Error('데이터의 행 수(' + (values && values.length) + ')가 범위의 행 수(' + this.nr + ')와 다릅니다.');
      }
      values.forEach((row) => {
        if (!Array.isArray(row) || row.length !== this.nc) {
          throw new Error('데이터의 열 수(' + (row && row.length) + ')가 범위의 열 수(' + this.nc + ')와 다릅니다.');
        }
      });
      writeValues(this.book, this.st, this.r, this.c, values);
      return this;
    }
    setValue(v) {
      const rows = [];
      for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(v); rows.push(row); }
      return this.setValues(rows);
    }
    clearContent() {
      this.book.local(this.st);
      this.book.push({ type: 'req', req: { updateCells: { range: this.gridRange(), fields: 'userEnteredValue' } } });
      const g = this.st.grid;
      for (let i = 0; i < this.nr; i++) {
        const row = g[this.r - 1 + i];
        if (!row) continue;
        for (let j = 0; j < this.nc; j++) if (this.c - 1 + j < row.length) row[this.c - 1 + j] = '';
      }
      this.st.dirty = true;
      return this;
    }
    clear() {
      this.clearContent();
      this.book.push({ type: 'req', req: { updateCells: { range: this.gridRange(), fields: 'userEnteredFormat,note' } } });
      return this;
    }
    fmt(cellFormat, fields) {
      this.book.push({ type: 'req', req: { repeatCell: { range: this.gridRange(), cell: { userEnteredFormat: cellFormat }, fields: fields } } });
      return this;
    }
    setNumberFormat(f) { return this.fmt({ numberFormat: numberFormatOf(f) }, 'userEnteredFormat.numberFormat'); }
    setFontWeight(w) { return this.fmt({ textFormat: { bold: String(w) === 'bold' } }, 'userEnteredFormat.textFormat.bold'); }
    setFontColor(c) {
      const rgb = hexColor(c);
      return rgb ? this.fmt({ textFormat: { foregroundColor: rgb } }, 'userEnteredFormat.textFormat.foregroundColor') : this;
    }
    setBackground(c) {
      const rgb = hexColor(c);
      return rgb ? this.fmt({ backgroundColor: rgb }, 'userEnteredFormat.backgroundColor') : this;
    }
    setNote(note) {
      this.book.push({ type: 'req', req: { repeatCell: { range: this.gridRange(), cell: { note: String(note == null ? '' : note) }, fields: 'note' } } });
      return this;
    }
    setWrap(w) { return this.fmt({ wrapStrategy: w ? 'WRAP' : 'OVERFLOW_CELL' }, 'userEnteredFormat.wrapStrategy'); }
    setHorizontalAlignment(a) { return this.fmt({ horizontalAlignment: String(a || 'left').toUpperCase() }, 'userEnteredFormat.horizontalAlignment'); }
  }

  function ensureSize(book, st, rows, cols) {
    if (rows > st.rows) {
      book.push({ type: 'req', req: { appendDimension: { sheetId: st.id, dimension: 'ROWS', length: rows - st.rows } } });
      st.rows = rows;
    }
    if (cols > st.cols) {
      book.push({ type: 'req', req: { appendDimension: { sheetId: st.id, dimension: 'COLUMNS', length: cols - st.cols } } });
      st.cols = cols;
    }
  }

  function writeValues(book, st, r, c, values) {
    book.local(st);
    const nr = values.length, nc = values[0] ? values[0].length : 0;
    if (!nr || !nc) return;
    ensureSize(book, st, r + nr - 1, c + nc - 1);
    book.push({
      type: 'values',
      range: quote(st.title) + '!' + a1(r, c) + ':' + a1(r + nr - 1, c + nc - 1),
      values: values.map((row) => row.map(toCell)),
    });
    const g = st.grid;
    for (let i = 0; i < nr; i++) {
      const ri = r - 1 + i;
      while (g.length <= ri) g.push([]);
      const row = g[ri];
      while (row.length < c - 1) row.push('');
      for (let j = 0; j < nc; j++) {
        const v = values[i][j];
        row[c - 1 + j] = v === null || v === undefined ? '' : v;
      }
    }
    st.dirty = true;
  }

  function lastRowOf(st) {
    const g = st.grid;
    for (let i = g.length - 1; i >= 0; i--) {
      const row = g[i];
      if (row && row.some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
    }
    return 0;
  }
  function lastColOf(st) {
    let m = 0;
    st.grid.forEach((row) => {
      for (let j = row.length - 1; j >= m; j--) {
        const v = row[j];
        if (v !== '' && v !== null && v !== undefined) { m = j + 1; break; }
      }
    });
    return m;
  }

  class Sheet {
    constructor(book, st) { this.book = book; this.st = st; }
    getName() { return this.st.title; }
    getSheetName() { return this.st.title; }
    getSheetId() { return this.st.id; }
    getIndex() { return this.st.index + 1; }
    getParent() { return new Spreadsheet(this.book); }
    getMaxRows() { this.book.ensureMeta(); return this.st.rows; }
    getMaxColumns() { this.book.ensureMeta(); return this.st.cols; }
    getLastRow() { this.book.local(this.st); return lastRowOf(this.st); }
    getLastColumn() { this.book.local(this.st); return lastColOf(this.st); }
    getRange(r, c, nr, nc) {
      if (typeof r === 'string') throw new Error('A1 표기 범위는 지원하지 않습니다: ' + r);
      return new Range(this.book, this.st, Number(r), Number(c), nr === undefined ? 1 : Number(nr), nc === undefined ? 1 : Number(nc));
    }
    getDataRange() {
      this.book.local(this.st);
      return new Range(this.book, this.st, 1, 1, Math.max(1, lastRowOf(this.st)), Math.max(1, lastColOf(this.st)));
    }
    appendRow(values) {
      this.book.local(this.st);
      writeValues(this.book, this.st, lastRowOf(this.st) + 1, 1, [values.slice()]);
      return this;
    }
    deleteRow(r) { return this.deleteRows(r, 1); }
    deleteRows(r, n) {
      this.book.local(this.st);
      n = n || 1;
      this.book.push({ type: 'req', req: { deleteDimension: { range: { sheetId: this.st.id, dimension: 'ROWS', startIndex: r - 1, endIndex: r - 1 + n } } } });
      this.st.grid.splice(r - 1, n);
      this.st.rows = Math.max(0, this.st.rows - n);
      this.st.dirty = true;
      return this;
    }
    insertColumnsAfter(after, n) {
      this.book.local(this.st);
      this.book.push({ type: 'req', req: { insertDimension: { range: { sheetId: this.st.id, dimension: 'COLUMNS', startIndex: after, endIndex: after + n }, inheritFromBefore: after > 0 } } });
      this.st.grid.forEach((row) => { if (row.length > after) row.splice(after, 0, ...new Array(n).fill('')); });
      this.st.cols += n;
      this.st.dirty = true;
      return this;
    }
    hideColumns(c, n) {
      this.book.push({ type: 'req', req: { updateDimensionProperties: { range: { sheetId: this.st.id, dimension: 'COLUMNS', startIndex: c - 1, endIndex: c - 1 + (n || 1) }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } } });
      return this;
    }
    setColumnWidth(c, px) {
      this.book.push({ type: 'req', req: { updateDimensionProperties: { range: { sheetId: this.st.id, dimension: 'COLUMNS', startIndex: c - 1, endIndex: c }, properties: { pixelSize: Number(px) }, fields: 'pixelSize' } } });
      return this;
    }
    setFrozenRows(n) {
      this.book.push({ type: 'req', req: { updateSheetProperties: { properties: { sheetId: this.st.id, gridProperties: { frozenRowCount: n } }, fields: 'gridProperties.frozenRowCount' } } });
      return this;
    }
    setFrozenColumns(n) {
      this.book.push({ type: 'req', req: { updateSheetProperties: { properties: { sheetId: this.st.id, gridProperties: { frozenColumnCount: n } }, fields: 'gridProperties.frozenColumnCount' } } });
      return this;
    }
    setName(name) {
      name = String(name);
      if (name === this.st.title) return this;
      this.book.push({ type: 'req', req: { updateSheetProperties: { properties: { sheetId: this.st.id, title: name }, fields: 'title' } } });
      this.book.sheets.delete(this.st.title);
      this.st.title = name;
      this.book.sheets.set(name, this.st);
      return this;
    }
    clear() {
      this.book.local(this.st);
      this.book.push({ type: 'req', req: { updateCells: { range: { sheetId: this.st.id }, fields: '*' } } });
      this.st.grid = [];
      this.st.dirty = true;
      return this;
    }
    clearContents() {
      this.book.local(this.st);
      this.book.push({ type: 'req', req: { updateCells: { range: { sheetId: this.st.id }, fields: 'userEnteredValue' } } });
      this.st.grid = [];
      this.st.dirty = true;
      return this;
    }
  }

  class Spreadsheet {
    constructor(book) { this.book = use(book); }
    getId() { return this.book.id; }
    getName() { this.book.ensureMeta(); return this.book.meta.title; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.book.id + '/edit'; }
    getSpreadsheetTimeZone() { this.book.ensureMeta(); return this.book.meta.timeZone || TZ(); }
    getSheetByName(name) {
      this.book.ensureMeta();
      const st = this.book.sheets.get(String(name));
      return st ? new Sheet(this.book, st) : null;
    }
    getSheets() {
      this.book.ensureMeta();
      return Array.from(this.book.sheets.values()).sort((a, b) => a.index - b.index).map((st) => new Sheet(this.book, st));
    }
    insertSheet(name) {
      this.book.ensureMeta();
      name = String(name || ('Sheet' + (this.book.sheets.size + 1)));
      if (this.book.sheets.has(name)) throw new Error('"' + name + '" 이름의 시트가 이미 있습니다.');
      const used = new Set(Array.from(this.book.sheets.values()).map((s) => s.id));
      let id;
      do { id = 1 + Math.floor(Math.random() * 2000000000); } while (used.has(id));
      const index = this.book.sheets.size;
      this.book.push({ type: 'req', req: { addSheet: { properties: { sheetId: id, title: name, index, gridProperties: { rowCount: 1000, columnCount: 26 } } } } });
      const st = { id, title: name, index, rows: 1000, cols: 26, grid: [], dirty: false, stale: false };
      this.book.sheets.set(name, st);
      return new Sheet(this.book, st);
    }
    deleteSheet(sheet) {
      this.book.push({ type: 'req', req: { deleteSheet: { sheetId: sheet.st.id } } });
      this.book.sheets.delete(sheet.st.title);
    }
  }

  const SpreadsheetApp = {
    getActiveSpreadsheet() { return new Spreadsheet(store.active()); },
    getActive() { return new Spreadsheet(store.active()); },
    openById(id) { return new Spreadsheet(id === store.active().id ? store.active() : new Book(id)); },
    create(name) {
      const d = bridge.sheets('spreadsheets.create', {
        requestBody: { properties: { title: String(name), timeZone: TZ() } },
        fields: 'spreadsheetId,properties(title,timeZone),sheets(properties(sheetId,title,index,gridProperties))',
      });
      const book = new Book(d.spreadsheetId);
      book.setMeta(d);
      for (const st of book.sheets.values()) st.grid = [];
      book.loadedAll = true;
      return new Spreadsheet(book);
    },
    flush() { for (const b of exec.books) b.flush(); },
  };

  /* ---------------- 드라이브 ---------------- */
  const FIELDS = 'id,name,mimeType,parents,webViewLink,trashed,size';
  const FOLDER = 'application/vnd.google-apps.folder';
  const qs = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  function iter(list) {
    let i = 0;
    return { hasNext: () => i < list.length, next: () => { if (i >= list.length) throw new Error('더 이상 없습니다.'); return list[i++]; } };
  }
  function listFiles(q) {
    const out = [];
    let pageToken;
    do {
      const d = bridge.drive('files.list', { q, fields: 'nextPageToken,files(' + FIELDS + ')', pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
      out.push(...(d.files || []));
      pageToken = d.nextPageToken;
    } while (pageToken);
    return out;
  }
  const wrap = (m) => (m.mimeType === FOLDER ? new Folder(m) : new File(m));

  class DriveItem {
    constructor(meta) { this.m = meta; }
    getId() { return this.m.id; }
    getName() { return this.m.name; }
    getMimeType() { return this.m.mimeType; }
    getSize() { return Number(this.m.size || 0); }
    getUrl() {
      return this.m.webViewLink || (this.m.mimeType === FOLDER
        ? 'https://drive.google.com/drive/folders/' + this.m.id
        : 'https://drive.google.com/file/d/' + this.m.id + '/view?usp=drivesdk');
    }
    isTrashed() { return !!this.m.trashed; }
    setTrashed(t) {
      this.m = bridge.drive('files.update', { fileId: this.m.id, requestBody: { trashed: !!t }, fields: FIELDS, supportsAllDrives: true });
      return this;
    }
    setName(n) {
      this.m = bridge.drive('files.update', { fileId: this.m.id, requestBody: { name: String(n) }, fields: FIELDS, supportsAllDrives: true });
      return this;
    }
    setDescription(d) {
      bridge.drive('files.update', { fileId: this.m.id, requestBody: { description: String(d) }, supportsAllDrives: true });
      return this;
    }
    setSharing(access, permission) {
      const role = permission === 'EDIT' ? 'writer' : permission === 'COMMENT' ? 'commenter' : 'reader';
      if (access === 'ANYONE' || access === 'ANYONE_WITH_LINK') {
        bridge.drive('permissions.create', { fileId: this.m.id, requestBody: { type: 'anyone', role, allowFileDiscovery: access === 'ANYONE' }, supportsAllDrives: true });
      }
      return this;
    }
    getParents() {
      return iter((this.m.parents || []).map((id) => new Folder({ id, mimeType: FOLDER })));
    }
  }

  class File extends DriveItem {
    getBlob() {
      if (/^application\/vnd\.google-apps/.test(this.m.mimeType)) return this.getAs('application/pdf');
      const r = bridge.drive('files.get', { fileId: this.m.id, alt: 'media', supportsAllDrives: true }, { binary: true });
      return new Blob(r.bytes, this.m.mimeType, this.m.name);
    }
    getAs(mime) {
      if (/^application\/vnd\.google-apps/.test(this.m.mimeType)) {
        const r = bridge.drive('files.export', { fileId: this.m.id, mimeType: mime }, { binary: true });
        return new Blob(r.bytes, mime, baseName(this.m.name) + (mime === 'application/pdf' ? '.pdf' : ''));
      }
      return this.getBlob().getAs(mime);
    }
  }

  class Folder extends DriveItem {
    createFile(blobOrName, content, mime) {
      const blob = (blobOrName && typeof blobOrName === 'object') ? blobOrName
        : new Blob(content || '', mime || 'text/plain', blobOrName);
      const type = blob.getContentType() || 'application/octet-stream';
      const m = bridge.drive('files.create', {
        requestBody: { name: blob.getName() || 'file', parents: [this.m.id], mimeType: type },
        fields: FIELDS, supportsAllDrives: true,
      }, { media: { mimeType: type, data: blob.getBytes() } });
      return new File(m);
    }
    createFolder(name) {
      return new Folder(bridge.drive('files.create', {
        requestBody: { name: String(name), mimeType: FOLDER, parents: [this.m.id] }, fields: FIELDS, supportsAllDrives: true,
      }));
    }
    getFoldersByName(name) {
      return iter(listFiles("'" + qs(this.m.id) + "' in parents and name = '" + qs(name) + "' and mimeType = '" + FOLDER + "' and trashed = false").map(wrap));
    }
    getFilesByName(name) {
      return iter(listFiles("'" + qs(this.m.id) + "' in parents and name = '" + qs(name) + "' and mimeType != '" + FOLDER + "' and trashed = false").map(wrap));
    }
    getFiles() {
      return iter(listFiles("'" + qs(this.m.id) + "' in parents and mimeType != '" + FOLDER + "' and trashed = false").map(wrap));
    }
    getFolders() {
      return iter(listFiles("'" + qs(this.m.id) + "' in parents and mimeType = '" + FOLDER + "' and trashed = false").map(wrap));
    }
  }

  const root = () => new Folder({ id: 'root', mimeType: FOLDER });
  const DriveApp = {
    Access: { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN: 'DOMAIN', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', PRIVATE: 'PRIVATE' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT', COMMENT: 'COMMENT', OWNER: 'OWNER', NONE: 'NONE' },
    getFileById(id) { return new File(bridge.drive('files.get', { fileId: String(id), fields: FIELDS, supportsAllDrives: true })); },
    getFolderById(id) {
      const m = bridge.drive('files.get', { fileId: String(id), fields: FIELDS, supportsAllDrives: true });
      if (m.mimeType !== FOLDER) throw new Error('폴더가 아닙니다: ' + id);
      return new Folder(m);
    },
    getRootFolder: root,
    createFolder(name) { return root().createFolder(name); },
    createFile(a, b, c) { return root().createFile(a, b, c); },
    getFoldersByName(name) { return root().getFoldersByName(name); },
    getFilesByName(name) { return root().getFilesByName(name); },
  };

  /* ---------------- 캘린더 ---------------- */
  const ymdLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fromYmd = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };

  class CalEvent {
    constructor(calId, ev) { this.calId = calId; this.ev = ev; }
    getId() { return this.ev.id; }
    getTitle() { return this.ev.summary || ''; }
    getDescription() { return this.ev.description || ''; }
    getLocation() { return this.ev.location || ''; }
    isAllDayEvent() { return !!(this.ev.start && this.ev.start.date); }
    isRecurringEvent() { return !!(this.ev.recurringEventId || (this.ev.recurrence && this.ev.recurrence.length)); }
    getStartTime() { return this.ev.start.dateTime ? new Date(this.ev.start.dateTime) : fromYmd(this.ev.start.date); }
    getEndTime() { return this.ev.end.dateTime ? new Date(this.ev.end.dateTime) : fromYmd(this.ev.end.date); }
    getAllDayStartDate() { return this.getStartTime(); }
    getAllDayEndDate() { return this.getEndTime(); }
    patch(body) {
      this.ev = bridge.calendar('events.patch', { calendarId: this.calId, eventId: this.ev.id, requestBody: body });
      return this;
    }
    replaceTimes(start, end) {
      const body = Object.assign({}, this.ev, { start, end });
      this.ev = bridge.calendar('events.update', { calendarId: this.calId, eventId: this.ev.id, requestBody: body });
      return this;
    }
    setTitle(t) { return this.patch({ summary: String(t) }); }
    setDescription(d) { return this.patch({ description: String(d) }); }
    setLocation(l) { return this.patch({ location: String(l) }); }
    setTime(s, e) { return this.replaceTimes({ dateTime: s.toISOString(), timeZone: TZ() }, { dateTime: e.toISOString(), timeZone: TZ() }); }
    setAllDayDate(d) {
      const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return this.replaceTimes({ date: ymdLocal(d) }, { date: ymdLocal(n) });
    }
    setAllDayDates(s, e) { return this.replaceTimes({ date: ymdLocal(s) }, { date: ymdLocal(e) }); }
    deleteEvent() { bridge.calendar('events.delete', { calendarId: this.calId, eventId: this.ev.id }); }
  }

  class Calendar {
    constructor(c) { this.c = c; }
    getId() { return this.c.id; }
    getName() { return this.c.summary || ''; }
    getTimeZone() { return this.c.timeZone || TZ(); }
    getEvents(start, end) {
      const out = [];
      let pageToken;
      do {
        const d = bridge.calendar('events.list', {
          calendarId: this.c.id, timeMin: start.toISOString(), timeMax: end.toISOString(),
          singleEvents: true, orderBy: 'startTime', maxResults: 2500, pageToken,
        });
        (d.items || []).forEach((ev) => { if (ev.status !== 'cancelled') out.push(new CalEvent(this.c.id, ev)); });
        pageToken = d.nextPageToken;
      } while (pageToken);
      return out;
    }
    getEventById(id) {
      try {
        const ev = bridge.calendar('events.get', { calendarId: this.c.id, eventId: String(id) });
        return ev && ev.status !== 'cancelled' ? new CalEvent(this.c.id, ev) : null;
      } catch (e) { return null; }
    }
    insert(title, start, end, opts) {
      opts = opts || {};
      const ev = bridge.calendar('events.insert', {
        calendarId: this.c.id,
        requestBody: { summary: String(title), description: opts.description || '', location: opts.location || '', start, end },
      });
      return new CalEvent(this.c.id, ev);
    }
    createEvent(title, s, e, opts) {
      return this.insert(title, { dateTime: s.toISOString(), timeZone: TZ() }, { dateTime: e.toISOString(), timeZone: TZ() }, opts);
    }
    createAllDayEvent(title, d, endOrOpts, opts) {
      let end;
      if (endOrOpts instanceof Date) end = endOrOpts;
      else { opts = endOrOpts; end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
      return this.insert(title, { date: ymdLocal(d) }, { date: ymdLocal(end) }, opts);
    }
  }

  const CalendarApp = {
    getCalendarById(id) {
      try { return new Calendar(bridge.calendar('calendars.get', { calendarId: String(id) })); }
      catch (e) { return null; }
    },
  };

  /* ---------------- 메일 (Gmail SMTP) ---------------- */
  const MailApp = {
    sendEmail(a, b, c, d) {
      const m = (a && typeof a === 'object') ? Object.assign({}, a) : Object.assign({ to: a, subject: b, body: c }, d || {});
      if (!m.to) throw new Error('받는 사람이 없습니다.');
      if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[메일 건너뜀] GMAIL_USER / GMAIL_APP_PASSWORD 가 없습니다 →', m.to, m.subject);
        return;
      }
      const atts = [].concat(m.attachments || []).map((x) => {
        const blob = x.getBlob ? x.getBlob() : x;
        return { name: blob.getName() || 'file', contentType: blob.getContentType() || 'application/octet-stream', data: blob.getBytes() };
      });
      bridge.call('mail', {
        to: m.to, cc: m.cc, bcc: m.bcc, replyTo: m.replyTo, name: m.name,
        subject: m.subject, body: m.body, htmlBody: m.htmlBody, attachments: atts,
      });
    },
    getRemainingDailyQuota() { return 500; },
  };
  const GmailApp = { sendEmail: MailApp.sendEmail };

  /* ---------------- 외부 주소 호출 ---------------- */
  class HTTPResponse {
    constructor(r) { this.r = r; }
    getResponseCode() { return this.r.status; }
    getContentText(cs) { return Buffer.from(this.r.bytes).toString(/ascii|latin/i.test(cs || '') ? 'latin1' : 'utf8'); }
    getContent() { return Buffer.from(this.r.bytes); }
    getBlob() { return new Blob(this.r.bytes, (this.r.headers['content-type'] || '').split(';')[0] || null, null); }
    getHeaders() { return Object.assign({}, this.r.headers); }
    getAllHeaders() { return Object.assign({}, this.r.headers); }
  }
  const UrlFetchApp = {
    fetch(url, p) {
      p = p || {};
      const headers = Object.assign({}, p.headers || {});
      let body = null;
      if (p.payload !== undefined && p.payload !== null) {
        if (typeof p.payload === 'string') body = p.payload;
        else if (p.payload instanceof Blob) body = p.payload.getBytes();
        else if (Buffer.isBuffer(p.payload) || Array.isArray(p.payload)) body = toBuffer(p.payload);
        else {
          body = new URLSearchParams(Object.keys(p.payload).map((k) => [k, String(p.payload[k])])).toString();
          if (!p.contentType) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if (p.contentType) headers['Content-Type'] = p.contentType;
        else if (typeof p.payload === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      const r = bridge.call('fetch', { url: String(url), method: String(p.method || (body != null ? 'post' : 'get')).toUpperCase(), headers, body });
      if (!p.muteHttpExceptions && r.status >= 400) {
        throw new Error('요청 실패 (' + r.status + '): ' + url + ' — ' + Buffer.from(r.bytes).toString('utf8').slice(0, 300));
      }
      return new HTTPResponse(r);
    },
  };

  /* ---------------- 잡다한 도구 ---------------- */
  const b64 = (buf) => buf.toString('base64');
  const Utilities = {
    Charset: { UTF_8: 'UTF-8', US_ASCII: 'US-ASCII' },
    DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_512: 'sha512' },
    formatDate(d, tz, pattern) { return formatDate(d, tz || TZ(), pattern); },
    getUuid() { return crypto.randomUUID(); },
    newBlob(data, type, name) { return new Blob(data, type, name); },
    base64Encode(data) { return b64(toBuffer(data)); },
    base64EncodeWebSafe(data) { return b64(toBuffer(data)).replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode(s) { return Buffer.from(String(s), 'base64'); },
    base64DecodeWebSafe(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); },
    computeHmacSha256Signature(value, key) {
      return crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest();
    },
    computeDigest(algo, value) { return crypto.createHash(algo || 'sha256').update(toBuffer(value)).digest(); },
    sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, Number(ms) || 0)); },
  };

  const Session = {
    getScriptTimeZone: TZ,
    getActiveUser: () => ({ getEmail: () => '' }),
    getEffectiveUser: () => ({ getEmail: () => process.env.GMAIL_USER || '' }),
  };

  const noLock = { waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } };
  const LockService = { getScriptLock: () => noLock, getDocumentLock: () => noLock, getUserLock: () => noLock };
  const CacheService = { getScriptCache: () => Cache, getDocumentCache: () => Cache, getUserCache: () => Cache };

  const MimeType = {
    HTML: 'text/html', PDF: 'application/pdf', PLAIN_TEXT: 'text/plain', CSV: 'text/csv',
    JPEG: 'image/jpeg', PNG: 'image/png', GIF: 'image/gif', JSON: 'application/json',
    FOLDER, GOOGLE_DOCS: 'application/vnd.google-apps.document', GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet',
    MICROSOFT_EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const Logger = { log: (...a) => console.log('[log]', ...a) };

  return {
    SpreadsheetApp, DriveApp, CalendarApp, MailApp, GmailApp, UrlFetchApp, Utilities,
    Session, CacheService, LockService, MimeType, Logger,
  };
}

module.exports = { makeServices, store, Book, Cache };
