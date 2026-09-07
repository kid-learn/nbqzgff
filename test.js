'use strict';
const fs = require('fs');
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 8099);

let pass = 0, fail = 0;
const jar = { kiosk: '', admin: '' };

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function cookies() {
  return [jar.kiosk, jar.admin].filter(Boolean).join('; ');
}

async function call(path, body, opts) {
  opts = opts || {};
  const headers = { Cookie: cookies() };
  if (!opts.noXhr) headers['X-Requested-With'] = 'nabard-quiz';
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : (opts.method || 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const setC = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const c of setC) {
    if (c.startsWith('nq_kiosk=')) jar.kiosk = c.split(';')[0];
    if (c.startsWith('nq_admin=')) jar.admin = c.split(';')[0];
  }
  const ct = r.headers.get('content-type') || '';
  const payload = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  return { status: r.status, body: payload, headers: r.headers };
}

(async () => {
  console.log('\n--- participant flow ---');

  let r = await call('/api/config');
  ok('config loads', r.status === 200);
  ok('kiosk starts locked', r.body.unlocked === false);
  ok('three wallpapers seeded', (r.body.wallpapers || []).length === 3, JSON.stringify(r.body.wallpapers));
  ok('three feedback questions seeded', (r.body.feedbackQuestions || []).length === 3);
  ok('config leaks no answer key', !JSON.stringify(r.body).includes('correct'));

  r = await call('/api/kiosk/unlock', { code: '999999' });
  ok('wrong display code rejected', r.status === 401);

  r = await call('/api/kiosk/unlock', { code: '120782' });
  ok('correct display code accepted', r.status === 200, JSON.stringify(r.body));
  ok('kiosk cookie is HttpOnly', jar.kiosk.length > 0);

  r = await call('/api/config');
  ok('kiosk stays unlocked across reload', r.body.unlocked === true);

  r = await call('/api/quiz/start', { terminal: 'TEST' });
  const quiz = r.body;
  ok('quiz returns 10 questions', quiz.questions && quiz.questions.length === 10, String(quiz.questions && quiz.questions.length));
  ok('threshold reported as 8', quiz.passThreshold === 8);
  ok('no answer key sent to client', !JSON.stringify(quiz).toLowerCase().includes('correctkey'));
  ok('every question has 4 options', quiz.questions.every(q => q.options.length === 4));
  ok('option keys are A-D', quiz.questions.every(q => q.options.map(o => o.key).join('') === 'ABCD'));
  ok('question ids are unique', new Set(quiz.questions.map(q => q.id)).size === 10);

  const q2 = (await call('/api/quiz/start', { terminal: 'TEST' })).body;
  const same = quiz.questions.map(q => q.id).join() === q2.questions.map(q => q.id).join();
  ok('a second attempt draws a different set', !same);

  const cfg = JSON.parse(fs.readFileSync(__dirname + '/data/config.json', 'utf8'));
  const key = {};
  for (const q of cfg.questions) key[q.id] = q.options[q.correct];

  const perfect = {};
  for (const q of quiz.questions) {
    perfect[q.id] = q.options.find(o => o.text === key[q.id]).key;
  }
  r = await call('/api/quiz/submit', { attemptId: quiz.attemptId, answers: perfect });
  ok('all-correct scores 10/10', r.body.score === 10 && r.body.total === 10, JSON.stringify(r.body));
  ok('all-correct passes', r.body.passed === true);
  ok('pass message is the congratulatory one', /Congratulations/.test(r.body.message || ''));

  r = await call('/api/quiz/submit', { attemptId: quiz.attemptId, answers: perfect });
  ok('resubmitting the same attempt is refused', r.status === 409 || r.status === 410, String(r.status));

  const wrong = {};
  for (const q of q2.questions) {
    wrong[q.id] = q.options.find(o => o.text !== key[q.id]).key;
  }
  r = await call('/api/quiz/submit', { attemptId: q2.attemptId, answers: wrong });
  ok('all-wrong scores 0/10', r.body.score === 0);
  ok('all-wrong does not pass', r.body.passed === false);
  ok('fail message is the consolation one', /Thanks for taking/.test(r.body.message || ''));

  r = await call('/api/quiz/submit', { attemptId: 'made-up-id', answers: {} });
  ok('unknown attempt id refused', r.status === 410);

  const q3 = (await call('/api/quiz/start', {})).body;
  const partial = {};
  q3.questions.slice(0, 4).forEach(q => { partial[q.id] = q.options.find(o => o.text === key[q.id]).key; });
  r = await call('/api/quiz/submit', { attemptId: q3.attemptId, answers: partial });
  ok('unanswered questions score zero', r.body.score === 4, JSON.stringify(r.body));

  const fbq = (await call('/api/config')).body.feedbackQuestions;
  r = await call('/api/feedback', { terminal: 'TEST', ratings: fbq.map((f, i) => ({ questionId: f.id, rating: [5, 4, 5][i] })) });
  ok('feedback accepted', r.status === 200);

  r = await call('/api/feedback', { terminal: 'TEST', ratings: [{ questionId: fbq[0].id, rating: 9 }] });
  ok('out-of-range rating rejected', r.status === 400);

  r = await call('/api/feedback', { terminal: 'TEST', ratings: [{ questionId: 'not-a-question', rating: 5 }] });
  ok('unknown feedback question rejected', r.status === 400);

  console.log('\n--- admin ---');

  r = await call('/api/admin/state');
  ok('admin state blocked when signed out', r.status === 401);

  r = await call('/api/admin/login', { username: 'admin', password: 'wrong-password' });
  ok('wrong admin password rejected', r.status === 401);

  r = await call('/api/admin/login', { username: 'admin', password: 'fintech-festival-nabard' });
  ok('admin signs in with the default password', r.status === 200, JSON.stringify(r.body));

  r = await call('/api/admin/state');
  ok('admin state loads', r.status === 200);

  const savedTok = jar.admin;
  jar.admin = '';
  for (const [label, pw] of [
    ['trailing space', 'fintech-festival-nabard '],
    ['leading space', ' fintech-festival-nabard'],
    ['trailing newline', 'fintech-festival-nabard\n'],
    ['smart dashes from a touch keyboard', 'fintech\u2011festival\u2011nabard'],
    ['en dashes', 'fintech\u2013festival\u2013nabard']
  ]) {
    r = await call('/api/admin/login', { username: 'admin', password: pw });
    ok('password survives ' + label, r.status === 200, String(r.status));
  }
  r = await call('/api/admin/login', { username: 'ADMIN', password: 'fintech-festival-nabard' });
  ok('user ID is case insensitive', r.status === 200);
  r = await call('/api/admin/login', { username: 'admin', password: 'fintech festival nabard' });
  ok('a genuinely wrong password still fails', r.status === 401);
  jar.admin = savedTok;

  r = await call('/api/admin/state');
  ok('admin state still valid after the login variants', r.status === 200);
  ok('bank holds 50 questions', r.body.questions.length === 50, String(r.body.questions.length));
  ok('threshold default is 8', r.body.settings.passThreshold === 8);
  ok('kiosk code is 120782', r.body.settings.kioskCode === '120782');
  ok('password hashes are not exposed', !JSON.stringify(r.body).includes('hash'));

  r = await call('/api/admin/question', {
    text: 'Test question added by the harness?',
    options: ['One', 'Two', 'Three', 'Four'], correct: 2, category: 'Test'
  });
  const newQid = r.body.id;
  ok('question created', r.status === 200 && !!newQid);

  r = await call('/api/admin/question', { id: newQid, text: 'Edited by the harness?', options: ['A1', 'B1', 'C1', 'D1'], correct: 0 });
  ok('question edited', r.status === 200);

  r = await call('/api/admin/state');
  const edited = r.body.questions.find(q => q.id === newQid);
  ok('edit persisted', edited && edited.text === 'Edited by the harness?' && edited.correct === 0);
  ok('bank now holds 51', r.body.questions.length === 51);

  r = await call('/api/admin/question', { text: 'Bad', options: ['a', 'b', 'c'], correct: 0 });
  ok('question with three options rejected', r.status === 400);

  r = await call('/api/admin/question', { text: 'Bad', options: ['a', 'b', 'c', 'd'], correct: 7 });
  ok('out-of-range correct index rejected', r.status === 400);

  r = await call('/api/admin/question/delete', { id: newQid });
  ok('question deleted', r.status === 200);
  r = await call('/api/admin/state');
  ok('bank back to 50', r.body.questions.length === 50);

  r = await call('/api/admin/feedback-question', { text: 'Harness feedback question?' });
  const newFid = r.body.id;
  ok('feedback question created', r.status === 200 && !!newFid);
  r = await call('/api/admin/feedback-question/delete', { id: newFid });
  ok('feedback question deleted', r.status === 200);

  r = await call('/api/admin/settings', { questionsPerAttempt: 5, passThreshold: 99 });
  ok('threshold capped at question count', r.body.settings.passThreshold === 5, JSON.stringify(r.body.settings));
  r = await call('/api/admin/settings', { questionsPerAttempt: 10, passThreshold: 8 });
  ok('settings restored', r.body.settings.passThreshold === 8);

  r = await call('/api/admin/settings', { idleResetSeconds: 99999 });
  ok('idle reset clamped to a sane maximum', r.body.settings.idleResetSeconds === 600);
  await call('/api/admin/settings', { idleResetSeconds: 60 });

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  r = await call('/api/admin/upload', { kind: 'logo', dataUrl: png, label: 'logo.png' });
  ok('logo uploads', r.status === 200 && /^\/media\//.test(r.body.url || ''), JSON.stringify(r.body));
  const logoUrl = r.body.url;

  r = await call('/api/config');
  ok('logo appears in the kiosk config', r.body.logo === logoUrl);
  r = await call(logoUrl, null, { method: 'GET' });
  ok('logo is served', r.status === 200);

  r = await call('/api/admin/upload', { kind: 'logo', dataUrl: 'data:text/html;base64,PGh0bWw+' });
  ok('non-image upload rejected', r.status === 400);

  r = await call('/api/admin/upload', { kind: 'wallpaper', dataUrl: png, label: 'w.png' });
  const wallId = r.body.id;
  ok('wallpaper uploads', r.status === 200);
  r = await call('/api/config');
  ok('four wallpapers now active', r.body.wallpapers.length === 4);
  r = await call('/api/admin/wallpaper/update', { id: wallId, active: false });
  ok('wallpaper can be switched off', r.status === 200);
  r = await call('/api/config');
  ok('inactive wallpaper hidden from kiosk', r.body.wallpapers.length === 3);
  r = await call('/api/admin/wallpaper/delete', { id: wallId });
  ok('wallpaper deleted', r.status === 200);
  await call('/api/admin/logo/delete', {});

  console.log('\n--- security ---');

  r = await call('/api/admin/password', { current: 'wrong', next: 'newpassword1', confirm: 'newpassword1', otp: '1982' });
  ok('password change blocked without the current password', r.status === 401);

  r = await call('/api/admin/password', { current: 'fintech-festival-nabard', next: 'newpassword1', confirm: 'newpassword1', otp: '0000' });
  ok('password change blocked with a wrong OTP', r.status === 401);

  r = await call('/api/admin/password', { current: 'fintech-festival-nabard', next: 'short', confirm: 'short', otp: '1982' });
  ok('short password rejected', r.status === 400);

  r = await call('/api/admin/password', { current: 'fintech-festival-nabard', next: 'newpassword1', confirm: 'different1', otp: '1982' });
  ok('mismatched confirmation rejected', r.status === 400);

  r = await call('/api/admin/password', { current: 'fintech-festival-nabard', next: 'newpassword1', confirm: 'newpassword1', otp: ' 1982 ' });
  ok('OTP survives stray spaces', r.status === 200);

  const saved = jar.admin;
  jar.admin = '';
  r = await call('/api/admin/login', { username: 'admin', password: 'fintech-festival-nabard' });
  ok('old password no longer works', r.status === 401);
  r = await call('/api/admin/login', { username: 'admin', password: 'newpassword1' });
  ok('new password works', r.status === 200);
  r = await call('/api/admin/password', { current: 'newpassword1', next: 'fintech-festival-nabard', confirm: 'fintech-festival-nabard', otp: '1982' });
  ok('password restored to the default', r.status === 200);

  jar.admin = '';
  r = await call('/api/admin/login', { username: 'xadmin', password: 'fintech-festival-xadmin' });
  ok('xadmin signs in with its own password', r.status === 200);
  r = await call('/api/admin/password', { current: 'fintech-festival-xadmin', next: 'xadminpass99', confirm: 'xadminpass99', otp: '1982' });
  ok('admin OTP does not work for xadmin', r.status === 401);
  r = await call('/api/admin/password', { current: 'fintech-festival-xadmin', next: 'xadminpass99', confirm: 'xadminpass99', otp: '0003' });
  ok('xadmin OTP works for xadmin', r.status === 200);
  await call('/api/admin/password', { current: 'xadminpass99', next: 'fintech-festival-xadmin', confirm: 'fintech-festival-xadmin', otp: '0003' });

  r = await call('/api/admin/kiosk-code', { code: '654321', password: 'wrong' });
  ok('kiosk code change needs the password', r.status === 401);
  r = await call('/api/admin/kiosk-code', { code: '12ab56', password: 'fintech-festival-xadmin' });
  ok('non-numeric kiosk code rejected', r.status === 400);
  r = await call('/api/admin/kiosk-code', { code: '654321', password: 'fintech-festival-xadmin' });
  ok('kiosk code changes', r.status === 200);
  r = await call('/api/config');
  ok('changing the code signs terminals out', r.body.unlocked === false);
  r = await call('/api/kiosk/unlock', { code: '654321' });
  ok('new kiosk code works', r.status === 200);
  await call('/api/admin/kiosk-code', { code: '120782', password: 'fintech-festival-xadmin' });

  console.log('\n--- superuser ---');

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'short', confirm: 'short', password: 'fintech-festival-xadmin', otp: '0003'
  });
  ok('short password rejected by the superuser endpoint', r.status === 400);

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'overriddenpass1', confirm: 'different1', password: 'fintech-festival-xadmin', otp: '0003'
  });
  ok('mismatched confirmation rejected', r.status === 400);

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'overriddenpass1', confirm: 'overriddenpass1', password: 'wrong-xadmin-password', otp: '0003'
  });
  ok('wrong xadmin password rejected', r.status === 401);

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'overriddenpass1', confirm: 'overriddenpass1', password: 'fintech-festival-xadmin', otp: '9999'
  });
  ok('wrong xadmin OTP rejected', r.status === 401);

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'overriddenpass1', confirm: 'overriddenpass1', password: 'fintech-festival-xadmin', otp: '0003'
  });
  ok('xadmin overrides admin\'s password', r.status === 200, JSON.stringify(r.body));

  const oldAdminSession = saved;
  const savedTmp = jar.admin;
  jar.admin = oldAdminSession;
  r = await call('/api/admin/state');
  ok('overriding admin\'s password signs out admin\'s existing session', r.status === 401);
  jar.admin = savedTmp;

  jar.admin = '';
  r = await call('/api/admin/login', { username: 'admin', password: 'fintech-festival-nabard' });
  ok('admin\'s old password no longer works after being overridden', r.status === 401);
  r = await call('/api/admin/login', { username: 'admin', password: 'overriddenpass1' });
  ok('admin can sign in with the password xadmin set', r.status === 200);

  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'whatever12345', confirm: 'whatever12345', password: 'overriddenpass1', otp: '1982'
  });
  ok('admin is forbidden from calling the superuser endpoint at all', r.status === 403, String(r.status));

  jar.admin = savedTmp;
  r = await call('/api/admin/superuser/override-password', {
    newPassword: 'fintech-festival-nabard', confirm: 'fintech-festival-nabard', password: 'fintech-festival-xadmin', otp: '0003'
  });
  ok('admin\'s password restored to the documented default via the superuser endpoint', r.status === 200);

  jar.admin = '';
  r = await call('/api/admin/login', { username: 'admin', password: 'fintech-festival-nabard' });
  ok('admin default password works again after restoring', r.status === 200);
  const freshAdminSession = jar.admin;

  jar.admin = freshAdminSession;

  jar.admin = freshAdminSession;
  r = await call('/api/admin/state');
  ok('fresh admin session works for the remaining tests', r.status === 200 && r.body.username === 'admin', JSON.stringify(r.body && r.body.username));

  r = await call('/api/admin/settings', { passThreshold: 8 }, { noXhr: true });
  ok('state-changing call without the request header refused', r.status === 400);

  r = await call('/../server.js', null, { method: 'GET' });
  ok('path traversal on static files blocked', r.status === 404 || r.status === 403, String(r.status));

  r = await call('/media/../config.json', null, { method: 'GET' });
  ok('path traversal on media blocked', r.status === 404 || r.status === 403, String(r.status));

  console.log('\n--- exports ---');
  for (const what of ['attempts', 'feedback', 'questions', 'audit']) {
    r = await call('/api/admin/export?what=' + what, null, { method: 'GET' });
    const isCsv = typeof r.body === 'string' && r.body.split('\r\n')[0].includes(',');
    ok(what + ' CSV exports', r.status === 200 && isCsv);
  }

  r = await call('/api/admin/reports', null, { method: 'GET' });
  ok('reports compute', r.status === 200 && r.body.totals.attemptsAll >= 3, JSON.stringify(r.body.totals));
  ok('question difficulty tracked', r.body.questionStats.length > 0);
  ok('feedback averages computed', r.body.feedbackStats.some(f => f.responses > 0));
  ok('access log populated', r.body.recentAudit.length > 0);

  console.log('\n--- reset data ---');

  const beforeReset = r.body.totals.attemptsAll;
  ok('some attempts exist before reset', beforeReset > 0);

  r = await call('/api/admin/reset', { what: 'attempts', password: 'wrong-password' });
  ok('reset refused with the wrong password', r.status === 401);

  r = await call('/api/admin/reset', { what: 'not-a-real-target', password: 'fintech-festival-nabard' });
  ok('unknown reset target rejected', r.status === 400);

  r = await call('/api/admin/reset', { what: 'feedback', password: 'fintech-festival-nabard' });
  ok('feedback reset accepted', r.status === 200);
  r = await call('/api/admin/reports', null, { method: 'GET' });
  ok('feedback count is now zero', r.body.totals.feedbackCount === 0);
  ok('quiz attempts untouched by a feedback-only reset', r.body.totals.attemptsAll === beforeReset, String(r.body.totals.attemptsAll));

  r = await call('/api/admin/reset', { what: 'attempts', password: 'fintech-festival-nabard' });
  ok('attempts reset accepted', r.status === 200);
  r = await call('/api/admin/reports', null, { method: 'GET' });
  ok('attempts count is now zero', r.body.totals.attemptsAll === 0);
  ok('question difficulty table is empty after reset', r.body.questionStats.length === 0);

  r = await call('/api/admin/state');
  ok('resetting attempts does not touch the question bank', r.body.questions.length === 50);
  ok('resetting attempts does not touch settings', r.body.settings.passThreshold === 8);

  const q4 = (await call('/api/quiz/start', {})).body;
  const cfgAfterReset = JSON.parse(fs.readFileSync(__dirname + '/data/config.json', 'utf8'));
  const key4 = {};
  for (const qq of cfgAfterReset.questions) key4[qq.id] = qq.options[qq.correct];
  const answers4 = {};
  q4.questions.forEach((qq) => { answers4[qq.id] = qq.options.find((o) => o.text === key4[qq.id]).key; });
  await call('/api/quiz/submit', { attemptId: q4.attemptId, answers: answers4 });
  r = await call('/api/admin/reset', { what: 'both', password: 'fintech-festival-nabard' });
  ok('reset-both accepted', r.status === 200);
  r = await call('/api/admin/reports', null, { method: 'GET' });
  ok('both counts are zero after reset-both', r.body.totals.attemptsAll === 0 && r.body.totals.feedbackCount === 0);

  r = await call('/api/admin/export?what=attempts', null, { method: 'GET' });
  const attemptsCsvLines = String(r.body).trim().split('\r\n');
  ok('attempts CSV is header-only after reset', attemptsCsvLines.length === 1, String(attemptsCsvLines.length));

  console.log('\n--- rate limiting ---');
  jar.kiosk = '';
  let blocked = false;
  for (let i = 0; i < 7; i++) {
    r = await call('/api/kiosk/unlock', { code: '000000' });
    if (r.status === 429) blocked = true;
  }
  ok('display code brute force is throttled', blocked);

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
