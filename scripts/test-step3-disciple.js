/** B. 제자훈련 — 단일 원천(제자훈련 시트) · 프로필 조회 · 교적 중복 제거 */
module.exports = function (T) {
  const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
  section('B. 제자훈련 단일 원천');

  const C1start = addDays(TODAY, -14);          // 진행 중인 기수: 오늘 포함 3번 모임이 지남 (9주 과정)
  const tabs = (t) => {
    t['제자훈련기수'] = [['ID', '이름', '시작일', '주차수', '수료기준'], ['C0', '2025 봄', '2025-03-04', 4, 75], ['C1', '지금 기수', C1start, 9, 80]];
    t['제자훈련명단'] = [['이름', '등록일', '메모', '회비', '회비일', '회비메모', '기수'],
      ['정일반', '', '', '', '', '', 'C1'],
      ['김커미티', '', '', '', '', '', 'C0'],
      ['이예배', '', '', '', '', '', 'C0'],
      ['한차단', '', '', '', '', '', 'C1']];
    const att = [['이름', '날짜', '출결', '시각']];
    [-14, -7, 0].forEach((n) => att.push(['정일반', addDays(TODAY, n), '출석', '']));
    ['2025-03-04', '2025-03-11', '2025-03-18', '2025-03-25'].forEach((d) => att.push(['김커미티', d, '출석', '']));
    att.push(['이예배', '2025-03-04', '출석', '']);
    t['제자훈련출결'] = att;
    // 교적의 옛 칸 (제자훈련 I열=8, 제자훈련출석 K열=10): 정일반은 엉뚱한 옛 값, 강허용은 명단에 없는 옛 수료자, 한차단은 낡은 값
    const row = (n) => t['교적'].find((r) => r[0] === n);
    row('정일반')[8] = '미이수'; row('정일반')[10] = '0%';
    row('강허용')[8] = '수료'; row('강허용')[10] = '90% (8/9)';
    row('한차단')[8] = '수료'; row('한차단')[10] = '100% (9/9)';
  };
  const env = newEnv(tabs);
  const 교적값 = (n, col) => env.fake.values(env.legacy.id, '교적').find((r) => r[0] === n)[col];
  const PHONE = (n) => String(4165551000 + n);

  // B1. 프로필은 제자훈련 시트에서 이름으로 찾는다 (교적의 옛 값이 아니라)
  const map = env.run((api) => { const m = api.교적맵_(); return { a: m['정일반'], b: m['김커미티'], c: m['이예배'], d: m['강허용'], e: m['한차단'] }; });
  eq([map.a.discipleship, map.a.trainingRate], ['진행중', '33% (3/9)'], '진행 중인 기수 — 시트 값이 교적의 옛 값(미이수)보다 우선');
  eq([map.b.discipleship, map.b.trainingRate], ['수료', '100% (4/4)'], '지난 기수 수료');
  eq([map.c.discipleship, map.c.trainingRate], ['미이수', '25% (1/4)'], '지난 기수 미이수 (기준 75% 미달)');
  eq([map.d.discipleship, map.d.trainingRate], ['수료', '90% (8/9)'], '명단에 없는 분은 교적의 옛 값을 예비로 (이전 전)');
  eq([map.e.discipleship, map.e.trainingRate], ['진행중', '0% (0/9)'], '시트에 있으면 교적의 낡은 "수료" 는 무시');

  // B2. 포털 첫 화면 (getMyProfile) — 기수별 상세 포함
  const tok = env.run((api) => api.포털토큰_('정일반', PHONE(8), ''));
  const me = env.run((api) => api.getMyProfile(tok)).me;
  eq([me.discipleship, me.trainingRate], ['진행중', '33% (3/9)'], 'getMyProfile 이 훈련 요약을 준다');
  eq(me.training.cohorts.map((c) => [c.id, c.status, c.present, c.weeks]), [['C1', '진행중', 3, 9]], 'getMyProfile 에 기수별 상세가 실린다');
  const tok2 = env.run((api) => api.포털토큰_('오팀장', PHONE(10), ''));
  eq(env.run((api) => api.getMyProfile(tok2)).me.training, null, '훈련과 무관한 분은 training 이 null');

  // B3. 쓰기: 교적의 두 칸은 더 이상 바뀌지 않는다
  const before = [교적값('정일반', 8), 교적값('정일반', 10)];
  env.run((api) => api.setDiscipleshipAttendance('ADM', '정일반', addDays(TODAY, -21), '출석'));
  env.run((api) => api.addDiscipleshipMember('ADM', '오팀장'));
  env.run((api) => api.setDiscipleshipAttendance('ADM', '오팀장', C1start, '출석'));
  env.run((api) => api.syncDiscipleship('ADM'));
  eq([교적값('정일반', 8), 교적값('정일반', 10)], before, '출석 · 명단 · 동기화 뒤에도 교적 제자훈련 칸은 그대로 (더 이상 쓰지 않음)');
  eq(교적값('오팀장', 8), '', '새로 명단에 넣은 분의 교적 칸도 비어 있음');
  const after = env.run((api) => api.교적맵_()['오팀장']);
  eq([after.discipleship, after.trainingRate], ['진행중', '11% (1/9)'], '대신 프로필 값은 시트에서 바로 갱신된다');
  eq(env.run((api) => api.교적맵_()['정일반'].trainingRate), '33% (3/9)', '기수 일정 밖 날짜(-21일) 출석은 집계에 안 들어감');

  // B4. 교적 저장 (셀장/커미티 편집)에 discipleship 을 보내도 무시
  env.run((api) => api.교적저장_('오팀장', { phone: '416-555-1010', discipleship: '수료' }));
  eq(교적값('오팀장', 8), '', '교적 편집 화면이 discipleship 을 보내도 교적에는 저장되지 않음');

  // B5. 기수 관리 화면 (getDiscipleship) 은 그대로 동작 · LEGACY 줄은 섞이지 않음
  const g = env.run((api) => api.getDiscipleship('ADM'));
  ok(g.list && g.list.some((x) => x.name === '정일반'), '제자훈련 관리 화면(getDiscipleship)이 그대로 동작');

  // B6. 이전 도구
  const st = env.run((api) => api.discipleshipMigrationStatus('ADM'));
  eq(st.pending, 1, '이전 대상: 교적에만 있는 분 1명 (강허용)');
  eq(st.sample[0].name, '강허용', '대상 이름');
  throws(() => env.run((api) => api.discipleshipMigrate('WRONG', true)), /권한|로그인|관리/, '관리자 열쇠가 틀리면 이전 거절');
  const mg = env.run((api) => api.discipleshipMigrate('ADM', false));
  eq(mg, { moved: 1, cleared: 0 }, '이전(교적 유지)');
  const rows = env.fake.values(env.legacy.id, '제자훈련명단');
  eq(rows[rows.length - 1].slice(0, 9), ['강허용', '', '이전 기록(교적에서 옮김)', '', '', '', 'LEGACY', '수료', '90% (8/9)'], '제자훈련명단에 LEGACY 줄로 들어감');
  eq(env.run((api) => api.discipleshipMigrate('ADM', true)), { moved: 0, cleared: 0 }, '다시 눌러도 중복으로 들어가지 않음 (멱등)');
  eq(교적값('강허용', 8), '수료', '"교적 유지" 이전은 교적을 건드리지 않음');
  const mg2 = env.run((api) => api.discipleshipMigrate('ADM', true));
  eq(mg2.moved, 0, '이미 옮긴 분은 다시 옮기지 않음');
  // 교적을 비우는 경우: 새 대상으로 확인
  env.run((api) => api.교적저장_('노셀장', {}));
  const e2 = newEnv((t) => { tabs(t); });
  const r2 = e2.run((api) => api.discipleshipMigrate('ADM', true));
  eq(r2, { moved: 1, cleared: 1 }, '교적 비우기 옵션: 옮기고 교적 칸을 비움');
  const 강 = e2.fake.values(e2.legacy.id, '교적').find((r) => r[0] === '강허용');
  eq([강[8], 강[10]], ['', ''], '교적 칸이 비었다');
  const after2 = e2.run((api) => api.교적맵_()['강허용']);
  eq([after2.discipleship, after2.trainingRate], ['수료', '90% (8/9)'], '비운 뒤에도 프로필은 제자훈련 시트(LEGACY)에서 같은 값을 찾는다');
  ok(!e2.run((api) => api.getDiscipleship('ADM')).list.some((x) => x.name === '강허용'), 'LEGACY 줄은 기수 관리 목록에 섞이지 않는다');
  eq(e2.run((api) => api.discipleshipMigrationStatus('ADM')).pending, 0, '이전이 끝나면 대상 0');
};
