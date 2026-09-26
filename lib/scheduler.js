/**
 * 자동 발송 일정 (예전 '트리거')
 * ------------------------------------------------------------
 * 기본값
 *  - 월요일 오전 8:00   미제출리마인더  (지난 주일 보고서를 안 낸 셀장에게)
 *  - 주일   오후 4:30   주일독려        (그날 보고서를 아직 안 낸 셀장에게)
 *  - 매일   오전 9:00   마감알림        (사역팀 보고 · 선교팀 서류 마감)
 * 요일·시각은 관리 화면(알림 관리)에서 바꿀 수 있고, 설정 시트에 저장됩니다.
 * 시각은 토론토 시간입니다. 켜고 끄기는 설정 시트의 '리마인더사용' (ON/OFF).
 *
 * 주의: Render 무료 요금제는 15분 동안 접속이 없으면 서버가 잠듭니다.
 * 잠들어 있으면 이 시계도 멈추므로, 외부 알림 서비스(cron-job.org 등)가
 *   https://<앱주소>/cron/미제출리마인더?secret=<CRON_SECRET>
 * 를 정해진 시각에 불러 주도록 해 두면 확실합니다. (README 참고)
 * 이미 보낸 셀에는 다시 보내지 않으므로 둘 다 켜 두어도 두 번 가지 않습니다.
 */
const { partsOf } = require('./dates');

/** 기본 일정 — 설정에 값이 없으면 이대로 돕니다 */
const JOBS = [
  { fn: '미제출리마인더', day: 'Monday', hour: 8, minute: 0 },
  { fn: '주일독려', day: 'Sunday', hour: 16, minute: 30 },
  { fn: '마감알림', day: '매일', hour: 9, minute: 0 },
  { fn: '설교요약돌기', day: 'Monday', hour: 10, minute: 0 },
  { fn: '지출번역돌기', day: '매일', hour: 2, minute: 0 },
];

const DAYS = {
  '일': 'Sunday', '월': 'Monday', '화': 'Tuesday', '수': 'Wednesday',
  '목': 'Thursday', '금': 'Friday', '토': 'Saturday', '매일': '매일',
};

/** 설정에서 읽은 일정({fn: '월 08:00'})을 JOBS 모양으로 바꿉니다 */
function merge(custom) {
  if (!custom || typeof custom !== 'object') return JOBS;
  return JOBS.map((j) => {
    const v = String(custom[j.fn] || '').trim();
    if (!v) return j;
    if (v.toUpperCase() === 'OFF') return Object.assign({}, j, { off: true });
    const m = /^(\S+)\s+(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return j;
    const day = DAYS[m[1]] || m[1];
    return { fn: j.fn, day, hour: Number(m[2]), minute: Number(m[3]) };
  }).filter((j) => !j.off);
}

let getCustom = () => null;
function setScheduleReader(fn) { getCustom = fn; }

let cached = null, cachedAt = 0;
function jobsNow() {
  if (Date.now() - cachedAt > 10 * 60 * 1000) {
    cachedAt = Date.now();
    try { cached = merge(getCustom()); } catch (e) { cached = JOBS; }
  }
  return cached || JOBS;
}

function start(runJob) {
  const done = {};
  const tick = () => {
    const now = new Date();
    const p = partsOf(now, process.env.TZ || 'America/Toronto');
    const today = p.y + '-' + p.M + '-' + p.d;
    jobsNow().forEach((j) => {
      if (j.day !== '매일' && p.E !== j.day) return;
      const mins = p.H * 60 + p.m, at = j.hour * 60 + j.minute;
      // 정각부터 2시간 안에 서버가 깨어 있으면 한 번 보냅니다
      if (mins < at || mins > at + 120) return;
      if (done[j.fn] === today) return;
      done[j.fn] = today;
      try {
        runJob(j.fn);
        console.log('[자동 발송]', j.fn, '완료');
      } catch (e) {
        console.error('[자동 발송 실패]', j.fn, e.message);
      }
    });
  };
  setInterval(tick, 60 * 1000).unref();
  setTimeout(tick, 15 * 1000).unref();
}

/** 바깥에서 /cron/<이름> 으로 부를 수 있는 작업 이름 (일정이 꺼져 있어도 부를 수 있게 기본값을 씁니다) */
const names = () => JOBS.map((j) => j.fn);

module.exports = { start, names, JOBS, setScheduleReader, jobsNow };
