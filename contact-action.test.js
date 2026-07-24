/* Regression tests for phone contact actions in the student detail view. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const app = { innerHTML: '', dataset: {} };
const context = {
  window: null,
  document: {
    getElementById: id => id === 'app' ? app : null,
    addEventListener() {},
    activeElement: null
  },
  console,
  Date,
  setTimeout,
  clearTimeout
};
context.window = context;
context.location = { href: 'https://example.test/' };
context.FIREBASE_CONFIG = null;
vm.createContext(context);
vm.runInContext(source + `
  ;globalThis.__contact = {
    normalize: normalizePhoneNumber,
    setSession: value => { Object.assign(S, value); },
    render,
    sheet: contactActionSheet,
    state: () => S.contactChoice
  };
`, context);

const contact = context.__contact;
assert.equal(contact.normalize('010-1234-5678'), '01012345678');
assert.equal(contact.normalize('+82 10 1234 5678'), '+821012345678');
assert.equal(contact.normalize('미입력'), '');
assert.equal(contact.normalize('12'), '');

context.FIREBASE_CONFIG = { apiKey: 'test' };
context.__contact.setSession({
  loaded: true,
  dataReady: true,
  me: { email: 'teacher@example.com', name: '선생님', role: 'teacher', cls: '중1' },
  cls: '중1',
  sid: 'student-1',
  screen: 'home',
  data: {
    classes: ['중1'],
    users: [],
    students: [{
      id: 'student-1',
      name: '학생',
      cls: '중1',
      phone: '010-1234-5678',
      fatherPhone: '',
      motherPhone: '010 9876 5432',
      parentPhone: '',
      att: {}
    }],
    visits: [],
    posts: [],
    comments: [],
    events: [],
    eventVotes: []
  }
});
contact.render();
assert.match(app.innerHTML, /aria-label="연락처 \(본인\) 010-1234-5678, 연락 방법 선택"/);
assert.match(app.innerHTML, /aria-label="연락처 \(모\) 010 9876 5432, 연락 방법 선택"/);
assert.doesNotMatch(app.innerHTML, /연락처 \(부\) 미입력, 연락 방법 선택/);

contact.setSession({ contactChoice: { label: '연락처 (본인)', phone: '010-1234-5678' } });
contact.render();
assert.match(app.innerHTML, /role="dialog" aria-modal="true"/);
assert.match(app.innerHTML, /href="tel:01012345678"/);
assert.match(app.innerHTML, /href="sms:01012345678"/);
assert.match(app.innerHTML, />전화 걸기<\/a>/);
assert.match(app.innerHTML, />문자 보내기<\/a>/);
assert.match(app.innerHTML, />취소<\/button>/);

assert.equal(contact.state().phone, '010-1234-5678');
console.log('contact action regression tests passed');
