/**
 * 날짜 도우미 — 시간대(토론토)를 지켜서 글자로 바꾸고, 시트의 날짜 숫자를 Date 로 바꿉니다.
 */

const partsCache = new Map();
function fmt(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'long', timeZoneName: 'shortOffset',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** 한 시각을 그 시간대의 연 · 월 · 일 … 로 */
function partsOf(date, tz) {
  const o = {};
  fmt(tz).formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  return {
    y: Number(o.year), M: Number(o.month), d: Number(o.day),
    H: Number(o.hour) % 24, m: Number(o.minute), s: Number(o.second),
    S: date.getTime() - Math.floor(date.getTime() / 1000) * 1000,
    E: o.weekday, zone: o.timeZoneName || 'GMT',
  };
}

const pad = (n, w) => String(n).padStart(w, '0');

/**
 * 자바 SimpleDateFormat 형식 (예: 'yyyy-MM-dd HH:mm', 'M/d', 'EEE') 으로 글자를 만듭니다.
 */
function formatDate(date, tz, pattern) {
  if (!(date instanceof Date) || isNaN(date.getTime())) throw new Error('날짜가 올바르지 않습니다.');
  const p = partsOf(date, tz || process.env.TZ || 'UTC');
  let out = '';
  const re = /'([^']*)'|(y+|M+|d+|H+|h+|k+|K+|m+|s+|S+|E+|a+|u+|Z+|z+|X+)/g;
  let last = 0, mt;
  while ((mt = re.exec(pattern))) {
    out += pattern.slice(last, mt.index);
    last = re.lastIndex;
    if (mt[1] !== undefined) { out += mt[1] === '' ? "'" : mt[1]; continue; }
    const t = mt[2], c = t[0], n = t.length;
    switch (c) {
      case 'y': out += n === 2 ? pad(p.y % 100, 2) : pad(p.y, n); break;
      case 'M':
        if (n >= 4) out += new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: tz }).format(date);
        else if (n === 3) out += new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: tz }).format(date);
        else out += pad(p.M, n);
        break;
      case 'd': out += pad(p.d, n); break;
      case 'H': out += pad(p.H, n); break;
      case 'k': out += pad(p.H === 0 ? 24 : p.H, n); break;
      case 'K': out += pad(p.H % 12, n); break;
      case 'h': out += pad(p.H % 12 === 0 ? 12 : p.H % 12, n); break;
      case 'm': out += pad(p.m, n); break;
      case 's': out += pad(p.s, n); break;
      case 'S': out += pad(p.S, 3).slice(0, Math.max(n, 3)); break;
      case 'E': out += n >= 4 ? p.E : p.E.slice(0, 3); break;
      case 'u': out += ({ Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 })[p.E]; break;
      case 'a': out += p.H < 12 ? 'AM' : 'PM'; break;
      case 'z': out += p.zone; break;
      case 'Z': case 'X': {
        const off = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(p.zone);
        out += off ? off[1] + pad(off[2], 2) + (c === 'X' && n === 3 ? ':' : '') + pad(off[3] || 0, 2) : (c === 'X' ? 'Z' : '+0000');
        break;
      }
      default: out += t;
    }
  }
  return out + pattern.slice(last);
}

/**
 * 시트의 날짜 숫자(1899-12-30 부터의 날 수) → Date.
 * 서버의 TZ 를 시트 시간대와 같게 맞춰 두므로 "벽시계 시각" 그대로 만듭니다.
 */
function serialToDate(serial) {
  const ms = Math.round(serial * 86400000);
  const u = new Date(Date.UTC(1899, 11, 30) + ms);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(),
    u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}

/** Date → 시트에 넣을 글자 (시트가 날짜로 알아봅니다) */
function dateToSheetText(d) {
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' +
    z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
}

module.exports = { formatDate, serialToDate, dateToSheetText, partsOf };
