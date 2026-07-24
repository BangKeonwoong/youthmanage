/* 교회 학생관리 — GitHub Pages + Firebase(Firestore) 버전 */
'use strict';

// ── 전역 상태
let S = {
  me: null, data: { classes: [], users: [], students: [], visits: [], posts: [], comments: [], events: [], eventVotes: [] },
  dataReady: false, dataError: '', dataSlow: false,
  cls: '전체', screen: 'home', sid: null, toast: '',
  vOpen: false, vType: '심방', careMode: 'visits', communityMode: 'board',
  attendanceTab: 'students',
  boardOpen: false, boardPostId: null, boardEditId: null,
  calendarMonth: null, calendarDate: null, eventOpen: false, eventEditId: null, eventPollEnabled: false,
  edOn: false, edSacr: '없음', adOpen: false,
  delArm: false, loginErr: '', loaded: false, busy: false, shirtPick: null, shirtPickU: null,
  retreatPick: null, retreatPickU: null, shirtStatsOpen: false, retreatStatsOpen: false,
  contactChoice: null,
  lastScrollTop: 0, scrollPositions: {}
};
const NAV_STATE_FIELDS = ['screen', 'sid', 'cls', 'communityMode', 'boardPostId', 'calendarMonth', 'calendarDate', 'careMode', 'attendanceTab'];
let navigationDepth = 0;
let edgeSwipe = null;
let edgeSwipeBackTimer = null;
let edgeSwipeResetTimer = null;
window.H = [];
const h = fn => { H.push(fn); return 'H[' + (H.length - 1) + '](event)'; };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 폼 입력값 보존 (재렌더링 시)
const FORM_IDS = ['lg-id', 'v-text', 'v-stu', 'ad-name', 'ad-phone', 'ad-birth', 'ad-father', 'ad-mother', 'ad-parent', 'ad-addr',
  'ed-name', 'ed-phone', 'ed-fatherPhone', 'ed-motherPhone', 'ed-parentPhone', 'ed-address', 'ed-birth', 'ed-school', 'ed-trait',
  'pw-old', 'pw-new', 'u-name', 'u-username', 'u-pw', 'u-role', 'u-cls', 'cls-text', 'note-text',
  'board-category', 'board-title', 'board-body', 'comment-body',
  'event-title', 'event-date', 'event-end-date', 'event-time', 'event-note'];
let F = {};
function capture() { FORM_IDS.forEach(id => { const e = document.getElementById(id); if (e) F[id] = e.value; }); }
function clearF(prefix) { Object.keys(F).forEach(k => { if (k.startsWith(prefix)) delete F[k]; }); }
const fv = id => F[id] || '';

// ── 날짜 헬퍼
function iso(d) { const p = n => (n < 10 ? '0' + n : '' + n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function todayISO() { return iso(new Date()); }
function curSundayDate() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
function curWeek() { return iso(curSundayDate()); }
function pastWeeks() { const r = []; for (let i = 7; i >= 1; i--) { const d = curSundayDate(); d.setDate(d.getDate() - 7 * i); r.push(iso(d)); } return r; }
function md(isoStr) { if (!isoStr) return ''; const p = String(isoStr).split('-'); return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : isoStr; }
function todayLabel() {
  const d = new Date(); const W = ['일', '월', '화', '수', '목', '금', '토'];
  return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + W[d.getDay()] + '요일';
}
const LONG_ABS_N = 3, BDAY_DAYS = 30;
// ── 캠프티 사이즈 조사 (수련회 이벤트 · 기간 한정)
const SHIRT_SIZES = ['미선택', '130', '140', '150', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '신청X'];
const SHIRT_START = '2026-07-06', SHIRT_END = '2026-07-19';
const shirtActive = () => { const t = todayISO(); return t >= SHIRT_START && t <= SHIRT_END; };
// Retreat attendance survey (limited-time event)
const RETREAT_STUDENT_OPTIONS = ['\uBBF8\uC120\uD0DD', '\uCC38\uC11D', '\uBD88\uCC38', '\uBD80\uBD84\uCC38\uC11D'];
const RETREAT_TEACHER_OPTIONS = ['\uBBF8\uC120\uD0DD', '\uCC38\uC11D', '\uBD88\uCC38', '\uBD80\uBD84\uCC38\uC11D', '\uC800\uB141\uBC29\uBB38'];
const RETREAT_START = '2026-07-12', RETREAT_END = '2026-07-26';
const retreatActive = () => { const t = todayISO(); return t >= RETREAT_START && t <= RETREAT_END; };
const DEFAULT_CLASSES = ['중1-1', '중1-2', '중2', '중3-1', '중3-2', '중3-3', '고1-1', '고1-2', '고2', '고3'];
const BOARD_CATEGORIES = ['공지', '나눔', '회의록'];
const INITIAL_DATA_KEYS = ['classes', 'users', 'students', 'visits', 'posts', 'comments', 'events', 'eventVotes'];
const DATA_LABELS = { classes: '반 목록', users: '교사·교역자', students: '학생', visits: '심방', posts: '게시판', comments: '댓글', events: '일정', eventVotes: '일정 투표' };
let initialDataPending = new Set(INITIAL_DATA_KEYS);
let dataLoadTimer = null;

function emptyData() {
  return { classes: [], users: [], students: [], visits: [], posts: [], comments: [], events: [], eventVotes: [] };
}
function resetInitialDataLoad() {
  clearTimeout(dataLoadTimer); dataLoadTimer = null;
  initialDataPending = new Set(INITIAL_DATA_KEYS);
  S.data = emptyData(); S.dataReady = false; S.dataError = ''; S.dataSlow = false;
}
function startInitialDataLoadTimer() {
  clearTimeout(dataLoadTimer);
  dataLoadTimer = setTimeout(() => {
    if (!S.dataReady && !S.dataError && S.me) { S.dataSlow = true; render(); }
  }, 10000);
}
function markInitialDataLoaded(key, snapshot) {
  if (snapshot && snapshot.metadata && snapshot.metadata.fromCache) return;
  initialDataPending.delete(key);
  S.dataReady = initialDataPending.size === 0;
  if (S.dataReady) { clearTimeout(dataLoadTimer); dataLoadTimer = null; S.dataSlow = false; }
}
function isUnconfirmedMissingDocument(snapshot) {
  return !!(snapshot && !snapshot.exists && snapshot.metadata && snapshot.metadata.fromCache);
}
function failInitialDataLoad(key, error) {
  clearTimeout(dataLoadTimer); dataLoadTimer = null;
  console.error(error);
  S.dataError = (DATA_LABELS[key] || '교회') + ' 데이터를 불러오지 못했습니다.';
  S.dataReady = false;
  render();
}

// ── 데이터 헬퍼
const students = () => S.data.students || [];
const visits = () => S.data.visits || [];
const posts = () => S.data.posts || [];
const comments = () => S.data.comments || [];
const events = () => S.data.events || [];
const eventVotes = () => S.data.eventVotes || [];
const classes = () => S.data.classes || [];
const users = () => S.data.users || [];
function normalizeBoardCategory(value) { return BOARD_CATEGORIES.includes(value) ? value : '공지'; }
function boardCategoryMeta(value) {
  const category = normalizeBoardCategory(value);
  if (category === '회의록') return { label: '회의록', color: '#4c6b82', background: '#e5edf2' };
  if (category === '나눔') return { label: '나눔', color: '#2e5d47', background: '#e2eae2' };
  return { label: '공지', color: '#7a6234', background: '#efe7d3' };
}
function eventStart(event) { return String((event && (event.date || event.startDate)) || ''); }
function eventEnd(event) { return String((event && event.endDate) || eventStart(event)); }
function eventOccursOn(event, date) {
  const start = eventStart(event), end = eventEnd(event);
  return !!start && !!date && start <= date && date <= end;
}
function eventOverlaps(event, start, end) {
  const eventStartDate = eventStart(event), eventEndDate = eventEnd(event);
  return !!eventStartDate && eventStartDate <= end && eventEndDate >= start;
}
function eventRangeLabel(event) {
  const start = eventStart(event), end = eventEnd(event);
  return start && end && start !== end ? md(start) + '–' + md(end) : md(start);
}
function attendanceStatus(record, week) { return record && record.att ? record.att[week] || '' : ''; }
function attendanceLabel(status) { return ({ P: '출석', L: '지각', A: '결석' })[status] || '미체크'; }
function teacherOf(cls) { const u = users().find(x => x.role === 'teacher' && x.cls === cls); return u ? u.name : '담당 미지정'; }
const stuOf = cls => students().filter(s => s.cls === cls);
const isNew = st => !st.att || Object.keys(st.att).filter(w => st.att[w]).length === 0;
function rate(st, weeks) {
  const ws = weeks || pastWeeks(); let p = 0, n = 0;
  ws.forEach(w => { const a = st.att && st.att[w]; if (a) { n++; if (a === 'P' || a === 'L') p++; } });
  return n ? Math.round(p / n * 100) : null;
}
function isLongAbs(st) {
  const ws = pastWeeks().slice(-LONG_ABS_N);
  return !isNew(st) && ws.every(w => st.att && st.att[w] === 'A');
}
const careType = st => st.care ? st.care.type : (isLongAbs(st) ? '장결' : null);
function bdInfo(st) {
  if (!st.birth) return null;
  const parts = String(st.birth).split(/[.\-\/]/).map(Number);
  if (parts.length < 3 || !parts[1] || !parts[2]) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let bd = new Date(now.getFullYear(), parts[1] - 1, parts[2]);
  if (bd < now) bd = new Date(now.getFullYear() + 1, parts[1] - 1, parts[2]);
  const days = Math.round((bd - now) / 864e5);
  return { days, m: parts[1], d: parts[2], age: bd.getFullYear() - parts[0] };
}
function badgeStyle(t) {
  const m = { '장결': ['#a3552e', '#f2e2d6'], '질병': ['#7a6234', '#efe7d3'], '기도': ['#2e5d47', '#e2eae2'], '새친구': ['#5c584c', '#eeeade'] }[t] || ['#5c584c', '#eeeade'];
  return 'font:600 11px Pretendard;color:' + m[0] + ';background:' + m[1] + ';padding:4px 9px;border-radius:99px;flex:none';
}
function typeStyle(t) {
  const m = { '심방': ['#2e5d47', '#e2eae2'], '전화': ['#7a6234', '#efe7d3'], '카톡': ['#5c584c', '#eeeade'], '상담': ['#a3552e', '#f2e2d6'] }[t] || ['#5c584c', '#eeeade'];
  return 'font:600 11px Pretendard;color:' + m[0] + ';background:' + m[1] + ';padding:4px 9px;border-radius:6px;flex:none';
}
const ini = name => String(name || '').slice(1) || name;
function inCurWeek(dateIso) {
  const start = curWeek();
  const end = (() => { const d = curSundayDate(); d.setDate(d.getDate() + 6); return iso(d); })();
  return dateIso >= start && dateIso <= end;
}
function weekVisited(st) {
  const CUR = curWeek();
  if (st.vchk && st.vchk[CUR] !== undefined) return st.vchk[CUR];
  return visits().some(x => x.sid === st.id && inCurWeek(x.date));
}
function classAttendanceStats(cls) {
  const list = stuOf(cls), week = curWeek();
  return {
    total: list.length,
    checked: list.filter(student => attendanceStatus(student, week)).length,
    visited: list.filter(weekVisited).length
  };
}
const sortV = (a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.ts || 0) - (a.ts || 0));
function scopeStudents() {
  if (S.me.role !== 'pastor') return stuOf(S.me.cls);
  return S.cls === '전체' ? students() : stuOf(S.cls);
}

// ═══ Firebase 데이터 계층 ═══
let AUTH = null, DB = null, unsubs = [], authEpoch = 0;
const configMissing = () => !window.FIREBASE_CONFIG || String(window.FIREBASE_CONFIG.apiKey || '').indexOf('PASTE') === 0;

function initFirebase() {
  if (configMissing()) { S.loaded = true; render(); return; }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  AUTH = firebase.auth();
  DB = firebase.firestore();
  AUTH.onAuthStateChanged(async u => {
    const epoch = ++authEpoch;
    const previousUser = S.me;
    detach();
    S.me = null; resetInitialDataLoad();
    if (!u) { if (previousUser) resetNavigationHistory(); S.loaded = true; render(); return; }
    S.loaded = false; render();
    try { await afterLogin(u, epoch); }
    catch (e) {
      if (!isCurrentAuthSession(u, epoch)) return;
      S.loginErr = '계정 정보를 불러오지 못했습니다: ' + (e.message || e); S.loaded = true; try { await AUTH.signOut(); } catch (e2) {} render();
    }
  });
}

function isCurrentAuthSession(user, epoch) {
  return epoch === authEpoch && !!(AUTH && AUTH.currentUser && user && AUTH.currentUser.uid === user.uid);
}

async function afterLogin(u, epoch) {
  const email = u.email;
  let doc = await DB.collection('users').doc(email).get();
  if (!isCurrentAuthSession(u, epoch)) return;
  if (!doc.exists) {
    const any = await DB.collection('users').limit(1).get();
    if (!isCurrentAuthSession(u, epoch)) return;
    if (any.empty) {
      // 최초 로그인 계정 = 자동으로 교역자(관리자)
      await DB.collection('users').doc(email).set({ name: '관리자', role: 'pastor', cls: '전체' });
      if (!isCurrentAuthSession(u, epoch)) return;
      doc = await DB.collection('users').doc(email).get();
      if (!isCurrentAuthSession(u, epoch)) return;
    } else {
      S.loginErr = '이 계정에 권한 정보가 없습니다. 담당 교역자에게 문의하세요.';
      S.loaded = true;
      await AUTH.signOut();
      return;
    }
  }
  const info = doc.data();
  S.me = { email, username: email.split('@')[0], name: info.name, role: info.role, cls: info.cls };
  resetInitialDataLoad();
  startInitialDataLoadTimer();
  S.cls = info.role === 'pastor' ? '전체' : info.cls;
  S.screen = 'home'; S.sid = null; S.boardPostId = null; S.boardOpen = false; S.boardEditId = null;
  S.eventOpen = false; S.eventEditId = null; S.loginErr = ''; S.loaded = true; F = {};
  initNavigationHistory();
  attach(epoch);
  render();
}

function detach() { unsubs.forEach(fn => { try { fn(); } catch (e) {} }); unsubs = []; }

function attach(epoch) {
  const active = () => epoch === authEpoch;
  const onLoadError = key => error => { if (active()) failInitialDataLoad(key, error); };
  // 반 목록
  unsubs.push(DB.collection('meta').doc('config').onSnapshot({ includeMetadataChanges: true }, async d => {
    if (!active()) return;
    if (isUnconfirmedMissingDocument(d)) return;
    if (!d.exists) {
      if (S.me && S.me.role === 'pastor') { try { await DB.collection('meta').doc('config').set({ classes: DEFAULT_CLASSES }); } catch (e) {} }
      if (!active()) return;
      S.data.classes = DEFAULT_CLASSES.slice();
    } else S.data.classes = d.data().classes || [];
    markInitialDataLoaded('classes', d);
    maybeRender();
  }, onLoadError('classes')));
  // 계정(권한) 목록
  unsubs.push(DB.collection('users').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.users = q.docs.map(d => Object.assign({ email: d.id }, d.data()));
    const mine = S.data.users.find(x => x.email === S.me.email);
    if (mine) { S.me.name = mine.name; S.me.role = mine.role; S.me.cls = mine.cls; if (mine.role !== 'pastor') S.cls = mine.cls; }
    markInitialDataLoaded('users', q);
    maybeRender();
  }, onLoadError('users')));
  // 학생
  unsubs.push(DB.collection('students').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.students = q.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    markInitialDataLoaded('students', q);
    maybeRender();
  }, onLoadError('students')));
  // 심방기록
  unsubs.push(DB.collection('visits').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.visits = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    markInitialDataLoaded('visits', q);
    maybeRender();
  }, onLoadError('visits')));
  // 게시판
  unsubs.push(DB.collection('posts').orderBy('ts', 'desc').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.posts = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    markInitialDataLoaded('posts', q);
    maybeRender();
  }, onLoadError('posts')));
  unsubs.push(DB.collection('comments').orderBy('ts', 'asc').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.comments = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    markInitialDataLoaded('comments', q);
    maybeRender();
  }, onLoadError('comments')));
  unsubs.push(DB.collection('events').orderBy('date', 'asc').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.events = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    markInitialDataLoaded('events', q);
    maybeRender();
  }, onLoadError('events')));
  unsubs.push(DB.collection('eventVotes').onSnapshot({ includeMetadataChanges: true }, q => {
    if (!active()) return;
    S.data.eventVotes = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    markInitialDataLoaded('eventVotes', q);
    maybeRender();
  }, onLoadError('eventVotes')));
}

// 입력 중이면 화면을 갈아엎지 않음 (데이터만 갱신, 다음 동작 때 반영)
function maybeRender() {
  if (!S.me) return;
  const ae = document.activeElement;
  if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) { capture(); return; }
  capture(); render();
}

async function fsTry(promise) {
  try { await promise; return true; }
  catch (e) { console.error(e); flash('저장 실패: ' + (e.message || e)); return false; }
}
const stuRef = id => DB.collection('students').doc(id);
const FV = () => firebase.firestore.FieldValue;

let toastT = null;
function flash(msg) { S.toast = msg; render(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ''; capture(); render(); }, 1800); }
function up(mut) { capture(); mut && mut(); render(); }

// ── 앱 화면 이동·뒤로가기
function navigationState() {
  const state = {};
  NAV_STATE_FIELDS.forEach(key => { state[key] = S[key]; });
  return state;
}
function navigationKey(state) { return JSON.stringify(state || navigationState()); }
function historySupported() {
  return !!(window.history && window.history.pushState && window.history.replaceState);
}
function navigationHistoryState() {
  return { youthApp: true, owner: S.me && S.me.email, depth: navigationDepth, view: navigationState() };
}
function applyNavigationState(view) {
  if (!view) return;
  NAV_STATE_FIELDS.forEach(key => { if (Object.prototype.hasOwnProperty.call(view, key)) S[key] = view[key]; });
  S.edOn = false; S.delArm = false; S.boardOpen = false; S.boardEditId = null;
  S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false;
  S.vOpen = false; S.adOpen = false; S.contactChoice = null; clearF('comment-'); clearF('board-'); clearF('event-');
}
function initNavigationHistory() {
  if (!S.me || !historySupported()) { navigationDepth = 0; return; }
  const current = window.history.state;
  if (current && current.youthApp && current.owner === S.me.email && current.view) {
    navigationDepth = Math.max(0, Number(current.depth) || 0);
    applyNavigationState(current.view);
    return;
  }
  navigationDepth = 0;
  window.history.replaceState(navigationHistoryState(), '', window.location.href);
}
function resetNavigationHistory() {
  navigationDepth = 0;
  if (historySupported() && window.history.state && window.history.state.youthApp) {
    window.history.replaceState(null, '', window.location.href);
  }
}
function navigate(mut) {
  capture();
  const before = navigationKey();
  mut && mut();
  if (navigationKey() !== before && S.me && historySupported()) {
    navigationDepth += 1;
    window.history.pushState(navigationHistoryState(), '', window.location.href);
  }
  render();
}
function closeTransientView() {
  if (S.contactChoice) { S.contactChoice = null; return true; }
  if (S.edOn) { S.edOn = false; clearF('ed-'); return true; }
  if (S.delArm) { S.delArm = false; return true; }
  if (S.boardOpen) {
    const editingPostId = S.boardEditId;
    S.boardOpen = false; S.boardEditId = null;
    if (editingPostId) S.boardPostId = editingPostId;
    clearF('board-'); return true;
  }
  if (S.eventOpen) { S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false; clearF('event-'); return true; }
  if (S.vOpen) { S.vOpen = false; clearF('v-'); return true; }
  if (S.adOpen) { S.adOpen = false; return true; }
  if (S.shirtPick || S.shirtPickU || S.retreatPick || S.retreatPickU) {
    S.shirtPick = null; S.shirtPickU = null; S.retreatPick = null; S.retreatPickU = null; return true;
  }
  return false;
}
function fallbackBack() {
  if (S.sid) { S.sid = null; S.edOn = false; S.delArm = false; clearF('note-'); return true; }
  if (S.boardPostId) { S.boardPostId = null; clearF('comment-'); return true; }
  if (S.screen !== 'home') { S.screen = 'home'; S.sid = null; return true; }
  if (S.me && S.me.role === 'pastor' && S.cls !== '전체') { S.cls = '전체'; return true; }
  return false;
}
function canAppBack() {
  return !!(S.contactChoice || S.edOn || S.delArm || S.boardOpen || S.eventOpen || S.vOpen || S.adOpen ||
    S.shirtPick || S.shirtPickU || S.retreatPick || S.retreatPickU || navigationDepth > 0 ||
    S.sid || S.boardPostId || S.screen !== 'home' || (S.me && S.me.role === 'pastor' && S.cls !== '전체'));
}
function appBack(fallbackMut) {
  capture();
  if (!fallbackMut && closeTransientView()) { render(); return true; }
  if (navigationDepth > 0 && historySupported()) { window.history.back(); return true; }
  const changed = fallbackMut ? (fallbackMut(), true) : fallbackBack();
  if (changed) render();
  return changed;
}

// iOS 홈 화면 앱은 Safari의 네이티브 가장자리 탐색 UI가 없을 수 있어 앱 내부 폴백을 제공한다.
function isStandaloneApp() {
  const standalone = typeof navigator !== 'undefined' && navigator.standalone === true;
  const displayMode = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return standalone || displayMode;
}
function swipeIgnoredTarget(target) {
  let node = target;
  while (node && node !== document) {
    const tag = String(node.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) || node.isContentEditable) return true;
    if (Number(node.scrollWidth) > Number(node.clientWidth) + 2) return true;
    node = node.parentElement;
  }
  return false;
}
function edgeSwipeThreshold(width) { return Math.min(96, Math.max(72, Number(width || 0) * 0.23)); }
function edgeSwipeCompletes(startX, dx, dy, width, elapsed) {
  const horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.15;
  const fast = elapsed > 0 && dx / elapsed > 0.55 && dx >= 48;
  return startX <= 28 && horizontal && Math.abs(dy) <= 80 && (dx >= edgeSwipeThreshold(width) || fast);
}
function swipeShell() { return document.querySelector ? document.querySelector('.app-shell') : null; }
function resetSwipeVisual(immediate) {
  const shell = swipeShell();
  if (!shell) return;
  shell.style.transition = immediate ? 'none' : 'transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease';
  shell.style.transform = 'translate3d(0,0,0)'; shell.style.boxShadow = '';
  shell.style.willChange = '';
}
function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function onEdgeTouchStart(event) {
  if (!isStandaloneApp() || !canAppBack() || !event.touches || event.touches.length !== 1 || swipeIgnoredTarget(event.target)) return;
  const touch = event.touches[0];
  if (touch.clientX > 28) return;
  if (window.visualViewport && window.visualViewport.scale > 1.01) return;
  edgeSwipe = { startX: touch.clientX, startY: touch.clientY, x: touch.clientX, y: touch.clientY, startedAt: Date.now(), direction: '' };
}
function onEdgeTouchMove(event) {
  if (!edgeSwipe) return;
  if (!event.touches || event.touches.length !== 1) { edgeSwipe = null; resetSwipeVisual(false); return; }
  const touch = event.touches[0], dx = touch.clientX - edgeSwipe.startX, dy = touch.clientY - edgeSwipe.startY;
  edgeSwipe.x = touch.clientX; edgeSwipe.y = touch.clientY;
  if (!edgeSwipe.direction && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
    edgeSwipe.direction = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.15 ? 'back' : 'scroll';
  }
  if (edgeSwipe.direction !== 'back') return;
  event.preventDefault();
  const shell = swipeShell();
  if (!shell || reducedMotion()) return;
  const width = window.innerWidth || document.documentElement.clientWidth || 390;
  const offset = Math.min(Math.max(0, dx), width * 0.82);
  shell.style.transition = 'none'; shell.style.willChange = 'transform';
  shell.style.transform = 'translate3d(' + offset + 'px,0,0)';
  shell.style.boxShadow = '-12px 0 30px rgba(33,31,26,.18)';
}
function finishEdgeSwipe(event, cancelled) {
  if (!edgeSwipe) return;
  const swipe = edgeSwipe; edgeSwipe = null;
  const touch = event && event.changedTouches && event.changedTouches[0];
  const endX = touch ? touch.clientX : swipe.x, endY = touch ? touch.clientY : swipe.y;
  const width = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 390;
  const complete = !cancelled && swipe.direction === 'back' && edgeSwipeCompletes(swipe.startX, endX - swipe.startX, endY - swipe.startY, width, Date.now() - swipe.startedAt);
  if (!complete) { resetSwipeVisual(false); return; }
  const shell = swipeShell();
  if (shell && !reducedMotion()) {
    shell.style.transition = 'transform .16s cubic-bezier(.4,0,1,1)';
    shell.style.transform = 'translate3d(' + width + 'px,0,0)';
    clearTimeout(edgeSwipeBackTimer); clearTimeout(edgeSwipeResetTimer);
    edgeSwipeBackTimer = setTimeout(() => { edgeSwipeBackTimer = null; appBack(); }, 110);
    edgeSwipeResetTimer = setTimeout(() => { edgeSwipeResetTimer = null; resetSwipeVisual(false); }, 520);
  } else appBack();
}
function onNavigationPop(event) {
  clearTimeout(edgeSwipeBackTimer); edgeSwipeBackTimer = null;
  clearTimeout(edgeSwipeResetTimer); edgeSwipeResetTimer = null;
  edgeSwipe = null; resetSwipeVisual(true);
  const state = event && event.state;
  if (!S.me || !state || !state.youthApp || state.owner !== S.me.email || !state.view) return;
  navigationDepth = Math.max(0, Number(state.depth) || 0);
  capture(); applyNavigationState(state.view); render();
}
function installEdgeSwipeBack() {
  if (!document.addEventListener) return;
  document.addEventListener('touchstart', onEdgeTouchStart, { passive: true });
  document.addEventListener('touchmove', onEdgeTouchMove, { passive: false });
  document.addEventListener('touchend', event => finishEdgeSwipe(event, false), { passive: true });
  document.addEventListener('touchcancel', event => finishEdgeSwipe(event, true), { passive: true });
  if (window.addEventListener) window.addEventListener('popstate', onNavigationPop);
}
function onAppScroll(el) {
  const current = Math.max(0, el.scrollTop);
  const delta = current - S.lastScrollTop;
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  if (current <= 8 || delta > 8) nav.style.transform = 'translateY(0)';
  else if (delta < -8) nav.style.transform = 'translateY(calc(100% + 2px))';
  if (Math.abs(delta) > 8 || current <= 8) S.lastScrollTop = current;
}
function scrollTarget(previousKey, nextKey, previousTop, positions) {
  if (previousKey) positions[previousKey] = previousTop;
  return previousKey === nextKey ? previousTop : (positions[nextKey] || 0);
}
function openStu(id) { return () => navigate(() => { S.sid = id; S.edOn = false; S.delArm = false; clearF('note-'); }); }
function curStu() { return S.sid ? students().find(x => x.id === S.sid) : null; }

// ── 공통 스타일 조각
const inputStyle = 'padding:10px 12px;border:1px solid #e8e4da;border-radius:10px;font:400 13px Pretendard;color:#211f1a;background:#faf8f3';
const primaryBtn = 'padding:12px;border-radius:10px;background:#2e5d47;text-align:center;font:600 14px Pretendard;color:#f5f2ea;cursor:pointer';
const darkBtn = 'padding:12px;border-radius:10px;background:#211f1a;text-align:center;font:600 14px Pretendard;color:#f5f2ea;cursor:pointer';
const secLabel = 'padding:20px 20px 6px;font:600 12px Pretendard;color:#8a8578;letter-spacing:.06em';

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  const normalized = compact.charAt(0) === '+'
    ? '+' + compact.slice(1).replace(/\+/g, '')
    : compact.replace(/\+/g, '');
  return normalized.replace(/\D/g, '').length >= 3 ? normalized : '';
}

function contactActionSheet() {
  const contact = S.contactChoice;
  if (!contact) return '';
  const phone = normalizePhoneNumber(contact.phone);
  if (!phone) return '';
  const close = h(() => up(() => { S.contactChoice = null; }));
  const launch = scheme => h(event => {
    event.preventDefault();
    const href = scheme + ':' + phone;
    S.contactChoice = null;
    capture(); render();
    window.location.href = href;
  });
  return `<div onclick="${close}" role="presentation" style="position:absolute;inset:0;z-index:20;background:rgba(33,31,26,.38);display:flex;align-items:flex-end;justify-content:center;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));animation:contactFade .16s ease-out">
    <div onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="contact-action-title" style="width:min(100%,520px);background:#faf8f3;border:1px solid #e8e4da;border-radius:20px;padding:8px 14px 14px;box-shadow:0 18px 48px rgba(33,31,26,.28);animation:contactSheetUp .2s cubic-bezier(.22,1,.36,1)">
      <div aria-hidden="true" style="width:38px;height:4px;border-radius:99px;background:#cfc9ba;margin:2px auto 12px"></div>
      <div id="contact-action-title" style="font:600 18px 'MaruBuri',serif;color:#211f1a;text-align:center">연락 방법 선택</div>
      <div style="font:500 13px Pretendard;color:#8a8578;text-align:center;margin-top:5px">${esc(contact.label)} · ${esc(contact.phone)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">
        <a href="tel:${esc(phone)}" onclick="${launch('tel')}" aria-label="${esc(contact.label)} ${esc(contact.phone)} 전화 걸기" style="min-height:52px;border-radius:12px;background:#2e5d47;color:#fff;text-decoration:none;display:flex;align-items:center;justify-content:center;font:700 15px Pretendard">전화 걸기</a>
        <a href="sms:${esc(phone)}" onclick="${launch('sms')}" aria-label="${esc(contact.label)} ${esc(contact.phone)} 문자 보내기" style="min-height:52px;border-radius:12px;background:#4c6b82;color:#fff;text-decoration:none;display:flex;align-items:center;justify-content:center;font:700 15px Pretendard">문자 보내기</a>
      </div>
      <button type="button" onclick="${close}" style="width:100%;min-height:48px;margin-top:8px;border:1px solid #e8e4da;border-radius:12px;background:#fff;color:#6d6a5f;font:600 14px Pretendard;cursor:pointer">취소</button>
    </div>
  </div>`;
}

// ══ 선생님 캠프티 입력 (이벤트 기간에만 표시)
function userShirtRows(list) {
  if (!shirtActive() || !list.length) return '';
  return `<div style="font:600 12px Pretendard;color:#2e5d47;padding:4px 2px 7px">선생님 캠프티</div>
  <div style="background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:4px 16px">
    ${list.map(u => {
      const btn = `<span onclick="${h(() => up(() => { S.shirtPickU = S.shirtPickU === u.email ? null : u.email; }))}" style="cursor:pointer;font:600 12px Pretendard;flex:none;padding:5px 12px;border-radius:99px;${u.shirt ? 'color:#f5f2ea;background:#2e5d47' : 'color:#2e5d47;border:1px dashed #9db8a8;background:#fff'}">${esc(u.shirt || '캠프티')}</span>`;
      const picker = S.shirtPickU === u.email ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 10px;border-bottom:1px solid #eeeade">
        ${SHIRT_SIZES.map(sz => `<span onclick="${h(async () => { await fsTry(DB.collection('users').doc(u.email).update({ shirt: sz === '미선택' ? FV().delete() : sz })); S.shirtPickU = null; capture(); render(); })}" style="cursor:pointer;flex:none;font:600 12px Pretendard;padding:7px 12px;border-radius:99px;${(u.shirt || '미선택') === sz ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${sz}</span>`).join('')}
      </div>` : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #eeeade">
        <span style="font:600 14px Pretendard;color:#211f1a">${esc(u.name)} <span style="font:400 12px Pretendard;color:#b5b0a2">${u.role === 'pastor' ? '교역자' : '선생님'}</span></span>${btn}
      </div>${picker}`;
    }).join('')}
    <div style="height:4px"></div>
  </div>`;
}

// ══ 캠프티 통계 (이벤트 기간에만 표시)
function shirtStats(list) {
  if (!shirtActive() || !list.length) return '';
  const counts = {};
  list.forEach(x => { const k = x.shirt || '미선택'; counts[k] = (counts[k] || 0) + 1; });
  const chips = SHIRT_SIZES.filter(sz => counts[sz]).map(sz =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eeeade;font:500 13px Pretendard;color:${sz === '미선택' ? '#a3552e' : '#211f1a'}"><span>${sz}</span><b>${counts[sz]}명</b></div>`).join('');
  return `<div style="font:600 12px Pretendard;color:#7a6234;padding:16px 2px 7px">캠프티 사이즈 통계</div>
    <div style="background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:6px 16px">${chips}<div style="font:400 11px Pretendard;color:#b5b0a2;padding-top:8px">${md(SHIRT_END)}까지 조사</div><div style="height:6px"></div></div>`;
}

function shirtEventSection(teacherList, allList) {
  if (!shirtActive() || !allList.length) return '';
  const done = allList.filter(x => x.shirt).length;
  return `<div onclick="${h(() => up(() => { S.shirtStatsOpen = !S.shirtStatsOpen; }))}" style="${secLabel};display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer" role="button" aria-expanded="${S.shirtStatsOpen}">
      <span>캠프티 조사 <span style="font:400 11px;color:#b5b0a2">· ${done}/${allList.length} 완료</span></span>
      <span style="font:600 16px Pretendard;color:#2e5d47;transform:rotate(${S.shirtStatsOpen ? '180deg' : '0deg'});transition:transform .22s ease">⌄</span>
    </div>
    ${S.shirtStatsOpen ? `<div style="margin:0 20px;animation:sectionReveal .2s ease-out">${userShirtRows(teacherList)}${shirtStats(allList)}</div>` : ''}`;
}

// Teacher and pastor retreat attendance input
function userRetreatRows(list) {
  if (!retreatActive() || !list.length) return '';
  return `<div style="font:600 12px Pretendard;color:#7a6234;padding:4px 2px 7px">\uAD50\uC0AC\u00B7\uAD50\uC5ED\uC790 \uC218\uB828\uD68C \uCC38\uC11D \uC5EC\uBD80</div>
  <div style="background:#fff;border:1px solid #d8cdb5;border-radius:14px;padding:4px 16px">
    ${list.map(u => {
      const btn = `<span onclick="${h(() => up(() => { S.retreatPickU = S.retreatPickU === u.email ? null : u.email; }))}" style="cursor:pointer;font:600 12px Pretendard;flex:none;padding:5px 12px;border-radius:99px;${u.retreatAttendance ? 'color:#f5f2ea;background:#7a6234' : 'color:#7a6234;border:1px dashed #c8b78f;background:#fff'}">${esc(u.retreatAttendance || '\uCC38\uC11D \uC5EC\uBD80')}</span>`;
      const picker = S.retreatPickU === u.email ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 10px;border-bottom:1px solid #eeeade">
        ${RETREAT_TEACHER_OPTIONS.map(status => `<span onclick="${h(async () => { await fsTry(DB.collection('users').doc(u.email).update({ retreatAttendance: status === '\uBBF8\uC120\uD0DD' ? FV().delete() : status })); S.retreatPickU = null; capture(); render(); })}" style="cursor:pointer;flex:none;font:600 12px Pretendard;padding:7px 12px;border-radius:99px;${(u.retreatAttendance || '\uBBF8\uC120\uD0DD') === status ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${status}</span>`).join('')}
      </div>` : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #eeeade">
        <span style="font:600 14px Pretendard;color:#211f1a">${esc(u.name)} <span style="font:400 12px Pretendard;color:#b5b0a2">${u.role === 'pastor' ? '\uAD50\uC5ED\uC790' : '\uC120\uC0DD\uB2D8'}</span></span>${btn}
      </div>${picker}`;
    }).join('')}
    <div style="height:4px"></div>
  </div>`;
}

// Retreat attendance statistics (separate from shirt statistics)
function retreatStats(studentList, teacherList) {
  if (!retreatActive() || (!studentList.length && !teacherList.length)) return '';
  const group = (title, list, options) => {
    const counts = {};
    list.forEach(x => { const k = x.retreatAttendance || '\uBBF8\uC120\uD0DD'; counts[k] = (counts[k] || 0) + 1; });
    const rows = options.filter(status => counts[status]).map(status =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eeeade;font:500 13px Pretendard;color:${status === '\uBBF8\uC120\uD0DD' ? '#a3552e' : '#211f1a'}"><span>${status}</span><b>${counts[status]}\uBA85</b></div>`).join('');
    const done = list.filter(x => x.retreatAttendance).length;
    return `<div style="font:600 12px Pretendard;color:#7a6234;padding:${title === '\uD559\uC0DD' ? '4px' : '14px'} 0 4px">${title} <span style="font:400 11px;color:#b5b0a2">\u00B7 ${done}/${list.length} \uC644\uB8CC</span></div>${rows || `<div style="font:400 12px Pretendard;color:#b5b0a2;padding:6px 0">\uB300\uC0C1\uC790 \uC5C6\uC74C</div>`}`;
  };
  return `<div style="font:600 12px Pretendard;color:#7a6234;padding:16px 2px 7px">\uC218\uB828\uD68C \uCC38\uC11D \uD1B5\uACC4</div>
    <div style="background:#fff;border:1px solid #d8cdb5;border-radius:14px;padding:6px 16px">
      ${group('\uD559\uC0DD', studentList, RETREAT_STUDENT_OPTIONS)}
      ${group('\uAD50\uC0AC\u00B7\uAD50\uC5ED\uC790', teacherList, RETREAT_TEACHER_OPTIONS)}
      <div style="font:400 11px Pretendard;color:#b5b0a2;padding-top:8px">${md(RETREAT_END)}\uAE4C\uC9C0 \uC870\uC0AC</div>
      <div style="height:6px"></div>
    </div>`;
}

function retreatEventSection(studentList, teacherList) {
  if (!retreatActive() || (!studentList.length && !teacherList.length)) return '';
  const all = studentList.concat(teacherList);
  const done = all.filter(x => x.retreatAttendance).length;
  return `<div onclick="${h(() => up(() => { S.retreatStatsOpen = !S.retreatStatsOpen; }))}" style="${secLabel};display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer" role="button" aria-expanded="${S.retreatStatsOpen}">
      <span>\uC218\uB828\uD68C \uCC38\uC11D \uC870\uC0AC <span style="font:400 11px;color:#b5b0a2">\u00B7 ${done}/${all.length} \uC644\uB8CC</span></span>
      <span style="font:600 16px Pretendard;color:#7a6234;transform:rotate(${S.retreatStatsOpen ? '180deg' : '0deg'});transition:transform .22s ease">⌄</span>
    </div>
    ${S.retreatStatsOpen ? `<div style="margin:0 20px;animation:sectionReveal .2s ease-out">${userRetreatRows(teacherList)}${retreatStats(studentList, teacherList)}</div>` : ''}`;
}

// ══ 최초 Firestore 동기화 화면
function dataSyncView() {
  const hasError = !!S.dataError;
  const isSlow = !hasError && S.dataSlow;
  return `<div class="app-shell" style="height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;padding:32px">
    <div style="width:100%;max-width:420px;text-align:center;background:#fff;border:1px solid ${hasError || isSlow ? '#d8bfa8' : '#e8e4da'};border-radius:16px;padding:28px 22px;box-shadow:0 8px 28px rgba(33,31,26,.08)" ${hasError ? 'role="alert"' : 'role="status"'}>
      <div style="font:600 22px 'MaruBuri',serif;color:#211f1a">${hasError ? '데이터를 불러오지 못했습니다' : isSlow ? '데이터 동기화가 지연되고 있습니다' : '교회 데이터를 불러오는 중입니다'}</div>
      <div style="font:400 13px Pretendard;color:#6d6a5f;line-height:1.65;margin-top:10px">${hasError ? esc(S.dataError) + '<br>기존 데이터는 변경되지 않았습니다.' : isSlow ? '네트워크 연결을 확인한 뒤 다시 시도해주세요.<br>기존 데이터는 변경되지 않았습니다.' : '반·학생·출석·게시판·일정을 안전하게 동기화하고 있습니다.<br>잠시만 기다려주세요.'}</div>
      ${hasError || isSlow ? '<button type="button" onclick="location.reload()" style="margin-top:18px;padding:11px 18px;border:0;border-radius:10px;background:#2e5d47;color:#fff;font:600 13px Pretendard;cursor:pointer">다시 불러오기</button>' : '<div style="width:38px;height:4px;border-radius:99px;background:#2e5d47;margin:20px auto 0;animation:sectionReveal .8s ease-in-out infinite alternate"></div>'}
    </div>
  </div>`;
}

// ══ 설정 안내 화면 (firebase-config.js 미입력 시)
function setupView() {
  return `<div class="auth-shell" style="min-height:100vh;min-height:100dvh;overflow-x:hidden;display:flex;flex-direction:column;justify-content:center;padding:36px 28px">
    <div style="font:600 26px 'MaruBuri',serif;color:#211f1a">설정이 필요합니다</div>
    <div style="font:400 14px Pretendard;color:#6d6a5f;margin-top:14px;line-height:1.7">
      <b>firebase-config.js</b> 파일에 Firebase 설정값이 아직 입력되지 않았습니다.<br><br>
      SETUP-GUIDE.md 문서의 안내에 따라 Firebase 프로젝트를 만들고, 설정값을 붙여넣은 뒤 다시 업로드해주세요.
    </div>
  </div>`;
}

// ══ 로그인 화면
function loginView() {
  const go = h(async () => {
    capture();
    const id = ((document.getElementById('lg-id') || {}).value || '').trim();
    const pw = (document.getElementById('lg-pw') || {}).value || '';
    if (!id || !pw) { S.loginErr = '아이디와 비밀번호를 입력해주세요.'; capture(); render(); return; }
    const email = id.includes('@') ? id : id + (window.EMAIL_SUFFIX || '@example.com');
    S.busy = true; capture(); render();
    try {
      await AUTH.signInWithEmailAndPassword(email, pw);
      S.busy = false;
      // 이후 처리는 onAuthStateChanged → afterLogin
    } catch (e) {
      const code = e && e.code || '';
      S.loginErr = code.includes('too-many-requests') ? '시도가 너무 많습니다. 잠시 후 다시 시도하세요.'
        : code.includes('network') ? '인터넷 연결을 확인해주세요.'
        : '아이디 또는 비밀번호가 올바르지 않습니다.';
      S.busy = false;
      capture(); render();
    }
  });
  return `<div class="auth-shell" style="min-height:100vh;min-height:100dvh;overflow-x:hidden;display:flex;flex-direction:column;justify-content:center;padding:36px 28px">
    <div style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.08em">CHURCH STUDENT CARE</div>
    <div style="font:600 32px 'MaruBuri',serif;color:#211f1a;margin-top:10px">중고등부<br>학생관리</div>
    <div style="font:400 14px Pretendard;color:#6d6a5f;margin-top:10px">교사·교역자 전용 페이지입니다.</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:38px">
      <input id="lg-id" placeholder="아이디" autocomplete="username" value="${esc(fv('lg-id'))}" style="${inputStyle};font-size:15px;padding:13px 14px">
      <input id="lg-pw" type="password" placeholder="비밀번호" autocomplete="current-password" onkeydown="if(event.key==='Enter')${go}" style="${inputStyle};font-size:15px;padding:13px 14px">
      ${S.loginErr ? `<div style="font:500 13px Pretendard;color:#a3552e">${esc(S.loginErr)}</div>` : ''}
      <div onclick="${go}" style="${primaryBtn};padding:14px;font-size:15px;margin-top:4px">${S.busy ? '로그인 중…' : '로그인'}</div>
    </div>
    <div style="font:400 12px Pretendard;color:#b5b0a2;margin-top:26px">계정이 없거나 비밀번호를 잊으셨다면 담당 교역자에게 문의하세요.</div>
  </div>`;
}

// ══ 헤더
function headerView() {
  const isPastor = S.me.role === 'pastor';
  if (curStu()) return '';
  let title, subtitle;
  const boardScreen = S.screen === 'board';
  if (boardScreen) { title = '중고등부'; subtitle = S.communityMode === 'calendar' ? '전체 교사·교역자가 함께 관리하는 공유 일정' : '전체 교사·교역자가 함께하는 통합 게시판'; }
  else if (!isPastor) { title = S.me.cls + '반'; subtitle = '담당 ' + S.me.name + ' 선생님 · 재적 ' + stuOf(S.me.cls).length + '명'; }
  else if (S.cls === '전체') { title = '중고등부'; subtitle = classes().length + '개 반 · 재적 ' + students().length + '명'; }
  else { title = S.cls + '반'; subtitle = '담당 ' + teacherOf(S.cls) + ' 선생님 · 재적 ' + stuOf(S.cls).length + '명'; }
  const chips = isPastor && !boardScreen ? `<div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:12px;scrollbar-width:none">
    ${['전체'].concat(classes()).map(c => `<div onclick="${h(() => navigate(() => { S.cls = c; S.sid = null; }))}" style="flex:none;font:600 13px Pretendard;padding:7px 13px;border-radius:99px;cursor:pointer;${S.cls === c ? 'background:#211f1a;color:#f5f2ea' : 'background:#fff;color:#6d6a5f;border:1px solid #e8e4da'}">${esc(c)}</div>`).join('')}
  </div>` : '';
  const communityTabs = boardScreen ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:12px;background:#eeeade;border-radius:12px">
    ${[['board', '게시판'], ['calendar', '일정']].map(([key, label]) => `<div onclick="${h(() => navigate(() => { S.communityMode = key; S.boardPostId = null; S.boardOpen = false; S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false; }))}" style="text-align:center;padding:8px;border-radius:9px;cursor:pointer;font:700 13px Pretendard;${S.communityMode === key ? 'background:#fff;color:#211f1a;box-shadow:0 1px 4px rgba(33,31,26,.12)' : 'color:#8a8578'}">${label}</div>`).join('')}
  </div>` : '';
  return `<div style="padding:16px 20px 0;border-bottom:1px solid #e8e4da;background:#faf8f3">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.04em">${todayLabel()}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <div style="font:600 12px Pretendard;color:#2e5d47;border:1px solid #cfc9ba;padding:5px 12px;border-radius:99px;background:#fff">${esc(S.me.name)} · ${isPastor ? '교역자' : '교사'}</div>
        <div onclick="${h(() => navigate(() => { S.screen = 'settings'; S.sid = null; }))}" role="button" aria-label="설정 열기" title="설정" style="width:29px;height:29px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font:600 15px Pretendard;${S.screen === 'settings' ? 'background:#2e5d47;color:#fff' : 'background:#fff;color:#6d6a5f;border:1px solid #cfc9ba'}">⚙</div>
      </div>
    </div>
    <div style="font:600 26px 'MaruBuri',serif;color:#211f1a;margin-top:8px">${esc(title)}</div>
    <div style="font:400 13px Pretendard;color:#6d6a5f;margin-top:2px;padding-bottom:12px">${esc(subtitle)}</div>
    ${communityTabs || chips}
  </div>`;
}

// ══ 전체 대시보드 (교역자·전체)
function overviewView() {
  const D = students(), PAST = pastWeeks(), LW = PAST[PAST.length - 1];
  const ovLast = D.filter(x => x.att && (x.att[LW] === 'P' || x.att[LW] === 'L')).length;
  const ovCare = D.filter(x => careType(x)).length;
  const ym = curWeek().slice(0, 7);
  const ovVisits = visits().filter(x => String(x.date).startsWith(ym)).length;
  const rows = classes().map(c => {
    const list = stuOf(c);
    const att = list.filter(x => x.att && (x.att[LW] === 'P' || x.att[LW] === 'L')).length;
    const rt = Math.round(att / (list.length || 1) * 100);
    const careN = list.filter(x => careType(x)).length;
    return `<div onclick="${h(() => navigate(() => { S.cls = c; }))}" style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:13px 14px;cursor:pointer">
      <div style="width:44px;font:600 15px 'MaruBuri',serif;color:#211f1a">${esc(c)}</div>
      <div style="flex:1;min-width:0">
        <div style="font:500 12px Pretendard;color:#8a8578">${esc(teacherOf(c))} · ${list.length}명</div>
        <div style="height:4px;background:#eeeade;border-radius:99px;margin-top:6px;overflow:hidden"><div style="width:${rt}%;height:100%;background:${rt < 60 ? '#a3552e' : '#2e5d47'};border-radius:99px"></div></div>
      </div>
      <div style="text-align:right"><div style="font:600 15px Pretendard;color:#211f1a">${rt}%</div>${careN ? `<div style="font:600 11px Pretendard;color:#a3552e">관심 ${careN}</div>` : ''}</div>
    </div>`;
  }).join('');
  return `<div>
    <div style="margin:16px 20px 0;background:#fff;border:1px solid #e8e4da;border-radius:14px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr">
      <div style="padding:14px 0;text-align:center;border-right:1px solid #eeeade"><div style="font:600 22px 'MaruBuri',serif;color:#211f1a">${D.length}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">재적</div></div>
      <div style="padding:14px 0;text-align:center;border-right:1px solid #eeeade"><div style="font:600 22px 'MaruBuri',serif;color:#211f1a">${ovLast}명</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">지난주 출석</div></div>
      <div style="padding:14px 0;text-align:center;border-right:1px solid #eeeade"><div style="font:600 22px 'MaruBuri',serif;color:#a3552e">${ovCare}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">관심대상</div></div>
      <div style="padding:14px 0;text-align:center"><div style="font:600 22px 'MaruBuri',serif;color:#2e5d47">${ovVisits}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">이번달 심방</div></div>
    </div>
    <div style="${secLabel};padding-top:20px;padding-bottom:8px">반별 현황 · 지난주 기준</div>
    <div class="dashboard-card-grid" style="padding:0 20px">${rows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:8px 2px">아직 반이 없습니다. 설정에서 반을 추가하세요.</div>`}</div>
    ${shirtEventSection(users(), D.concat(users()))}
    ${retreatEventSection(D, users())}
  </div>`;
}

// ══ 반 대시보드
function classHomeView(scopeCls) {
  const CUR = curWeek(), PAST = pastWeeks(), L4 = PAST.slice(-4);
  const list = stuOf(scopeCls);
  const checked = list.filter(x => x.att && x.att[CUR]);
  const chToday = checked.filter(x => x.att[CUR] === 'P' || x.att[CUR] === 'L').length + '/' + list.length;
  const rates = list.map(x => rate(x, L4)).filter(r => r !== null);
  const chRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) + '%' : '–';
  const careList = list.filter(x => careType(x));

  const careHtml = careList.length ? `<div style="${secLabel};padding-bottom:6px">이번 주 챙길 학생</div>
    <div style="display:flex;flex-direction:column;padding:0 12px;gap:2px">
      ${careList.map(x => {
        const t = careType(x);
        const lastV = visits().filter(vv => vv.sid === x.id).sort(sortV)[0];
        const desc = (x.care && x.care.note ? x.care.note : LONG_ABS_N + '주 연속 결석') + (lastV ? ' · 마지막 기록 ' + md(lastV.date) : '');
        return `<div onclick="${h(openStu(x.id))}" style="display:flex;align-items:center;gap:12px;padding:11px 8px;border-radius:10px;cursor:pointer">
          <div style="width:38px;height:38px;border-radius:50%;background:#ddd6c6;display:flex;align-items:center;justify-content:center;font:600 13px Pretendard;color:#5c584c;flex:none">${esc(ini(x.name))}</div>
          <div style="flex:1;min-width:0"><div style="font:600 15px Pretendard;color:#211f1a">${esc(x.name)}</div><div style="font:400 12px Pretendard;color:#8a8578;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(desc)}</div></div>
          <span style="${badgeStyle(t)}">${esc(t)}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const adFields = [['ad-name', '이름 *'], ['ad-phone', '연락처 (010-…)'], ['ad-birth', '생년월일 (2012.03.14)'], ['ad-father', '연락처(부)'], ['ad-mother', '연락처(모)'], ['ad-parent', '연락처(보호자)'], ['ad-addr', '주소']];
  const adSubmit = h(async () => {
    capture();
    const name = fv('ad-name').trim();
    if (!name) { flash('이름을 입력해주세요'); return; }
    const okd = await fsTry(DB.collection('students').add({
      name, cls: scopeCls, school: '', phone: fv('ad-phone'),
      fatherPhone: fv('ad-father'), motherPhone: fv('ad-mother'), parentPhone: fv('ad-parent'),
      address: fv('ad-addr'), sacr: '없음', birth: fv('ad-birth'), trait: '새친구 · 성향 기록 전',
      att: {}, reasons: {}, care: null, notes: [], vchk: {}, ts: Date.now()
    }));
    if (okd) { S.adOpen = false; clearF('ad-'); flash(name + ' 학생을 명단에 추가했어요'); }
  });
  const adForm = S.adOpen ? `<div style="margin:6px 20px 10px;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px">
    <div style="font:600 15px 'MaruBuri',serif;color:#211f1a">새친구 등록</div>
    ${adFields.map(([id, ph]) => `<input id="${id}" value="${esc(fv(id))}" placeholder="${ph}" style="${inputStyle}">`).join('')}
    <div onclick="${adSubmit}" style="${primaryBtn}">명단에 추가</div>
  </div>` : '';

  const rows = list.map(x => {
    const t = careType(x) || (isNew(x) ? '새친구' : null);
    const vd = weekVisited(x);
    const r = rate(x);
    const dots = L4.map(w => {
      const a = x.att && x.att[w];
      return `<span style="width:9px;height:9px;border-radius:50%;display:inline-block;background:${a === 'P' ? '#2e5d47' : a === 'L' ? '#b0913e' : a === 'A' ? '#ddd6c6' : '#eeeade'}"></span>`;
    }).join('');
    const vToggle = h(async e => { e.stopPropagation(); await fsTry(stuRef(x.id).update({ ['vchk.' + curWeek()]: !vd })); capture(); render(); });
    const shirtBtn = shirtActive() ? `<span onclick="${h(e => { e.stopPropagation(); up(() => { S.shirtPick = S.shirtPick === x.id ? null : x.id; }); })}" style="cursor:pointer;font:600 10.5px Pretendard;flex:none;padding:3px 8px;border-radius:99px;${x.shirt ? 'color:#f5f2ea;background:#2e5d47' : 'color:#2e5d47;border:1px dashed #9db8a8;background:#fff'}">${esc(x.shirt || '캠프티')}</span>` : '';
    const picker = (shirtActive() && S.shirtPick === x.id) ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 0;border-bottom:1px solid #eeeade">
      ${SHIRT_SIZES.map(sz => `<span onclick="${h(async () => { await fsTry(stuRef(x.id).update({ shirt: sz === '미선택' ? FV().delete() : sz })); S.shirtPick = null; capture(); render(); })}" style="cursor:pointer;flex:none;font:600 12px Pretendard;padding:7px 12px;border-radius:99px;${(x.shirt || '미선택') === sz ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${sz}</span>`).join('')}
    </div>` : '';
    const retreatBtn = retreatActive() ? `<span onclick="${h(e => { e.stopPropagation(); up(() => { S.retreatPick = S.retreatPick === x.id ? null : x.id; }); })}" style="cursor:pointer;font:600 10.5px Pretendard;flex:none;padding:3px 8px;border-radius:99px;${x.retreatAttendance ? 'color:#f5f2ea;background:#7a6234' : 'color:#7a6234;border:1px dashed #c8b78f;background:#fff'}">${esc(x.retreatAttendance || '\uC218\uB828\uD68C')}</span>` : '';
    const retreatPicker = (retreatActive() && S.retreatPick === x.id) ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 0;border-bottom:1px solid #eeeade">
      ${RETREAT_STUDENT_OPTIONS.map(status => `<span onclick="${h(async () => { await fsTry(stuRef(x.id).update({ retreatAttendance: status === '\uBBF8\uC120\uD0DD' ? FV().delete() : status })); S.retreatPick = null; capture(); render(); })}" style="cursor:pointer;flex:none;font:600 12px Pretendard;padding:7px 12px;border-radius:99px;${(x.retreatAttendance || '\uBBF8\uC120\uD0DD') === status ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${status}</span>`).join('')}
    </div>` : '';
    return `<div onclick="${h(openStu(x.id))}" style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eeeade;cursor:pointer">
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:7px">
        <span style="font:600 15px Pretendard;color:#211f1a">${esc(x.name)}</span>
        ${t ? `<span style="${badgeStyle(t)}">${esc(t)}</span>` : ''}
        ${!vd ? `<span style="font:600 10.5px Pretendard;color:#a3552e;border:1px dashed #d8bfa8;padding:3px 8px;border-radius:99px;flex:none">미심방</span>` : ''}
        ${shirtBtn}
        ${retreatBtn}
      </div>
      <div style="display:flex;gap:3px">${dots}</div>
      <div style="font:500 12px Pretendard;color:#8a8578;width:40px;text-align:right">${r === null ? (isNew(x) ? '신규' : '–') : r + '%'}</div>
      <div onclick="${vToggle}" title="이번 주 심방 완료 체크" style="flex:none;width:22px;height:22px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;font:700 13px Pretendard;${vd ? 'background:#2e5d47;color:#fff' : 'background:#fff;border:1.5px solid #cfc9ba;color:transparent'}">${vd ? '✓' : ''}</div>
    </div>${picker}${retreatPicker}`;
  }).join('');

  return `<div>
    <div style="margin:16px 20px 0;background:#fff;border:1px solid #e8e4da;border-radius:14px;display:grid;grid-template-columns:1fr 1fr 1fr">
      <div style="padding:14px 0;text-align:center;border-right:1px solid #eeeade"><div style="font:600 22px 'MaruBuri',serif;color:#211f1a">${chToday}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">오늘 출석</div></div>
      <div style="padding:14px 0;text-align:center;border-right:1px solid #eeeade"><div style="font:600 22px 'MaruBuri',serif;color:#211f1a">${chRate}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">최근 4주</div></div>
      <div style="padding:14px 0;text-align:center"><div style="font:600 22px 'MaruBuri',serif;color:#a3552e">${careList.length}</div><div style="font:500 11px Pretendard;color:#8a8578;margin-top:2px">관심대상</div></div>
    </div>
    ${careHtml}
    <div style="padding:16px 20px 6px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.06em">학생 명단</span>
      <span onclick="${h(() => up(() => { S.adOpen = !S.adOpen; }))}" style="font:600 12px Pretendard;color:#2e5d47;cursor:pointer">${S.adOpen ? '닫기' : '+ 새친구'}</span>
    </div>
    ${adForm}
    <div style="display:flex;flex-direction:column;padding:0 20px">${rows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:8px 2px">아직 학생이 없습니다. '+ 새친구'로 명단을 만들어보세요.</div>`}</div>
    ${shirtEventSection(users().filter(u => u.cls === scopeCls), list.concat(users().filter(u => u.cls === scopeCls)))}
    ${retreatEventSection(list, users().filter(u => u.cls === scopeCls))}
  </div>`;
}

// ══ 출석 반 선택 (교역자·전체)
function attendPickView() {
  const CUR = curWeek();
  const teacherList = users().filter(user => user.role === 'teacher').sort((a, b) => String(a.cls || '').localeCompare(String(b.cls || ''), 'ko') || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  const teacherChecked = teacherList.filter(user => attendanceStatus(user, CUR)).length;
  const tabs = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;background:#eeeade;border-radius:12px">
    ${[['students', '학생'], ['teachers', '교사']].map(([key, label]) => `<div onclick="${h(() => up(() => { S.attendanceTab = key; }))}" role="button" aria-pressed="${S.attendanceTab === key}" style="text-align:center;padding:9px;border-radius:9px;cursor:pointer;font:700 13px Pretendard;${S.attendanceTab === key ? 'background:#fff;color:#211f1a;box-shadow:0 1px 4px rgba(33,31,26,.12)' : 'color:#8a8578'}">${label}</div>`).join('')}
  </div>`;
  const studentCards = classes().map(c => {
    const stats = classAttendanceStats(c);
    const attendanceDone = stats.total > 0 && stats.checked === stats.total;
    const visitDone = stats.total > 0 && stats.visited === stats.total;
    return `<div onclick="${h(() => navigate(() => { S.cls = c; }))}" style="background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:16px 14px;cursor:pointer">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px"><div style="font:600 17px 'MaruBuri',serif;color:#211f1a">${esc(c)}</div><div style="font:500 11px Pretendard;color:#8a8578">${esc(teacherOf(c))}</div></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;font:600 12px Pretendard;color:${attendanceDone ? '#2e5d47' : '#6d6a5f'}"><span>출석 체크</span><span>${stats.checked}/${stats.total}${attendanceDone ? ' ✓' : ''}</span></div>
      <div style="height:4px;background:#eeeade;border-radius:99px;margin-top:5px;overflow:hidden"><div style="width:${Math.round(stats.checked / (stats.total || 1) * 100)}%;height:100%;background:#2e5d47;border-radius:99px"></div></div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:10px;font:600 12px Pretendard;color:${visitDone ? '#7a6234' : '#8a8578'}"><span>심방 완료</span><span>${stats.visited}/${stats.total}${visitDone ? ' ✓' : ''}</span></div>
      <div style="height:4px;background:#eeeade;border-radius:99px;margin-top:5px;overflow:hidden"><div style="width:${Math.round(stats.visited / (stats.total || 1) * 100)}%;height:100%;background:#7a6234;border-radius:99px"></div></div>
    </div>`;
  }).join('');
  const teacherCards = teacherList.map(user => {
    const status = attendanceStatus(user, CUR), label = attendanceLabel(status);
    const meta = status === 'P' ? ['#2e5d47', '#e2eae2'] : status === 'L' ? ['#7a6234', '#efe7d3'] : status === 'A' ? ['#a3552e', '#f2e2d6'] : ['#8a8578', '#eeeade'];
    return `<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:14px">
      <div style="width:38px;height:38px;border-radius:50%;background:#ddd6c6;display:flex;align-items:center;justify-content:center;font:600 13px Pretendard;color:#5c584c;flex:none">${esc(ini(user.name))}</div>
      <div style="flex:1"><div style="font:600 15px Pretendard;color:#211f1a">${esc(user.name)}</div><div style="font:400 12px Pretendard;color:#8a8578;margin-top:2px">${esc(user.cls || '담당 반 미지정')}</div></div>
      <span style="font:700 11px Pretendard;color:${meta[0]};background:${meta[1]};padding:6px 10px;border-radius:99px">${label}</span>
    </div>`;
  }).join('');
  const isTeachers = S.attendanceTab === 'teachers';
  return `<div style="padding:20px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px"><div><div style="font:600 18px 'MaruBuri',serif;color:#211f1a">출석 전체 대시보드</div><div style="font:400 12px Pretendard;color:#8a8578;margin-top:3px">${md(CUR)} 주일 기준</div></div><div style="font:600 12px Pretendard;color:#2e5d47">${isTeachers ? teacherChecked + '/' + teacherList.length + ' 교사 체크' : '반별 현황'}</div></div>
    ${tabs}
    <div style="font:500 13px Pretendard;color:#6d6a5f;margin:14px 0 10px">${isTeachers ? '교사가 직접 체크한 금주 출석입니다.' : '반별 출석 체크와 심방 완료 현황입니다.'}</div>
    <div class="${isTeachers ? 'teacher-attendance-grid' : 'attendance-class-grid'}" style="gap:8px">
      ${isTeachers ? (teacherCards || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:8px 2px">등록된 교사가 없습니다.</div>`) : (studentCards || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:8px 2px">등록된 반이 없습니다.</div>`)}
    </div>
  </div>`;
}

// ══ 출석체크
function attendView(scopeCls) {
  const CUR = curWeek();
  const list = stuOf(scopeCls);
  const done = list.filter(x => x.att && x.att[CUR]).length;
  const REASONS = ['질병', '학원·시험', '가족 일정', '여행', '미입력'];
  const btn = (on, color) => 'cursor:pointer;flex:none;white-space:nowrap;font:600 13px Pretendard;padding:9px 11px;border-radius:9px;' + (on ? 'color:#fff;background:' + color : 'color:#8a8578;background:#f3efe6');
  const myUser = S.me.role === 'teacher' ? users().find(user => user.email === S.me.email) : null;
  const myStatus = attendanceStatus(myUser, CUR);
  const setMyAttendance = status => h(async () => {
    const nextValue = myStatus === status ? FV().delete() : status;
    const okd = await fsTry(DB.collection('users').doc(S.me.email).update({ ['att.' + CUR]: nextValue }));
    if (okd) flash(myStatus === status ? '내 출석 체크를 취소했어요' : '내 출석을 ' + attendanceLabel(status) + '으로 저장했어요');
  });
  const myAttendance = myUser ? `<div style="margin:16px 20px 0;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><div style="font:600 15px 'MaruBuri',serif;color:#211f1a">내 출석</div><div style="font:400 11.5px Pretendard;color:#8a8578;margin-top:3px">교사 본인의 ${md(CUR)} 주일 출석을 체크하세요.</div></div><span style="font:700 11px Pretendard;color:${myStatus ? '#2e5d47' : '#a3552e'}">${attendanceLabel(myStatus)}</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px">${[['P','출석','#2e5d47'],['L','지각','#b0913e'],['A','결석','#a3552e']].map(([status, label, color]) => `<span onclick="${setMyAttendance(status)}" style="${btn(myStatus === status, color)};text-align:center">${label}</span>`).join('')}</div>
    <div style="font:400 10.5px Pretendard;color:#b5b0a2;margin-top:8px">선택한 항목을 한 번 더 누르면 체크를 취소합니다.</div>
  </div>` : '';
  const rows = list.map(x => {
    const a = x.att && x.att[CUR];
    const set = val => h(async () => {
      const upd = { ['att.' + CUR]: val };
      if (val !== 'A') upd['reasons.' + CUR] = FV().delete();
      await fsTry(stuRef(x.id).update(upd));
      capture(); render();
    });
    const chips = a === 'A' ? `<div style="display:flex;gap:6px;padding:0 12px 12px;flex-wrap:wrap">
      ${REASONS.map(rr => `<span onclick="${h(async () => { await fsTry(stuRef(x.id).update({ ['att.' + CUR]: 'A', ['reasons.' + CUR]: rr })); capture(); render(); })}" style="cursor:pointer;font:500 12px Pretendard;padding:6px 11px;border-radius:99px;${(x.reasons && x.reasons[CUR]) === rr ? 'color:#fff;background:#a3552e' : 'color:#8a8578;border:1px solid #e8e4da'}">${rr}</span>`).join('')}
    </div>` : '';
    return `<div style="border-radius:12px;background:#fff;border:1px solid ${a === 'A' ? '#dcc9b8' : '#e8e4da'}">
      <div style="display:flex;align-items:center;gap:10px;padding:11px 12px">
        <div onclick="${h(openStu(x.id))}" style="flex:1;font:600 15px Pretendard;color:#211f1a;cursor:pointer">${esc(x.name)}</div>
        <div style="display:flex;gap:6px">
          <span onclick="${set('P')}" style="${btn(a === 'P', '#2e5d47')}">출석</span>
          <span onclick="${set('L')}" style="${btn(a === 'L', '#b0913e')}">지각</span>
          <span onclick="${set('A')}" style="${btn(a === 'A', '#a3552e')}">결석</span>
        </div>
      </div>
      ${chips}
    </div>`;
  }).join('');
  const left = list.length - done;
  return `<div>
    ${myAttendance}
    <div style="padding:16px 20px 0">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font:600 13px Pretendard;color:#6d6a5f">${esc(scopeCls)}반 · ${md(CUR)} 주일</div>
        <div style="font:500 13px Pretendard;color:#2e5d47">${done} / ${list.length} 체크</div>
      </div>
      <div style="height:5px;background:#e8e4da;border-radius:99px;margin-top:10px;overflow:hidden"><div style="width:${Math.round(done / (list.length || 1) * 100)}%;height:100%;background:#2e5d47;border-radius:99px"></div></div>
    </div>
    <div style="display:flex;flex-direction:column;padding:14px 14px 0;gap:8px">
      ${rows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:8px 6px">이 반에는 아직 학생이 없습니다.</div>`}
      ${list.length ? `<div onclick="${h(() => flash(left > 0 ? '저장했어요 · ' + left + '명은 나중에 체크할 수 있어요' : '오늘 출석이 모두 저장되었습니다'))}" style="margin-top:6px;padding:14px;border-radius:12px;background:#2e5d47;text-align:center;font:600 15px Pretendard;color:#f5f2ea;cursor:pointer">${left > 0 ? '출석 저장 · ' + left + '명 미체크' : '출석 저장 완료'}</div>` : ''}
    </div>
    <div style="font:400 11.5px Pretendard;color:#b5b0a2;text-align:center;padding:10px 20px 0">체크하는 즉시 클라우드에 자동 저장됩니다.</div>
  </div>`;
}

// ══ 심방기록
function visitsView() {
  const isPastor = S.me.role === 'pastor';
  const scoped = scopeStudents();
  const ids = {}; scoped.forEach(x => ids[x.id] = x);
  const rows = visits().filter(x => ids[x.sid]).sort(sortV);
  const scopeLabel = isPastor && S.cls === '전체' ? '전체 부서' : (isPastor ? S.cls : S.me.cls) + '반';
  const vSubmit = h(async () => {
    capture();
    const sid = fv('v-stu'), text = fv('v-text').trim();
    if (!sid || !text) { flash('학생과 내용을 입력해주세요'); return; }
    const okd = await fsTry(DB.collection('visits').add({ sid, date: todayISO(), type: S.vType, text, by: S.me.name, ts: Date.now() }));
    if (okd) { S.vOpen = false; clearF('v-'); flash('심방 기록이 저장되었습니다'); }
  });
  const form = S.vOpen ? `<div style="margin:14px 20px 0;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px">
    <div style="font:600 15px 'MaruBuri',serif;color:#211f1a">새 기록</div>
    <select id="v-stu" style="padding:11px 12px;border:1px solid #e8e4da;border-radius:10px;font:500 14px Pretendard;color:#211f1a;background:#faf8f3">
      <option value="">학생 선택…</option>
      ${scoped.map(x => `<option value="${esc(x.id)}" ${x.id === fv('v-stu') ? 'selected' : ''}>${esc(x.name)} · ${esc(x.cls)}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px">
      ${['심방', '전화', '카톡', '상담'].map(t => `<span onclick="${h(() => up(() => { S.vType = t; }))}" style="cursor:pointer;font:600 12px Pretendard;padding:8px 14px;border-radius:99px;${S.vType === t ? 'color:#f5f2ea;background:#2e5d47' : 'color:#8a8578;border:1px solid #e8e4da'}">${t}</span>`).join('')}
    </div>
    <textarea id="v-text" placeholder="만남 내용, 나눈 이야기, 기도제목…" style="padding:11px 12px;border:1px solid #e8e4da;border-radius:10px;font:400 14px Pretendard;color:#211f1a;min-height:76px;resize:vertical;background:#faf8f3">${esc(fv('v-text'))}</textarea>
    <div onclick="${vSubmit}" style="${darkBtn}">기록 저장</div>
  </div>` : '';
  const rowHtml = rows.map(x => {
    const stu = ids[x.sid];
    const canDel = isPastor || x.by === S.me.name;
    const del = canDel ? `<span onclick="${h(async e => { e.stopPropagation(); if (!confirm('이 기록을 삭제할까요?')) return; await fsTry(DB.collection('visits').doc(x.id).delete()); capture(); render(); })}" style="font:500 11px Pretendard;color:#b5b0a2;cursor:pointer;margin-left:10px">삭제</span>` : '';
    return `<div onclick="${h(openStu(stu.id))}" style="background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:14px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="${typeStyle(x.type)}">${esc(x.type)}</span>
        <span style="font:600 14px Pretendard;color:#211f1a">${esc(stu.name)}</span>
        <span style="font:400 12px Pretendard;color:#b5b0a2">${esc(stu.cls)}</span>
        <span style="font:400 12px Pretendard;color:#8a8578;margin-left:auto">${md(x.date)}${x.by ? ' · ' + esc(x.by) : ''}${del}</span>
      </div>
      <div style="font:400 13px Pretendard;color:#6d6a5f;margin-top:8px;line-height:1.55">${esc(x.text)}</div>
    </div>`;
  }).join('');
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 0">
      <div style="font:600 13px Pretendard;color:#6d6a5f">${esc(scopeLabel)} · ${rows.length}건</div>
      <div onclick="${h(() => up(() => { S.vOpen = !S.vOpen; }))}" style="font:600 13px Pretendard;color:#f5f2ea;background:#2e5d47;padding:8px 14px;border-radius:99px;cursor:pointer">${S.vOpen ? '닫기' : '+ 새 기록'}</div>
    </div>
    ${form}
    <div style="display:flex;flex-direction:column;gap:8px;padding:14px 20px 0">${rowHtml || `<div style="font:400 13px Pretendard;color:#b5b0a2">아직 심방 기록이 없습니다.</div>`}</div>
  </div>`;
}

// ══ 관심대상
function careView() {
  const scoped = scopeStudents();
  const lastMuted = 'font:400 11px Pretendard;color:#b5b0a2;text-align:right;flex:none';
  const item = (x, note, last, lastStyle) => `<div onclick="${h(openStu(x.id))}" style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:13px 14px;cursor:pointer">
    <div style="width:38px;height:38px;border-radius:50%;background:#ddd6c6;display:flex;align-items:center;justify-content:center;font:600 13px Pretendard;color:#5c584c;flex:none">${esc(ini(x.name))}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:baseline;gap:6px"><span style="font:600 15px Pretendard;color:#211f1a">${esc(x.name)}</span><span style="font:400 12px Pretendard;color:#b5b0a2">${esc(x.cls)}</span></div>
      <div style="font:400 12px Pretendard;color:#8a8578;margin-top:2px">${esc(note)}</div>
    </div>
    <div style="${lastStyle}">${esc(last)}</div>
  </div>`;
  const mk = t => scoped.filter(x => careType(x) === t).map(x => {
    const lastV = visits().filter(vv => vv.sid === x.id).sort(sortV)[0];
    return item(x, x.care && x.care.note ? x.care.note : LONG_ABS_N + '주 연속 결석 · 사유 미입력', lastV ? '기록 ' + md(lastV.date) : '기록 없음', lastMuted);
  });
  const bds = scoped.map(x => ({ x, b: bdInfo(x) })).filter(o => o.b && o.b.days <= BDAY_DAYS)
    .sort((a, b) => a.b.days - b.b.days)
    .map(o => item(o.x, o.b.m + '월 ' + o.b.d + '일 · 만 ' + o.b.age + '세 생일', o.b.days === 0 ? '오늘 🎂' : 'D-' + o.b.days, 'font:700 12px Pretendard;color:#2e5d47;text-align:right;flex:none'));
  const groups = [
    { title: '다가오는 생일', hint: BDAY_DAYS + '일 이내', items: bds },
    { title: '장기결석', hint: LONG_ABS_N + '주 연속 결석 자동 감지', items: mk('장결') },
    { title: '질병·회복', hint: '', items: mk('질병') },
    { title: '기도필요', hint: '', items: mk('기도') }
  ].filter(g => g.items.length > 0);
  if (!groups.length) return `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:24px 20px">지금은 특별히 챙길 학생이 없습니다.</div>`;
  return groups.map(g => `<div>
    <div style="padding:18px 20px 6px;display:flex;align-items:baseline;gap:8px">
      <span style="font:600 16px 'MaruBuri',serif;color:#211f1a">${g.title}</span>
      <span style="font:500 12px Pretendard;color:#8a8578">${g.items.length}명</span>
      <span style="font:400 11px Pretendard;color:#b5b0a2;margin-left:auto">${g.hint}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px">${g.items.join('')}</div>
  </div>`).join('');
}

// ══ 돌봄 허브 (심방·관심 통합)
function careHubView() {
  const changeMode = h(e => up(() => { S.careMode = e.target.value; S.vOpen = false; }));
  return `<div>
    <div style="padding:16px 20px 2px">
      <label for="care-mode" style="display:block;font:600 12px Pretendard;color:#8a8578;margin-bottom:7px;letter-spacing:.04em">돌봄 보기</label>
      <select id="care-mode" onchange="${changeMode}" style="${inputStyle};width:100%;font-weight:600;background:#fff">
        <option value="visits" ${S.careMode === 'visits' ? 'selected' : ''}>심방 기록</option>
        <option value="care" ${S.careMode === 'care' ? 'selected' : ''}>관심 학생</option>
      </select>
    </div>
    ${S.careMode === 'care' ? careView() : visitsView()}
  </div>`;
}

// ══ 게시판
function boardView() {
  const isPastor = S.me.role === 'pastor';
  const stamp = ts => {
    if (!ts) return '';
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const toggleLike = (collection, item) => h(async e => {
    e && e.stopPropagation();
    const liked = Array.isArray(item.likedBy) && item.likedBy.includes(S.me.email);
    await fsTry(DB.collection(collection).doc(item.id).update({ likedBy: liked ? FV().arrayRemove(S.me.email) : FV().arrayUnion(S.me.email) }));
  });
  const submit = h(async () => {
    capture();
    const category = normalizeBoardCategory(fv('board-category'));
    const title = fv('board-title').trim().slice(0, 80);
    const body = fv('board-body').trim().slice(0, 2000);
    if (!title || !body) { flash('제목과 내용을 입력해주세요'); return; }
    const editing = S.boardEditId && posts().find(x => x.id === S.boardEditId && x.authorEmail === S.me.email);
    const action = editing
      ? DB.collection('posts').doc(editing.id).update({ category, title, body, updatedTs: Date.now() })
      : DB.collection('posts').add({ category, title, body, authorEmail: S.me.email, authorName: S.me.name, cls: S.me.role === 'pastor' ? '전체' : S.me.cls, likedBy: [], ts: Date.now() });
    const okd = await fsTry(action);
    if (okd) { S.boardOpen = false; S.boardEditId = null; clearF('board-'); flash(editing ? '게시글을 수정했어요' : '게시글을 등록했어요'); }
  });
  const form = S.boardOpen ? `<div style="margin:14px 20px 0;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:9px;animation:sectionReveal .2s ease-out">
    <div style="font:600 15px 'MaruBuri',serif;color:#211f1a">${S.boardEditId ? '게시글 수정' : '새 게시글'}</div>
    <select id="board-category" style="${inputStyle}">
      ${BOARD_CATEGORIES.map(category => `<option value="${category}" ${normalizeBoardCategory(fv('board-category')) === category ? 'selected' : ''}>${category === '공지' ? '공지사항' : category === '나눔' ? '교사 나눔' : '회의록'}</option>`).join('')}
    </select>
    <input id="board-title" maxlength="80" value="${esc(fv('board-title'))}" placeholder="제목" style="${inputStyle}">
    <textarea id="board-body" maxlength="2000" placeholder="함께 공유할 내용을 입력하세요" style="${inputStyle};min-height:120px;resize:vertical;line-height:1.55">${esc(fv('board-body'))}</textarea>
    <div onclick="${submit}" style="${darkBtn}">${S.boardEditId ? '수정 저장' : '게시글 등록'}</div>
  </div>` : '';

  const selected = S.boardPostId ? posts().find(x => x.id === S.boardPostId) : null;
  if (S.boardPostId && !selected) S.boardPostId = null;
  if (selected) {
    const categoryMeta = boardCategoryMeta(selected.category);
    const postComments = comments().filter(x => x.postId === selected.id);
    const canEdit = selected.authorEmail === S.me.email;
    const canDelete = isPastor || canEdit;
    const edit = canEdit ? `<span onclick="${h(() => up(() => { S.boardEditId = selected.id; S.boardOpen = true; S.boardPostId = null; F['board-category'] = selected.category || '공지'; F['board-title'] = selected.title || ''; F['board-body'] = selected.body || ''; }))}" style="font:600 12px Pretendard;color:#2e5d47;cursor:pointer">수정</span>` : '';
    const del = canDelete ? `<span onclick="${h(async () => { if (!confirm('게시글과 댓글을 모두 삭제할까요?')) return; const batch = DB.batch(); batch.delete(DB.collection('posts').doc(selected.id)); postComments.forEach(c => batch.delete(DB.collection('comments').doc(c.id))); const okd = await fsTry(batch.commit()); if (okd) { S.boardPostId = null; flash('게시글을 삭제했어요'); } })}" style="font:600 12px Pretendard;color:#a3552e;cursor:pointer">삭제</span>` : '';
    const commentSubmit = h(async () => {
      capture();
      const body = fv('comment-body').trim().slice(0, 1000);
      if (!body) { flash('댓글 내용을 입력해주세요'); return; }
      const okd = await fsTry(DB.collection('comments').add({ postId: selected.id, body, authorEmail: S.me.email, authorName: S.me.name, cls: S.me.role === 'pastor' ? '전체' : S.me.cls, likedBy: [], ts: Date.now() }));
      if (okd) { clearF('comment-'); flash('댓글을 등록했어요'); }
    });
    const commentRows = postComments.map(comment => {
      const liked = Array.isArray(comment.likedBy) && comment.likedBy.includes(S.me.email);
      const canDelComment = isPastor || comment.authorEmail === S.me.email;
      const commentDel = canDelComment ? `<span onclick="${h(async () => { if (!confirm('이 댓글을 삭제할까요?')) return; await fsTry(DB.collection('comments').doc(comment.id).delete()); })}" style="font:500 11px Pretendard;color:#a3552e;cursor:pointer">삭제</span>` : '';
      return `<div style="padding:14px 2px;border-bottom:1px dashed #d8d3c8">
        <div style="display:flex;align-items:center;gap:7px"><span style="font:700 13px Pretendard;color:#211f1a">${esc(comment.authorName || '작성자')}</span><span style="font:400 11px Pretendard;color:#b5b0a2">${esc(comment.cls || '')} · ${stamp(comment.ts)}</span><span style="margin-left:auto">${commentDel}</span></div>
        <div style="font:400 13.5px Pretendard;color:#5c584c;line-height:1.65;margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(comment.body)}</div>
        <div onclick="${toggleLike('comments', comment)}" style="display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:5px 10px;border-radius:99px;cursor:pointer;font:600 11px Pretendard;color:${liked ? '#a3552e' : '#8a8578'};border:1px solid ${liked ? '#d8bfa8' : '#e8e4da'}">♡ 공감 ${(comment.likedBy || []).length}</div>
      </div>`;
    }).join('');
    const postLiked = Array.isArray(selected.likedBy) && selected.likedBy.includes(S.me.email);
    return `<div>
      <div style="padding:14px 20px 0"><span onclick="${h(() => appBack(() => { S.boardPostId = null; clearF('comment-'); }))}" style="font:600 13px Pretendard;color:#2e5d47;cursor:pointer">‹ 목록으로</span></div>
      <article style="margin:12px 20px 0;background:#fff;border:1px solid #d8cdb5;border-radius:14px;padding:17px 16px">
        <div style="display:flex;align-items:center;gap:7px"><span style="font:700 10.5px Pretendard;color:${categoryMeta.color};background:${categoryMeta.background};padding:4px 8px;border-radius:99px">${esc(categoryMeta.label)}</span><span style="margin-left:auto;display:flex;gap:10px">${edit}${del}</span></div>
        <h2 style="font:600 20px 'MaruBuri',serif;color:#211f1a;line-height:1.4;margin:12px 0 0">${esc(selected.title)}</h2>
        <div style="font:400 11.5px Pretendard;color:#b5b0a2;margin-top:7px">${esc(selected.authorName || '작성자')} · ${esc(selected.cls || '')} · ${stamp(selected.ts)}${selected.updatedTs ? ' · 수정됨' : ''}</div>
        <div style="font:400 14px Pretendard;color:#3f3c35;line-height:1.75;margin-top:20px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(selected.body)}</div>
        <div onclick="${toggleLike('posts', selected)}" style="display:inline-flex;align-items:center;gap:5px;margin-top:18px;padding:7px 12px;border-radius:99px;cursor:pointer;font:600 12px Pretendard;color:${postLiked ? '#a3552e' : '#8a8578'};border:1px solid ${postLiked ? '#d8bfa8' : '#e8e4da'}">♡ 공감 ${(selected.likedBy || []).length}</div>
      </article>
      <div style="margin:18px 20px 0">
        <div style="font:600 15px 'MaruBuri',serif;color:#211f1a">댓글 ${postComments.length}</div>
        <div style="margin-top:8px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:0 14px">${commentRows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:18px 2px">첫 댓글을 남겨보세요.</div>`}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><textarea id="comment-body" maxlength="1000" placeholder="댓글을 입력하세요" style="${inputStyle};flex:1;min-height:72px;resize:vertical">${esc(fv('comment-body'))}</textarea><div onclick="${commentSubmit}" style="${primaryBtn};width:62px;display:flex;align-items:center;justify-content:center">등록</div></div>
      </div>
    </div>`;
  }

  const rows = posts().map(post => {
    const commentCount = comments().filter(x => x.postId === post.id).length;
    const categoryMeta = boardCategoryMeta(post.category);
    return `<div onclick="${h(() => navigate(() => { S.boardPostId = post.id; S.boardOpen = false; }))}" style="display:flex;align-items:center;gap:10px;padding:14px 4px;border-bottom:1px solid #e8e4da;cursor:pointer">
      <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="font:700 10.5px Pretendard;color:${categoryMeta.color}">${esc(categoryMeta.label)}</span><span style="font:600 15px Pretendard;color:#211f1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(post.title)}</span></div><div style="font:400 11.5px Pretendard;color:#8a8578;margin-top:6px">${esc(post.authorName || '작성자')} · ${esc(post.cls || '')} · ${stamp(post.ts)} · 공감 ${(post.likedBy || []).length}</div></div>
      <div style="width:42px;height:48px;border-radius:10px;background:#f4f1ea;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none"><b style="font:700 14px Pretendard;color:#211f1a">${commentCount}</b><span style="font:500 10px Pretendard;color:#8a8578">댓글</span></div>
    </div>`;
  }).join('');
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 0">
      <div><div style="font:600 17px 'MaruBuri',serif;color:#211f1a">중고등부 게시판</div><div style="font:400 12px Pretendard;color:#8a8578;margin-top:3px">공지·나눔·회의록을 함께 확인하세요.</div></div>
      <div onclick="${h(() => up(() => { S.boardOpen = !S.boardOpen; S.boardEditId = null; if (!S.boardOpen) clearF('board-'); }))}" style="font:600 13px Pretendard;color:#f5f2ea;background:#2e5d47;padding:8px 13px;border-radius:99px;cursor:pointer">${S.boardOpen ? '닫기' : '+ 글쓰기'}</div>
    </div>
    ${form}
    <div style="margin:14px 20px 0;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:0 12px">${rows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:18px 2px">아직 게시글이 없습니다. 첫 공지를 작성해보세요.</div>`}</div>
  </div>`;
}

// ══ 공유 일정 캘린더
function calendarView() {
  const today = todayISO();
  const month = S.calendarMonth || today.slice(0, 7);
  if (!S.calendarMonth) S.calendarMonth = month;
  if (!S.calendarDate || !S.calendarDate.startsWith(month)) S.calendarDate = month === today.slice(0, 7) ? today : month + '-01';
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const monthStart = month + '-01';
  const monthEnd = month + '-' + String(daysInMonth).padStart(2, '0');
  const monthEvents = events().filter(x => eventOverlaps(x, monthStart, monthEnd));
  const moveMonth = delta => h(() => up(() => {
    const d = new Date(year, monthNum - 1 + delta, 1);
    S.calendarMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    S.calendarDate = S.calendarMonth + '-01'; S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false; clearF('event-');
  }));
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push('<div style="min-height:54px"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = month + '-' + String(day).padStart(2, '0');
    const count = monthEvents.filter(x => eventOccursOn(x, date)).length;
    const selected = S.calendarDate === date, isToday = today === date;
    cells.push(`<div class="calendar-cell" onclick="${h(() => up(() => { S.calendarDate = date; S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false; clearF('event-'); }))}" style="padding:7px 4px;border-radius:10px;cursor:pointer;text-align:center;${selected ? 'background:#2e5d47;color:#fff' : 'background:#fff;color:#211f1a'};${isToday && !selected ? 'box-shadow:inset 0 0 0 1.5px #7a6234' : ''}">
      <div style="font:600 12px Pretendard">${day}</div>
      ${count ? `<div style="display:flex;justify-content:center;gap:2px;margin-top:7px">${Array.from({ length: Math.min(count, 3) }, () => `<span style="width:4px;height:4px;border-radius:50%;background:${selected ? '#f5f2ea' : '#a3552e'}"></span>`).join('')}</div>` : ''}
    </div>`);
  }
  const selectedEvents = events().filter(x => eventOccursOn(x, S.calendarDate)).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const submit = h(async () => {
    capture();
    const title = fv('event-title').trim().slice(0, 80);
    const date = fv('event-date') || S.calendarDate;
    const endDate = fv('event-end-date') || date;
    const time = fv('event-time').slice(0, 5);
    const note = fv('event-note').trim().slice(0, 1000);
    if (!title || !date) { flash('일정 제목과 날짜를 입력해주세요'); return; }
    if (endDate < date) { flash('종료일은 시작일보다 빠를 수 없습니다'); return; }
    const editing = S.eventEditId && events().find(x => x.id === S.eventEditId && x.authorEmail === S.me.email);
    const payload = { title, date, endDate, time, note, pollEnabled: S.eventPollEnabled };
    let action;
    if (editing && editing.pollEnabled && !S.eventPollEnabled) {
      const batch = DB.batch();
      batch.update(DB.collection('events').doc(editing.id), Object.assign({}, payload, { updatedTs: Date.now() }));
      eventVotes().filter(v => v.eventId === editing.id).forEach(v => batch.delete(DB.collection('eventVotes').doc(v.id)));
      action = batch.commit();
    } else if (editing) action = DB.collection('events').doc(editing.id).update(Object.assign({}, payload, { updatedTs: Date.now() }));
    else action = DB.collection('events').add(Object.assign({}, payload, { authorEmail: S.me.email, authorName: S.me.name, ts: Date.now() }));
    const okd = await fsTry(action);
    if (okd) { S.calendarMonth = date.slice(0, 7); S.calendarDate = date; S.eventOpen = false; S.eventEditId = null; S.eventPollEnabled = false; clearF('event-'); flash(editing ? '일정을 수정했어요' : '일정을 등록했어요'); }
  });
  const form = S.eventOpen ? `<div style="margin-top:10px;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;animation:sectionReveal .2s ease-out">
    <div style="font:600 14px 'MaruBuri',serif;color:#211f1a">${S.eventEditId ? '일정 수정' : '새 일정'}</div>
    <input id="event-title" maxlength="80" value="${esc(fv('event-title'))}" placeholder="일정 제목" style="${inputStyle}">
    <div class="event-schedule-heading"><span class="event-schedule-title">날짜와 시간</span><span class="event-schedule-help">여러 날 일정은 종료일까지 선택</span></div>
    <div class="event-date-grid">
      <div class="event-period">
        <label class="event-field"><span class="event-field-label">시작일</span><input class="event-field-control" id="event-date" type="date" value="${esc(fv('event-date') || S.calendarDate)}" onchange="const end=document.getElementById('event-end-date');end.min=this.value;if(!end.value||end.value&lt;this.value)end.value=this.value"></label>
        <span class="event-range-arrow" aria-hidden="true">→</span>
        <label class="event-field"><span class="event-field-label">종료일</span><input class="event-field-control" id="event-end-date" type="date" min="${esc(fv('event-date') || S.calendarDate)}" value="${esc(fv('event-end-date') || fv('event-date') || S.calendarDate)}"></label>
      </div>
      <label class="event-field event-time-field"><span class="event-field-label">시간 · 선택</span><input class="event-field-control" id="event-time" type="time" value="${esc(fv('event-time'))}"></label>
    </div>
    <textarea id="event-note" maxlength="1000" placeholder="장소, 준비물, 안내사항 등" style="${inputStyle};min-height:74px;resize:vertical">${esc(fv('event-note'))}</textarea>
    <div onclick="${h(() => up(() => { S.eventPollEnabled = !S.eventPollEnabled; }))}" style="display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid ${S.eventPollEnabled ? '#9db8a8' : '#e8e4da'};border-radius:10px;cursor:pointer;background:${S.eventPollEnabled ? '#f1f6f1' : '#faf8f3'}"><span style="width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font:700 12px Pretendard;${S.eventPollEnabled ? 'background:#2e5d47;color:#fff' : 'border:1.5px solid #cfc9ba;color:transparent'}">✓</span><div><div style="font:600 13px Pretendard;color:#211f1a">참석 여부 투표 사용</div><div style="font:400 11px Pretendard;color:#8a8578;margin-top:2px">참석·불참·미정으로 응답을 받습니다.</div></div></div>
    <div onclick="${submit}" style="${darkBtn}">${S.eventEditId ? '수정 저장' : '일정 등록'}</div>
  </div>` : '';
  const eventRows = selectedEvents.map(event => {
    const canEdit = event.authorEmail === S.me.email;
    const canDelete = S.me.role === 'pastor' || canEdit;
    const edit = canEdit ? `<span onclick="${h(() => up(() => { S.eventEditId = event.id; S.eventOpen = true; S.eventPollEnabled = !!event.pollEnabled; F['event-title'] = event.title || ''; F['event-date'] = eventStart(event) || S.calendarDate; F['event-end-date'] = eventEnd(event) || S.calendarDate; F['event-time'] = event.time || ''; F['event-note'] = event.note || ''; }))}" style="font:500 11px Pretendard;color:#2e5d47;cursor:pointer">수정</span>` : '';
    const del = canDelete ? `<span onclick="${h(async () => { if (!confirm('이 일정과 투표 결과를 삭제할까요?')) return; const batch = DB.batch(); batch.delete(DB.collection('events').doc(event.id)); eventVotes().filter(v => v.eventId === event.id).forEach(v => batch.delete(DB.collection('eventVotes').doc(v.id))); const okd = await fsTry(batch.commit()); if (okd) flash('일정을 삭제했어요'); })}" style="font:500 11px Pretendard;color:#a3552e;cursor:pointer">삭제</span>` : '';
    const votes = eventVotes().filter(v => v.eventId === event.id);
    const myVote = votes.find(v => v.userEmail === S.me.email);
    const vote = status => h(async () => {
      const ref = DB.collection('eventVotes').doc(event.id + '--' + encodeURIComponent(S.me.email));
      const okd = await fsTry(myVote && myVote.status === status ? ref.delete() : ref.set({ eventId: event.id, userEmail: S.me.email, userName: S.me.name, status, ts: Date.now() }));
      if (okd) flash(myVote && myVote.status === status ? '응답을 취소했어요' : status + '으로 응답했어요');
    });
    const voteBox = event.pollEnabled ? `<div style="margin-top:11px;padding-top:10px;border-top:1px solid #eeeade"><div style="display:flex;align-items:center;justify-content:space-between"><span style="font:600 11px Pretendard;color:#7a6234">참석 여부 · ${votes.length}명 응답</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:7px">${['참석','불참','미정'].map(status => { const count = votes.filter(v => v.status === status).length; const on = myVote && myVote.status === status; return `<div onclick="${vote(status)}" style="text-align:center;padding:8px 4px;border-radius:9px;cursor:pointer;font:600 11.5px Pretendard;${on ? 'background:#2e5d47;color:#fff' : 'background:#faf8f3;color:#6d6a5f;border:1px solid #e8e4da'}">${status} ${count}</div>`; }).join('')}</div></div>` : '';
    return `<div style="background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:13px 14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font:700 11.5px Pretendard;color:#7a6234;min-width:82px">${esc(eventRangeLabel(event))} · ${esc(event.time || '종일')}</span><span style="font:600 14px Pretendard;color:#211f1a;flex:1">${esc(event.title)}</span>${edit}${del}</div>
      ${event.note ? `<div style="font:400 12.5px Pretendard;color:#6d6a5f;line-height:1.55;margin-top:7px;white-space:pre-wrap">${esc(event.note)}</div>` : ''}
      <div style="font:400 11px Pretendard;color:#b5b0a2;margin-top:7px">${esc(event.authorName || '작성자')}${event.updatedTs ? ' · 수정됨' : ''}</div>${voteBox}
    </div>`;
  }).join('');
  return `<div style="padding:16px 20px 0">
    <div style="display:flex;align-items:center;justify-content:space-between"><span onclick="${moveMonth(-1)}" style="font:700 20px Pretendard;color:#2e5d47;cursor:pointer;padding:4px 10px">‹</span><div style="text-align:center"><div style="font:600 19px 'MaruBuri',serif;color:#211f1a">${year}년 ${monthNum}월</div><div style="font:400 11px Pretendard;color:#8a8578;margin-top:2px">공유 일정 ${monthEvents.length}건</div></div><span onclick="${moveMonth(1)}" style="font:700 20px Pretendard;color:#2e5d47;cursor:pointer;padding:4px 10px">›</span></div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:14px">${['일','월','화','수','목','금','토'].map((w, i) => `<div style="text-align:center;font:600 10.5px Pretendard;color:${i === 0 ? '#a3552e' : i === 6 ? '#4c6b82' : '#8a8578'};padding-bottom:3px">${w}</div>`).join('')}${cells.join('')}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px"><div><div style="font:600 15px 'MaruBuri',serif;color:#211f1a">${md(S.calendarDate)} 일정</div><div style="font:400 11px Pretendard;color:#8a8578;margin-top:2px">${selectedEvents.length}건</div></div><div onclick="${h(() => up(() => { S.eventOpen = !S.eventOpen; S.eventEditId = null; S.eventPollEnabled = false; if (!S.eventOpen) clearF('event-'); }))}" style="font:600 12px Pretendard;color:#f5f2ea;background:#2e5d47;padding:8px 12px;border-radius:99px;cursor:pointer">${S.eventOpen ? '닫기' : '+ 일정'}</div></div>
    ${form}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${eventRows || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:14px 2px">선택한 날짜에 등록된 일정이 없습니다.</div>`}</div>
  </div>`;
}

// ══ 학생 상세
function studentView(st) {
  const CUR = curWeek(), PAST = pastWeeks();
  const t = careType(st);
  const r = rate(st);
  const dash = x => (x && String(x).trim()) ? x : '미입력';
  const back = h(() => appBack(() => { S.sid = null; S.edOn = false; S.delArm = false; }));

  // 교적 (보기/수정)
  const edFieldDefs = [['ed-name', '이름', st.name], ['ed-phone', '본인 연락처', st.phone], ['ed-fatherPhone', '연락처(부)', st.fatherPhone], ['ed-motherPhone', '연락처(모)', st.motherPhone], ['ed-parentPhone', '연락처(보호자)', st.parentPhone], ['ed-address', '주소', st.address], ['ed-birth', '생년월일', st.birth], ['ed-school', '학교', st.school], ['ed-trait', '성향', st.trait]];
  const edToggle = h(() => up(() => {
    if (S.edOn) { S.edOn = false; clearF('ed-'); }
    else { S.edOn = true; S.edSacr = st.sacr || '없음'; edFieldDefs.forEach(([id, , val]) => F[id] = val || ''); }
  }));
  const edSave = h(async () => {
    capture();
    if (!fv('ed-name').trim()) { flash('이름은 비울 수 없어요'); return; }
    const okd = await fsTry(stuRef(st.id).update({ name: fv('ed-name').trim(), phone: fv('ed-phone'), fatherPhone: fv('ed-fatherPhone'), motherPhone: fv('ed-motherPhone'), parentPhone: fv('ed-parentPhone'), address: fv('ed-address'), birth: fv('ed-birth'), school: fv('ed-school'), trait: fv('ed-trait'), sacr: S.edSacr }));
    if (okd) { S.edOn = false; clearF('ed-'); flash('교적을 수정했어요'); }
  });
  const edForm = `<div style="margin:0 20px;background:#fff;border:1px solid #cfc9ba;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px">
    ${edFieldDefs.map(([id, label]) => `<div style="display:flex;align-items:center;gap:10px">
      <span style="font:500 12px Pretendard;color:#8a8578;width:64px;flex:none">${label}</span>
      <input id="${id}" value="${esc(fv(id))}" style="flex:1;padding:9px 11px;border:1px solid #e8e4da;border-radius:9px;font:400 13px Pretendard;color:#211f1a;background:#faf8f3">
    </div>`).join('')}
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font:500 12px Pretendard;color:#8a8578;width:64px;flex:none">신급</span>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${['세례', '유아세례', '입교', '없음'].map(c => `<span onclick="${h(() => up(() => { S.edSacr = c; }))}" style="cursor:pointer;font:600 12px Pretendard;padding:7px 12px;border-radius:99px;${S.edSacr === c ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${c}</span>`).join('')}
      </div>
    </div>
    <div onclick="${edSave}" style="${primaryBtn};margin-top:4px">교적 저장</div>
  </div>`;
  const infoRows = [['연락처 (본인)', st.phone, true], ['연락처 (부)', st.fatherPhone, true], ['연락처 (모)', st.motherPhone, true], ['연락처 (보호자)', st.parentPhone, true], ['주소', st.address], ['생년월일', st.birth], ['학교', st.school], ['신급 (세례·입교)', st.sacr || '없음'], ['성향', st.trait]];
  const infoView = `<div style="margin:0 20px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:4px 16px">
    ${infoRows.map(([label, rawValue, isPhone]) => {
      const value = dash(rawValue);
      const phone = isPhone ? normalizePhoneNumber(rawValue) : '';
      const shownValue = phone
        ? `<button type="button" onclick="${h(() => up(() => { S.contactChoice = { label, phone: String(rawValue).trim() }; }))}" aria-haspopup="dialog" aria-label="${esc(label)} ${esc(value)}, 연락 방법 선택" style="min-height:44px;margin:-8px 0;padding:8px 0 8px 14px;border:0;background:transparent;color:#2e5d47;text-align:right;font:700 14px Pretendard;cursor:pointer;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px">${esc(value)} <span aria-hidden="true" style="text-decoration:none">›</span></button>`
        : `<span style="font:500 13px Pretendard;color:#211f1a;text-align:right">${esc(value)}</span>`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid #eeeade">
      <span style="font:500 13px Pretendard;color:#8a8578;flex:none">${label}</span>
      ${shownValue}
    </div>`;
    }).join('')}
    <div style="height:6px"></div>
  </div>`;

  // 출결 8주
  const allW = PAST.concat([CUR]);
  const weeks = allW.map(w => {
    const a = st.att && st.att[w];
    const bg = a === 'P' ? '#2e5d47' : a === 'L' ? '#b0913e' : a === 'A' ? '#a3552e' : '#eeeade';
    const mark = a === 'P' ? '✓' : a === 'L' ? '늦' : a === 'A' ? '✕' : '·';
    return `<div style="flex:1;text-align:center"><div style="height:30px;border-radius:8px;background:${bg};color:${a ? '#fff' : '#b5b0a2'};display:flex;align-items:center;justify-content:center;font:600 12px Pretendard">${mark}</div><div style="font:400 10px Pretendard;color:#b5b0a2;margin-top:4px">${md(w)}</div></div>`;
  }).join('');
  const abs = allW.filter(w => st.att && st.att[w] === 'A').map(w => `<div style="display:flex;gap:10px;font:400 12.5px Pretendard;color:#6d6a5f"><span style="color:#a3552e;font-weight:600;flex:none">${md(w)} 결석</span><span>${esc((st.reasons && st.reasons[w]) || '미입력')}</span></div>`).reverse().join('');

  // 관심대상 지정
  const CARE = [['해제', null], ['장결', '장결'], ['질병', '질병'], ['기도', '기도']];
  const careChips = CARE.map(([label, type]) => `<span onclick="${h(async () => { capture(); const note = (document.getElementById('care-note') || {}).value || (st.care && st.care.note) || ''; await fsTry(stuRef(st.id).update({ care: type ? { type, note } : null })); capture(); render(); })}" style="cursor:pointer;font:600 12px Pretendard;padding:8px 14px;border-radius:99px;${(st.care ? st.care.type : null) === type ? 'color:#f5f2ea;background:#211f1a' : 'color:#8a8578;border:1px solid #e8e4da'}">${label}</span>`).join('');
  const careNote = st.care ? `<input id="care-note" value="${esc(st.care.note || '')}" onchange="${h(async e => { await fsTry(stuRef(st.id).update({ care: { type: st.care.type, note: e.target.value } })); })}" placeholder="메모 (예: 3주 연속 결석, 병문안 필요)" style="${inputStyle}">` : '';

  // 심방기록
  const myV = visits().filter(x => x.sid === st.id).sort(sortV);
  const vHtml = myV.map(x => `<div style="background:#fff;border:1px solid #e8e4da;border-radius:12px;padding:13px 14px">
    <div style="display:flex;align-items:center;gap:8px"><span style="${typeStyle(x.type)}">${esc(x.type)}</span><span style="font:400 12px Pretendard;color:#8a8578;margin-left:auto">${md(x.date)}${x.by ? ' · ' + esc(x.by) : ''}</span></div>
    <div style="font:400 13px Pretendard;color:#6d6a5f;margin-top:7px;line-height:1.55">${esc(x.text)}</div>
  </div>`).join('');

  // 메모
  const addNote = h(async () => {
    capture();
    const text = fv('note-text').trim();
    if (!text) { flash('메모 내용을 입력해주세요'); return; }
    const newNotes = [{ date: todayISO(), text, by: S.me.name }].concat(st.notes || []);
    const okd = await fsTry(stuRef(st.id).update({ notes: newNotes }));
    if (okd) { clearF('note-'); flash('메모를 남겼어요'); }
  });
  const notes = (st.notes || []).map(n => `<div style="border-top:1px solid #eeeade;padding-top:9px"><div style="font:400 11px Pretendard;color:#b5b0a2">${md(n.date)}${n.by ? ' · ' + esc(n.by) : ''}</div><div style="font:400 13px Pretendard;color:#211f1a;margin-top:3px;line-height:1.55">${esc(n.text)}</div></div>`).join('');

  // 제적
  const delTap = h(async () => {
    if (!S.delArm) { up(() => { S.delArm = true; }); setTimeout(() => { if (S.delArm) { S.delArm = false; capture(); render(); } }, 2500); return; }
    const nm = st.name;
    const okd = await fsTry((async () => {
      const q = await DB.collection('visits').where('sid', '==', st.id).get();
      const batch = DB.batch();
      q.docs.forEach(d => batch.delete(d.ref));
      batch.delete(stuRef(st.id));
      await batch.commit();
    })());
    if (okd) { S.sid = null; S.delArm = false; flash(nm + ' 학생을 제적 처리했어요'); }
  });

  return `<div>
    <div style="padding:14px 20px 0;display:flex;align-items:center;justify-content:space-between">
      <div onclick="${back}" style="font:600 13px Pretendard;color:#6d6a5f;cursor:pointer">← 목록으로</div>
      ${t ? `<span style="${badgeStyle(t)}">${esc(t)}</span>` : ''}
    </div>
    <div style="padding:14px 20px 0">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:64px;height:64px;border-radius:50%;background:#ddd6c6;display:flex;align-items:center;justify-content:center;font:600 18px Pretendard;color:#5c584c;flex:none">${esc(ini(st.name))}</div>
        <div>
          <div style="font:600 24px 'MaruBuri',serif;color:#211f1a">${esc(st.name)}</div>
          <div style="font:400 13px Pretendard;color:#6d6a5f;margin-top:1px">${esc(st.cls)}반${st.school ? ' · ' + esc(st.school) : ''}</div>
        </div>
      </div>
    </div>
    <div style="padding:18px 20px 6px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.06em">교적</span>
      <span onclick="${edToggle}" style="font:600 12px Pretendard;color:#2e5d47;cursor:pointer">${S.edOn ? '취소' : '수정'}</span>
    </div>
    ${S.edOn ? edForm : infoView}
    <div style="padding:20px 20px 6px;display:flex;justify-content:space-between;align-items:baseline"><span style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.06em">출결 · 최근 8주</span><span style="font:600 13px Pretendard;color:#2e5d47">출석률 ${r === null ? (isNew(st) ? '신규' : '–') : r + '%'}</span></div>
    <div style="margin:0 20px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:14px">
      <div style="display:flex;gap:5px">${weeks}</div>
      ${abs ? `<div style="margin-top:12px;border-top:1px solid #eeeade;padding-top:10px;display:flex;flex-direction:column;gap:6px">${abs}</div>` : ''}
    </div>
    <div style="${secLabel}">관심대상 지정</div>
    <div style="margin:0 20px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${careChips}</div>
      ${careNote}
    </div>
    <div style="padding:20px 20px 6px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font:600 12px Pretendard;color:#8a8578;letter-spacing:.06em">심방·상담 기록</span>
      <span onclick="${h(() => navigate(() => { S.sid = null; S.screen = 'carehub'; S.careMode = 'visits'; S.vOpen = true; F['v-stu'] = st.id; }))}" style="font:600 12px Pretendard;color:#2e5d47;cursor:pointer">+ 기록 추가</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px">
      ${vHtml || `<div style="font:400 13px Pretendard;color:#b5b0a2;padding:6px 2px">아직 기록이 없어요.</div>`}
    </div>
    <div style="${secLabel}">교사 메모 · 성향 기록</div>
    <div style="margin:0 20px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:9px">
      <textarea id="note-text" placeholder="오늘 관찰한 모습, 기도제목, 나눈 대화…" style="padding:10px 12px;border:1px solid #e8e4da;border-radius:10px;font:400 13px Pretendard;color:#211f1a;min-height:56px;resize:vertical;background:#faf8f3">${esc(fv('note-text'))}</textarea>
      <div onclick="${addNote}" style="padding:11px;border-radius:10px;background:#211f1a;text-align:center;font:600 13px Pretendard;color:#f5f2ea;cursor:pointer">메모 남기기</div>
      ${notes}
    </div>
    <div style="padding:18px 20px 8px">
      <div onclick="${delTap}" style="cursor:pointer;text-align:center;font:600 13px Pretendard;padding:12px;border-radius:10px;${S.delArm ? 'color:#fff;background:#a3552e' : 'color:#a3552e;border:1px solid #dcc9b8;background:#fff'}">${S.delArm ? '한 번 더 누르면 명단에서 삭제됩니다' : '제적 처리 · 명단에서 삭제'}</div>
    </div>
  </div>`;
}

// ══ 설정
function settingsView() {
  const isPastor = S.me.role === 'pastor';
  const card = 'margin:0 20px;background:#fff;border:1px solid #e8e4da;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px';
  const pwChange = h(async () => {
    capture();
    const o = fv('pw-old'), n = fv('pw-new');
    if (!o || !n) { flash('현재/새 비밀번호를 입력해주세요'); return; }
    if (n.length < 6) { flash('새 비밀번호는 6자 이상이어야 합니다'); return; }
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(S.me.email, o);
      await AUTH.currentUser.reauthenticateWithCredential(cred);
      await AUTH.currentUser.updatePassword(n);
      clearF('pw-'); flash('비밀번호를 변경했어요');
    } catch (e) {
      const code = e && e.code || '';
      flash(code.includes('wrong-password') || code.includes('invalid-credential') ? '현재 비밀번호가 올바르지 않습니다' : '변경 실패: ' + (e.message || e));
    }
  });
  const logout = h(async () => { F = {}; await AUTH.signOut(); });

  let adminHtml = '';
  if (isPastor) {
    const clsSave = h(async () => {
      capture();
      const list = [...new Set(fv('cls-text').split('\n').map(x => x.trim()).filter(Boolean))];
      if (!list.length) { flash('반 목록이 비어 있습니다'); return; }
      const okd = await fsTry(DB.collection('meta').doc('config').set({ classes: list }));
      if (okd) { delete F['cls-text']; flash('반 목록을 저장했어요'); }
    });
    const addUser = h(async () => {
      capture();
      const name = fv('u-name').trim(), uid = fv('u-username').trim(), pw = fv('u-pw');
      const role = fv('u-role') === 'pastor' ? 'pastor' : 'teacher';
      const cls = role === 'pastor' ? '전체' : fv('u-cls');
      if (!name || !uid) { flash('이름과 아이디를 입력해주세요'); return; }
      if (pw.length < 6) { flash('비밀번호는 6자 이상이어야 합니다'); return; }
      if (role === 'teacher' && !classes().includes(cls)) { flash('담당 반을 선택해주세요'); return; }
      const email = uid.includes('@') ? uid : uid + (window.EMAIL_SUFFIX || '@example.com');
      // 보조 앱으로 계정 생성 (현재 로그인 유지)
      let sec = null;
      try {
        sec = firebase.initializeApp(window.FIREBASE_CONFIG, 'secondary-' + Date.now());
        await sec.auth().createUserWithEmailAndPassword(email, pw);
        await sec.auth().signOut();
      } catch (e) {
        const code = e && e.code || '';
        flash(code.includes('email-already-in-use') ? '이미 있는 아이디입니다' : '계정 생성 실패: ' + (e.message || e));
        if (sec) try { await sec.delete(); } catch (e2) {}
        return;
      }
      try { await sec.delete(); } catch (e2) {}
      const okd = await fsTry(DB.collection('users').doc(email).set({ name, role, cls }));
      if (okd) { clearF('u-'); flash(name + ' 계정을 만들었어요'); }
    });
    const userRows = users().map(u => {
      const isMe = u.email === S.me.email;
      const editCls = h(async () => {
        const nc = prompt(u.name + ' 선생님의 담당 반 (현재: ' + u.cls + ')\n반 이름을 정확히 입력하세요:', u.cls);
        if (!nc) return;
        if (nc !== '전체' && !classes().includes(nc.trim())) { flash('없는 반 이름입니다'); return; }
        const okd = await fsTry(DB.collection('users').doc(u.email).update({ cls: nc.trim() }));
        if (okd) flash('담당 반을 변경했어요');
      });
      const delUser = h(async () => {
        if (u.role === 'pastor' && users().filter(x => x.role === 'pastor').length <= 1) { flash('최소 1명의 교역자 계정이 필요합니다'); return; }
        if (!confirm(u.name + ' (' + u.email.split('@')[0] + ') 계정 권한을 삭제할까요?\n(로그인 계정 자체는 Firebase 콘솔에서 삭제해야 합니다)')) return;
        const okd = await fsTry(DB.collection('users').doc(u.email).delete());
        if (okd) flash('계정 권한을 삭제했어요');
      });
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #eeeade">
        <div style="flex:1;min-width:0">
          <div style="font:600 14px Pretendard;color:#211f1a">${esc(u.name)} <span style="font:400 12px Pretendard;color:#b5b0a2">${esc(u.email.split('@')[0])}</span></div>
          <div style="font:400 12px Pretendard;color:#8a8578">${u.role === 'pastor' ? '교역자 · 전체' : '교사 · ' + esc(u.cls)}</div>
        </div>
        ${u.role === 'teacher' ? `<span onclick="${editCls}" style="font:600 12px Pretendard;color:#2e5d47;cursor:pointer;flex:none">반변경</span>` : ''}
        ${!isMe ? `<span onclick="${delUser}" style="font:600 12px Pretendard;color:#a3552e;cursor:pointer;flex:none">삭제</span>` : ''}
      </div>`;
    }).join('');
    adminHtml = `
    <div style="${secLabel}">반 관리 <span style="font:400 11px;color:#b5b0a2">· 한 줄에 한 반씩</span></div>
    <div style="${card}">
      <textarea id="cls-text" style="padding:10px 12px;border:1px solid #e8e4da;border-radius:10px;font:400 13px Pretendard;color:#211f1a;min-height:120px;resize:vertical;background:#faf8f3">${esc(F['cls-text'] !== undefined ? F['cls-text'] : classes().join('\n'))}</textarea>
      <div onclick="${clsSave}" style="${primaryBtn}">반 목록 저장</div>
    </div>
    <div style="${secLabel}">계정 관리</div>
    <div style="${card}">
      ${userRows}
      <div style="font:600 13px 'MaruBuri',serif;color:#211f1a;margin-top:6px">새 계정 만들기</div>
      <input id="u-name" value="${esc(fv('u-name'))}" placeholder="이름 (예: 한수진)" style="${inputStyle}">
      <input id="u-username" value="${esc(fv('u-username'))}" placeholder="로그인 아이디 (영문/숫자)" style="${inputStyle}">
      <input id="u-pw" value="${esc(fv('u-pw'))}" placeholder="초기 비밀번호 (6자 이상)" style="${inputStyle}">
      <div style="display:flex;gap:8px">
        <select id="u-role" style="${inputStyle};flex:1">
          <option value="teacher" ${fv('u-role') !== 'pastor' ? 'selected' : ''}>교사</option>
          <option value="pastor" ${fv('u-role') === 'pastor' ? 'selected' : ''}>교역자</option>
        </select>
        <select id="u-cls" style="${inputStyle};flex:1">
          ${classes().map(c => `<option value="${esc(c)}" ${fv('u-cls') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div onclick="${addUser}" style="${darkBtn}">계정 추가</div>
      <div style="font:400 12px Pretendard;color:#b5b0a2;line-height:1.6">비밀번호를 잊은 계정은 Firebase 콘솔 → Authentication에서 해당 사용자를 삭제한 뒤, 여기서 같은 아이디로 다시 만들면 됩니다 (학생 데이터는 유지됩니다).</div>
    </div>
    <div style="${secLabel}">데이터 백업</div>
    <div style="${card}">
      <div style="font:400 13px Pretendard;color:#6d6a5f;line-height:1.6">모든 데이터는 Google Firebase(Firestore) 클라우드에 저장되며 자동으로 유지됩니다. 수동 백업은 Firebase 콘솔 → Firestore Database에서 내보내기 하거나, 담당자에게 요청하세요.</div>
    </div>`;
  }

  return `<div>
    <div style="${secLabel};padding-top:18px">내 계정</div>
    <div style="${card}">
      <div style="font:600 16px Pretendard;color:#211f1a">${esc(S.me.name)} <span style="font:400 12px Pretendard;color:#b5b0a2">${esc(S.me.username)}</span></div>
      <div style="font:400 13px Pretendard;color:#8a8578">${S.me.role === 'pastor' ? '교역자 · 전체 열람' : '교사 · ' + esc(S.me.cls) + '반 담당'}</div>
      <div onclick="${logout}" style="cursor:pointer;text-align:center;font:600 13px Pretendard;padding:11px;border-radius:10px;color:#a3552e;border:1px solid #dcc9b8;background:#fff">로그아웃</div>
    </div>
    <div style="${secLabel}">비밀번호 변경</div>
    <div style="${card}">
      <input id="pw-old" type="password" value="${esc(fv('pw-old'))}" placeholder="현재 비밀번호" autocomplete="current-password" style="${inputStyle}">
      <input id="pw-new" type="password" value="${esc(fv('pw-new'))}" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password" style="${inputStyle}">
      <div onclick="${pwChange}" style="${primaryBtn}">변경하기</div>
    </div>
    ${adminHtml}
    <div style="height:20px"></div>
  </div>`;
}

// ══ 메인 렌더
function render() {
  const el = document.getElementById('app');
  const previousScroll = document.getElementById('app-scroll');
  const previousScrollTop = previousScroll ? previousScroll.scrollTop : 0;
  const previousViewKey = el.dataset.viewKey || '';
  H.length = 0;
  if (configMissing()) { el.innerHTML = setupView(); return; }
  if (!S.loaded) { el.innerHTML = '<div style="text-align:center;padding:60px;font:500 14px Pretendard;color:#8a8578">불러오는 중…</div>'; return; }
  if (!S.me) { el.innerHTML = loginView(); return; }
  if (!S.dataReady) { el.innerHTML = dataSyncView(); return; }

  const isPastor = S.me.role === 'pastor';
  const scopeCls = isPastor ? S.cls : S.me.cls;
  const st = curStu();
  if (S.sid && !st) S.sid = null;

  let body = '';
  const screen = st ? 'student' : S.screen;
  const viewKey = screen + ':' + (st ? st.id : scopeCls) + (screen === 'board' ? ':' + S.communityMode + ':' + (S.boardPostId || S.calendarMonth || 'list') : '') + (screen === 'carehub' ? ':' + S.careMode : '') + (screen === 'attend' && isPastor && scopeCls === '전체' ? ':' + S.attendanceTab : '');
  const nextScrollTop = scrollTarget(previousViewKey, viewKey, previousScrollTop, S.scrollPositions);
  if (screen === 'student') body = studentView(st);
  else if (screen === 'home') body = (isPastor && S.cls === '전체') ? overviewView() : classHomeView(scopeCls);
  else if (screen === 'attend') body = (isPastor && S.cls === '전체') ? attendPickView() : attendView(scopeCls);
  else if (screen === 'carehub') body = careHubView();
  else if (screen === 'board') body = S.communityMode === 'calendar' ? calendarView() : boardView();
  else if (screen === 'settings') body = settingsView();

  const NAV = [['home', '홈'], ['attend', '출석'], ['carehub', '돌봄'], ['board', '게시판']];
  const nav = NAV.map(([k, label]) => {
    const on = !st && S.screen === k;
    return `<div onclick="${h(() => navigate(() => { S.screen = k; S.sid = null; }))}" style="text-align:center;cursor:pointer">
      <div style="width:5px;height:5px;border-radius:50%;margin:0 auto;background:${on ? '#2e5d47' : 'transparent'}"></div>
      <div style="font:${on ? '700' : '500'} 13px Pretendard;color:${on ? '#2e5d47' : '#8a8578'};margin-top:3px">${label}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="app-shell" style="height:100vh;height:100dvh;overflow:hidden;display:flex;flex-direction:column;position:relative">
    ${headerView()}
    <div id="app-scroll" onscroll="onAppScroll(this)" style="flex:1;overflow-y:auto;padding-bottom:76px;overflow-anchor:none">${body}</div>
    ${S.toast ? `<div style="position:absolute;left:0;right:0;bottom:74px;display:flex;justify-content:center;pointer-events:none;z-index:5">
      <div style="background:#211f1a;color:#f5f2ea;font:500 13px Pretendard;padding:10px 18px;border-radius:99px;box-shadow:0 4px 14px rgba(33,31,26,.25)">${esc(S.toast)}</div>
    </div>` : ''}
    <div id="bottom-nav" style="position:absolute;left:0;right:0;bottom:0;background:rgba(250,248,243,.96);backdrop-filter:blur(12px);border-top:1px solid #e8e4da;display:grid;grid-template-columns:repeat(4,1fr);padding:10px 0 14px;z-index:4;transform:translateY(0);transition:transform .28s cubic-bezier(.22,1,.36,1);will-change:transform">${nav}</div>
    ${contactActionSheet()}
  </div>`;
  el.dataset.viewKey = viewKey;
  const nextScroll = document.getElementById('app-scroll');
  if (nextScroll && nextScrollTop) {
    const max = Math.max(0, nextScroll.scrollHeight - nextScroll.clientHeight);
    nextScroll.scrollTop = Math.min(nextScrollTop, max);
  }
}

installEdgeSwipeBack();
render();
initFirebase();
