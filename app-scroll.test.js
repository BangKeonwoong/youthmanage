/* Regression tests for full-render scroll stability. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
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
vm.runInContext(source + ';globalThis.__scrollTarget = scrollTarget;', context);

const positions = {};
assert.equal(context.__scrollTarget('board:list', 'board:list', 480, positions), 480);
assert.equal(positions['board:list'], 480);
assert.equal(context.__scrollTarget('board:list', 'board:detail', 480, positions), 0);
positions['board:detail'] = 320;
assert.equal(context.__scrollTarget('board:list', 'board:detail', 480, positions), 320);
assert.doesNotMatch(source, /id="app-scroll"[^>]*scroll-behavior:smooth/);
assert.match(source, /S\.toast \? `<div style="position:absolute/);

console.log('scroll stability regression tests passed');
