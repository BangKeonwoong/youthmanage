/* Regression tests for full-render scroll stability. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const app = { innerHTML: '', dataset: {} };
const context = {
  window: null,
  document: { getElementById: id => id === 'app' ? app : null, activeElement: null },
  console,
  Date,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: fn => fn()
};
context.window = context;
context.FIREBASE_CONFIG = null;
vm.createContext(context);
vm.runInContext(source + `
  ;globalThis.__scrollTarget = scrollTarget;
  globalThis.__navigation = {
    state: navigationState,
    setSession: value => { Object.assign(S, value); },
    setDepth: value => { navigationDepth = value; },
    canBack: canAppBack,
    closeTransient: closeTransientView,
    navigate,
    init: initNavigationHistory,
    reset: resetNavigationHistory,
    pop: onNavigationPop,
    depth: () => navigationDepth
  };
  globalThis.__edgeSwipe = {
    completes: edgeSwipeCompletes,
    threshold: edgeSwipeThreshold,
    ignored: swipeIgnoredTarget,
    start: onEdgeTouchStart,
    move: onEdgeTouchMove,
    finish: finishEdgeSwipe
  };
`, context);

const positions = {};
assert.equal(context.__scrollTarget('board:list', 'board:list', 480, positions), 480);
assert.equal(positions['board:list'], 480);
assert.equal(context.__scrollTarget('board:list', 'board:detail', 480, positions), 0);
positions['board:detail'] = 320;
assert.equal(context.__scrollTarget('board:list', 'board:detail', 480, positions), 320);
assert.doesNotMatch(source, /id="app-scroll"[^>]*scroll-behavior:smooth/);
assert.match(source, /S\.toast \? `<div style="position:absolute/);

// iOS 홈 화면 앱의 왼쪽 가장자리 뒤로가기 판정
const swipe = context.__edgeSwipe;
assert.equal(swipe.threshold(390), 89.7);
assert.equal(swipe.completes(12, 92, 12, 390, 350), true);
assert.equal(swipe.completes(12, 52, 5, 390, 80), true); // 짧지만 빠른 스와이프
assert.equal(swipe.completes(36, 120, 4, 390, 300), false); // 가장자리 밖에서 시작
assert.equal(swipe.completes(12, 58, 4, 390, 500), false); // 거리·속도 부족
assert.equal(swipe.completes(12, 100, 92, 390, 300), false); // 수직 이동 과다
assert.equal(swipe.completes(12, -120, 2, 390, 200), false); // 반대 방향

const input = { tagName: 'INPUT', scrollWidth: 100, clientWidth: 100, parentElement: null };
assert.equal(swipe.ignored(input), true);
const horizontalScroller = { tagName: 'DIV', scrollWidth: 280, clientWidth: 120, parentElement: null };
const chip = { tagName: 'SPAN', scrollWidth: 40, clientWidth: 40, parentElement: horizontalScroller };
assert.equal(swipe.ignored(chip), true);
const verticalScroller = { tagName: 'DIV', scrollWidth: 120, clientWidth: 120, scrollHeight: 900, parentElement: null };
const row = { tagName: 'DIV', scrollWidth: 100, clientWidth: 100, parentElement: verticalScroller };
assert.equal(swipe.ignored(row), false);

// 화면 이동만 브라우저 기록에 쌓이고 popstate가 이전 화면을 복원한다.
const historyCalls = [];
context.location = { href: 'https://example.test/' };
context.history = {
  state: null,
  replaceState(state) { this.state = state; historyCalls.push(['replace', state]); },
  pushState(state) { this.state = state; historyCalls.push(['push', state]); },
  back() { historyCalls.push(['back']); }
};
const nav = context.__navigation;
nav.setSession({ me: { email: 'teacher@example.com', role: 'teacher', cls: 'A' }, loaded: true, dataReady: false, screen: 'home', sid: null, cls: 'A' });
nav.init();
assert.equal(historyCalls[0][0], 'replace');
assert.equal(nav.canBack(), false);
nav.navigate(() => { context.__navigation.setSession({ screen: 'board' }); });
assert.equal(historyCalls[1][0], 'push');
assert.equal(historyCalls[1][1].view.screen, 'board');
assert.equal(nav.depth(), 1);
nav.pop({ state: historyCalls[0][1] });
assert.equal(nav.state().screen, 'home');
assert.equal(nav.depth(), 0);
nav.setSession({ boardOpen: true, boardEditId: 'post-1', boardPostId: null });
assert.equal(nav.closeTransient(), true);
assert.equal(nav.state().boardPostId, 'post-1');

// 새로고침은 현재 앱 기록을 복원하고, 로그아웃은 기록 깊이를 초기화한다.
context.history.state = { youthApp: true, owner: 'teacher@example.com', depth: 3, view: { ...nav.state(), screen: 'carehub', boardPostId: null } };
nav.setSession({ screen: 'home', boardOpen: false, boardEditId: null, boardPostId: null });
nav.init();
assert.equal(nav.depth(), 3);
assert.equal(nav.state().screen, 'carehub');
nav.reset();
assert.equal(nav.depth(), 0);
assert.equal(context.history.state, null);

// touchend 직전 네이티브 popstate가 오면 예약된 커스텀 back을 취소해 한 번만 이동한다.
const shell = { style: {} };
context.document.querySelector = selector => selector === '.app-shell' ? shell : null;
context.document.documentElement = { clientWidth: 390 };
context.navigator = { standalone: true };
context.innerWidth = 390;
context.matchMedia = query => ({ matches: query === '(display-mode: standalone)' });
let timerSeq = 0;
const pendingTimers = new Map();
context.setTimeout = (fn, ms) => { const id = ++timerSeq; pendingTimers.set(id, { fn, ms }); return id; };
context.clearTimeout = id => pendingTimers.delete(id);
const touchTarget = { tagName: 'DIV', scrollWidth: 100, clientWidth: 100, parentElement: null };
const touchStart = { touches: [{ clientX: 12, clientY: 120 }], target: touchTarget };
const touchMove = { touches: [{ clientX: 112, clientY: 128 }], preventDefaultCalled: 0, preventDefault() { this.preventDefaultCalled += 1; } };
const touchEnd = { changedTouches: [{ clientX: 112, clientY: 128 }] };
nav.setSession({ screen: 'board', boardPostId: 'post-2', boardOpen: false, me: { email: 'teacher@example.com', role: 'teacher', cls: 'A' } });
nav.setDepth(1);
swipe.start(touchStart);
swipe.move(touchMove);
assert.equal(touchMove.preventDefaultCalled, 1);
swipe.finish(touchEnd, false);
assert.equal([...pendingTimers.values()].some(timer => timer.ms === 110), true);
nav.pop({ state: { youthApp: true, owner: 'teacher@example.com', depth: 0, view: { ...nav.state(), screen: 'home', boardPostId: null } } });
assert.equal(pendingTimers.size, 0);
assert.equal(historyCalls.filter(call => call[0] === 'back').length, 0);

// 네이티브 popstate가 없을 때는 완료 타이머가 history.back을 정확히 한 번만 호출한다.
nav.setSession({ screen: 'board', boardPostId: 'post-3' });
nav.setDepth(1);
swipe.start(touchStart);
swipe.move(touchMove);
swipe.finish(touchEnd, false);
const backTimer = [...pendingTimers.entries()].find(([, timer]) => timer.ms === 110);
assert.ok(backTimer);
pendingTimers.delete(backTimer[0]);
backTimer[1].fn();
assert.equal(historyCalls.filter(call => call[0] === 'back').length, 1);

// 진행 중 멀티터치로 바뀌면 제스처를 취소한다.
const backCountBeforeMultiTouch = historyCalls.filter(call => call[0] === 'back').length;
swipe.start(touchStart);
swipe.move({ touches: [{ clientX: 70, clientY: 120 }, { clientX: 90, clientY: 140 }], preventDefault() {} });
swipe.finish(touchEnd, false);
assert.equal(historyCalls.filter(call => call[0] === 'back').length, backCountBeforeMultiTouch);

assert.match(source, /document\.addEventListener\('touchmove', onEdgeTouchMove, \{ passive: false \}\)/);
assert.match(source, /window\.history\.pushState\(navigationHistoryState\(\)/);
assert.match(source, /window\.addEventListener\('popstate', onNavigationPop\)/);
assert.match(source, /const back = h\(\(\) => appBack\(/);
assert.match(source, /appBack\(\(\) => \{ S\.boardPostId = null/);

console.log('scroll stability regression tests passed');
