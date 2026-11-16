// App shell: game library (IndexedDB), import, per-app settings, and the multi-tab workspace.
import './style.css';
import { loadSuite, unzip, type Suite } from '../emulator';
import { AudioEngine } from './audio';
import { bindingLabel, bindingsFor, MIDP_KEYS, readGamepads } from './controls';
import { ITEM_NAMES } from './keypad';
import { coarsePointer, Workspace } from './player';
import type { TextRequest } from '../midp/platform';
import type { Session } from './session';
import {
  AppStore, clearAppData, DEFAULT_SETTINGS, loadTabPrefs, newId, saveTabPrefs, type AppEntry, type AppSettings,
} from './store';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ globals
const GLOBAL_KEY = 'j2me4w:global';
const global = (() => {
  const defaults = { proxy: '', muted: false, volume: 80, drawHidden: false, soundFocusedOnly: true };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(GLOBAL_KEY) ?? '{}') }; }
  catch { return defaults; }
})();
const saveGlobal = () => { try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(global)); } catch { /* ignore */ } };

const store = new AppStore();
const engine = new AudioEngine();
engine.log = (m) => log(m);
const logEl = $<HTMLPreElement>('log');
let apps: AppEntry[] = [];
let rt: Map<string, Uint8Array> | null = null;

const libraryView = $('libraryView');
const playerView = $('playerView');
const menuSheet = $('menuSheet');
const consoleSheet = $('consoleSheet');

function log(line: string, err = false) {
  const span = document.createElement('span');
  if (err) span.className = 'err';
  span.textContent = line + '\n';
  logEl.appendChild(span);
  while (logEl.childNodes.length > 2000) logEl.removeChild(logEl.firstChild!);
  if (!consoleSheet.hidden) logEl.scrollTop = logEl.scrollHeight;
  (err ? console.warn : console.log)(line);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

async function runtime(): Promise<Map<string, Uint8Array>> {
  if (!rt) {
    const res = await fetch(new URL('rt.jar', document.baseURI));
    if (!res.ok) throw new Error(`Cannot load rt.jar (${res.status})`);
    rt = unzip(new Uint8Array(await res.arrayBuffer()));
  }
  return rt;
}

// ------------------------------------------------------------------ dialogs
function dialogResult(d: HTMLDialogElement): Promise<string> {
  return new Promise((resolve) => {
    d.returnValue = '';
    const done = () => { d.removeEventListener('close', done); resolve(d.returnValue); };
    d.addEventListener('close', done);
    d.showModal();
  });
}

async function confirmBox(text: string, ok = 'OK', danger = false): Promise<boolean> {
  const d = $<HTMLDialogElement>('confirmDialog');
  $('confirmText').textContent = text;
  $<HTMLInputElement>('promptInput').hidden = true;
  const b = $('confirmOk');
  b.textContent = ok;
  b.style.background = danger ? 'var(--danger)' : '';
  b.style.borderColor = danger ? 'var(--danger)' : '';
  return (await dialogResult(d)) === 'ok';
}

async function promptBox(text: string, value: string): Promise<string | null> {
  const d = $<HTMLDialogElement>('confirmDialog');
  $('confirmText').textContent = text;
  const input = $<HTMLInputElement>('promptInput');
  input.hidden = false;
  input.value = value;
  $('confirmOk').textContent = 'Save';
  $('confirmOk').style.background = '';
  $('confirmOk').style.borderColor = '';
  setTimeout(() => input.select(), 0);
  return (await dialogResult(d)) === 'ok' ? input.value.trim() : null;
}

/**
 * Text entry for TextBox / TextField: a real input the user types into with the PC keyboard or the
 * phone's own keyboard. The screen's commands appear as buttons; Enter picks the first positive one.
 * Requests from several tabs are queued (one dialog at a time).
 */
let textQueue: Promise<unknown> = Promise.resolve();
const NEGATIVE = '\u0001';
function editText(req: TextRequest): Promise<{ text: string; command: number } | null> {
  const run = async () => {
    const d = $<HTMLDialogElement>('textDialog');
    const line = $<HTMLInputElement>('textLine');
    const area = $<HTMLTextAreaElement>('textArea');
    const reveal = $<HTMLButtonElement>('textReveal');
    const kind = req.constraints & 0xffff;
    const password = (req.constraints & 0x10000) !== 0;
    const multiline = kind === 0 && !password && req.maxSize > 120;
    const input: HTMLInputElement | HTMLTextAreaElement = multiline ? area : line;
    line.parentElement!.hidden = multiline;
    area.hidden = !multiline;
    $('textTitle').textContent = req.title || 'Enter text';
    $('textTitle').setAttribute('for', input.id);
    input.value = req.text;
    input.maxLength = req.maxSize;
    input.inputMode = kind === 2 ? 'numeric' : kind === 5 ? 'decimal' : kind === 3 ? 'tel' : kind === 1 ? 'email' : kind === 4 ? 'url' : 'text';
    if (!multiline) line.type = password ? 'password' : kind === 1 ? 'email' : 'text';
    reveal.hidden = !password;
    reveal.setAttribute('aria-pressed', 'false');
    $('textHint').textContent = kind === 2 ? 'Numbers only' : kind === 5 ? 'Decimal number' : kind === 3 ? 'Phone number' : '';
    const count = () => { $('textCount').textContent = `${input.value.length} / ${req.maxSize}`; };
    count();
    input.oninput = () => {
      if (kind === 2) input.value = input.value.replace(/[^\d-]/g, '');
      else if (kind === 5) input.value = input.value.replace(/[^\d.,-]/g, '');
      count();
    };
    // the game's commands, positive ones first; Enter triggers the first positive command
    const box = $('textCommands');
    box.innerHTML = '';
    const cmds = req.commands.map((label, index) => ({ label: label.replace(NEGATIVE, ''), index, negative: label.startsWith(NEGATIVE) }));
    const ordered = [...cmds.filter((c) => c.negative), ...cmds.filter((c) => !c.negative)];
    for (const c of ordered) {
      const b = document.createElement('button');
      b.value = `cmd:${c.index}`;
      b.className = c.negative ? 'btn' : 'btn primary';
      b.textContent = c.label || 'OK';
      box.appendChild(b);
    }
    const firstPositive = cmds.find((c) => !c.negative);
    const ok = $<HTMLButtonElement>('textOk');
    ok.hidden = !!firstPositive;
    (input as HTMLInputElement).enterKeyHint = firstPositive ? 'go' : 'done';
    input.onkeydown = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' && !(multiline && ke.shiftKey)) {
        ke.preventDefault();
        d.close(firstPositive ? `cmd:${firstPositive.index}` : 'ok');
      }
    };
    ws.releaseKeys();
    const r = dialogResult(d).then((v) => {
      if (v === 'ok') return { text: input.value, command: -1 };
      if (v.startsWith('cmd:')) return { text: input.value, command: Number(v.slice(4)) };
      return null;
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return r;
  };
  const p = textQueue.then(run, run);
  textQueue = p.catch(() => {});
  return p;
}

$('textReveal').addEventListener('click', () => {
  const line = $<HTMLInputElement>('textLine');
  const show = line.type === 'password';
  line.type = show ? 'text' : 'password';
  $('textReveal').setAttribute('aria-pressed', String(show));
  $('textReveal').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  line.focus();
});

// ------------------------------------------------------------------ workspace
const ws = new Workspace({
  root: playerView,
  body: $('playerBody'),
  stage: $('stage'),
  keypad: $('keypad'),
  fps: $('fps'),
}, {
  engine,
  bridge: () => global.proxy,
  log,
  editText,
  saveApp: (app) => { void store.put(app).catch(() => {}); },
  changed: () => { renderTabs(); syncPlayerButtons(); updateRunningBar(); },
  closeRequested: (s) => void closeTab(s),
});
if ((import.meta as any).env?.DEV) (window as any).__ws = ws; // inspection from tests
ws.setDrawHidden(!!global.drawHidden);
ws.setSoundFocusedOnly(global.soundFocusedOnly !== false);

const editBar = $('editBar');
const volumeInput = $<HTMLInputElement>('volume');
let pickerMode = false;
let exiting = false;

function setSheetLabel(action: string, text: string) {
  const span = menuSheet.querySelector(`[data-action="${action}"] span`);
  if (span) span.textContent = text;
}

function syncPlayerButtons() {
  $('kbBtn').setAttribute('aria-pressed', String(ws.keypadShown));
  const icon = engine.muted || global.volume === 0 ? '#i-mute' : '#i-sound';
  for (const id of ['soundBtn', 'menuMute']) {
    const b = $(id);
    b.querySelector('use')!.setAttribute('href', icon);
    b.setAttribute('aria-label', engine.muted ? 'Unmute' : 'Mute');
  }
  volumeInput.value = String(global.volume);
  $<HTMLOutputElement>('volumeOut').value = engine.muted ? 'Muted' : `${global.volume}%`;
  const multi = ws.sessions.length > 1;
  const grid = $('gridBtn');
  grid.setAttribute('aria-pressed', String(ws.view === 'grid'));
  grid.querySelector('use')!.setAttribute('href', ws.view === 'grid' ? '#i-single' : '#i-grid');
  grid.setAttribute('aria-label', ws.view === 'grid' ? 'Show one tab' : 'Show all tabs side by side');
  $('syncBtn').setAttribute('aria-pressed', String(ws.syncInput));
  grid.hidden = !multi;
  $('syncBtn').hidden = !multi;
  setSheetLabel('keypad', ws.keypadShown ? 'Hide keypad' : 'Show keypad');
  setSheetLabel('fullscreen', document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
  setSheetLabel('view', ws.view === 'grid' ? 'Show one tab at a time' : 'Show all tabs side by side');
  setSheetLabel('sync', `Sync input: ${ws.syncInput ? 'on' : 'off'}`);
  for (const a of ['view', 'sync']) (menuSheet.querySelector(`[data-action="${a}"]`) as HTMLElement).hidden = !multi;
  $('menuTitle').textContent = ws.focused?.title ?? '';
  playerView.classList.toggle('syncing', ws.syncInput && multi);
}

function setMuted(m: boolean) {
  engine.setMuted(m);
  global.muted = m;
  saveGlobal();
  syncPlayerButtons();
}

volumeInput.addEventListener('input', () => {
  global.volume = Number(volumeInput.value);
  engine.setVolume(global.volume / 100);
  if (engine.muted && global.volume > 0) { engine.setMuted(false); global.muted = false; }
  saveGlobal();
  syncPlayerButtons();
});

// ---- tab strip (bar + menu sheet)
function tabChip(s: Session, compact: boolean): HTMLElement {
  const b = document.createElement('div');
  b.className = 'tab-chip';
  b.setAttribute('role', 'tab');
  b.tabIndex = 0;
  b.setAttribute('aria-selected', String(s === ws.focused));
  b.dataset.status = s.status;
  if (s.via) b.classList.add('proxied');
  if (ws.syncInput && s.sync && ws.sessions.length > 1) b.classList.add('synced');
  const img = document.createElement('img');
  img.src = s.app.icon ?? 'icon.svg';
  img.alt = '';
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = s.title;
  b.title = `${s.title}${s.via ? ' — via proxy' : ''}${s.status !== 'running' ? ' — stopped' : ''}`;
  b.append(img, label);
  if (!compact || s === ws.focused) {
    const x = document.createElement('button');
    x.className = 'tab-x';
    x.setAttribute('aria-label', `Close ${s.title}`);
    x.innerHTML = '<svg class="ic"><use href="#i-close" /></svg>';
    x.addEventListener('click', (e) => { e.stopPropagation(); void closeTab(s); });
    b.appendChild(x);
  }
  b.addEventListener('click', () => { ws.focus(s); if (!menuSheet.hidden) menuSheet.hidden = true; });
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter') ws.focus(s); });
  b.addEventListener('dblclick', () => void openTabDialog(s));
  b.addEventListener('contextmenu', (e) => { e.preventDefault(); void openTabDialog(s); });
  return b;
}

function renderTabs() {
  const strip = $('tabStrip');
  const sheet = $('sheetTabs');
  strip.replaceChildren(...ws.sessions.map((s) => tabChip(s, true)));
  sheet.replaceChildren(...ws.sessions.map((s) => tabChip(s, false)));
  sheet.hidden = ws.sessions.length < 2;
  strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function updateRunningBar() {
  const n = ws.sessions.length;
  const bar = $('runningBar');
  bar.hidden = n === 0 || !playerView.hidden;
  $('runningText').textContent = n === 1 ? `${ws.sessions[0].title} is running` : `${n} games running`;
}

// ---- views
function showPlayer() {
  libraryView.hidden = true;
  playerView.hidden = false;
  setPicker(false);
  if (history.state?.view !== 'player') history.pushState({ view: 'player' }, '');
  ws.setShown(true);
  document.title = `${ws.focused?.title ?? 'Playing'} · J2ME4W`;
  renderTabs();
  syncPlayerButtons();
  updateRunningBar();
}

function showLibrary(picker = false) {
  stopEditing();
  menuSheet.hidden = true;
  consoleSheet.hidden = true;
  ws.setShown(false);
  void ws.exitFullscreen();
  playerView.hidden = true;
  libraryView.hidden = false;
  setPicker(picker);
  document.title = 'J2ME4W';
  renderLibrary();
  updateRunningBar();
}

/** Leaves the workspace for the library; games keep running in the background. */
function toLibrary(picker = false) {
  if (playerView.hidden) { setPicker(picker); return; }
  if (history.state?.view === 'player') {
    exiting = true;
    history.back();
  }
  showLibrary(picker);
}

function setPicker(on: boolean) {
  pickerMode = on;
  $('pickerBar').hidden = !on;
}
$('pickerCancel').addEventListener('click', () => { setPicker(false); if (ws.sessions.length) showPlayer(); });
$('runningBar').addEventListener('click', showPlayer);

async function chooseMidlet(suite: Suite): Promise<number | null> {
  if (suite.midlets.length < 2) return 0;
  const box = $('midletChoices');
  box.innerHTML = '';
  suite.midlets.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'sheet-item';
    b.value = String(i);
    b.textContent = m.name;
    box.appendChild(b);
  });
  const r = await dialogResult($<HTMLDialogElement>('midletDialog'));
  return r === '' || r === 'cancel' ? null : Number(r);
}

function freeSlot(app: AppEntry): number {
  const used = new Set(ws.sessions.filter((s) => s.app.id === app.id).map((s) => s.slot));
  let slot = 1;
  while (used.has(slot)) slot++;
  return slot;
}

/** Opens `app`: switches to its running tab, or starts it in a new tab. */
async function launch(app: AppEntry, newTab = false) {
  engine.unlock();
  if (!newTab && !pickerMode) {
    const running = ws.sessions.find((s) => s.app.id === app.id);
    if (running) { ws.focus(running); showPlayer(); return; }
  }
  let suite: Suite;
  try {
    let jar: Uint8Array, jad: string | undefined;
    if (app.builtin) {
      const res = await fetch(new URL('demo.jar', document.baseURI));
      if (!res.ok) throw new Error('demo.jar is missing (run npm run build:rt)');
      jar = new Uint8Array(await res.arrayBuffer());
    } else {
      const stored = await store.getJar(app.id);
      if (!stored) throw new Error('JAR data is missing; delete and re-add this game');
      jar = stored.jar;
      jad = stored.jad;
    }
    suite = loadSuite(jar, jad);
  } catch (e) {
    toast(String(e instanceof Error ? e.message : e), 4000);
    return;
  }
  const idx = await chooseMidlet(suite);
  if (idx === null) return;
  const boot = await runtime();
  const slot = freeSlot(app);
  showPlayer();
  if (coarsePointer() && app.settings.orientation !== 'auto' && ws.sessions.length === 0) void ws.enterFullscreen();
  ws.open(app, suite, boot, idx, slot, loadTabPrefs(app.id, slot).via);
  if (ws.sessions.length === 2 && !sessionStorage.getItem('j2me4w:tabsHint')) {
    sessionStorage.setItem('j2me4w:tabsHint', '1');
    toast(matchMedia('(max-width: 640px)').matches
      ? 'Two games running. The menu can show both side by side or send your input to both.'
      : 'Two games running. Use the grid button to see both, or the link button to control them together.', 5000);
  }
  document.title = `${ws.focused?.title ?? app.name} · J2ME4W`;
  app.lastPlayed = Date.now();
  void store.put(app).catch(() => {});
}

async function closeTab(s: Session) {
  if (s.running && !(await confirmBox(`Close “${s.title}”? The game stops and unsaved progress is lost.`, 'Close tab', true))) return;
  ws.close(s);
  if (!ws.sessions.length && !playerView.hidden) toLibrary();
}

function openMenu() {
  if (playerView.hidden) return;
  if (ws.editing) stopEditing();
  ws.releaseKeys();
  syncPlayerButtons();
  renderTabs();
  menuSheet.hidden = false;
  (menuSheet.querySelector('.sheet-item') as HTMLElement).focus();
}

// ---- per-tab settings
async function openTabDialog(s: Session) {
  const d = $<HTMLDialogElement>('tabDialog');
  $('tabDialogTitle').textContent = s.title;
  const sel = $<HTMLSelectElement>('tabSlot');
  sel.innerHTML = '';
  const used = new Set(ws.sessions.filter((x) => x !== s && x.app.id === s.app.id).map((x) => x.slot));
  for (let i = 1; i <= 9; i++) {
    const o = new Option(i === 1 ? 'Slot 1 (main save)' : `Slot ${i}`, String(i), false, i === s.slot);
    if (used.has(i)) { o.disabled = true; o.text += ' — open in another tab'; }
    sel.add(o);
  }
  $<HTMLInputElement>('tabVia').value = s.via;
  $<HTMLInputElement>('tabSync').checked = s.sync;
  ws.releaseKeys();
  if ((await dialogResult(d)) !== 'ok') return;
  const slot = Number(sel.value);
  const via = $<HTMLInputElement>('tabVia').value.trim();
  if (via && !/^(socks5h?|socks|http):\/\/[^\s/]+$/i.test(via.replace(/\/$/, ''))) {
    toast('Proxy must look like socks5://host:port or http://host:port', 4500);
    return;
  }
  s.sync = $<HTMLInputElement>('tabSync').checked;
  const restart = slot !== s.slot || via !== s.via;
  s.slot = slot;
  s.via = via;
  saveTabPrefs(s.app.id, slot, { via });
  s.updateLabel();
  if (restart) {
    toast(`Restarting ${s.title}`);
    ws.restart(s);
  }
  renderTabs();
}

// ---- keypad layout editing
ws.onEditSelection = (item) => {
  $('editTarget').textContent = item ? ITEM_NAMES[item] ?? item : 'Select a key group';
};

function startEditing() {
  ws.setEditing(true);
  editBar.hidden = false;
}

function stopEditing() {
  if (!ws.editing) return;
  ws.setEditing(false);
  editBar.hidden = true;
  toast('Keypad layout saved');
}

editBar.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'smaller') ws.resizeSelected(-0.1);
  if (action === 'bigger') ws.resizeSelected(0.1);
  if (action === 'reset') { ws.resetLayout(); toast('Default positions restored for this orientation'); }
  if (action === 'done') stopEditing();
});

window.addEventListener('popstate', () => {
  if (exiting) { exiting = false; return; }
  if (playerView.hidden) {
    // back from the library returns to running games, if any
    if (ws.sessions.length && history.state?.view === 'player') showPlayer();
    return;
  }
  // Android back: leave edit mode, then open the menu; back on the menu goes to the library
  if (ws.editing) {
    history.pushState({ view: 'player' }, '');
    stopEditing();
    return;
  }
  if (!menuSheet.hidden || !consoleSheet.hidden) {
    showLibrary();
    return;
  }
  history.pushState({ view: 'player' }, '');
  openMenu();
});

function toggleView() {
  ws.setView(ws.view === 'grid' ? 'single' : 'grid');
  syncPlayerButtons();
}

function toggleSync() {
  ws.syncInput = !ws.syncInput;
  toast(ws.syncInput ? 'Input goes to every synced tab' : 'Input goes to the selected tab only');
  renderTabs();
  syncPlayerButtons();
}

menuSheet.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t === menuSheet) { menuSheet.hidden = true; return; }
  const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'mute') { setMuted(!engine.muted); return; }
  menuSheet.hidden = true;
  const s = ws.focused;
  switch (action) {
    case 'newtab': toLibrary(true); break;
    case 'view': toggleView(); break;
    case 'sync': toggleSync(); break;
    case 'tabsettings': if (s) await openTabDialog(s); break;
    case 'keypad': ws.toggleKeypad(); break;
    case 'edit': startEditing(); break;
    case 'screenshot': s?.screenshot(); toast('Screenshot saved'); break;
    case 'fullscreen': await toggleFullscreen(); break;
    case 'settings': if (s) await openSettings(s.app); break;
    case 'log': consoleSheet.hidden = false; logEl.scrollTop = logEl.scrollHeight; break;
    case 'restart': ws.restart(); break;
    case 'close': if (s) await closeTab(s); break;
  }
  syncPlayerButtons();
});

consoleSheet.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const action = t === consoleSheet ? 'close' : t.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'close') consoleSheet.hidden = true;
  if (action === 'clear') logEl.textContent = '';
  if (action === 'copy') void navigator.clipboard?.writeText(logEl.textContent ?? '').then(() => toast('Copied'));
});

async function toggleFullscreen() {
  if (document.fullscreenElement) await ws.exitFullscreen();
  else await ws.enterFullscreen();
}

$('backBtn').addEventListener('click', () => toLibrary());
$('newTabBtn').addEventListener('click', () => toLibrary(true));
$('gridBtn').addEventListener('click', toggleView);
$('syncBtn').addEventListener('click', toggleSync);
$('menuBtn').addEventListener('click', openMenu);
$('floatMenu').addEventListener('click', openMenu);
$('fsBtn').addEventListener('click', () => void toggleFullscreen());
$('kbBtn').addEventListener('click', () => { ws.toggleKeypad(); if (!ws.keypadShown) stopEditing(); syncPlayerButtons(); });
$('soundBtn').addEventListener('click', () => setMuted(!engine.muted));
document.addEventListener('fullscreenchange', () => { syncPlayerButtons(); ws.layout(); });

// hardware keyboard
window.addEventListener('keydown', (e) => {
  if (capture) return; // a binding is being recorded
  if (document.querySelector('dialog[open]')) return;
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (playerView.hidden) return;
  if (!menuSheet.hidden || !consoleSheet.hidden) {
    if (e.key === 'Escape') { menuSheet.hidden = true; consoleSheet.hidden = true; e.preventDefault(); }
    return;
  }
  if (ws.editing) {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); stopEditing(); }
    if (e.key === '+' || e.key === '=') ws.resizeSelected(0.1);
    if (e.key === '-') ws.resizeSelected(-0.1);
    return;
  }
  // Alt+1..9 switches tabs, Alt+G toggles the grid, Alt+S toggles input sync
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); ws.focusIndex(Number(e.code.slice(5)) - 1); return; }
    if (e.code === 'KeyG') { e.preventDefault(); toggleView(); return; }
    if (e.code === 'KeyS') { e.preventDefault(); toggleSync(); return; }
  }
  if ((e.key === 'Escape' || e.code === 'KeyM') && !e.repeat && !e.altKey) { e.preventDefault(); openMenu(); return; }
  if (e.code === 'KeyF' && !e.repeat && !e.altKey) { e.preventDefault(); void toggleFullscreen(); return; }
  if (ws.keyDown(e)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { if (!playerView.hidden && ws.keyUp(e)) e.preventDefault(); });
window.addEventListener('blur', () => ws.releaseKeys());

// ------------------------------------------------------------------ settings dialog
const settingsDialog = $<HTMLDialogElement>('settingsDialog');
const form = $<HTMLFormElement>('settingsForm');
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;
/** Settings being edited (bindings and layouts change here before Save). */
let draft: AppSettings = { ...DEFAULT_SETTINGS };

function selectTab(name: string) {
  for (const t of form.querySelectorAll<HTMLElement>('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of form.querySelectorAll<HTMLElement>('.tab-panel')) p.hidden = p.dataset.panel !== name;
  try { localStorage.setItem('j2me4w:settingsTab', name); } catch { /* ignore */ }
}
form.querySelector('.tabs')!.addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (tab) selectTab(tab.dataset.tab!);
});
form.querySelector('.tabs')!.addEventListener('keydown', (e) => {
  const k = (e as KeyboardEvent).key;
  if (k !== 'ArrowLeft' && k !== 'ArrowRight') return;
  const tabs = [...form.querySelectorAll<HTMLElement>('.tab')];
  const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  selectTab(next.dataset.tab!);
  next.focus();
});

function fillSettings(s: AppSettings) {
  draft = { ...s, keyLayouts: { ...s.keyLayouts }, bindings: { ...s.bindings } };
  field('width').value = String(s.width);
  field('height').value = String(s.height);
  syncSizeUI();
  field<HTMLSelectElement>('scale').value = s.scale;
  field('background').value = s.background;
  field<HTMLSelectElement>('orientation').value = s.orientation;
  field('filter').checked = s.filter;
  field('showFps').checked = s.showFps;
  field('fontSmall').value = s.fontSmall ? String(s.fontSmall) : '';
  field('fontMedium').value = s.fontMedium ? String(s.fontMedium) : '';
  field('fontLarge').value = s.fontLarge ? String(s.fontLarge) : '';
  field('fontAA').checked = s.fontAA;
  field<HTMLSelectElement>('keypad').value = s.keypad;
  field<HTMLSelectElement>('keypadType').value = s.keypadType;
  field('keypadOpacity').value = String(s.keypadOpacity);
  field<HTMLOutputElement>('opacityOut').value = `${Math.round(s.keypadOpacity * 100)}%`;
  field('haptics').checked = s.haptics;
  field('pauseWhenHidden').checked = s.pauseWhenHidden;
  field<HTMLTextAreaElement>('sysProps').value = s.sysProps;
  renderLayoutSummary();
  renderBindings();
}

function readSettings(): AppSettings {
  const num = (n: string) => Math.max(0, Math.min(48, parseInt(field(n).value, 10) || 0));
  // the width/height inputs always hold the chosen size (presets, "match device" and swap fill them)
  const w = Math.max(64, Math.min(1024, parseInt(field('width').value, 10) || 240));
  const h = Math.max(64, Math.min(1024, parseInt(field('height').value, 10) || 320));
  return {
    width: w,
    height: h,
    scale: field<HTMLSelectElement>('scale').value as AppSettings['scale'],
    background: field('background').value,
    orientation: field<HTMLSelectElement>('orientation').value as AppSettings['orientation'],
    filter: field('filter').checked,
    showFps: field('showFps').checked,
    fontSmall: num('fontSmall'),
    fontMedium: num('fontMedium'),
    fontLarge: num('fontLarge'),
    fontAA: field('fontAA').checked,
    keypad: field<HTMLSelectElement>('keypad').value as AppSettings['keypad'],
    keypadType: field<HTMLSelectElement>('keypadType').value as AppSettings['keypadType'],
    keypadOpacity: Number(field('keypadOpacity').value),
    haptics: field('haptics').checked,
    pauseWhenHidden: field('pauseWhenHidden').checked,
    sysProps: field<HTMLTextAreaElement>('sysProps').value,
    keyLayouts: draft.keyLayouts,
    bindings: draft.bindings,
  };
}

function renderLayoutSummary() {
  const n = Object.keys(draft.keyLayouts).length;
  $('layoutSummary').textContent = n ? `Custom in ${n} layout${n > 1 ? 's' : ''}` : 'Default';
  $<HTMLButtonElement>('resetLayouts').disabled = n === 0;
}
$('resetLayouts').addEventListener('click', () => { draft.keyLayouts = {}; renderLayoutSummary(); });

// ---- controls (bindings) editor
let capture: { code: number; cancel: () => void } | null = null;

function renderBindings() {
  const list = $('bindingList');
  list.innerHTML = '';
  for (const k of MIDP_KEYS) {
    const row = document.createElement('div');
    row.className = 'binding-row';
    row.dataset.code = String(k.code);
    const name = document.createElement('span');
    name.className = 'binding-name';
    name.textContent = k.name;
    const chips = document.createElement('div');
    chips.className = 'binding-chips';
    for (const b of bindingsFor(draft.bindings, k.code)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = bindingLabel(b);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.setAttribute('aria-label', `Remove ${bindingLabel(b)} from ${k.name}`);
      x.innerHTML = '<svg class="ic"><use href="#i-close" /></svg>';
      x.addEventListener('click', () => setBindings(k.code, bindingsFor(draft.bindings, k.code).filter((v) => v !== b)));
      chip.appendChild(x);
      chips.appendChild(chip);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'chip add';
    add.textContent = 'Add';
    add.setAttribute('aria-label', `Add a key for ${k.name}`);
    add.addEventListener('click', () => startCapture(k.code, add));
    chips.appendChild(add);
    row.append(name, chips);
    list.appendChild(row);
  }
}

function setBindings(code: number, list: string[]) {
  draft.bindings = { ...draft.bindings, [String(code)]: list };
  renderBindings();
}

function assign(code: number, binding: string) {
  // a binding drives one phone key: take it away from any other key first
  const next = { ...draft.bindings };
  for (const k of MIDP_KEYS) {
    if (k.code === code) continue;
    const cur = bindingsFor(next, k.code);
    if (cur.includes(binding)) next[String(k.code)] = cur.filter((v) => v !== binding);
  }
  const mine = bindingsFor(next, code);
  if (!mine.includes(binding)) next[String(code)] = [...mine, binding];
  draft.bindings = next;
  renderBindings();
}

function startCapture(code: number, btn: HTMLElement) {
  capture?.cancel();
  btn.textContent = 'Press a key…';
  btn.classList.add('listening');
  const before = readGamepads();
  let raf = 0;
  const finish = (binding: string | null) => {
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    capture = null;
    if (binding) assign(code, binding); else renderBindings();
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { finish(null); return; }
    finish(`k:${e.code}`);
  };
  const poll = () => {
    for (const b of readGamepads()) if (!before.has(b)) { finish(b); return; }
    raf = requestAnimationFrame(poll);
  };
  window.addEventListener('keydown', onKey, true);
  raf = requestAnimationFrame(poll);
  capture = { code, cancel: () => finish(null) };
}

$('resetBindings').addEventListener('click', () => { capture?.cancel(); draft.bindings = {}; renderBindings(); });
settingsDialog.addEventListener('close', () => capture?.cancel());

/** A screen size with the same shape as this device's viewport, 240 px on the short side. */
function deviceSize(): [number, number] {
  const vw = window.innerWidth, vh = window.innerHeight;
  const clamp = (v: number) => Math.max(240, Math.min(480, Math.round(v / 2) * 2));
  return vh >= vw ? [240, clamp((240 * vh) / vw)] : [clamp((240 * vw) / vh), 240];
}

/** Selects the preset matching width x height (or Custom) and describes the size. */
function syncSizeUI(fromPreset = false) {
  const sel = field<HTMLSelectElement>('preset');
  const w = parseInt(field('width').value, 10) || 0, h = parseInt(field('height').value, 10) || 0;
  if (!fromPreset) {
    const v = `${w}x${h}`;
    sel.value = [...sel.options].some((o) => o.value === v) ? v : 'custom';
  }
  (form.querySelector('.custom-size') as HTMLElement).hidden = sel.value !== 'custom';
  const shape = w > h ? 'Landscape' : w < h ? 'Portrait' : 'Square';
  $('sizeHint').textContent = `${shape}, ${w} × ${h}. Changing the size restarts the game.`;
}

field<HTMLSelectElement>('preset').addEventListener('change', () => {
  const v = field<HTMLSelectElement>('preset').value;
  if (v === 'device') {
    const [w, h] = deviceSize();
    field('width').value = String(w);
    field('height').value = String(h);
  } else if (v !== 'custom') {
    const [w, h] = v.split('x');
    field('width').value = w;
    field('height').value = h;
  }
  syncSizeUI(true);
});
$('swapSize').addEventListener('click', () => {
  const w = field('width').value;
  field('width').value = field('height').value;
  field('height').value = w;
  syncSizeUI();
});
for (const n of ['width', 'height']) field(n).addEventListener('input', () => syncSizeUI(true));
field('keypadOpacity').addEventListener('input', () => {
  field<HTMLOutputElement>('opacityOut').value = `${Math.round(Number(field('keypadOpacity').value) * 100)}%`;
});

const NEEDS_RESTART: (keyof AppSettings)[] = ['width', 'height', 'fontSmall', 'fontMedium', 'fontLarge', 'fontAA', 'sysProps'];

async function openSettings(app: AppEntry) {
  stopEditing();
  $('settingsTitle').textContent = app.name;
  fillSettings(app.settings);
  let tab = 'display';
  try { tab = localStorage.getItem('j2me4w:settingsTab') ?? 'display'; } catch { /* ignore */ }
  selectTab(tab);
  ws.releaseKeys();
  for (;;) {
    const r = await dialogResult(settingsDialog);
    if (r === 'reset') {
      if (await confirmBox('Reset every setting of this game, including controls and key positions?', 'Reset all', true)) {
        fillSettings({ ...DEFAULT_SETTINGS, keyLayouts: {}, bindings: {} });
      }
      continue;
    }
    if (r !== 'save') return;
    break;
  }
  const next = readSettings();
  const restart = NEEDS_RESTART.some((k) => next[k] !== app.settings[k]);
  app.settings = next;
  await store.put(app);
  const tabs = ws.sessions.filter((s) => s.app.id === app.id);
  if (tabs.length) {
    if (restart) {
      toast(tabs.length > 1 ? `Restarting ${tabs.length} tabs with the new settings` : 'Restarting with the new settings');
      for (const s of tabs) ws.restart(s);
    }
    ws.applySettings();
    syncPlayerButtons();
  } else {
    toast('Settings saved');
  }
  renderLibrary();
}

// ------------------------------------------------------------------ library
function formatSize(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function renderLibrary() {
  const list = $('appList');
  const q = $<HTMLInputElement>('search').value.trim().toLowerCase();
  const sort = $<HTMLSelectElement>('sort').value;
  const shown = apps
    .filter((a) => !q || a.name.toLowerCase().includes(q) || a.vendor.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'vendor') return a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name);
      if (!!a.builtin !== !!b.builtin) return a.builtin ? 1 : -1;
      return Math.max(b.lastPlayed, b.addedAt) - Math.max(a.lastPlayed, a.addedAt);
    });
  list.innerHTML = '';
  for (const app of shown) {
    const running = ws.sessions.filter((s) => s.app.id === app.id).length;
    const li = document.createElement('li');
    li.className = 'app-card';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', pickerMode ? `Open ${app.name} in a new tab` : `Play ${app.name}`);
    const img = document.createElement('img');
    img.className = 'app-icon';
    img.alt = '';
    img.src = app.icon ?? 'icon.svg';
    const meta = document.createElement('div');
    meta.className = 'app-meta';
    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name;
    const sub = document.createElement('div');
    sub.className = 'app-sub';
    const info = app.builtin ? 'Built-in demo' : [app.vendor, app.version && `v${app.version}`, formatSize(app.size)].filter(Boolean).join(' · ');
    sub.textContent = running ? `${running === 1 ? 'Running' : `${running} tabs running`} · ${info}` : info;
    if (running) li.classList.add('running');
    meta.append(name, sub);
    const more = document.createElement('button');
    more.className = 'icon-btn';
    more.setAttribute('aria-label', `Options for ${app.name}`);
    more.innerHTML = '<svg class="ic"><use href="#i-more" /></svg>';
    more.addEventListener('click', (e) => { e.stopPropagation(); void appMenu(app); });
    li.append(img, meta, more);
    li.addEventListener('click', () => void launch(app));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') void launch(app); });
    li.addEventListener('contextmenu', (e) => { e.preventDefault(); void appMenu(app); });
    list.appendChild(li);
  }
  const empty = $('emptyState');
  empty.hidden = shown.length > 0;
  empty.querySelector('h2')!.textContent = q ? `No matches for “${q}”` : 'No games yet';
}

async function appMenu(app: AppEntry) {
  const d = $<HTMLDialogElement>('appMenuDialog');
  $<HTMLImageElement>('amIcon').src = app.icon ?? 'icon.svg';
  $('amName').textContent = app.name;
  $('amInfo').textContent = [app.vendor, app.version && `v${app.version}`].filter(Boolean).join(' · ');
  for (const b of d.querySelectorAll<HTMLButtonElement>('[value="rename"],[value="delete"]')) b.hidden = !!app.builtin;
  const r = await dialogResult(d);
  switch (r) {
    case 'play': void launch(app); break;
    case 'newtab': void launch(app, true); break;
    case 'settings': await openSettings(app); break;
    case 'rename': {
      const n = await promptBox('Rename', app.name);
      if (n) {
        app.name = n;
        await store.put(app);
        for (const s of ws.sessions) if (s.app === app) s.updateLabel();
        renderLibrary();
        renderTabs();
      }
      break;
    }
    case 'clear':
      if (await confirmBox(`Delete the saved data (records, high scores) of “${app.name}”, in every slot?`, 'Clear data', true)) {
        toast(`Cleared ${clearAppData(app.id)} record store(s)`);
      }
      break;
    case 'delete':
      if (await confirmBox(`Delete “${app.name}” and its saved data?`, 'Delete', true)) {
        for (const s of ws.sessions.filter((x) => x.app.id === app.id)) ws.close(s);
        await store.delete(app.id);
        clearAppData(app.id);
        apps = apps.filter((a) => a.id !== app.id);
        renderLibrary();
        updateRunningBar();
        toast(`Deleted ${app.name}`);
      }
      break;
  }
}

function extractIcon(suite: Suite): string | null {
  const path = (suite.properties['MIDlet-Icon'] || suite.midlets[0]?.icon || '').trim().replace(/^\//, '');
  if (!path) return null;
  const data = suite.files.get(path);
  if (!data || data.length > 128 * 1024) return null;
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + 0x8000)));
  const type = data[0] === 0x89 ? 'image/png' : data[0] === 0xff ? 'image/jpeg' : 'image/gif';
  return `data:${type};base64,${btoa(bin)}`;
}

async function installFiles(files: FileList | File[]) {
  const list = Array.from(files);
  const jars = list.filter((f) => /\.jar$/i.test(f.name) || f.type === 'application/java-archive');
  const jads = list.filter((f) => /\.jad$/i.test(f.name));
  if (!jars.length) {
    toast(jads.length ? 'Select the .jar file too (you can pick the .jar and .jad together)' : 'Not a .jar file', 4000);
    return;
  }
  let installed: AppEntry | null = null;
  for (const f of jars) {
    const base = f.name.replace(/\.jar$/i, '').toLowerCase();
    const jadFile = jads.find((j) => j.name.replace(/\.jad$/i, '').toLowerCase() === base) ?? (jars.length === 1 ? jads[0] : undefined);
    try {
      const jar = new Uint8Array(await f.arrayBuffer());
      const jad = jadFile ? await jadFile.text() : undefined;
      const suite = loadSuite(jar, jad);
      if (!suite.midlets.length) throw new Error('no MIDlet-1 entry in the manifest');
      const name = suite.properties['MIDlet-Name'] || f.name.replace(/\.jar$/i, '');
      const vendor = suite.properties['MIDlet-Vendor'] ?? '';
      const existing = apps.find((a) => !a.builtin && a.name === name && a.vendor === vendor);
      const entry: AppEntry = {
        id: existing?.id ?? newId(),
        name,
        vendor,
        version: suite.properties['MIDlet-Version'] ?? '',
        size: jar.length,
        icon: extractIcon(suite),
        midlets: suite.midlets,
        addedAt: existing?.addedAt ?? Date.now(),
        lastPlayed: existing?.lastPlayed ?? 0,
        settings: existing?.settings ?? { ...DEFAULT_SETTINGS },
      };
      await store.putWithJar(entry, { jar, jad });
      apps = apps.filter((a) => a.id !== entry.id).concat(entry);
      installed = entry;
      toast(existing ? `Updated ${name} (saved data kept)` : `Installed ${name}`);
    } catch (e) {
      toast(`${f.name}: ${e instanceof Error ? e.message : e}`, 5000);
    }
  }
  renderLibrary();
  if (installed && jars.length === 1 && playerView.hidden) {
    // one game added: start it right away, like J2ME-Loader does after installing
    void launch(installed, pickerMode);
  }
}

for (const id of ['fileInput', 'fileInputFab']) {
  $<HTMLInputElement>(id).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) void installFiles(input.files);
    input.value = '';
  });
}

let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (!playerView.hidden || !e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('dropHint').hidden = false;
});
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('dropHint').hidden = true;
  if (e.dataTransfer?.files.length && playerView.hidden) void installFiles(e.dataTransfer.files);
});

$('search').addEventListener('input', renderLibrary);
$<HTMLSelectElement>('sort').addEventListener('change', () => {
  try { localStorage.setItem('j2me4w:sort', $<HTMLSelectElement>('sort').value); } catch { /* ignore */ }
  renderLibrary();
});

$('globalBtn').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('proxyInput');
  input.value = global.proxy;
  $<HTMLInputElement>('optDrawHidden').checked = !!global.drawHidden;
  $<HTMLInputElement>('optSoundFocused').checked = global.soundFocusedOnly !== false;
  const r = await dialogResult($<HTMLDialogElement>('globalDialog'));
  if (r !== 'save') return;
  global.proxy = input.value.trim();
  global.drawHidden = $<HTMLInputElement>('optDrawHidden').checked;
  global.soundFocusedOnly = $<HTMLInputElement>('optSoundFocused').checked;
  saveGlobal();
  ws.setDrawHidden(global.drawHidden);
  ws.setSoundFocusedOnly(global.soundFocusedOnly);
});

window.addEventListener('beforeunload', (e) => {
  if (ws.sessions.some((s) => s.running)) e.preventDefault();
});

// ------------------------------------------------------------------ boot
async function boot() {
  try { $<HTMLSelectElement>('sort').value = localStorage.getItem('j2me4w:sort') ?? 'recent'; } catch { /* ignore */ }
  engine.setMuted(!!global.muted);
  engine.setVolume(global.volume / 100);
  try {
    apps = await store.list();
  } catch (e) {
    toast(`Storage unavailable: ${e}`, 5000);
    apps = [];
  }
  // the library no longer lists the built-in demo
  for (const a of apps.filter((x) => x.builtin)) void store.delete(a.id).catch(() => {});
  apps = apps.filter((a) => !a.builtin);
  // the on-screen keypad is now on by default: move games still on the old "auto" default
  if (!localStorage.getItem('j2me4w:migr:keypadShow2')) {
    for (const a of apps) {
      if (a.settings.keypad === 'auto' || a.settings.keypadOpacity < 0.6) {
        a.settings = {
          ...a.settings,
          keypad: a.settings.keypad === 'auto' ? 'show' : a.settings.keypad,
          keypadOpacity: Math.max(a.settings.keypadOpacity, 0.8),
        };
        void store.put(a).catch(() => {});
      }
    }
    try { localStorage.setItem('j2me4w:migr:keypadShow2', '1'); } catch { /* ignore */ }
  }
  renderLibrary();
  history.replaceState({ view: 'library' }, '');
  void runtime().catch((e) => toast(String(e), 5000));
}

void boot();
