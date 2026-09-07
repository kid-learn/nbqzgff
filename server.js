'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'attempts.jsonl');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');

const MAX_JSON = 64 * 1024;
const MAX_UPLOAD = 6 * 1024 * 1024;
const ATTEMPT_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- helpers */

const nowIso = () => new Date().toISOString();
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');

function normalisePassword(v) {
  return String(v == null ? '' : v)
    .normalize('NFC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .trim();
}

function hashPassword(plain, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const d = crypto.scryptSync(normalisePassword(plain), s, 64).toString('hex');
  return { salt: s, hash: d };
}

function verifyPassword(plain, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const d = crypto.scryptSync(normalisePassword(plain), rec.salt, 64).toString('hex');
  const a = Buffer.from(d, 'hex');
  const b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function constantEquals(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------------------------------------------------------- storage */

let config = null;
let writeChain = Promise.resolve();

function queueWrite(fn) {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

async function persistConfig() {
  return queueWrite(async () => {
    const tmp = CONFIG_FILE + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8');
    await fsp.rename(tmp, CONFIG_FILE);
  });
}

function appendLine(file, obj) {
  return queueWrite(() => fsp.appendFile(file, JSON.stringify(obj) + '\n', 'utf8'));
}

async function truncateFile(file) {
  return queueWrite(async () => {
    const tmp = file + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, '', 'utf8');
    await fsp.rename(tmp, file);
  });
}

function audit(event, detail, req) {
  return appendLine(AUDIT_FILE, {
    at: nowIso(),
    event,
    detail: detail || {},
    ip: req ? clientIp(req) : null
  });
}

async function readLines(file) {
  let raw;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch (_) { /* skip corrupt line */ }
  }
  return out;
}

function buildSeedConfig() {
  const admin = hashPassword('fintech-festival-nabard');
  const xadmin = hashPassword('fintech-festival-xadmin');
  return {
    version: 1,
    createdAt: nowIso(),
    settings: Object.assign({}, seed.SETTINGS),
    logo: null,
    wallpapers: [],
    users: {
      admin: { username: 'admin', salt: admin.salt, hash: admin.hash, otp: '1982', updatedAt: nowIso() },
      xadmin: { username: 'xadmin', salt: xadmin.salt, hash: xadmin.hash, otp: '0003', updatedAt: nowIso() }
    },
    questions: seed.QUESTIONS.map((q, i) => ({
      id: 'q' + String(i + 1).padStart(3, '0'),
      text: q.q,
      options: q.o.slice(),
      correct: q.a,
      category: q.c,
      active: true,
      createdAt: nowIso()
    })),
    feedbackQuestions: seed.FEEDBACK.map((t, i) => ({
      id: 'f' + String(i + 1).padStart(3, '0'),
      text: t,
      order: i + 1,
      active: true
    }))
  };
}

async function makePlaceholderWallpapers() {
  const swatches = [
    { name: 'wall-green.svg', bg: '#7AC756', fg: '#0B5C3A' },
    { name: 'wall-forest.svg', bg: '#0B5C3A', fg: '#9FE1CB' },
    { name: 'wall-navy.svg', bg: '#0B2E4F', fg: '#5DCAA5' }
  ];
  const out = [];
  for (const s of swatches) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" width="720" height="1280">
<rect width="720" height="1280" fill="${s.bg}"/>
<g fill="none" stroke="${s.fg}" stroke-width="3" opacity="0.5">
<circle cx="120" cy="200" r="70"/><circle cx="600" cy="340" r="110"/>
<circle cx="200" cy="1000" r="150"/><circle cx="640" cy="1120" r="90"/>
<path d="M0 760 C 180 690, 360 830, 540 760 S 720 690, 720 760"/>
<path d="M0 820 C 180 750, 360 890, 540 820 S 720 750, 720 820"/>
</g>
<g fill="${s.fg}" opacity="0.35">
<circle cx="420" cy="180" r="10"/><circle cx="470" cy="230" r="6"/><circle cx="90" cy="620" r="8"/>
<circle cx="660" cy="700" r="12"/><circle cx="300" cy="480" r="7"/>
</g></svg>`;
    await fsp.writeFile(path.join(UPLOAD_DIR, s.name), svg, 'utf8');
    out.push({ id: rid(6), file: s.name, label: s.name.replace('.svg', ''), active: true, addedAt: nowIso() });
  }
  return out;
}

async function loadConfig() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const raw = await fsp.readFile(CONFIG_FILE, 'utf8');
    config = JSON.parse(raw);
    config.settings = Object.assign({}, seed.SETTINGS, config.settings);
    if (!Array.isArray(config.wallpapers)) config.wallpapers = [];
    if (!Array.isArray(config.questions)) config.questions = [];
    if (!Array.isArray(config.feedbackQuestions)) config.feedbackQuestions = [];
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  config = buildSeedConfig();
  config.wallpapers = await makePlaceholderWallpapers();
  await persistConfig();
  console.log('Seeded a fresh data store at ' + DATA_DIR);
}

/* --------------------------------------------------------------- sessions */

const sessions = new Map();   // token -> { username, expires }
const kioskTokens = new Map();// token -> expires
const attempts = new Map();   // attemptId -> live attempt
const throttle = new Map();   // key -> { count, until }

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function throttleCheck(key, limit, windowMs) {
  const rec = throttle.get(key);
  const t = Date.now();
  if (rec && rec.until > t && rec.count >= limit) {
    return Math.ceil((rec.until - t) / 1000);
  }
  return 0;
}

function throttleHit(key, windowMs) {
  const t = Date.now();
  const rec = throttle.get(key);
  if (!rec || rec.until <= t) throttle.set(key, { count: 1, until: t + windowMs });
  else rec.count += 1;
}

function throttleClear(key) { throttle.delete(key); }

function sweep() {
  const t = Date.now();
  for (const [k, v] of sessions) if (v.expires < t) sessions.delete(k);
  for (const [k, v] of kioskTokens) if (v < t) kioskTokens.delete(k);
  for (const [k, v] of attempts) if (v.expires < t) attempts.delete(k);
  for (const [k, v] of throttle) if (v.until < t) throttle.delete(k);
}
setInterval(sweep, 60 * 1000).unref();

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).nq_admin;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) return null;
  s.expires = Date.now() + SESSION_TTL_MS;
  return s.username;
}

/* ------------------------------------------------------------------- http */

function send(res, status, body, headers) {
  const h = Object.assign({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }, headers || {});
  res.writeHead(status, h);
  res.end(body);
}

function sendJson(res, status, obj, headers) {
  send(res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

async function serveStatic(res, dir, rel, cache) {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(dir, safe);
  if (!file.startsWith(dir)) return send(res, 403, 'forbidden');
  try {
    const data = await fsp.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, {
      'Content-Type': type,
      'Cache-Control': cache || 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self','unsafe-inline'; img-src 'self' data:"
    });
  } catch (_) {
    send(res, 404, 'not found');
  }
}

/* -------------------------------------------------------------- csv utils */

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------ public data */

function publicConfig() {
  const s = config.settings;
  return {
    welcomeTitle: s.welcomeTitle,
    welcomeSubtitle: s.welcomeSubtitle,
    wallpaperCycleSeconds: s.wallpaperCycleSeconds,
    idleResetSeconds: s.idleResetSeconds,
    thankYouSeconds: s.thankYouSeconds,
    feedbackRequireAll: s.feedbackRequireAll,
    questionsPerAttempt: s.questionsPerAttempt,
    logo: config.logo ? '/media/' + config.logo.file : null,
    wallpapers: config.wallpapers.filter((w) => w.active !== false).map((w) => '/media/' + w.file),
    feedbackQuestions: config.feedbackQuestions
      .filter((f) => f.active !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((f) => ({ id: f.id, text: f.text }))
  };
}

/* -------------------------------------------------------------- api: quiz */

function startAttempt(terminal) {
  const active = config.questions.filter((q) => q.active !== false && q.options && q.options.length === 4);
  const want = Math.max(1, Number(config.settings.questionsPerAttempt) || 10);
  const n = Math.min(want, active.length);
  const picked = shuffle(active).slice(0, n);
  const id = rid(16);

  const served = picked.map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      id: q.id,
      text: q.text,
      category: q.category || '',
      order,
      correctKey: 'ABCD'[order.indexOf(q.correct)]
    };
  });

  attempts.set(id, {
    id,
    terminal: terminal || 'unknown',
    startedAt: Date.now(),
    expires: Date.now() + ATTEMPT_TTL_MS,
    served
  });

  return {
    attemptId: id,
    total: n,
    passThreshold: Math.min(Number(config.settings.passThreshold) || 0, n),
    questions: served.map((s, idx) => {
      const src = config.questions.find((q) => q.id === s.id);
      return {
        id: s.id,
        index: idx + 1,
        text: s.text,
        options: s.order.map((oi, k) => ({ key: 'ABCD'[k], text: src.options[oi] }))
      };
    })
  };
}

function scoreAttempt(att, answers) {
  let score = 0;
  const detail = att.served.map((s) => {
    const given = answers && typeof answers[s.id] === 'string' ? answers[s.id] : null;
    const ok = given !== null && given === s.correctKey;
    if (ok) score += 1;
    return { questionId: s.id, given, correct: s.correctKey, ok };
  });
  return { score, detail };
}

/* ------------------------------------------------------------- api routes */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  const guard = () => {
    if (method === 'GET') return true;
    return req.headers['x-requested-with'] === 'nabard-quiz';
  };
  if (!guard()) return sendJson(res, 400, { error: 'bad request' });

  /* --- kiosk unlock ------------------------------------------------- */
  if (p === '/api/kiosk/unlock' && method === 'POST') {
    const key = 'kiosk:' + clientIp(req);
    const wait = throttleCheck(key, 5, 60 * 1000);
    if (wait) return sendJson(res, 429, { error: 'Too many attempts. Try again in ' + wait + 's.' });
    const body = await readBody(req, MAX_JSON);
    const code = String(body.code || '');
    if (code.length === 6 && constantEquals(code, String(config.settings.kioskCode))) {
      throttleClear(key);
      const token = rid(16);
      kioskTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
      audit('kiosk.unlock', {}, req);
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': 'nq_kiosk=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'
      });
    }
    throttleHit(key, 60 * 1000);
    audit('kiosk.unlock.failed', {}, req);
    return sendJson(res, 401, { error: 'Incorrect code' });
  }

  if (p === '/api/config' && method === 'GET') {
    const token = parseCookies(req).nq_kiosk;
    const exp = token ? kioskTokens.get(token) : null;
    return sendJson(res, 200, Object.assign(publicConfig(), { unlocked: !!(exp && exp > Date.now()) }));
  }

  if (p === '/api/quiz/start' && method === 'POST') {
    const body = await readBody(req, MAX_JSON);
    const active = config.questions.filter((q) => q.active !== false);
    if (!active.length) return sendJson(res, 409, { error: 'No active questions in the bank.' });
    return sendJson(res, 200, startAttempt(body.terminal));
  }

  if (p === '/api/quiz/submit' && method === 'POST') {
    const body = await readBody(req, MAX_JSON);
    const att = attempts.get(String(body.attemptId || ''));
    if (!att) return sendJson(res, 410, { error: 'This attempt has expired. Please start again.' });
    if (att.submitted) return sendJson(res, 409, { error: 'This attempt was already submitted.' });
    att.submitted = true;

    const { score, detail } = scoreAttempt(att, body.answers || {});
    const total = att.served.length;
    const threshold = Math.min(Number(config.settings.passThreshold) || 0, total);
    const passed = score >= threshold;
    const durationMs = Date.now() - att.startedAt;

    await appendLine(ATTEMPTS_FILE, {
      attemptId: att.id,
      at: nowIso(),
      terminal: att.terminal,
      total,
      score,
      threshold,
      passed,
      durationMs,
      answers: detail
    });

    attempts.delete(att.id);
    return sendJson(res, 200, {
      score,
      total,
      threshold,
      passed,
      message: passed ? config.settings.congratsMessage : config.settings.consolationMessage
    });
  }

  if (p === '/api/feedback' && method === 'POST') {
    const body = await readBody(req, MAX_JSON);
    const valid = new Map(config.feedbackQuestions.map((f) => [f.id, f.text]));
    const ratings = Array.isArray(body.ratings) ? body.ratings : [];
    const clean = [];
    for (const r of ratings) {
      const v = Number(r.rating);
      if (!valid.has(r.questionId)) continue;
      if (!Number.isInteger(v) || v < 1 || v > 5) continue;
      clean.push({ questionId: r.questionId, text: valid.get(r.questionId), rating: v });
    }
    if (!clean.length) return sendJson(res, 400, { error: 'No valid ratings received.' });
    await appendLine(FEEDBACK_FILE, {
      feedbackId: rid(10),
      at: nowIso(),
      terminal: String(body.terminal || 'unknown'),
      attemptId: body.attemptId ? String(body.attemptId) : null,
      ratings: clean
    });
    return sendJson(res, 200, { ok: true });
  }

  /* --- admin auth --------------------------------------------------- */
  if (p === '/api/admin/login' && method === 'POST') {
    const key = 'admin:' + clientIp(req);
    const wait = throttleCheck(key, 5, 5 * 60 * 1000);
    if (wait) return sendJson(res, 429, { error: 'Too many attempts. Try again in ' + wait + 's.' });
    const body = await readBody(req, MAX_JSON);
    const username = String(body.username || '').trim().toLowerCase();
    const user = config.users[username];
    if (user && verifyPassword(body.password, user)) {
      throttleClear(key);
      const token = rid(24);
      sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
      audit('admin.login', { username }, req);
      return sendJson(res, 200, { ok: true, username }, {
        'Set-Cookie': 'nq_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'
      });
    }
    throttleHit(key, 5 * 60 * 1000);
    audit('admin.login.failed', { username }, req);
    return sendJson(res, 401, { error: 'Incorrect user ID or password' });
  }

  if (p === '/api/admin/logout' && method === 'POST') {
    const token = parseCookies(req).nq_admin;
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'nq_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
  }

  /* --- everything below requires a session -------------------------- */
  if (p.startsWith('/api/admin/')) {
    const username = currentUser(req);
    if (!username) return sendJson(res, 401, { error: 'Not signed in', code: 'nosession' });
    return handleAdmin(req, res, url, username);
  }

  return sendJson(res, 404, { error: 'not found' });
}

/* ------------------------------------------------------------ admin api */

async function handleAdmin(req, res, url, username) {
  const p = url.pathname;
  const method = req.method;

  if (p === '/api/admin/state' && method === 'GET') {
    return sendJson(res, 200, {
      username,
      settings: config.settings,
      logo: config.logo ? '/media/' + config.logo.file : null,
      wallpapers: config.wallpapers.map((w) => ({ id: w.id, url: '/media/' + w.file, label: w.label, active: w.active !== false })),
      questions: config.questions.map((q) => ({
        id: q.id, text: q.text, options: q.options, correct: q.correct,
        category: q.category || '', active: q.active !== false
      })),
      feedbackQuestions: config.feedbackQuestions
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((f) => ({ id: f.id, text: f.text, order: f.order, active: f.active !== false }))
    });
  }

  if (p === '/api/admin/question' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const text = String(b.text || '').trim();
    const options = Array.isArray(b.options) ? b.options.map((o) => String(o || '').trim()) : [];
    const correct = Number(b.correct);
    if (!text) return sendJson(res, 400, { error: 'Question text is required.' });
    if (options.length !== 4 || options.some((o) => !o)) return sendJson(res, 400, { error: 'All four options are required.' });
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) return sendJson(res, 400, { error: 'Select the correct option.' });

    if (b.id) {
      const q = config.questions.find((x) => x.id === b.id);
      if (!q) return sendJson(res, 404, { error: 'Question not found.' });
      Object.assign(q, { text, options, correct, category: String(b.category || '').trim(), active: b.active !== false, updatedAt: nowIso() });
      await persistConfig();
      await audit('question.update', { id: q.id, by: username }, req);
      return sendJson(res, 200, { ok: true, id: q.id });
    }
    const id = 'q' + rid(5);
    config.questions.push({ id, text, options, correct, category: String(b.category || '').trim(), active: b.active !== false, createdAt: nowIso() });
    await persistConfig();
    await audit('question.create', { id, by: username }, req);
    return sendJson(res, 200, { ok: true, id });
  }

  if (p === '/api/admin/question/delete' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const i = config.questions.findIndex((x) => x.id === b.id);
    if (i < 0) return sendJson(res, 404, { error: 'Question not found.' });
    const removed = config.questions.splice(i, 1)[0];
    await persistConfig();
    await audit('question.delete', { id: removed.id, by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/feedback-question' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const text = String(b.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'Question text is required.' });
    if (b.id) {
      const f = config.feedbackQuestions.find((x) => x.id === b.id);
      if (!f) return sendJson(res, 404, { error: 'Question not found.' });
      f.text = text;
      f.active = b.active !== false;
      if (Number.isFinite(Number(b.order))) f.order = Number(b.order);
      await persistConfig();
      await audit('feedback.update', { id: f.id, by: username }, req);
      return sendJson(res, 200, { ok: true, id: f.id });
    }
    const id = 'f' + rid(5);
    const maxOrder = config.feedbackQuestions.reduce((m, f) => Math.max(m, f.order || 0), 0);
    config.feedbackQuestions.push({ id, text, order: maxOrder + 1, active: b.active !== false });
    await persistConfig();
    await audit('feedback.create', { id, by: username }, req);
    return sendJson(res, 200, { ok: true, id });
  }

  if (p === '/api/admin/feedback-question/delete' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const i = config.feedbackQuestions.findIndex((x) => x.id === b.id);
    if (i < 0) return sendJson(res, 404, { error: 'Question not found.' });
    config.feedbackQuestions.splice(i, 1);
    await persistConfig();
    await audit('feedback.delete', { id: b.id, by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/settings' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const s = config.settings;
    const num = (v, lo, hi, dflt) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, Math.round(n)));
    };
    if (b.welcomeTitle !== undefined) s.welcomeTitle = String(b.welcomeTitle).slice(0, 120);
    if (b.welcomeSubtitle !== undefined) s.welcomeSubtitle = String(b.welcomeSubtitle).slice(0, 160);
    if (b.congratsMessage !== undefined) s.congratsMessage = String(b.congratsMessage).slice(0, 300);
    if (b.consolationMessage !== undefined) s.consolationMessage = String(b.consolationMessage).slice(0, 300);
    if (b.questionsPerAttempt !== undefined) s.questionsPerAttempt = num(b.questionsPerAttempt, 1, 50, s.questionsPerAttempt);
    if (b.passThreshold !== undefined) s.passThreshold = num(b.passThreshold, 0, 50, s.passThreshold);
    if (b.idleResetSeconds !== undefined) s.idleResetSeconds = num(b.idleResetSeconds, 15, 600, s.idleResetSeconds);
    if (b.thankYouSeconds !== undefined) s.thankYouSeconds = num(b.thankYouSeconds, 2, 60, s.thankYouSeconds);
    if (b.wallpaperCycleSeconds !== undefined) s.wallpaperCycleSeconds = num(b.wallpaperCycleSeconds, 2, 120, s.wallpaperCycleSeconds);
    if (b.feedbackRequireAll !== undefined) s.feedbackRequireAll = !!b.feedbackRequireAll;
    if (s.passThreshold > s.questionsPerAttempt) s.passThreshold = s.questionsPerAttempt;
    await persistConfig();
    await audit('settings.update', { by: username }, req);
    return sendJson(res, 200, { ok: true, settings: s });
  }

  if (p === '/api/admin/upload' && method === 'POST') {
    const b = await readBody(req, MAX_UPLOAD);
    const kind = b.kind === 'logo' ? 'logo' : 'wallpaper';
    const m = /^data:(image\/(png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(b.dataUrl || ''));
    if (!m) return sendJson(res, 400, { error: 'Upload a PNG, JPG, WEBP or SVG image.' });
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[m[1]];
    const buf = Buffer.from(m[3].replace(/\s/g, ''), 'base64');
    if (!buf.length) return sendJson(res, 400, { error: 'The image is empty.' });
    if (buf.length > MAX_UPLOAD) return sendJson(res, 413, { error: 'Image is larger than 6 MB.' });
    const file = kind + '-' + rid(6) + ext;
    await fsp.writeFile(path.join(UPLOAD_DIR, file), buf);

    if (kind === 'logo') {
      const old = config.logo;
      config.logo = { file, label: String(b.label || 'logo').slice(0, 80), addedAt: nowIso() };
      await persistConfig();
      if (old && old.file) fsp.unlink(path.join(UPLOAD_DIR, old.file)).catch(() => {});
      await audit('logo.update', { by: username }, req);
      return sendJson(res, 200, { ok: true, url: '/media/' + file });
    }
    const w = { id: rid(6), file, label: String(b.label || file).slice(0, 80), active: true, addedAt: nowIso() };
    config.wallpapers.push(w);
    await persistConfig();
    await audit('wallpaper.add', { id: w.id, by: username }, req);
    return sendJson(res, 200, { ok: true, id: w.id, url: '/media/' + file });
  }

  if (p === '/api/admin/wallpaper/update' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const w = config.wallpapers.find((x) => x.id === b.id);
    if (!w) return sendJson(res, 404, { error: 'Wallpaper not found.' });
    if (b.active !== undefined) w.active = !!b.active;
    await persistConfig();
    await audit('wallpaper.update', { id: w.id, by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/wallpaper/delete' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const i = config.wallpapers.findIndex((x) => x.id === b.id);
    if (i < 0) return sendJson(res, 404, { error: 'Wallpaper not found.' });
    const [w] = config.wallpapers.splice(i, 1);
    await persistConfig();
    fsp.unlink(path.join(UPLOAD_DIR, w.file)).catch(() => {});
    await audit('wallpaper.delete', { id: w.id, by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/logo/delete' && method === 'POST') {
    const old = config.logo;
    config.logo = null;
    await persistConfig();
    if (old && old.file) fsp.unlink(path.join(UPLOAD_DIR, old.file)).catch(() => {});
    await audit('logo.delete', { by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/password' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const user = config.users[username];
    if (!verifyPassword(b.current, user)) {
      await audit('password.change.failed', { username, reason: 'current' }, req);
      return sendJson(res, 401, { error: 'Current password is incorrect.' });
    }
    const next = normalisePassword(b.next);
    if (next.length < 8) return sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
    if (next !== normalisePassword(b.confirm)) return sendJson(res, 400, { error: 'New password and confirmation do not match.' });
    if (!constantEquals(String(b.otp || '').replace(/\D/g, ''), String(user.otp))) {
      await audit('password.change.failed', { username, reason: 'otp' }, req);
      return sendJson(res, 401, { error: 'Incorrect OTP.' });
    }
    const h = hashPassword(next);
    user.salt = h.salt;
    user.hash = h.hash;
    user.updatedAt = nowIso();
    await persistConfig();
    await audit('password.change', { username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/kiosk-code' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const user = config.users[username];
    if (!verifyPassword(b.password, user)) return sendJson(res, 401, { error: 'Password is incorrect.' });
    const code = String(b.code || '');
    if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: 'The display code must be exactly 6 digits.' });
    config.settings.kioskCode = code;
    await persistConfig();
    kioskTokens.clear();
    await audit('kioskcode.change', { by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/superuser/override-password' && method === 'POST') {
    if (username !== 'xadmin') {
      await audit('superuser.override.denied', { by: username }, req);
      return sendJson(res, 403, { error: 'Only xadmin can override another account\'s password.' });
    }
    const b = await readBody(req, MAX_JSON);
    const xu = config.users.xadmin;
    if (!verifyPassword(b.password, xu)) {
      await audit('superuser.override.failed', { by: username, reason: 'password' }, req);
      return sendJson(res, 401, { error: 'Your xadmin password is incorrect.' });
    }
    if (!constantEquals(String(b.otp || '').replace(/\D/g, ''), String(xu.otp))) {
      await audit('superuser.override.failed', { by: username, reason: 'otp' }, req);
      return sendJson(res, 401, { error: 'Incorrect OTP.' });
    }
    const next = normalisePassword(b.newPassword);
    if (next.length < 8) return sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
    if (next !== normalisePassword(b.confirm)) return sendJson(res, 400, { error: 'New password and confirmation do not match.' });
    const target = config.users.admin;
    const h = hashPassword(next);
    target.salt = h.salt;
    target.hash = h.hash;
    target.updatedAt = nowIso();
    sessions.forEach((s, token) => { if (s.username === 'admin') sessions.delete(token); });
    await persistConfig();
    await audit('superuser.override', { by: username, target: 'admin' }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/reports' && method === 'GET') {
    const atts = await readLines(ATTEMPTS_FILE);
    const fbs = await readLines(FEEDBACK_FILE);
    const today = new Date().toISOString().slice(0, 10);

    const todays = atts.filter((a) => String(a.at).slice(0, 10) === today);
    const sum = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
    const pass = atts.filter((a) => a.passed).length;

    const byHour = {};
    for (const a of atts) {
      const h = new Date(a.at).getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    }

    const qStats = new Map();
    for (const a of atts) {
      for (const d of (a.answers || [])) {
        const s = qStats.get(d.questionId) || { served: 0, correct: 0 };
        s.served += 1;
        if (d.ok) s.correct += 1;
        qStats.set(d.questionId, s);
      }
    }
    const questionStats = [...qStats.entries()].map(([id, s]) => {
      const q = config.questions.find((x) => x.id === id);
      return {
        id,
        text: q ? q.text : '(deleted question)',
        served: s.served,
        correct: s.correct,
        pct: s.served ? Math.round((s.correct / s.served) * 100) : 0
      };
    }).sort((a, b) => a.pct - b.pct);

    const fbStats = config.feedbackQuestions.map((f) => {
      const vals = [];
      for (const r of fbs) for (const x of (r.ratings || [])) if (x.questionId === f.id) vals.push(x.rating);
      const dist = [0, 0, 0, 0, 0];
      for (const v of vals) if (v >= 1 && v <= 5) dist[v - 1] += 1;
      return {
        id: f.id,
        text: f.text,
        responses: vals.length,
        average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0,
        dist
      };
    });

    return sendJson(res, 200, {
      totals: {
        attemptsToday: todays.length,
        attemptsAll: atts.length,
        passRate: atts.length ? Math.round((pass / atts.length) * 100) : 0,
        avgScore: atts.length ? Math.round((sum(atts, (a) => a.score) / atts.length) * 10) / 10 : 0,
        avgSeconds: atts.length ? Math.round(sum(atts, (a) => a.durationMs) / atts.length / 1000) : 0,
        feedbackCount: fbs.length
      },
      byHour,
      questionStats,
      feedbackStats: fbStats,
      recentAudit: (await readLines(AUDIT_FILE)).slice(-40).reverse()
    });
  }

  if (p === '/api/admin/reset' && method === 'POST') {
    const b = await readBody(req, MAX_JSON);
    const user = config.users[username];
    if (!verifyPassword(b.password, user)) {
      await audit('data.reset.failed', { by: username }, req);
      return sendJson(res, 401, { error: 'Password is incorrect.' });
    }
    const what = b.what;
    if (!['attempts', 'feedback', 'both'].includes(what)) {
      return sendJson(res, 400, { error: 'Unknown reset target.' });
    }
    if (what === 'attempts' || what === 'both') await truncateFile(ATTEMPTS_FILE);
    if (what === 'feedback' || what === 'both') await truncateFile(FEEDBACK_FILE);
    await audit('data.reset', { what, by: username }, req);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/admin/export' && method === 'GET') {
    const what = url.searchParams.get('what');
    if (what === 'attempts') {
      const rows = [['attempt_id', 'timestamp', 'terminal', 'score', 'total', 'threshold', 'passed', 'seconds']];
      for (const a of await readLines(ATTEMPTS_FILE)) {
        rows.push([a.attemptId, a.at, a.terminal, a.score, a.total, a.threshold, a.passed ? 'yes' : 'no', Math.round((a.durationMs || 0) / 1000)]);
      }
      return send(res, 200, toCsv(rows), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nabard-attempts.csv"'
      });
    }
    if (what === 'feedback') {
      const rows = [['feedback_id', 'timestamp', 'terminal', 'attempt_id', 'question', 'rating']];
      for (const f of await readLines(FEEDBACK_FILE)) {
        for (const r of (f.ratings || [])) rows.push([f.feedbackId, f.at, f.terminal, f.attemptId || '', r.text, r.rating]);
      }
      return send(res, 200, toCsv(rows), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nabard-feedback.csv"'
      });
    }
    if (what === 'questions') {
      const stats = new Map();
      for (const a of await readLines(ATTEMPTS_FILE)) {
        for (const d of (a.answers || [])) {
          const s = stats.get(d.questionId) || { served: 0, correct: 0 };
          s.served += 1;
          if (d.ok) s.correct += 1;
          stats.set(d.questionId, s);
        }
      }
      const rows = [['question_id', 'question', 'category', 'active', 'times_served', 'times_correct', 'correct_pct']];
      for (const q of config.questions) {
        const s = stats.get(q.id) || { served: 0, correct: 0 };
        rows.push([q.id, q.text, q.category || '', q.active !== false ? 'yes' : 'no', s.served, s.correct, s.served ? Math.round((s.correct / s.served) * 100) : '']);
      }
      return send(res, 200, toCsv(rows), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nabard-questions.csv"'
      });
    }
    if (what === 'audit') {
      const rows = [['timestamp', 'event', 'detail', 'ip']];
      for (const a of await readLines(AUDIT_FILE)) rows.push([a.at, a.event, JSON.stringify(a.detail || {}), a.ip || '']);
      return send(res, 200, toCsv(rows), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nabard-audit.csv"'
      });
    }
    return sendJson(res, 400, { error: 'Unknown export.' });
  }

  return sendJson(res, 404, { error: 'not found' });
}

/* ----------------------------------------------------------------- server */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = url.pathname;

  const run = async () => {
    if (p.startsWith('/api/')) return handleApi(req, res, url);
    if (p.startsWith('/media/')) return serveStatic(res, UPLOAD_DIR, p.slice('/media/'.length), 'public, max-age=60');
    if (p === '/' || p === '/index.html') return serveStatic(res, PUBLIC_DIR, 'index.html');
    return serveStatic(res, PUBLIC_DIR, p);
  };

  run().catch((err) => {
    const status = err && err.status ? err.status : 500;
    if (status === 500) console.error('[error]', p, err && err.message);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
    else res.end();
  });
});

const setPwFlag = process.argv.indexOf('--set-password');
if (setPwFlag > -1) {
  const name = String(process.argv[setPwFlag + 1] || '').toLowerCase();
  const pw = process.argv[setPwFlag + 2];
  if (!name || !pw) {
    console.error('Usage: node server.js --set-password <admin|xadmin> "<new password>"');
    process.exit(1);
  }
  loadConfig().then(async () => {
    if (!config.users[name]) {
      console.error('No such account: ' + name + '. Accounts are admin and xadmin.');
      process.exit(1);
    }
    if (normalisePassword(pw).length < 8) {
      console.error('The password must be at least 8 characters.');
      process.exit(1);
    }
    const h = hashPassword(pw);
    config.users[name].salt = h.salt;
    config.users[name].hash = h.hash;
    config.users[name].updatedAt = nowIso();
    await persistConfig();
    console.log('Password updated for ' + name + '.');
    process.exit(0);
  }).catch((e) => { console.error(e); process.exit(1); });
  return;
}

if (process.argv.includes('--reset-admin')) {
  loadConfig().then(async () => {
    const defaults = { admin: 'fintech-festival-nabard', xadmin: 'fintech-festival-xadmin' };
    for (const [name, pw] of Object.entries(defaults)) {
      const h = hashPassword(pw);
      config.users[name] = Object.assign(config.users[name] || { username: name, otp: name === 'admin' ? '1982' : '0003' },
        { salt: h.salt, hash: h.hash, updatedAt: nowIso() });
    }
    await persistConfig();
    console.log('Both admin passwords have been reset to the values in README.md.');
    console.log('Questions, settings and all recorded data are untouched.');
    process.exit(0);
  }).catch((e) => { console.error(e); process.exit(1); });
  return;
}

loadConfig().then(() => {
  server.listen(PORT, HOST, () => {
    console.log('NABARD pavilion quiz running on http://localhost:' + PORT);
    console.log('Data store: ' + DATA_DIR);
  });
}).catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});
