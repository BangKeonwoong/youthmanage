/* Mobile browser verification for phone contact actions. */
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const consoleErrors = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        S.loaded = true;
        S.dataReady = true;
        S.dataError = '';
        S.me = { email: 'teacher@example.com', name: '선생님', role: 'teacher', cls: '중1' };
        S.cls = '중1';
        S.sid = 'student-1';
        S.screen = 'home';
        S.data = {
          classes: ['중1'],
          users: [],
          students: [{
            id: 'student-1',
            name: '테스트학생',
            cls: '중1',
            phone: '010-1234-5678',
            fatherPhone: '',
            motherPhone: '010 9876 5432',
            parentPhone: '',
            school: '테스트학교',
            att: {}
          }],
          visits: [],
          posts: [],
          comments: [],
          events: [],
          eventVotes: []
        };
        render();
      });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${width}px viewport must not overflow horizontally`);

      await page.getByRole('button', { name: /연락처 \(본인\).*연락 방법 선택/ }).click();
      const dialog = page.getByRole('dialog', { name: '연락 방법 선택' });
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.getByRole('link', { name: /전화 걸기/ }).getAttribute('href'), 'tel:01012345678');
      assert.equal(await dialog.getByRole('link', { name: /문자 보내기/ }).getAttribute('href'), 'sms:01012345678');
      if (width === 390) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: '/tmp/youthmanage-contact-action-390.png', fullPage: true });
      }

      await dialog.getByRole('button', { name: '취소' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(consoleErrors, [], `${width}px viewport must not log browser errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('contact action mobile browser tests passed at 320px and 390px');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
