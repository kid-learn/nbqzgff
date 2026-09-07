(function () {
  'use strict';

  var st = { data: null, editQ: null, editF: null };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, body) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'X-Requested-With': 'nabard-quiz' }, credentials: 'same-origin' };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && j.code === 'nosession') {
          showLogin();
          throw new Error('Your session has ended. Sign in again.');
        }
        if (!r.ok) throw new Error(j.error || 'Something went wrong.');
        return j;
      });
    });
  }

  /* ------------------------------------------------------- reveal toggle */

  function eyeSvg(shown) {
    return '<svg aria-hidden="true"><use href="#' + (shown ? 'i-eye-off' : 'i-eye') + '"/></svg>';
  }

  function attachReveal() {
    Array.prototype.forEach.call(document.querySelectorAll('input[type=password]'), function (input) {
      if (input.closest('.otp-row') || input.dataset.reveal) return;
      input.dataset.reveal = '1';
      var wrap = document.createElement('div');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-eye';
      btn.innerHTML = eyeSvg(false);
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function () {
        var shown = input.type === 'text';
        input.type = shown ? 'password' : 'text';
        btn.innerHTML = eyeSvg(!shown);
        btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
        btn.setAttribute('aria-pressed', shown ? 'false' : 'true');
        input.focus();
      });
      wrap.appendChild(btn);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.otp-row'), function (row) {
      if (row.dataset.reveal) return;
      row.dataset.reveal = '1';
      var boxes = Array.prototype.slice.call(row.children);
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'otp-reveal';
      t.innerHTML = eyeSvg(false) + '<span>Show OTP</span>';
      t.setAttribute('aria-pressed', 'false');
      t.addEventListener('click', function () {
        var shown = boxes[0].type === 'text';
        boxes.forEach(function (b) {
          b.type = shown ? 'password' : 'text';
          b.style.webkitTextSecurity = shown ? 'disc' : 'none';
        });
        t.innerHTML = eyeSvg(!shown) + '<span>' + (shown ? 'Show OTP' : 'Hide OTP') + '</span>';
        t.setAttribute('aria-pressed', shown ? 'false' : 'true');
      });
      row.parentNode.insertBefore(t, row.nextSibling);
    });
  }

  function scrollTo$(id) {
    var el = $(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function note(el, msg, kind) {
    el.innerHTML = '<div class="note ' + (kind || 'ok') + '">' + esc(msg) + '</div>';
    if (kind !== 'bad') setTimeout(function () { if (el.firstChild) el.innerHTML = ''; }, 5000);
  }

  /* --------------------------------------------------------------- auth */

  function showLogin() {
    $('login-shell').hidden = false;
    $('panel-shell').hidden = true;
  }

  function showPanel() {
    $('login-shell').hidden = true;
    $('panel-shell').hidden = false;
  }

  function login() {
    var u = $('li-user').value.trim();
    var p = $('li-pass').value;
    if (!u || !p) { note($('li-note'), 'Enter your user ID and password.', 'bad'); return; }
    $('li-go').disabled = true;
    api('/api/admin/login', { username: u, password: p })
      .then(function () {
        $('li-go').disabled = false;
        $('li-pass').value = '';
        $('li-note').innerHTML = '';
        load();
      })
      .catch(function (e) {
        $('li-go').disabled = false;
        var n = $('li-pass').value.length;
        $('li-pass').value = '';
        note($('li-note'), e.message + ' (' + n + ' characters entered — use the eye icon to check what you typed)', 'bad');
      });
  }

  /* --------------------------------------------------------------- load */

  function load() {
    return api('/api/admin/state').then(function (d) {
      st.data = d;
      showPanel();
      $('who-name').textContent = d.username;
      $('super-card').hidden = d.username !== 'xadmin';
      paintSettings();
      paintQuestions();
      paintFeedbackQuestions();
      paintBranding();
      return loadReports();
    }).catch(function () { /* showLogin already handled */ });
  }

  /* ------------------------------------------------------------ reports */

  function loadReports() {
    return api('/api/admin/reports').then(function (r) {
      var t = r.totals;
      $('rep-metrics').innerHTML = [
        ['Attempts today', t.attemptsToday],
        ['Attempts total', t.attemptsAll],
        ['Pass rate', t.passRate + '%'],
        ['Average score', t.avgScore],
        ['Average time', t.avgSeconds + 's'],
        ['Feedback responses', t.feedbackCount]
      ].map(function (m) {
        return '<div class="metric"><div class="l">' + esc(m[0]) + '</div><div class="v">' + esc(m[1]) + '</div></div>';
      }).join('');

      var hours = Object.keys(r.byHour).map(Number).sort(function (a, b) { return a - b; });
      if (!hours.length) {
        $('rep-bars').innerHTML = '<p class="hint" style="margin:auto">No attempts recorded yet.</p>';
        $('rep-hour-from').textContent = '';
        $('rep-hour-to').textContent = '';
      } else {
        var max = Math.max.apply(null, hours.map(function (h) { return r.byHour[h]; }));
        $('rep-bars').innerHTML = hours.map(function (h) {
          var pct = Math.round((r.byHour[h] / max) * 100);
          return '<div class="bar" style="height:' + pct + '%" title="' + h + ':00 — ' + r.byHour[h] + ' attempts"></div>';
        }).join('');
        $('rep-hour-from').textContent = hours[0] + ':00';
        $('rep-hour-to').textContent = hours[hours.length - 1] + ':00';
      }

      var qb = $('rep-questions').querySelector('tbody');
      if (!r.questionStats.length) {
        qb.innerHTML = '<tr><td class="hint">No data yet. Difficulty appears once participants have played.</td></tr>';
      } else {
        qb.innerHTML = '<tr><th>Question</th><th class="n">Served</th><th class="n">Correct</th></tr>' +
          r.questionStats.slice(0, 12).map(function (q) {
            var cls = q.pct < 30 ? 'pct-bad' : q.pct < 50 ? 'pct-mid' : '';
            return '<tr><td>' + esc(q.text) + '</td><td class="n">' + q.served +
              '</td><td class="n ' + cls + '">' + q.pct + '%</td></tr>';
          }).join('');
      }

      $('rep-feedback').innerHTML = r.feedbackStats.map(function (f) {
        return '<div style="margin-bottom:12px"><div style="font-size:14px">' + esc(f.text) + '</div>' +
          '<div class="hint">Average ' + f.average + ' of 5 from ' + f.responses + ' response' + (f.responses === 1 ? '' : 's') +
          ' &middot; ' + f.dist.map(function (d, i) { return (i + 1) + '★:' + d; }).join('  ') + '</div></div>';
      }).join('') || '<p class="hint">No feedback yet.</p>';

      $('rep-audit').innerHTML = r.recentAudit.map(function (a) {
        return '<div><b>' + esc(a.event) + '</b> &middot; ' + esc(new Date(a.at).toLocaleString()) + '</div>';
      }).join('') || '<p class="hint">Nothing logged yet.</p>';
    });
  }

  /* ---------------------------------------------------------- questions */

  function optionInputs() {
    var host = $('qf-options');
    if (host.children.length) return;
    ['A', 'B', 'C', 'D'].forEach(function (k, i) {
      var wrap = document.createElement('div');
      wrap.innerHTML = '<label for="qf-o' + i + '">Option ' + k + '</label>' +
        '<input type="text" id="qf-o' + i + '" maxlength="200">';
      host.appendChild(wrap);
    });
  }

  function clearQForm() {
    st.editQ = null;
    $('q-form-title').textContent = 'Add a question';
    $('qf-text').value = '';
    for (var i = 0; i < 4; i++) $('qf-o' + i).value = '';
    $('qf-correct').value = '0';
    $('qf-cat').value = '';
    $('qf-active').checked = true;
    $('qf-note').innerHTML = '';
  }

  function editQuestion(id) {
    var q = st.data.questions.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    st.editQ = id;
    $('q-form-title').textContent = 'Edit question';
    $('qf-text').value = q.text;
    for (var i = 0; i < 4; i++) $('qf-o' + i).value = q.options[i] || '';
    $('qf-correct').value = String(q.correct);
    $('qf-cat').value = q.category || '';
    $('qf-active').checked = q.active;
    scrollTo$('p-questions');
  }

  function saveQuestion() {
    var body = {
      id: st.editQ,
      text: $('qf-text').value,
      options: [0, 1, 2, 3].map(function (i) { return $('qf-o' + i).value; }),
      correct: Number($('qf-correct').value),
      category: $('qf-cat').value,
      active: $('qf-active').checked
    };
    if (!body.text.trim()) { note($('qf-note'), 'Enter the question text.', 'bad'); return; }
    if (body.options.some(function (o) { return !o.trim(); })) { note($('qf-note'), 'Fill in all four options.', 'bad'); return; }
    api('/api/admin/question', body).then(function () {
      note($('qf-note'), st.editQ ? 'Question updated.' : 'Question added.');
      clearQForm();
      return load();
    }).catch(function (e) { note($('qf-note'), e.message, 'bad'); });
  }

  function deleteQuestion(id) {
    var q = st.data.questions.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    if (!window.confirm('Delete this question permanently?\n\n' + q.text + '\n\nTo keep it out of the draw without losing it, uncheck "Include this question in the draw" instead.')) return;
    api('/api/admin/question/delete', { id: id }).then(load);
  }

  function paintQuestions() {
    optionInputs();
    var term = $('q-search').value.trim().toLowerCase();
    var list = st.data.questions.filter(function (q) {
      return !term || q.text.toLowerCase().indexOf(term) >= 0 || (q.category || '').toLowerCase().indexOf(term) >= 0;
    });
    $('q-count').textContent = st.data.questions.length;
    var host = $('q-list');
    host.innerHTML = '';
    if (!list.length) {
      host.innerHTML = '<p class="hint">No questions match that search.</p>';
      return;
    }
    list.forEach(function (q, i) {
      var row = document.createElement('div');
      row.className = 'q-item';
      row.innerHTML =
        '<span class="q-num' + (q.active ? '' : ' off') + '">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="q-txt">' + esc(q.text) +
        '<span class="q-meta">' + (q.active ? 'Correct: ' + 'ABCD'[q.correct] : 'Not in the draw') +
        (q.category ? ' &middot; ' + esc(q.category) : '') + '</span></span>';
      var edit = document.createElement('button');
      edit.className = 'icon-btn';
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { editQuestion(q.id); });
      var del = document.createElement('button');
      del.className = 'icon-btn del';
      del.textContent = 'Delete';
      del.addEventListener('click', function () { deleteQuestion(q.id); });
      row.appendChild(edit);
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  /* --------------------------------------------------- feedback questions */

  function clearFForm() {
    st.editF = null;
    $('f-form-title').textContent = 'Add a feedback question';
    $('ff-text').value = '';
    $('ff-active').checked = true;
    $('ff-note').innerHTML = '';
  }

  function paintFeedbackQuestions() {
    var host = $('f-list');
    host.innerHTML = '';
    if (!st.data.feedbackQuestions.length) {
      host.innerHTML = '<p class="hint">No feedback questions yet. Participants will see an empty feedback screen.</p>';
      return;
    }
    st.data.feedbackQuestions.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'q-item';
      row.innerHTML = '<span class="q-num' + (f.active ? '' : ' off') + '">' + (i + 1) + '</span>' +
        '<span class="q-txt">' + esc(f.text) +
        '<span class="q-meta">' + (f.active ? 'Shown to participants' : 'Hidden') + '</span></span>';
      var edit = document.createElement('button');
      edit.className = 'icon-btn';
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () {
        st.editF = f.id;
        $('f-form-title').textContent = 'Edit feedback question';
        $('ff-text').value = f.text;
        $('ff-active').checked = f.active;
        scrollTo$('p-feedback');
      });
      var del = document.createElement('button');
      del.className = 'icon-btn del';
      del.textContent = 'Delete';
      del.addEventListener('click', function () {
        if (!window.confirm('Delete this feedback question?\n\n' + f.text)) return;
        api('/api/admin/feedback-question/delete', { id: f.id }).then(load);
      });
      row.appendChild(edit);
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  function saveFeedbackQuestion() {
    var text = $('ff-text').value.trim();
    if (!text) { note($('ff-note'), 'Enter the question text.', 'bad'); return; }
    api('/api/admin/feedback-question', { id: st.editF, text: text, active: $('ff-active').checked })
      .then(function () {
        note($('ff-note'), st.editF ? 'Question updated.' : 'Question added.');
        clearFForm();
        return load();
      })
      .catch(function (e) { note($('ff-note'), e.message, 'bad'); });
  }

  /* ------------------------------------------------------------ branding */

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsDataURL(file);
    });
  }

  function upload(kind, input, noteEl) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { note(noteEl, 'That image is larger than 6 MB.', 'bad'); input.value = ''; return; }
    readAsDataUrl(file).then(function (dataUrl) {
      return api('/api/admin/upload', { kind: kind, dataUrl: dataUrl, label: file.name });
    }).then(function () {
      note(noteEl, kind === 'logo' ? 'Logo updated. It now appears on every screen.' : 'Wallpaper added.');
      input.value = '';
      return load();
    }).catch(function (e) { input.value = ''; note(noteEl, e.message, 'bad'); });
  }

  function paintBranding() {
    var pv = $('logo-preview');
    pv.innerHTML = st.data.logo
      ? '<div style="background:var(--green-dark);border-radius:9px;padding:14px;text-align:center">' +
        '<img src="' + esc(st.data.logo) + '" alt="Current logo" style="max-height:60px;max-width:100%;object-fit:contain">' +
        '</div><p class="hint">Shown on a dark green header, so a white or transparent-background logo works best.</p>'
      : '<p class="hint">No logo uploaded. Screens fall back to a plain NABARD wordmark until you add one.</p>';

    var host = $('wall-list');
    host.innerHTML = '';
    if (!st.data.wallpapers.length) {
      host.innerHTML = '<p class="hint">No wallpapers. The home screen shows a plain green background.</p>';
    }
    st.data.wallpapers.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'thumb' + (w.active ? '' : ' off');
      d.innerHTML = '<img src="' + esc(w.url) + '" alt="' + esc(w.label) + '">';
      var acts = document.createElement('div');
      acts.className = 'acts';
      var toggle = document.createElement('button');
      toggle.className = 'icon-btn';
      toggle.textContent = w.active ? 'On' : 'Off';
      toggle.addEventListener('click', function () {
        api('/api/admin/wallpaper/update', { id: w.id, active: !w.active }).then(load);
      });
      var del = document.createElement('button');
      del.className = 'icon-btn del';
      del.textContent = 'Delete';
      del.addEventListener('click', function () {
        if (!window.confirm('Delete this wallpaper?')) return;
        api('/api/admin/wallpaper/delete', { id: w.id }).then(load);
      });
      acts.appendChild(toggle);
      acts.appendChild(del);
      d.appendChild(acts);
      host.appendChild(d);
    });
    $('set-cycle').value = st.data.settings.wallpaperCycleSeconds;
  }

  /* ------------------------------------------------------------ settings */

  function paintSettings() {
    var s = st.data.settings;
    $('set-count').value = s.questionsPerAttempt;
    $('set-threshold').value = s.passThreshold;
    $('set-idle').value = s.idleResetSeconds;
    $('set-thanks').value = s.thankYouSeconds;
    $('set-title').value = s.welcomeTitle;
    $('set-subtitle').value = s.welcomeSubtitle;
    $('set-congrats').value = s.congratsMessage;
    $('set-consolation').value = s.consolationMessage;
    $('set-requireall').checked = !!s.feedbackRequireAll;
    checkThreshold();
  }

  function checkThreshold() {
    var n = Number($('set-count').value);
    var t = Number($('set-threshold').value);
    var el = $('threshold-warn');
    if (t > n) {
      el.innerHTML = '<div class="note bad">The pass threshold cannot be higher than the number of questions. It will be capped at ' + n + '.</div>';
    } else if (n > 0 && t / n >= 0.8) {
      el.innerHTML = '<div class="note warn">A threshold of ' + t + ' out of ' + n + ' is demanding. Expect a low pass rate and plan gift stock accordingly.</div>';
    } else {
      el.innerHTML = '';
    }
  }

  function saveSettings() {
    api('/api/admin/settings', {
      questionsPerAttempt: $('set-count').value,
      passThreshold: $('set-threshold').value,
      idleResetSeconds: $('set-idle').value,
      thankYouSeconds: $('set-thanks').value,
      welcomeTitle: $('set-title').value,
      welcomeSubtitle: $('set-subtitle').value,
      congratsMessage: $('set-congrats').value,
      consolationMessage: $('set-consolation').value,
      feedbackRequireAll: $('set-requireall').checked
    }).then(function () {
      note($('set-note'), 'Settings saved. Terminals pick these up on their next reset.');
      return load();
    }).catch(function (e) { note($('set-note'), e.message, 'bad'); });
  }

  /* ------------------------------------------------------------ security */

  function otpValue(rowId) {
    return Array.prototype.map.call($(rowId || 'otp-row').children, function (i) { return i.value; }).join('');
  }

  function clearOtp(rowId) {
    Array.prototype.forEach.call($(rowId || 'otp-row').children, function (i) { i.value = ''; });
  }

  function wireOtp(rowId) {
    var boxes = Array.prototype.slice.call($(rowId || 'otp-row').children);
    boxes.forEach(function (b, i) {
      b.addEventListener('input', function () {
        b.value = b.value.replace(/\D/g, '').slice(0, 1);
        if (b.value && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus();
      });
    });
  }

  function changePassword() {
    var otp = otpValue();
    if (otp.length !== 4) { note($('pw-note'), 'Enter all four OTP digits.', 'bad'); return; }
    if ($('pw-next').value.length < 8) { note($('pw-note'), 'The new password must be at least 8 characters.', 'bad'); return; }
    if ($('pw-next').value !== $('pw-confirm').value) { note($('pw-note'), 'The new password and confirmation do not match.', 'bad'); return; }
    api('/api/admin/password', {
      current: $('pw-current').value,
      next: $('pw-next').value,
      confirm: $('pw-confirm').value,
      otp: otp
    }).then(function () {
      ['pw-current', 'pw-next', 'pw-confirm'].forEach(function (id) { $(id).value = ''; });
      clearOtp();
      note($('pw-note'), 'Password updated. Use the new one next time you sign in.');
    }).catch(function (e) {
      ['pw-current', 'pw-next', 'pw-confirm'].forEach(function (id) { $(id).value = ''; });
      clearOtp();
      note($('pw-note'), e.message, 'bad');
    });
  }

  function changeKioskCode() {
    var code = $('kc-code').value;
    if (!/^\d{6}$/.test(code)) { note($('kc-note'), 'The display code must be exactly 6 digits.', 'bad'); return; }
    api('/api/admin/kiosk-code', { code: code, password: $('kc-pass').value })
      .then(function () {
        $('kc-code').value = '';
        $('kc-pass').value = '';
        note($('kc-note'), 'Display code updated. Every terminal now needs the new code.');
      })
      .catch(function (e) {
        $('kc-pass').value = '';
        note($('kc-note'), e.message, 'bad');
      });
  }

  /* ------------------------------------------------------------ superuser */

  const DEFAULT_KIOSK_CODE = '120782';

  function overrideAdminPassword() {
    var otp = otpValue('su-otp-row');
    if (otp.length !== 4) { note($('su-note'), 'Enter all four digits of your xadmin OTP.', 'bad'); return; }
    if ($('su-new').value.length < 8) { note($('su-note'), 'The new password must be at least 8 characters.', 'bad'); return; }
    if ($('su-new').value !== $('su-confirm').value) { note($('su-note'), 'The new password and confirmation do not match.', 'bad'); return; }
    if (!window.confirm('This immediately replaces admin\'s password and signs admin out everywhere. Continue?')) return;
    api('/api/admin/superuser/override-password', {
      newPassword: $('su-new').value,
      confirm: $('su-confirm').value,
      password: $('su-pass').value,
      otp: otp
    }).then(function () {
      ['su-new', 'su-confirm', 'su-pass'].forEach(function (id) { $(id).value = ''; });
      clearOtp('su-otp-row');
      note($('su-note'), 'admin\'s password has been overwritten. Share the new password with them directly.');
    }).catch(function (e) {
      $('su-pass').value = '';
      clearOtp('su-otp-row');
      note($('su-note'), e.message, 'bad');
    });
  }

  function restoreDefaultKioskCode() {
    if (!window.confirm('Reset the display unlock code back to the default (' + DEFAULT_KIOSK_CODE + ')?')) return;
    api('/api/admin/kiosk-code', { code: DEFAULT_KIOSK_CODE, password: $('su-code-pass').value })
      .then(function () {
        $('su-code-pass').value = '';
        note($('su-code-note'), 'Display code restored to the default. Every terminal now needs ' + DEFAULT_KIOSK_CODE + '.');
      })
      .catch(function (e) {
        $('su-code-pass').value = '';
        note($('su-code-note'), e.message, 'bad');
      });
  }

  /* --------------------------------------------------------------- reset */

  function resetData(what) {
    var pwd = $('reset-password').value;
    if (!pwd) { note($('reset-note'), 'Enter your password to confirm.', 'bad'); return; }
    var label = what === 'both' ? 'every quiz attempt and every feedback response'
      : what === 'attempts' ? 'every quiz attempt'
      : 'every feedback response';
    if (!window.confirm('This permanently deletes ' + label + ' recorded so far. This cannot be undone.\n\nContinue?')) return;
    api('/api/admin/reset', { what: what, password: pwd }).then(function () {
      $('reset-password').value = '';
      note($('reset-note'), 'Data reset. Reports now reflect zero recorded activity.');
      return loadReports();
    }).catch(function (e) {
      $('reset-password').value = '';
      note($('reset-note'), e.message, 'bad');
    });
  }

  /* ---------------------------------------------------------------- wire */

  function wire() {
    $('li-go').addEventListener('click', login);
    $('li-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
    $('li-user').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('li-pass').focus(); });
    $('li-back').addEventListener('click', function () { window.location.href = '/'; });
    $('btn-logout').addEventListener('click', function () {
      api('/api/admin/logout', {}).then(function () { window.location.href = '/'; });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.a-tab'), function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.a-tab'), function (t) { t.classList.remove('on'); });
        Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.remove('on'); });
        tab.classList.add('on');
        $(tab.dataset.panel).classList.add('on');
        $('panel-title').textContent = tab.textContent;
        window.scrollTo(0, 0);
      });
    });

    $('qf-save').addEventListener('click', saveQuestion);
    $('qf-clear').addEventListener('click', clearQForm);
    $('q-search').addEventListener('input', paintQuestions);
    $('ff-save').addEventListener('click', saveFeedbackQuestion);
    $('ff-clear').addEventListener('click', clearFForm);

    $('logo-file').addEventListener('change', function () { upload('logo', this, $('logo-note')); });
    $('logo-remove').addEventListener('click', function () {
      if (!window.confirm('Remove the uploaded logo? Screens will fall back to a plain wordmark.')) return;
      api('/api/admin/logo/delete', {}).then(function () { note($('logo-note'), 'Logo removed.'); return load(); });
    });
    $('wall-file').addEventListener('change', function () { upload('wallpaper', this, $('wall-note')); });
    $('cycle-save').addEventListener('click', function () {
      api('/api/admin/settings', { wallpaperCycleSeconds: $('set-cycle').value })
        .then(function () { note($('wall-note'), 'Cycling interval saved.'); return load(); })
        .catch(function (e) { note($('wall-note'), e.message, 'bad'); });
    });

    $('set-save').addEventListener('click', saveSettings);
    $('set-count').addEventListener('input', checkThreshold);
    $('set-threshold').addEventListener('input', checkThreshold);

    attachReveal();
    $('pw-save').addEventListener('click', changePassword);
    $('kc-save').addEventListener('click', changeKioskCode);
    $('reset-attempts').addEventListener('click', function () { resetData('attempts'); });
    $('reset-feedback').addEventListener('click', function () { resetData('feedback'); });
    $('reset-both').addEventListener('click', function () { resetData('both'); });
    $('su-save').addEventListener('click', overrideAdminPassword);
    $('su-code-reset').addEventListener('click', restoreDefaultKioskCode);
    wireOtp('otp-row');
    wireOtp('su-otp-row');

    Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (b) {
      b.addEventListener('click', function () {
        window.location.href = '/api/admin/export?what=' + encodeURIComponent(b.dataset.export);
      });
    });
  }

  function boot() {
    wire();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
