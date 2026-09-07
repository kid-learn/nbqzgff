'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const css = P('public/styles.css');
const seed = P('seed.js');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');

/* Pull the real markup out of the production pages so the demo cannot drift. */
const kioskHtml = P('public/index.html');
const adminHtml = P('public/admin.html');

const sprite = kioskHtml.match(/<svg style="display:none"[\s\S]*?<\/svg>/)[0]
  .replace('</svg>', `  <symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><rect x="9.5" y="10.5" width="5" height="4" rx="1"/><path d="M10.7 10.5V9.3a1.3 1.3 0 0 1 2.6 0v1.2"/>
  </symbol>
</svg>`);

const kioskMain = kioskHtml.match(/<main class="app" id="app">[\s\S]*?<\/main>/)[0];

const loginShell = adminHtml.match(/<!-- login -->\s*([\s\S]*?)<!-- panel -->/)[1].trim();
const panelShell = adminHtml.match(/<!-- panel -->\s*([\s\S]*?)<script/)[1].trim();

/* Swap the network layer and page navigation for demo equivalents. */
function patch(src, extra) {
  let out = src.replace(/fetch\(\s*(BASE \+ )?path,\s*opts\s*\)/g, 'window.__mock(path, opts)');
  for (const [from, to] of extra) {
    if (!out.includes(from)) throw new Error('patch target missing: ' + from);
    out = out.split(from).join(to);
  }
  return out;
}

const kioskJs = patch(P('public/kiosk.js'), [
  ["window.location.href = '/admin.html'", 'window.__goAdmin()'],
  ['  function boot() {', `  window.__kioskRefresh = function () {
    api('/api/config').then(function (c) {
      cfg = c;
      paintBranding();
      if (c.unlocked) goHome(); else show('s-launcher');
    });
  };

  function boot() {`]
]);

const adminJs = patch(P('public/admin.js'), [
  ["window.location.href = '/'", 'window.__goKiosk()'],
  ["window.location.href = '/api/admin/export?what=' + encodeURIComponent(b.dataset.export);",
    'window.__demoExport(b.dataset.export);'],
  ['  function boot() {', '  window.__adminRefresh = load;\n\n  function boot() {']
]);

const seedGlobal = seed.replace(
  'module.exports = { QUESTIONS, FEEDBACK, SETTINGS };',
  'window.__SEED = { QUESTIONS: QUESTIONS, FEEDBACK: FEEDBACK, SETTINGS: SETTINGS };'
).replace(/^'use strict';\n/, '');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>NABARD Pavilion Quiz — demo</title>
<style>
${css}

#demo-bar {
  position: sticky; top: 0; z-index: 50;
  background: var(--navy-deep); color: #fff;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 14px; font-family: var(--font); font-size: 13px;
}
#demo-bar b { font-weight: 600; }
#demo-bar span { color: var(--mint); }
#demo-bar button {
  margin-left: auto; border: 1px solid var(--mint-strong); background: transparent;
  color: #fff; font-family: inherit; font-size: 13px; padding: 5px 12px;
  border-radius: 999px; cursor: pointer;
}
#stage { background: var(--navy-deep); }
body.demo-admin .app { display: none; }
body.demo-kiosk #login-shell, body.demo-kiosk #panel-shell { display: none !important; }
body { user-select: none; -webkit-user-select: none; }
body.demo-admin { background: var(--cream); user-select: auto; -webkit-user-select: auto; }
</style>
</head>
<body class="demo-kiosk">

<div id="demo-bar">
  <b>Demo</b>
  <span>Nothing is saved &mdash; refreshing restores the starting state</span>
  <button id="demo-reset" type="button">Reset demo</button>
</div>

<div id="stage">
${sprite}

${kioskMain}

${loginShell}

${panelShell}
</div>

<script>
${seedGlobal}
</script>
<script>
${mock}
</script>
<script>
window.__goAdmin = function () {
  document.body.className = 'demo-admin';
  document.getElementById('login-shell').hidden = false;
  document.getElementById('panel-shell').hidden = true;
  window.scrollTo(0, 0);
  if (window.__adminRefresh) window.__adminRefresh();
};
window.__goKiosk = function () {
  document.body.className = 'demo-kiosk';
  window.scrollTo(0, 0);
  if (window.__kioskRefresh) window.__kioskRefresh();
};
document.getElementById('demo-reset').addEventListener('click', function () {
  window.__demoReset();
  window.__goKiosk();
});
</script>
<script>
${kioskJs}
</script>
<script>
${adminJs}
</script>
</body>
</html>
`;

const outDir = process.argv[2] || path.join(ROOT, 'demo');
fs.writeFileSync(path.join(outDir, 'nabard-quiz-demo.html'), html, 'utf8');
console.log('built nabard-quiz-demo.html  (' + Math.round(html.length / 1024) + ' KB)');
