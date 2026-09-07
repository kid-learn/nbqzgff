(function () {
  'use strict';

  var cfg = null;
  var state = { code: '', quiz: null, answers: {}, idx: 0, lastAttempt: null, ratings: {} };
  var timers = { wall: null, idle: null, thanks: null };

  var $ = function (id) { return document.getElementById(id); };
  var screens = ['s-launcher', 's-lock', 's-home', 's-quiz', 's-result', 's-feedback', 's-thanks'];

  function terminal() {
    var t;
    try { t = localStorage.getItem('nq_terminal'); } catch (e) { t = null; }
    if (!t) {
      t = 'T' + Math.floor(Math.random() * 900 + 100);
      try { localStorage.setItem('nq_terminal', t); } catch (e) {}
    }
    return t;
  }

  function api(path, body) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'X-Requested-With': 'nabard-quiz' }, credentials: 'same-origin' };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Something went wrong. Please ask our team for help.');
        return j;
      });
    });
  }

  function show(id) {
    screens.forEach(function (s) { $(s).classList.toggle('on', s === id); });
    window.scrollTo(0, 0);
    armIdle(id);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ branding */

  function logoHtml(size) {
    if (cfg && cfg.logo) {
      return '<img class="logo-img' + (size === 'sm' ? ' sm' : '') + '" src="' + esc(cfg.logo) + '" alt="NABARD">';
    }
    var cls = size === 'sm' ? 'font-size:14px' : '';
    var col = size === 'sm' ? 'var(--green-dark)' : 'currentColor';
    return '<span class="logo-fallback" style="' + cls + ';color:' + col + '">' +
      '<svg width="' + (size === 'sm' ? 18 : 26) + '" height="' + (size === 'sm' ? 18 : 26) + '" aria-hidden="true"><use href="#i-sprout"/></svg>NABARD</span>';
  }

  function paintBranding() {
    $('logo-launcher').innerHTML = logoHtml();
    $('logo-launcher').style.color = '#fff';
    $('logo-home').innerHTML = logoHtml();
    $('logo-home').style.color = 'var(--green-dark)';
    $('logo-quiz').innerHTML = logoHtml('sm');
  }

  /* ---------------------------------------------------------- wallpapers */

  function startWalls() {
    var host = $('walls');
    var dots = $('wall-dots');
    host.innerHTML = '';
    dots.innerHTML = '';
    clearInterval(timers.wall);

    var list = (cfg.wallpapers || []).slice();
    if (!list.length) { host.style.background = 'var(--green-light)'; return; }

    list.forEach(function (url, i) {
      var d = document.createElement('div');
      d.className = 'wall' + (i === 0 ? ' on' : '');
      d.style.backgroundImage = 'url("' + url + '")';
      host.appendChild(d);
      var dot = document.createElement('span');
      dot.className = 'wall-dot' + (i === 0 ? ' on' : '');
      dots.appendChild(dot);
    });
    if (list.length < 2) return;

    var at = 0;
    var every = Math.max(2, Number(cfg.wallpaperCycleSeconds) || 5) * 1000;
    timers.wall = setInterval(function () {
      var walls = host.children, marks = dots.children;
      walls[at].classList.remove('on');
      marks[at].classList.remove('on');
      at = (at + 1) % walls.length;
      walls[at].classList.add('on');
      marks[at].classList.add('on');
    }, every);
  }

  /* ------------------------------------------------------------- keypad */

  function paintDots() {
    var h = '';
    for (var i = 0; i < 6; i++) h += '<span class="dot' + (i < state.code.length ? ' fill' : '') + '"></span>';
    $('lock-dots').innerHTML = h;
  }

  function buildKeys() {
    var host = $('lock-keys');
    host.innerHTML = '';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'];
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'key' + (k === 'clear' ? ' ghost' : k === 'ok' ? ' go' : '');
      if (k === 'ok') {
        b.innerHTML = '<svg width="20" height="20" style="transform:rotate(180deg)" aria-hidden="true"><use href="#i-back"/></svg>';
        b.setAttribute('aria-label', 'Confirm code');
      } else {
        b.textContent = k;
      }
      b.addEventListener('click', function () { tapKey(k); });
      host.appendChild(b);
    });
  }

  function tapKey(k) {
    $('lock-msg').textContent = '';
    if (k === 'clear') { state.code = ''; paintDots(); return; }
    if (k === 'ok') { submitCode(); return; }
    if (state.code.length >= 6) return;
    state.code += k;
    paintDots();
    if (state.code.length === 6) setTimeout(submitCode, 140);
  }

  function submitCode() {
    if (state.code.length !== 6) {
      $('lock-msg').textContent = 'Enter all six digits';
      return;
    }
    api('/api/kiosk/unlock', { code: state.code }).then(function () {
      state.code = '';
      paintDots();
      goHome();
    }).catch(function (e) {
      state.code = '';
      paintDots();
      $('lock-msg').textContent = e.message;
      var el = $('s-lock');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    });
  }

  /* --------------------------------------------------------------- home */

  function goHome() {
    state.quiz = null;
    state.answers = {};
    state.ratings = {};
    state.lastAttempt = null;
    $('home-title').textContent = cfg.welcomeTitle;
    $('home-sub').textContent = cfg.welcomeSubtitle;
    show('s-home');
    startWalls();
  }

  /* --------------------------------------------------------------- quiz */

  function startQuiz() {
    api('/api/quiz/start', { terminal: terminal() }).then(function (q) {
      state.quiz = q;
      state.answers = {};
      state.idx = 0;
      show('s-quiz');
      paintQuestion();
    }).catch(function (e) { flash($('q-err'), e.message); });
  }

  function paintQuestion() {
    var q = state.quiz.questions[state.idx];
    var total = state.quiz.total;
    $('q-counter').textContent = (state.idx + 1) + ' of ' + total;
    $('q-progress').style.width = Math.round((state.idx / total) * 100) + '%';
    $('q-text').textContent = q.text;
    $('q-err').textContent = '';

    var host = $('q-opts');
    host.innerHTML = '';
    q.options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (state.answers[q.id] === o.key ? ' sel' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', state.answers[q.id] === o.key ? 'true' : 'false');
      b.innerHTML = '<span class="k">' + esc(o.key) + '</span><span class="t">' + esc(o.text) + '</span>';
      b.addEventListener('click', function () {
        state.answers[q.id] = o.key;
        $('q-err').textContent = '';
        paintQuestion();
      });
      host.appendChild(b);
    });
    $('q-submit').textContent = (state.idx === state.quiz.questions.length - 1) ? 'Submit' : 'Next';
  }

  function openExit() { $('exit-overlay').hidden = false; }
  function closeExit() { $('exit-overlay').hidden = true; }
  function confirmExit() { $('exit-overlay').hidden = true; goHome(); }

  function nextQuestion() {
    var q = state.quiz.questions[state.idx];
    if (!state.answers[q.id]) {
      flash($('q-err'), 'Choose an answer to continue');
      return;
    }
    if (state.idx < state.quiz.questions.length - 1) {
      state.idx += 1;
      paintQuestion();
      return;
    }
    $('q-submit').disabled = true;
    api('/api/quiz/submit', { attemptId: state.quiz.attemptId, answers: state.answers })
      .then(function (r) {
        $('q-submit').disabled = false;
        state.lastAttempt = state.quiz.attemptId;
        showResult(r);
      })
      .catch(function (e) {
        $('q-submit').disabled = false;
        flash($('q-err'), e.message);
      });
  }

  function showResult(r) {
    var el = $('s-result');
    el.classList.toggle('fail', !r.passed);
    $('res-badge').style.background = r.passed ? 'var(--gold)' : 'rgba(255,255,255,.14)';
    $('res-badge').innerHTML = '<svg width="36" height="36" style="color:' + (r.passed ? 'var(--gold-ink)' : 'var(--mint)') +
      '" aria-hidden="true"><use href="#' + (r.passed ? 'i-gift' : 'i-seed') + '"/></svg>';
    $('res-title').textContent = r.passed ? 'Congratulations!' : 'Well played!';
    $('res-msg').textContent = r.message;
    $('res-score').textContent = r.score + ' / ' + r.total;
    show('s-result');
  }

  /* ----------------------------------------------------------- feedback */

  function startFeedback() {
    var list = cfg.feedbackQuestions || [];
    var host = $('fb-list');
    host.innerHTML = '';
    state.ratings = {};
    $('fb-err').textContent = '';

    if (!list.length) {
      host.innerHTML = '<div class="fb-card"><p class="fb-q">No feedback questions are set up right now.</p></div>';
      show('s-feedback');
      return;
    }

    list.forEach(function (f, i) {
      var card = document.createElement('div');
      card.className = 'fb-card';
      card.innerHTML = '<span class="fb-tag">Question ' + (i + 1) + '</span><p class="fb-q">' + esc(f.text) + '</p>';
      var row = document.createElement('div');
      row.className = 'stars';
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', f.text);
      for (var v = 1; v <= 5; v++) {
        (function (val) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'star';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', 'false');
          b.setAttribute('aria-label', val + ' of 5');
          b.innerHTML = '<svg width="30" height="30" aria-hidden="true"><use href="#i-star"/></svg>';
          b.addEventListener('click', function () {
            state.ratings[f.id] = val;
            $('fb-err').textContent = '';
            var kids = row.children;
            for (var k = 0; k < kids.length; k++) {
              kids[k].classList.toggle('lit', k < val);
              kids[k].setAttribute('aria-checked', (k + 1) === val ? 'true' : 'false');
            }
          });
          row.appendChild(b);
        })(v);
      }
      card.appendChild(row);
      host.appendChild(card);
    });
    show('s-feedback');
  }

  function submitFeedback() {
    var list = cfg.feedbackQuestions || [];
    var ratings = list.map(function (f) { return { questionId: f.id, rating: state.ratings[f.id] }; })
      .filter(function (r) { return r.rating; });

    if (!ratings.length) { flash($('fb-err'), 'Tap the stars to rate at least one question'); return; }
    if (cfg.feedbackRequireAll && ratings.length < list.length) {
      flash($('fb-err'), 'Please rate all ' + list.length + ' questions');
      return;
    }
    $('fb-submit').disabled = true;
    api('/api/feedback', { terminal: terminal(), attemptId: state.lastAttempt, ratings: ratings })
      .then(function () { $('fb-submit').disabled = false; thanks(); })
      .catch(function (e) { $('fb-submit').disabled = false; flash($('fb-err'), e.message); });
  }

  /* ------------------------------------------------------------- thanks */

  function thanks() {
    show('s-thanks');
    var secs = Math.max(2, Number(cfg.thankYouSeconds) || 5);
    var left = secs;
    $('thanks-bar').style.width = '100%';
    $('thanks-count').textContent = 'Returning to home in ' + left + 's';
    clearInterval(timers.thanks);
    timers.thanks = setInterval(function () {
      left -= 1;
      $('thanks-bar').style.width = Math.max(0, (left / secs) * 100) + '%';
      $('thanks-count').textContent = 'Returning to home in ' + Math.max(0, left) + 's';
      if (left <= 0) { clearInterval(timers.thanks); goHome(); }
    }, 1000);
  }

  /* --------------------------------------------------------- idle reset */

  function armIdle(id) {
    clearTimeout(timers.idle);
    var watched = ['s-quiz', 's-result', 's-feedback'];
    if (watched.indexOf(id) < 0) return;
    var ms = Math.max(15, Number(cfg && cfg.idleResetSeconds) || 60) * 1000;
    timers.idle = setTimeout(goHome, ms);
  }

  function bumpIdle() {
    var live = screens.filter(function (s) { return $(s).classList.contains('on'); })[0];
    if (live) armIdle(live);
  }

  function flash(el, msg) {
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 4000);
  }

  /* --------------------------------------------------------------- boot */

  function wire() {
    $('go-display').addEventListener('click', function () {
      state.code = '';
      paintDots();
      $('lock-msg').textContent = '';
      show('s-lock');
    });
    $('go-admin').addEventListener('click', function () { window.location.href = '/admin.html'; });
    $('lock-back').addEventListener('click', function () { state.code = ''; paintDots(); show('s-launcher'); });
    $('home-gear').addEventListener('click', function () { window.location.href = '/admin.html'; });
    $('go-quiz').addEventListener('click', startQuiz);
    $('go-feedback').addEventListener('click', function () { state.lastAttempt = null; startFeedback(); });
    $('q-submit').addEventListener('click', nextQuestion);
    $('quiz-exit').addEventListener('click', openExit);
    $('exit-cancel').addEventListener('click', closeExit);
    $('exit-confirm').addEventListener('click', confirmExit);
    $('res-next').addEventListener('click', startFeedback);
    $('fb-submit').addEventListener('click', submitFeedback);
    $('fb-skip').addEventListener('click', goHome);

    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, bumpIdle, { passive: true });
    });

    document.addEventListener('keydown', function (e) {
      if (!$('s-lock').classList.contains('on')) return;
      if (/^[0-9]$/.test(e.key)) tapKey(e.key);
      else if (e.key === 'Backspace') { state.code = state.code.slice(0, -1); paintDots(); }
      else if (e.key === 'Enter') submitCode();
    });
  }

  function boot() {
    buildKeys();
    paintDots();
    $('term-name').textContent = terminal();
    wire();
    api('/api/config').then(function (c) {
      cfg = c;
      paintBranding();
      if (c.unlocked) goHome(); else show('s-launcher');
    }).catch(function () {
      $('lock-msg').textContent = 'Cannot reach the quiz server.';
      show('s-launcher');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
