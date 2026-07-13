/* Regression tests for responsive layout, categories, date ranges, and attendance summaries. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const app = { innerHTML: '', dataset: {} };
const context = {
  window: null,
  document: { getElementById: id => id === 'app' ? app : null, activeElement: null },
  console,
  Date,
  setTimeout,
  clearTimeout
};
context.window = context;
context.FIREBASE_CONFIG = null;
vm.createContext(context);
vm.runInContext(source + `
  ;globalThis.__feature = {
    normalizeBoardCategory, boardCategoryMeta,
    eventOccursOn, eventOverlaps, eventRangeLabel,
    attendanceStatus, classAttendanceStats, curWeek,
    shirtPeriod: [SHIRT_START, SHIRT_END],
    resetInitialDataLoad, markInitialDataLoaded,
    isUnconfirmedMissingDocument,
    setAuthState: (epoch, user) => { authEpoch = epoch; AUTH = { currentUser: user }; },
    isCurrentAuthSession,
    initialDataState: () => ({ ready: S.dataReady, error: S.dataError, pending: initialDataPending.size })
  };
  globalThis.__setData = value => { S.data = value; };
  globalThis.__setSession = value => { Object.assign(S, value); };
  globalThis.__render = render;
`, context);

const feature = context.__feature;

assert.equal(feature.normalizeBoardCategory('\uD68C\uC758\uB85D'), '\uD68C\uC758\uB85D');
assert.equal(feature.boardCategoryMeta('\uD68C\uC758\uB85D').label, '\uD68C\uC758\uB85D');
assert.equal(feature.normalizeBoardCategory('\uC54C \uC218 \uC5C6\uC74C'), '\uACF5\uC9C0');
assert.deepEqual(JSON.parse(JSON.stringify(feature.shirtPeriod)), ['2026-07-06', '2026-07-19']);

const legacyEvent = { date: '2026-07-24' };
assert.equal(feature.eventOccursOn(legacyEvent, '2026-07-24'), true);
assert.equal(feature.eventOccursOn(legacyEvent, '2026-07-25'), false);

const retreat = { date: '2026-07-24', endDate: '2026-07-26' };
assert.equal(feature.eventOccursOn(retreat, '2026-07-24'), true);
assert.equal(feature.eventOccursOn(retreat, '2026-07-25'), true);
assert.equal(feature.eventOccursOn(retreat, '2026-07-26'), true);
assert.equal(feature.eventOccursOn(retreat, '2026-07-27'), false);
assert.equal(feature.eventRangeLabel(retreat), '7/24\u20137/26');

const crossMonth = { date: '2026-07-30', endDate: '2026-08-02' };
assert.equal(feature.eventOverlaps(crossMonth, '2026-07-01', '2026-07-31'), true);
assert.equal(feature.eventOverlaps(crossMonth, '2026-08-01', '2026-08-31'), true);
assert.equal(feature.eventOccursOn(crossMonth, '2026-08-01'), true);

const week = feature.curWeek();
context.__setData({
  classes: ['A'],
  users: [],
  students: [
    { id: '1', cls: 'A', att: { [week]: 'P' }, vchk: { [week]: true } },
    { id: '2', cls: 'A', att: { [week]: 'L' } },
    { id: '3', cls: 'A', att: { [week]: 'A' }, vchk: { [week]: false } },
    { id: '4', cls: 'A', att: {} }
  ],
  visits: [
    { sid: '2', date: week },
    { sid: '3', date: week }
  ],
  posts: [], comments: [], events: [], eventVotes: []
});
assert.deepEqual(JSON.parse(JSON.stringify(feature.classAttendanceStats('A'))), { total: 4, checked: 3, visited: 2 });
assert.equal(feature.attendanceStatus({ att: { [week]: 'A' } }, week), 'A');
assert.equal(feature.attendanceStatus({}, week), '');

feature.resetInitialDataLoad();
const pendingSnapshot = { metadata: { fromCache: true } };
feature.markInitialDataLoaded('classes', pendingSnapshot);
assert.deepEqual(JSON.parse(JSON.stringify(feature.initialDataState())), { ready: false, error: '', pending: 8 });
assert.equal(feature.isUnconfirmedMissingDocument({ exists: false, metadata: { fromCache: true } }), true);
assert.equal(feature.isUnconfirmedMissingDocument({ exists: false, metadata: { fromCache: false } }), false);
['classes', 'users', 'students', 'visits', 'posts', 'comments', 'events'].forEach(key => feature.markInitialDataLoaded(key));
assert.equal(feature.initialDataState().ready, false);
assert.equal(feature.initialDataState().pending, 1);
feature.markInitialDataLoaded('eventVotes');
assert.deepEqual(JSON.parse(JSON.stringify(feature.initialDataState())), { ready: true, error: '', pending: 0 });

const authUser = { uid: 'user-a' };
feature.setAuthState(4, authUser);
assert.equal(feature.isCurrentAuthSession(authUser, 4), true);
assert.equal(feature.isCurrentAuthSession(authUser, 3), false);
assert.equal(feature.isCurrentAuthSession({ uid: 'user-b' }, 4), false);

context.FIREBASE_CONFIG = { apiKey: 'test' };
context.__setSession({ loaded: true, me: { email: 'pastor@example.com', name: '관리자', role: 'pastor', cls: '전체' }, dataReady: false, dataError: '' });
context.__render();
assert.match(app.innerHTML, /교회 데이터를 불러오는 중입니다/);
assert.doesNotMatch(app.innerHTML, /재적 0|아직 학생이 없습니다|등록된 반이 없습니다/);
context.__setSession({ dataError: '학생 데이터를 불러오지 못했습니다.' });
context.__render();
assert.match(app.innerHTML, /데이터를 불러오지 못했습니다/);
assert.match(app.innerHTML, /기존 데이터는 변경되지 않았습니다/);
context.__setSession({ dataError: '', dataSlow: true });
context.__render();
assert.match(app.innerHTML, /데이터 동기화가 지연되고 있습니다/);
assert.match(app.innerHTML, /다시 불러오기/);

assert.match(html, /\.app-shell\{max-width:1180px\}/);
assert.match(html, /@media \(min-width:768px\)/);
assert.match(html, /\.event-date-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*padding:13px 14px[^}]*\}/);
assert.match(html, /\.event-period\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*min-width:0[^}]*\}/);
assert.match(html, /\.event-field\{[^}]*min-width:0[^}]*padding:0[^}]*border:0[^}]*background:transparent[^}]*\}/);
assert.match(html, /\.event-field-control\{[^}]*width:100%[^}]*min-width:0[^}]*max-width:100%[^}]*padding:5px 0 6px[^}]*\}/);
assert.match(html, /@media \(min-width:768px\)\{[\s\S]*?\.event-date-grid\{grid-template-columns:minmax\(0,2fr\) minmax\(150px,1fr\)/);
assert.match(html, /@media \(min-width:768px\)\{[\s\S]*?\.event-period\{grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
assert.doesNotMatch(source, /max-width:390px/);
assert.match(source, /BOARD_CATEGORIES = \['\uACF5\uC9C0', '\uB098\uB214', '\uD68C\uC758\uB85D'\]/);
assert.match(source, /id="event-end-date"/);
assert.equal((source.match(/class="event-field-control"/g) || []).length, 3);
assert.equal((source.match(/class="event-field(?: event-time-field)?"/g) || []).length, 3);
assert.doesNotMatch(source, /id="event-(?:date|end-date|time)"[^>]*style="\$\{inputStyle\}/);
assert.match(source, /doc\(S\.me\.email\)\.update\(\{ \['att\.' \+ CUR\]/);
assert.match(source, /\[\['students', '\uD559\uC0DD'\], \['teachers', '\uAD50\uC0AC'\]\]/);
assert.equal((source.match(/onSnapshot\(\{ includeMetadataChanges: true \}/g) || []).length, 8);
assert.match(source, /attach\(epoch\)/);
assert.equal((source.match(/if \(!active\(\)\) return;/g) || []).length >= 9, true);
assert.equal((source.match(/onLoadError\('[A-Za-z]+'\)/g) || []).length, 8);
const cachedMissingGuard = source.indexOf('if (isUnconfirmedMissingDocument(d)) return;');
const configWrite = source.indexOf("DB.collection('meta').doc('config').set");
assert.equal(cachedMissingGuard > 0 && cachedMissingGuard < configWrite, true);

console.log('feature regression tests passed');
