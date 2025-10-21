// AI Interview Desktop – Electron main process
// Shows a system-wide caption bar and auto-asks on clipboard changes.

const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  name: 'settings',
  defaults: {
    apiUrl: '',
    apiKey: '',
    apiKeyHeader: 'Authorization',
    useBearer: true,
    questionField: 'question',
    contextField: 'context',
    topicField: 'topic',
    responsePath: 'answer',

    // Clipboard to ask
    clipboardEnabled: true,
    requireQuestionMark: false,
    minLength: 12,
    cooldownSeconds: 10,
    defaultTopic: 'general',

    // Caption bar
    captionDurationSeconds: 12,
    overlayFontSize: 16,
    overlayWidth: 800,
    overlayBottomMargin: 48,
    autostart: false
  }
});

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let lastAskAt = 0;
let lastClipboard = '';
let recent = new Set();

function looksLikeQuestion(text) {
  if (!text) return false;
  const cfg = store.store;
  const t = text.trim();
  if (t.length < (cfg.minLength || 0)) return false;
  const lower = t.toLowerCase();
  const qwords = [
    'what','why','how','when','which','where','who','can you','could you','would you','should we',
    'do you','tell me','explain','describe','walk me','difference','compare','is there','are there','have you','will this'
  ];
  const hasQMark = /\?/.test(t);
  const hasQWord = qwords.some(w => lower.startsWith(w) || lower.includes(` ${w} `));
  if (cfg.requireQuestionMark) return hasQMark && hasQWord;
  return hasQMark || hasQWord;
}

function parseByPath(obj, pathStr) {
  if (!pathStr) return obj;
  const parts = String(pathStr).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    const m = p.match(/(.+)?\[(\d+)\]$/);
    if (m) {
      const key = m[1];
      const idx = parseInt(m[2], 10);
      cur = key ? cur[key] : cur;
      cur = Array.isArray(cur) ? cur[idx] : undefined;
    } else {
      cur = cur[p];
    }
  }
  return cur;
}

async function callApi({ question, context = '', topic = '' }) {
  const cfg = store.store;
  if (!cfg.apiUrl) throw new Error('API URL not set. Open Settings.');

  const body = {};
  body[cfg.questionField || 'question'] = question;
  if (context) body[cfg.contextField || 'context'] = context;
  if (topic) body[cfg.topicField || 'topic'] = topic;

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    const headerName = cfg.apiKeyHeader || 'Authorization';
    headers[headerName] = cfg.useBearer ? `Bearer ${cfg.apiKey}` : cfg.apiKey;
  }

  const res = await fetch(cfg.apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = await res.json();
    const value = parseByPath(json, cfg.responsePath || 'answer');
    return value == null ? JSON.stringify(json) : (typeof value === 'string' ? value : JSON.stringify(value));
  }
  return await res.text();
}

function createOverlay() {
  if (overlayWindow) return overlayWindow;
  const cfg = store.store;
  overlayWindow = new BrowserWindow({
    width: cfg.overlayWidth || 800,
    height: 140,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: 'toolbar',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  positionOverlay();
  return overlayWindow;
}

function positionOverlay() {
  if (!overlayWindow) return;
  const cfg = store.store;
  const { width, height } = overlayWindow.getBounds();
  const { x, y } = centerBottom(width, height, cfg.overlayBottomMargin || 48);
  overlayWindow.setBounds({ x, y, width, height });
}

function centerBottom(w, h, bottomMargin) {
  const display = require('electron').screen.getPrimaryDisplay();
  const area = display.workArea; // exclude taskbar/dock
  const x = Math.round(area.x + (area.width - w) / 2);
  const y = Math.round(area.y + area.height - h - bottomMargin);
  return { x, y };
}

function createSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 640,
    height: 720,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    title: 'AI Interview – Settings'
  });
  settingsWindow.on('closed', () => settingsWindow = null);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}

function setTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('AI Interview Bot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Settings', click: () => createSettings() },
    { label: 'Test Answer', click: async () => {
      try { await showAnswer('Test question', 'Hello from AI Interview Bot'); } catch (_) {}
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

let hideTimer;
async function showAnswer(question, answer) {
  createOverlay();
  overlayWindow.webContents.send('show-answer', { question, answer, fontSize: store.get('overlayFontSize') });
  clearTimeout(hideTimer);
  const seconds = store.get('captionDurationSeconds') || 12;
  hideTimer = setTimeout(() => {
    overlayWindow && overlayWindow.webContents.send('hide');
  }, seconds * 1000);
}

async function handleClipboardTick() {
  const cfg = store.store;
  if (!cfg.clipboardEnabled) return;
  const text = clipboard.readText();
  if (!text || text === lastClipboard) return;
  lastClipboard = text;
  if (!looksLikeQuestion(text)) return;

  const now = Date.now();
  const cool = (cfg.cooldownSeconds || 10) * 1000;
  if (now - lastAskAt < cool) return;
  lastAskAt = now;

  const key = text.trim().slice(0, 200);
  if (recent.has(key)) return;
  recent.add(key);
  if (recent.size > 100) { // simple rotation
    const first = recent.values().next().value;
    recent.delete(first);
  }

  try {
    const answer = await callApi({ question: text, topic: cfg.defaultTopic || 'general' });
    await showAnswer(text, answer);
  } catch (e) {
    await showAnswer('Error', String(e?.message || e));
  }
}

function tick() {
  try { handleClipboardTick(); } catch (_) {}
}

app.whenReady().then(() => {
  createOverlay();
  setTray();
  setInterval(tick, 800);
});

app.on('window-all-closed', (e) => {
  // keep running in tray
  e.preventDefault();
});

ipcMain.handle('get-settings', () => store.store);
ipcMain.handle('save-settings', (_e, patch) => { store.set(patch || {}); positionOverlay(); return store.store; });
ipcMain.handle('test-call', async (_e, prompt) => {
  const answer = await callApi({ question: prompt || 'ping' });
  return answer;
});

