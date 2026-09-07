'use strict';
const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); }
};

const html = fs.readFileSync('/home/claude/nabard-quiz/demo/nabard-quiz-demo.html', 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const w = dom.window;
const d = w.document;
w.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const $ = (id) => d.getElementById(id);
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));
const on = (id) => $(id).classList.contains('on');

(async () => {
  await tick(200);

  console.log('\n--- starts empty, no fabricated data ---');
  w.__goAdmin();
  await tick(200);
  $('li-user').value = 'admin';
  $('li-pass').value = 'fintech-festival-nabard';
  $('li-go').click();
  await tick(400);
  ok('a fresh install has zero attempts', $('rep-metrics').children[1].querySelector('.v').textContent.trim() === '0',
    $('rep-metrics').children[1].querySelector('.v').textContent);
  ok('a fresh install has zero feedback responses', $('rep-metrics').children[5].querySelector('.v').textContent.trim() === '0');
  ok('no question difficulty until someone has played', /No data yet/.test($('rep-questions').textContent));
  ok('no activity before this session — only this real sign-in is logged',
    $('rep-audit').children.length === 1 && /admin\.login/.test($('rep-audit').textContent));
  ok('a fresh install has exactly the three seeded wallpapers, not sample captures',
    $('wall-list').querySelectorAll('.thumb').length === 3, String($('wall-list').querySelectorAll('.thumb').length));
  $('btn-logout').click();
  await tick(300);

  console.log('\n--- participant journey ---');
  ok('launcher is the first screen', on('s-launcher'));
  ok('launcher shows the fallback wordmark', /NABARD/.test($('logo-launcher').textContent));

  $('go-display').click();
  await tick();
  ok('Display opens the code keypad', on('s-lock'));
  ok('keypad has 12 keys', $('lock-keys').children.length === 12);
  ok('code entry starts empty', $('lock-dots').querySelectorAll('.fill').length === 0);

  const press = (n) => {
    const btns = [...$('lock-keys').children];
    btns.find(b => b.textContent === n).click();
  };
  '999999'.split('').forEach(press);
  await tick(250);
  ok('wrong code is refused', /Incorrect/.test($('lock-msg').textContent), $('lock-msg').textContent);
  ok('digits masked as dots, never shown', !/9/.test($('lock-dots').innerHTML));

  '120782'.split('').forEach(press);
  await tick(250);
  ok('correct code opens the home screen', on('s-home'));
  ok('home heading rendered', $('home-title').textContent.includes("NABARD's Pavilion"));
  ok('three wallpapers loaded', $('walls').children.length === 3);
  ok('wallpaper indicator matches', $('wall-dots').children.length === 3);

  $('go-quiz').click();
  await tick(250);
  ok('Quiz opens the first question', on('s-quiz'));
  ok('counter reads 1 of 10', $('q-counter').textContent === '1 of 10', $('q-counter').textContent);
  ok('four options rendered', $('q-opts').children.length === 4);
  ok('option letters are A-D', [...$('q-opts').children].map(o => o.querySelector('.k').textContent).join('') === 'ABCD');

  $('q-submit').click();
  await tick();
  ok('cannot advance without choosing', /Choose an answer/.test($('q-err').textContent) && $('q-counter').textContent === '1 of 10');

  $('q-opts').children[0].click();
  await tick(60);
  $('quiz-exit').click();
  await tick(120);
  ok('exit button opens a confirmation overlay', $('exit-overlay').hidden === false);
  ok('the overlay warns that progress will be lost', /lose your progress/i.test($('exit-overlay').textContent));
  ok('quiz screen is still underneath, not abandoned yet', on('s-quiz'));

  $('exit-cancel').click();
  await tick(120);
  ok('Continue quiz closes the overlay', $('exit-overlay').hidden === true);
  ok('the chosen answer survived cancelling out of the exit dialog',
    $('q-opts').children[0].classList.contains('sel'));

  $('quiz-exit').click();
  await tick(120);
  $('exit-confirm').click();
  await tick(200);
  ok('Exit to home leaves the quiz', on('s-home'));
  ok('the overlay is hidden again after exiting', $('exit-overlay').hidden === true);

  $('go-quiz').click();
  await tick(200);
  ok('starting a new quiz after exiting works normally', on('s-quiz') && $('q-counter').textContent === '1 of 10');

  for (let i = 0; i < 10; i++) {
    $('q-opts').children[i % 4].click();
    await tick(30);
    $('q-submit').click();
    await tick(80);
  }
  await tick(300);
  ok('a quiz can still be completed after an earlier exit', on('s-result'));
  $('res-next').click();
  await tick(150);
  [...$('fb-list').children].forEach(card => card.querySelectorAll('.star')[4].click());
  $('fb-submit').click();
  await tick(250);
  w.__goKiosk();
  await tick(200);

  $('go-quiz').click();
  await tick(200);

  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    seen.add($('q-text').textContent);
    ok.silent = true;
    $('q-opts').children[i % 4].click();
    await tick(30);
    $('q-submit').click();
    await tick(80);
  }
  await tick(300);
  ok('ten distinct questions were asked', seen.size === 10, String(seen.size));
  ok('quiz ends on the result screen', on('s-result'));
  ok('score is shown out of 10', /\/ 10$/.test($('res-score').textContent), $('res-score').textContent);
  ok('result never reveals correct answers', !/correct answer/i.test($('s-result').textContent));

  const passed = !$('s-result').classList.contains('fail');
  ok('result branch matches the score',
    passed ? /Congratulations/.test($('res-title').textContent) : /Well played/.test($('res-title').textContent));

  $('res-next').click();
  await tick(150);
  ok('feedback screen opens', on('s-feedback'));
  ok('three feedback cards', $('fb-list').children.length === 3);
  ok('five stars per card', $('fb-list').children[0].querySelectorAll('.star').length === 5);

  $('fb-submit').click();
  await tick(120);
  ok('feedback blocked until rated', /rate/i.test($('fb-err').textContent) && on('s-feedback'));

  [...$('fb-list').children].forEach(card => card.querySelectorAll('.star')[4].click());
  await tick(60);
  ok('tapping the fifth star lights all five', $('fb-list').children[0].querySelectorAll('.star.lit').length === 5);

  $('fb-submit').click();
  await tick(250);
  ok('thank you screen appears', on('s-thanks'));
  ok('auto-return countdown running', /Returning to home/.test($('thanks-count').textContent));

  console.log('\n--- feedback-only route ---');
  $('go-quiz');
  w.__goKiosk();
  await tick(200);
  $('go-feedback').click();
  await tick(150);
  ok('Feedback button skips the quiz', on('s-feedback'));

  console.log('\n--- the hidden-attribute bug ---');
  const cssText = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  ok('stylesheet forces [hidden] to win over display rules', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(cssText));

  console.log('\n--- admin portal ---');
  $('home-gear') && w.__goAdmin();
  await tick(250);
  ok('admin login shown', !$('login-shell').hidden && $('panel-shell').hidden);
  ok('password field is masked', $('li-pass').type === 'password');

  $('li-user').value = 'admin';
  $('li-pass').value = 'wrong';
  $('li-go').click();
  await tick(200);
  ok('wrong password refused', /Incorrect/.test($('li-note').textContent));
  ok('password field cleared after failure', $('li-pass').value === '');

  $('li-user').value = 'admin';
  $('li-pass').value = 'fintech-festival-nabard';
  $('li-go').click();
  await tick(400);
  ok('admin signs in', !$('panel-shell').hidden);
  ok('login form is hidden once signed in', $('login-shell').hidden === true);
  ok('login form and panel are never both visible', $('login-shell').hidden !== $('panel-shell').hidden);
  ok('signed-in user shown', $('who-name').textContent === 'admin');

  const pwWraps = d.querySelectorAll('.pw-wrap');
  ok('reveal toggles attached to password fields', pwWraps.length >= 4, String(pwWraps.length));
  const liWrap = $('li-pass').closest('.pw-wrap');
  ok('login password has a reveal toggle', !!liWrap && !!liWrap.querySelector('.pw-eye'));

  ok('six tabs present', d.querySelectorAll('.a-tab').length === 6);
  ok('reports metrics rendered', $('rep-metrics').children.length === 6);
  const attemptsAllText = [...$('rep-metrics').children].find(function (c) { return /Attempts total/.test(c.textContent); });
  ok('attempts total reflects only the two completed quizzes — the exited one left no record',
    attemptsAllText && Number(attemptsAllText.querySelector('.v').textContent) === 2,
    attemptsAllText && attemptsAllText.querySelector('.v').textContent);
  ok('hourly chart has exactly one bar for the one real attempt', $('rep-bars').querySelectorAll('.bar').length === 1);
  ok('question difficulty reflects the ten real questions asked', $('rep-questions').querySelectorAll('tbody tr, tr').length >= 2);
  ok('activity log records the real actions taken, not seeded ones', $('rep-audit').children.length > 0 && $('rep-audit').children.length < 10);

  const tabs = [...d.querySelectorAll('.a-tab')];
  tabs.find(t => t.textContent === 'Questions').click();
  await tick(120);
  ok('questions tab opens', on('p-questions'));
  ok('bank shows 50', $('q-count').textContent === '50', $('q-count').textContent);
  ok('list renders rows', $('q-list').children.length === 50);

  $('q-search').value = 'RIDF';
  $('q-search').dispatchEvent(new w.Event('input'));
  await tick(80);
  const filtered = $('q-list').children.length;
  ok('search filters the bank', filtered > 0 && filtered < 50, String(filtered));
  $('q-search').value = '';
  $('q-search').dispatchEvent(new w.Event('input'));
  await tick(80);

  $('qf-text').value = 'Demo question added on device?';
  ['A', 'B', 'C', 'D'].forEach((k, i) => { $('qf-o' + i).value = 'Option ' + k; });
  $('qf-correct').value = '1';
  $('qf-cat').value = 'Demo';
  $('qf-save').click();
  await tick(400);
  ok('question added', $('q-count').textContent === '51', $('q-count').textContent);

  const row = [...$('q-list').children].find(r => r.textContent.includes('Demo question added'));
  ok('new question appears in the list', !!row);
  row.querySelector('.icon-btn').click();
  await tick(120);
  ok('edit loads the question into the form', $('qf-text').value === 'Demo question added on device?');
  ok('edit form is labelled as an edit', $('q-form-title').textContent === 'Edit question');

  w.confirm = () => true;
  [...$('q-list').children].find(r => r.textContent.includes('Demo question added'))
    .querySelector('.icon-btn.del').click();
  await tick(400);
  ok('question deleted', $('q-count').textContent === '50');

  tabs.find(t => t.textContent === 'Settings').click();
  await tick(120);
  ok('settings show 10 questions', $('set-count').value === '10');
  ok('settings show threshold 8', $('set-threshold').value === '8');
  ok('demanding threshold is flagged', /demanding/i.test($('threshold-warn').textContent));

  $('set-threshold').value = '6';
  $('set-threshold').dispatchEvent(new w.Event('input'));
  await tick(60);
  ok('warning clears at a realistic threshold', $('threshold-warn').textContent.trim() === '');
  $('set-save').click();
  await tick(400);
  ok('settings saved', /saved/i.test($('set-note').textContent));

  tabs.find(t => t.textContent === 'Branding').click();
  await tick(120);
  ok('branding tab opens', on('p-branding'));
  ok('logo file input accepts images', $('logo-file').accept.includes('image/png'));
  ok('three wallpapers listed', $('wall-list').querySelectorAll('.thumb').length === 3);

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await w.__mock('/api/admin/upload', { body: JSON.stringify({ kind: 'logo', dataUrl: png }) });
  await w.__adminRefresh();
  await tick(300);
  ok('uploaded logo previews in admin', $('logo-preview').querySelector('img') !== null);

  w.__goKiosk();
  await tick(400);
  ok('uploaded logo reaches the kiosk launcher', $('logo-launcher').querySelector('img') !== null);
  ok('uploaded logo reaches the home screen', $('logo-home').querySelector('img') !== null);
  ok('uploaded logo reaches the quiz header', $('logo-quiz').querySelector('img') !== null);

  w.__goAdmin();
  await tick(300);
  tabs.find(t => t.textContent === 'Security').click();
  await tick(120);
  ok('security tab opens', on('p-security'));
  ok('current password masked', $('pw-current').type === 'password');
  ok('new password masked', $('pw-next').type === 'password');
  ok('confirm password masked', $('pw-confirm').type === 'password');
  ok('all four OTP boxes masked', [...$('otp-row').children].every(i => i.type === 'password'));
  ok('display code field masked', $('kc-code').type === 'password');
  ok('OTP row has a reveal toggle', !!d.querySelector('.otp-reveal'));

  const eye = $('pw-current').closest('.pw-wrap').querySelector('.pw-eye');
  $('pw-current').value = 'visible-check';
  eye.click();
  await tick(60);
  ok('eye icon reveals the password', $('pw-current').type === 'text');
  ok('reveal button reports its state', eye.getAttribute('aria-pressed') === 'true');
  eye.click();
  await tick(60);
  ok('eye icon re-masks the password', $('pw-current').type === 'password');
  ok('revealing does not alter what was typed', $('pw-current').value === 'visible-check');

  const otpToggle = d.querySelector('.otp-reveal');
  otpToggle.click();
  await tick(60);
  ok('OTP toggle reveals all four boxes', [...$('otp-row').children].every(i => i.type === 'text'));
  otpToggle.click();
  await tick(60);
  ok('OTP toggle re-masks all four boxes', [...$('otp-row').children].every(i => i.type === 'password'));
  $('pw-current').value = '';

  const otp = [...$('otp-row').children];
  $('pw-current').value = 'fintech-festival-nabard';
  $('pw-next').value = 'newdemopass1';
  $('pw-confirm').value = 'newdemopass1';
  '0000'.split('').forEach((c, i) => { otp[i].value = c; });
  $('pw-save').click();
  await tick(250);
  ok('wrong OTP blocks the change', /OTP/i.test($('pw-note').textContent), $('pw-note').textContent);

  $('pw-current').value = 'fintech-festival-nabard';
  $('pw-next').value = 'newdemopass1';
  $('pw-confirm').value = 'newdemopass1';
  '1982'.split('').forEach((c, i) => { otp[i].value = c; });
  $('pw-save').click();
  await tick(250);
  ok('correct OTP allows the change', /updated/i.test($('pw-note').textContent), $('pw-note').textContent);
  ok('password fields cleared afterwards', $('pw-current').value === '' && $('pw-next').value === '');
  ok('OTP boxes cleared afterwards', otp.every(i => i.value === ''));

  $('kc-code').value = '654321';
  $('kc-pass').value = 'newdemopass1';
  $('kc-save').click();
  await tick(250);
  ok('display code can be changed', /updated/i.test($('kc-note').textContent), $('kc-note').textContent);

  w.__goKiosk();
  await tick(400);
  ok('changing the code re-locks terminals', on('s-launcher'));

  console.log('\n--- superuser tools ---');
  w.__goAdmin();
  await tick(300);
  ok('super user card is hidden for the admin account', $('super-card').hidden === true);

  $('btn-logout').click();
  await tick(300);
  w.__goAdmin();
  await tick(300);
  ok('signing out returns to the login form', !$('login-shell').hidden);

  $('li-user').value = 'xadmin';
  $('li-pass').value = 'fintech-festival-xadmin';
  $('li-go').click();
  await tick(400);
  ok('xadmin signs in with the corrected default password', $('who-name').textContent === 'xadmin');

  const secTab = [...d.querySelectorAll('.a-tab')].find(t => t.textContent === 'Security');
  secTab.click();
  await tick(150);
  ok('super user card is visible for xadmin', $('super-card').hidden === false);

  $('su-new').value = 'overriddenbydemo1';
  $('su-confirm').value = 'overriddenbydemo1';
  $('su-pass').value = 'wrong-xadmin-password';
  const suOtp = [...$('su-otp-row').children];
  '0003'.split('').forEach((c, i) => { suOtp[i].value = c; });
  $('su-save').click();
  await tick(250);
  ok('wrong xadmin password blocks the override', /incorrect/i.test($('su-note').textContent), $('su-note').textContent);

  $('su-pass').value = 'fintech-festival-xadmin';
  suOtp.forEach(b => { b.value = ''; });
  '1982'.split('').forEach((c, i) => { suOtp[i].value = c; });
  $('su-save').click();
  await tick(250);
  ok('admin\'s own OTP does not work for the xadmin superuser action', /OTP/i.test($('su-note').textContent), $('su-note').textContent);

  suOtp.forEach(b => { b.value = ''; });
  '0003'.split('').forEach((c, i) => { suOtp[i].value = c; });
  $('su-pass').value = 'fintech-festival-xadmin';
  $('su-save').click();
  await tick(300);
  ok('xadmin overrides admin\'s password', /overwritten/i.test($('su-note').textContent), $('su-note').textContent);
  ok('the form clears afterwards', $('su-new').value === '' && $('su-pass').value === '');

  const overrideCheck = await w.__mock('/api/admin/login', {
    body: JSON.stringify({ username: 'admin', password: 'overriddenbydemo1' })
  }).then(r => r.json());
  ok('admin can sign in with the password xadmin just set', overrideCheck.ok === true, JSON.stringify(overrideCheck));

  await w.__mock('/api/admin/login', {
    body: JSON.stringify({ username: 'xadmin', password: 'fintech-festival-xadmin' })
  });
  const restoreCheck = await w.__mock('/api/admin/superuser/override-password', {
    body: JSON.stringify({
      newPassword: 'newdemopass1', confirm: 'newdemopass1',
      password: 'fintech-festival-xadmin', otp: '0003'
    })
  }).then(r => r.json());
  ok('admin\'s password restored to newdemopass1 for the rest of the walkthrough', restoreCheck.ok === true, JSON.stringify(restoreCheck));

  $('su-code-pass').value = 'fintech-festival-xadmin';
  $('su-code-reset').click();
  await tick(250);
  ok('restoring the default display code succeeds', /restored/i.test($('su-code-note').textContent), $('su-code-note').textContent);

  w.__goKiosk();
  await tick(300);
  ok('kiosk is locked again after restoring the default code', on('s-launcher'));
  $('go-display').click();
  await tick(150);
  '120782'.split('').forEach(digit => {
    [...$('lock-keys').children].find(b => b.textContent === digit).click();
  });
  await tick(300);
  ok('the restored default display code actually unlocks the kiosk', on('s-home'));

  $('btn-logout').click();
  await tick(300);
  w.__goAdmin();
  await tick(300);
  $('li-user').value = 'admin';
  $('li-pass').value = 'newdemopass1';
  $('li-go').click();
  await tick(400);
  ok('back on the admin account with its usual password for the remaining tests', $('who-name').textContent === 'admin');

  console.log('\n--- reset data ---');
  w.__goAdmin();
  await tick(300);
  ok('returning to admin keeps the existing session', !$('panel-shell').hidden);
  const repTab = [...d.querySelectorAll('.a-tab')].find(t => t.textContent === 'Reports');
  repTab.click();
  await tick(150);

  const metricsBefore = [...$('rep-metrics').children];
  const attemptsBefore = Number(metricsBefore.find(c => /Attempts total/.test(c.textContent)).querySelector('.v').textContent);
  const feedbackBefore = Number(metricsBefore.find(c => /Feedback responses/.test(c.textContent)).querySelector('.v').textContent);
  ok('there is real recorded activity to reset', attemptsBefore > 0 && feedbackBefore > 0,
    'attempts=' + attemptsBefore + ' feedback=' + feedbackBefore);

  $('reset-attempts').click();
  await tick(100);
  ok('reset is blocked without a password', /Enter your password/.test($('reset-note').textContent));

  $('reset-password').value = 'wrong-password';
  const origConfirm = w.confirm;
  w.confirm = () => true;
  $('reset-attempts').click();
  await tick(250);
  ok('reset refused with the wrong password', /incorrect/i.test($('reset-note').textContent), $('reset-note').textContent);

  $('reset-password').value = 'newdemopass1';
  $('reset-feedback').click();
  await tick(300);
  ok('feedback reset succeeds', /reset/i.test($('reset-note').textContent), $('reset-note').textContent);
  let m = [...$('rep-metrics').children];
  ok('feedback count is now zero', Number(m.find(c => /Feedback responses/.test(c.textContent)).querySelector('.v').textContent) === 0);
  ok('quiz attempts are untouched by a feedback-only reset',
    Number(m.find(c => /Attempts total/.test(c.textContent)).querySelector('.v').textContent) === attemptsBefore);

  $('reset-password').value = 'newdemopass1';
  $('reset-both').click();
  await tick(300);
  m = [...$('rep-metrics').children];
  ok('reset-both clears attempts too', Number(m.find(c => /Attempts total/.test(c.textContent)).querySelector('.v').textContent) === 0);
  ok('question difficulty is empty once attempts are cleared', /No data yet/.test($('rep-questions').textContent));
  w.confirm = origConfirm;

  console.log('\n--- reset ---');
  $('demo-reset').click();
  await tick(400);
  ok('reset returns to the launcher', on('s-launcher'));
  ok('reset restores the default wordmark', $('logo-launcher').querySelector('img') === null);

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('WALKTHROUGH ERROR', e); process.exit(2); });
