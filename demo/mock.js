/* Demo-only stand-in for server.js. Same API surface, all state in memory. */
(function () {
  'use strict';

  var DB = null;

  function wallSvg(bg, fg) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" width="720" height="1280">' +
      '<rect width="720" height="1280" fill="' + bg + '"/>' +
      '<g fill="none" stroke="' + fg + '" stroke-width="3" opacity="0.5">' +
      '<circle cx="120" cy="200" r="70"/><circle cx="600" cy="340" r="110"/>' +
      '<circle cx="200" cy="1000" r="150"/><circle cx="640" cy="1120" r="90"/>' +
      '<path d="M0 760 C 180 690, 360 830, 540 760 S 720 690, 720 760"/>' +
      '<path d="M0 820 C 180 750, 360 890, 540 820 S 720 750, 720 820"/></g>' +
      '<g fill="' + fg + '" opacity="0.35"><circle cx="420" cy="180" r="10"/><circle cx="470" cy="230" r="6"/>' +
      '<circle cx="90" cy="620" r="8"/><circle cx="660" cy="700" r="12"/><circle cx="300" cy="480" r="7"/></g></svg>';
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function rid() { return Math.random().toString(36).slice(2, 10); }

  function normPass(v) {
    return String(v == null ? '' : v).normalize('NFC').replace(/[\u2010-\u2015\u2212]/g, '-').trim();
  }

  function init() {
    DB = {
      unlocked: false,
      session: null,
      settings: JSON.parse(JSON.stringify(window.__SEED.SETTINGS)),
      logo: null,
      users: {
        admin: { password: 'fintech-festival-nabard', otp: '1982' },
        xadmin: { password: 'fintech-festival-xadmin', otp: '0003' }
      },
      wallpapers: [
        { id: 'w1', url: wallSvg('#7AC756', '#0B5C3A'), label: 'Field green', active: true },
        { id: 'w2', url: wallSvg('#0B5C3A', '#9FE1CB'), label: 'Deep forest', active: true },
        { id: 'w3', url: wallSvg('#0B2E4F', '#5DCAA5'), label: 'Night navy', active: true }
      ],
      questions: window.__SEED.QUESTIONS.map(function (q, i) {
        return {
          id: 'q' + String(i + 1).padStart(3, '0'),
          text: q.q, options: q.o.slice(), correct: q.a, category: q.c, active: true
        };
      }),
      feedbackQuestions: window.__SEED.FEEDBACK.map(function (t, i) {
        return { id: 'f' + String(i + 1).padStart(3, '0'), text: t, order: i + 1, active: true };
      }),
      live: {},
      attempts: [],
      feedback: [],
      audit: []
    };
  }

  function log(event) {
    DB.audit.push({ at: new Date().toISOString(), event: event, detail: {} });
  }

  function publicConfig() {
    var s = DB.settings;
    return {
      welcomeTitle: s.welcomeTitle,
      welcomeSubtitle: s.welcomeSubtitle,
      wallpaperCycleSeconds: s.wallpaperCycleSeconds,
      idleResetSeconds: s.idleResetSeconds,
      thankYouSeconds: s.thankYouSeconds,
      feedbackRequireAll: s.feedbackRequireAll,
      questionsPerAttempt: s.questionsPerAttempt,
      logo: DB.logo,
      wallpapers: DB.wallpapers.filter(function (w) { return w.active; }).map(function (w) { return w.url; }),
      feedbackQuestions: DB.feedbackQuestions.filter(function (f) { return f.active; })
        .map(function (f) { return { id: f.id, text: f.text }; }),
      unlocked: DB.unlocked
    };
  }

  function adminState() {
    return {
      username: DB.session,
      settings: DB.settings,
      logo: DB.logo,
      wallpapers: DB.wallpapers.map(function (w) {
        return { id: w.id, url: w.url, label: w.label, active: w.active };
      }),
      questions: DB.questions.map(function (q) {
        return { id: q.id, text: q.text, options: q.options, correct: q.correct, category: q.category, active: q.active };
      }),
      feedbackQuestions: DB.feedbackQuestions.slice().sort(function (a, b) { return a.order - b.order; })
    };
  }

  function reports() {
    var today = new Date().toISOString().slice(0, 10);
    var atts = DB.attempts;
    var pass = atts.filter(function (a) { return a.passed; }).length;
    var byHour = {};
    atts.forEach(function (a) {
      var h = new Date(a.at).getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    });
    var qs = {};
    atts.forEach(function (a) {
      a.answers.forEach(function (d) {
        var s = qs[d.questionId] || { served: 0, correct: 0 };
        s.served++; if (d.ok) s.correct++;
        qs[d.questionId] = s;
      });
    });
    var questionStats = Object.keys(qs).map(function (id) {
      var q = DB.questions.filter(function (x) { return x.id === id; })[0];
      return {
        id: id, text: q ? q.text : '(deleted question)',
        served: qs[id].served, correct: qs[id].correct,
        pct: Math.round((qs[id].correct / qs[id].served) * 100)
      };
    }).sort(function (a, b) { return a.pct - b.pct; });

    var feedbackStats = DB.feedbackQuestions.map(function (f) {
      var vals = [];
      DB.feedback.forEach(function (r) {
        r.ratings.forEach(function (x) { if (x.questionId === f.id) vals.push(x.rating); });
      });
      var dist = [0, 0, 0, 0, 0];
      vals.forEach(function (v) { dist[v - 1]++; });
      return {
        id: f.id, text: f.text, responses: vals.length,
        average: vals.length ? Math.round((vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) * 10) / 10 : 0,
        dist: dist
      };
    });

    return {
      totals: {
        attemptsToday: atts.filter(function (a) { return a.at.slice(0, 10) === today; }).length,
        attemptsAll: atts.length,
        passRate: atts.length ? Math.round((pass / atts.length) * 100) : 0,
        avgScore: atts.length ? Math.round((atts.reduce(function (t, a) { return t + a.score; }, 0) / atts.length) * 10) / 10 : 0,
        avgSeconds: atts.length ? Math.round(atts.reduce(function (t, a) { return t + a.durationMs; }, 0) / atts.length / 1000) : 0,
        feedbackCount: DB.feedback.length
      },
      byHour: byHour,
      questionStats: questionStats,
      feedbackStats: feedbackStats,
      recentAudit: DB.audit.slice(-40).reverse()
    };
  }

  function reply(status, body) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      headers: { get: function () { return 'application/json'; } },
      json: function () { return Promise.resolve(body); }
    });
  }

  function needAdmin() { return DB.session ? null : reply(401, { error: 'Not signed in', code: 'nosession' }); }

  window.__mock = function (path, opts) {
    if (!DB) init();
    var b = opts && opts.body ? JSON.parse(opts.body) : {};
    var s = DB.settings;

    if (path === '/api/config') return reply(200, publicConfig());

    if (path === '/api/kiosk/unlock') {
      if (String(b.code) === String(s.kioskCode)) {
        DB.unlocked = true;
        log('kiosk.unlock');
        return reply(200, { ok: true });
      }
      log('kiosk.unlock.failed');
      return reply(401, { error: 'Incorrect code' });
    }

    if (path === '/api/quiz/start') {
      var active = DB.questions.filter(function (q) { return q.active; });
      if (!active.length) return reply(409, { error: 'No active questions in the bank.' });
      var n = Math.min(s.questionsPerAttempt, active.length);
      var picked = shuffle(active).slice(0, n);
      var id = rid();
      var served = picked.map(function (q) {
        var order = shuffle([0, 1, 2, 3]);
        return { id: q.id, order: order, correctKey: 'ABCD'[order.indexOf(q.correct)] };
      });
      DB.live[id] = { id: id, served: served, startedAt: Date.now(), terminal: b.terminal || 'demo' };
      return reply(200, {
        attemptId: id,
        total: n,
        passThreshold: Math.min(s.passThreshold, n),
        questions: served.map(function (x, i) {
          var src = DB.questions.filter(function (q) { return q.id === x.id; })[0];
          return {
            id: x.id, index: i + 1, text: src.text,
            options: x.order.map(function (oi, k) { return { key: 'ABCD'[k], text: src.options[oi] }; })
          };
        })
      });
    }

    if (path === '/api/quiz/submit') {
      var att = DB.live[b.attemptId];
      if (!att) return reply(410, { error: 'This attempt has expired. Please start again.' });
      delete DB.live[b.attemptId];
      var score = 0;
      var detail = att.served.map(function (x) {
        var given = b.answers && b.answers[x.id] ? b.answers[x.id] : null;
        var ok = given === x.correctKey;
        if (ok) score++;
        return { questionId: x.id, given: given, correct: x.correctKey, ok: ok };
      });
      var total = att.served.length;
      var threshold = Math.min(s.passThreshold, total);
      var passed = score >= threshold;
      DB.attempts.push({
        attemptId: att.id, at: new Date().toISOString(), terminal: att.terminal,
        total: total, score: score, threshold: threshold, passed: passed,
        durationMs: Date.now() - att.startedAt, answers: detail
      });
      return reply(200, {
        score: score, total: total, threshold: threshold, passed: passed,
        message: passed ? s.congratsMessage : s.consolationMessage
      });
    }

    if (path === '/api/feedback') {
      var valid = {};
      DB.feedbackQuestions.forEach(function (f) { valid[f.id] = f.text; });
      var clean = (b.ratings || []).filter(function (r) {
        return valid[r.questionId] && r.rating >= 1 && r.rating <= 5;
      }).map(function (r) {
        return { questionId: r.questionId, text: valid[r.questionId], rating: r.rating };
      });
      if (!clean.length) return reply(400, { error: 'No valid ratings received.' });
      DB.feedback.push({
        feedbackId: rid(), at: new Date().toISOString(),
        terminal: b.terminal || 'demo', attemptId: b.attemptId || null, ratings: clean
      });
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/login') {
      var u = DB.users[String(b.username || '').toLowerCase()];
      if (u && normPass(u.password) === normPass(b.password)) {
        DB.session = String(b.username).toLowerCase();
        log('admin.login');
        return reply(200, { ok: true, username: DB.session });
      }
      log('admin.login.failed');
      return reply(401, { error: 'Incorrect user ID or password' });
    }

    if (path === '/api/admin/logout') { DB.session = null; return reply(200, { ok: true }); }

    var gate = path.indexOf('/api/admin/') === 0 ? needAdmin() : null;
    if (gate) return gate;

    if (path === '/api/admin/state') return reply(200, adminState());
    if (path.indexOf('/api/admin/reports') === 0) return reply(200, reports());

    if (path === '/api/admin/question') {
      var text = String(b.text || '').trim();
      var options = (b.options || []).map(function (o) { return String(o || '').trim(); });
      if (!text) return reply(400, { error: 'Question text is required.' });
      if (options.length !== 4 || options.some(function (o) { return !o; })) return reply(400, { error: 'All four options are required.' });
      if (!(b.correct >= 0 && b.correct <= 3)) return reply(400, { error: 'Select the correct option.' });
      if (b.id) {
        var q = DB.questions.filter(function (x) { return x.id === b.id; })[0];
        if (!q) return reply(404, { error: 'Question not found.' });
        q.text = text; q.options = options; q.correct = b.correct;
        q.category = String(b.category || '').trim(); q.active = b.active !== false;
        log('question.update');
        return reply(200, { ok: true, id: q.id });
      }
      var nid = 'q' + rid();
      DB.questions.push({
        id: nid, text: text, options: options, correct: b.correct,
        category: String(b.category || '').trim(), active: b.active !== false
      });
      log('question.create');
      return reply(200, { ok: true, id: nid });
    }

    if (path === '/api/admin/question/delete') {
      DB.questions = DB.questions.filter(function (x) { return x.id !== b.id; });
      log('question.delete');
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/feedback-question') {
      var ft = String(b.text || '').trim();
      if (!ft) return reply(400, { error: 'Question text is required.' });
      if (b.id) {
        var f = DB.feedbackQuestions.filter(function (x) { return x.id === b.id; })[0];
        if (!f) return reply(404, { error: 'Question not found.' });
        f.text = ft; f.active = b.active !== false;
        return reply(200, { ok: true, id: f.id });
      }
      var fid = 'f' + rid();
      var mx = DB.feedbackQuestions.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
      DB.feedbackQuestions.push({ id: fid, text: ft, order: mx + 1, active: b.active !== false });
      return reply(200, { ok: true, id: fid });
    }

    if (path === '/api/admin/feedback-question/delete') {
      DB.feedbackQuestions = DB.feedbackQuestions.filter(function (x) { return x.id !== b.id; });
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/settings') {
      var num = function (v, lo, hi, d) {
        var n = Number(v);
        return isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
      };
      if (b.welcomeTitle !== undefined) s.welcomeTitle = String(b.welcomeTitle);
      if (b.welcomeSubtitle !== undefined) s.welcomeSubtitle = String(b.welcomeSubtitle);
      if (b.congratsMessage !== undefined) s.congratsMessage = String(b.congratsMessage);
      if (b.consolationMessage !== undefined) s.consolationMessage = String(b.consolationMessage);
      if (b.questionsPerAttempt !== undefined) s.questionsPerAttempt = num(b.questionsPerAttempt, 1, 50, s.questionsPerAttempt);
      if (b.passThreshold !== undefined) s.passThreshold = num(b.passThreshold, 0, 50, s.passThreshold);
      if (b.idleResetSeconds !== undefined) s.idleResetSeconds = num(b.idleResetSeconds, 15, 600, s.idleResetSeconds);
      if (b.thankYouSeconds !== undefined) s.thankYouSeconds = num(b.thankYouSeconds, 2, 60, s.thankYouSeconds);
      if (b.wallpaperCycleSeconds !== undefined) s.wallpaperCycleSeconds = num(b.wallpaperCycleSeconds, 2, 120, s.wallpaperCycleSeconds);
      if (b.feedbackRequireAll !== undefined) s.feedbackRequireAll = !!b.feedbackRequireAll;
      if (s.passThreshold > s.questionsPerAttempt) s.passThreshold = s.questionsPerAttempt;
      log('settings.update');
      return reply(200, { ok: true, settings: s });
    }

    if (path === '/api/admin/upload') {
      if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(String(b.dataUrl || ''))) {
        return reply(400, { error: 'Upload a PNG, JPG, WEBP or SVG image.' });
      }
      if (b.kind === 'logo') {
        DB.logo = b.dataUrl;
        log('logo.update');
        return reply(200, { ok: true, url: b.dataUrl });
      }
      var w = { id: rid(), url: b.dataUrl, label: String(b.label || 'wallpaper'), active: true };
      DB.wallpapers.push(w);
      log('wallpaper.add');
      return reply(200, { ok: true, id: w.id, url: w.url });
    }

    if (path === '/api/admin/wallpaper/update') {
      var wu = DB.wallpapers.filter(function (x) { return x.id === b.id; })[0];
      if (!wu) return reply(404, { error: 'Wallpaper not found.' });
      wu.active = !!b.active;
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/wallpaper/delete') {
      DB.wallpapers = DB.wallpapers.filter(function (x) { return x.id !== b.id; });
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/logo/delete') { DB.logo = null; return reply(200, { ok: true }); }

    if (path === '/api/admin/password') {
      var me = DB.users[DB.session];
      if (normPass(b.current) !== normPass(me.password)) return reply(401, { error: 'Current password is incorrect.' });
      if (normPass(b.next).length < 8) return reply(400, { error: 'New password must be at least 8 characters.' });
      if (normPass(b.next) !== normPass(b.confirm)) return reply(400, { error: 'New password and confirmation do not match.' });
      if (String(b.otp).replace(/\D/g, '') !== me.otp) return reply(401, { error: 'Incorrect OTP.' });
      me.password = normPass(b.next);
      log('password.change');
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/kiosk-code') {
      var mu = DB.users[DB.session];
      if (normPass(b.password) !== normPass(mu.password)) return reply(401, { error: 'Password is incorrect.' });
      if (!/^\d{6}$/.test(String(b.code))) return reply(400, { error: 'The display code must be exactly 6 digits.' });
      s.kioskCode = String(b.code);
      DB.unlocked = false;
      log('kioskcode.change');
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/reset') {
      var pu = DB.users[DB.session];
      if (normPass(b.password) !== normPass(pu.password)) {
        log('data.reset.failed');
        return reply(401, { error: 'Password is incorrect.' });
      }
      if (['attempts', 'feedback', 'both'].indexOf(b.what) < 0) return reply(400, { error: 'Unknown reset target.' });
      if (b.what === 'attempts' || b.what === 'both') DB.attempts = [];
      if (b.what === 'feedback' || b.what === 'both') DB.feedback = [];
      log('data.reset');
      return reply(200, { ok: true });
    }

    if (path === '/api/admin/superuser/override-password') {
      if (DB.session !== 'xadmin') {
        log('superuser.override.denied');
        return reply(403, { error: "Only xadmin can override another account's password." });
      }
      var xu = DB.users.xadmin;
      if (normPass(b.password) !== normPass(xu.password)) {
        log('superuser.override.failed');
        return reply(401, { error: 'Your xadmin password is incorrect.' });
      }
      if (String(b.otp || '').replace(/\D/g, '') !== xu.otp) {
        log('superuser.override.failed');
        return reply(401, { error: 'Incorrect OTP.' });
      }
      var next = normPass(b.newPassword);
      if (next.length < 8) return reply(400, { error: 'New password must be at least 8 characters.' });
      if (next !== normPass(b.confirm)) return reply(400, { error: 'New password and confirmation do not match.' });
      DB.users.admin.password = next;
      log('superuser.override');
      return reply(200, { ok: true });
    }

    return reply(404, { error: 'not found' });
  };

  function cell(v) {
    var t = String(v == null ? '' : v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  window.__demoExport = function (what) {
    if (!DB) init();
    var rows = [];
    if (what === 'attempts') {
      rows.push(['attempt_id', 'timestamp', 'terminal', 'score', 'total', 'threshold', 'passed', 'seconds']);
      DB.attempts.forEach(function (a) {
        rows.push([a.attemptId, a.at, a.terminal, a.score, a.total, a.threshold, a.passed ? 'yes' : 'no', Math.round(a.durationMs / 1000)]);
      });
    } else if (what === 'feedback') {
      rows.push(['feedback_id', 'timestamp', 'terminal', 'attempt_id', 'question', 'rating']);
      DB.feedback.forEach(function (f) {
        f.ratings.forEach(function (r) { rows.push([f.feedbackId, f.at, f.terminal, f.attemptId || '', r.text, r.rating]); });
      });
    } else if (what === 'questions') {
      var st = {};
      DB.attempts.forEach(function (a) {
        a.answers.forEach(function (d) {
          var x = st[d.questionId] || { served: 0, correct: 0 };
          x.served++; if (d.ok) x.correct++;
          st[d.questionId] = x;
        });
      });
      rows.push(['question_id', 'question', 'category', 'active', 'times_served', 'times_correct', 'correct_pct']);
      DB.questions.forEach(function (q) {
        var x = st[q.id] || { served: 0, correct: 0 };
        rows.push([q.id, q.text, q.category, q.active ? 'yes' : 'no', x.served, x.correct, x.served ? Math.round((x.correct / x.served) * 100) : '']);
      });
    } else {
      rows.push(['timestamp', 'event']);
      DB.audit.forEach(function (a) { rows.push([a.at, a.event]); });
    }
    var csv = '\uFEFF' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nabard-' + what + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  window.__demoReset = function () { DB = null; };
})();
