/**
 * 자동 발송 일정 (예전 '트리거')
 * ------------------------------------------------------------
 *  - 월요일 오전 8:00   미제출리마인더  (지난 주일 보고서를 안 낸 셀장에게)
 *  - 주일   오후 4:30   주일독려        (그날 보고서를 아직 안 낸 셀장에게)
 * 시각은 토론토 시간입니다. 켜고 끄기는 설정 시트의 '리마인더사용' (ON/OFF).
 *
 * 주의: Render 무료 요금제는 15분 동안 접속이 없으면 서버가 잠듭니다.
 * 잠들어 있으면 이 시계도 멈추므로, 외부 알림 서비스(cron-job.org 등)가
 *   https://<앱주소>/cron/미제출리마인더?secret=<CRON_SECRET>
 * 를 정해진 시각에 불러 주도록 해 두면 확실합니다. (README 참고)
 * 이미 보낸 셀에는 다시 보내지 않으므로 둘 다 켜 두어도 두 번 가지 않습니다.
 */
const { partsOf } = require('./dates');

const JOBS = [
  { fn: '미제출리마인더', day: 'Monday', hour: 8, minute: 0 },
  { fn: '주일독려', day: 'Sunday', hour: 16, minute: 30 },
];

function start(runJob) {
  const done = {};
  const tick = () => {
    const now = new Date();
    const p = partsOf(now, process.env.TZ || 'America/Toronto');
    const today = p.y + '-' + p.M + '-' + p.d;
    JOBS.forEach((j) => {
      if (p.E !== j.day) return;
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

const names = () => JOBS.map((j) => j.fn);

module.exports = { start, names, JOBS };
