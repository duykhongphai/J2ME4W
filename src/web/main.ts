// App shell: game library (IndexedDB), import, per-app settings, routing between library and player.
import './style.css';
import { loadSuite, unzip, type Suite } from '../emulator';
import { WebAudioHost } from './audio';
import { ProxyNetHost } from './net';
import { coarsePointer, Player } from './player';
import {
  AppStore, clearAppData, DEFAULT_SETTINGS, newId, type AppEntry, type AppSettings,
} from './store';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ globals
const GLOBAL_KEY = 'j2me4w:global';
const global = (() => {
  try { return { proxy: '', muted: false, ...JSON.parse(localStorage.getItem(GLOBAL_KEY) ?? '{}') }; }
  catch { return { proxy: '', muted: false }; }
})();
const saveGlobal = () => { try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(global)); } catch { /* ignore */ } };

const store = new AppStore();
const audio = new WebAudioHost();
const logEl = $<HTMLPreElement>('log');
const net = new ProxyNetHost(() => global.proxy, (m) => log(m));
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
  while (logEl.childNodes.length > 1500) logEl.removeChild(logEl.firstChild!);
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
  setTimeout(() => input.select(), 0);
  return (await dialogResult(d)) === 'ok' ? input.value.trim() : null;
}

function editText(title: string | null, text: string, maxSize: number, constraints: number): Promise<string | null> {
  const d = $<HTMLDialogElement>('textDialog');
  const input = $<HTMLTextAreaElement>('textInput');
  $('textTitle').textContent = title || 'Enter text';
  input.value = text;
  input.maxLength = maxSize;
  const kind = constraints & 0xffff;
  input.inputMode = kind === 2 ? 'numeric' : kind === 5 ? 'decimal' : kind === 3 ? 'tel' : kind === 1 ? 'email' : 'text';
  player.releaseKeys();
  const r = dialogResult(d).then((v) => (v === 'ok' ? input.value : null));
  setTimeout(() => { input.focus(); input.select(); }, 0);
  return r;
}

// ------------------------------------------------------------------ player
const player = new Player({
  root: playerView,
  body: $('playerBody'),
  stage: $('stage'),
  canvas: $<HTMLCanvasElement>('screen'),
  keypad: $('keypad'),
  overlay: $('overlay'),
  fps: $('fps'),
}, {
  audio,
  net,
  log,
  editText,
  onExit: (reason) => {
    if (playerView.hidden) return;
    player.showOverlay(reason === 'MIDlet exited' ? 'Game closed' : 'Stopped',
      reason === 'MIDlet exited' ? '' : reason);
  },
});

let exiting = false;

function syncPlayerButtons() {
  $('kbBtn').setAttribute('aria-pressed', String(player.keypadShown));
  const snd = $('soundBtn');
  snd.querySelector('use')!.setAttribute('href', audio.muted ? '#i-mute' : '#i-sound');
  snd.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  const kpItem = menuSheet.querySelector('[data-action="keypad"]')!;
  kpItem.textContent = player.keypadShown ? 'Hide keypad' : 'Show keypad';
  const fsItem = menuSheet.querySelector('[data-action="fullscreen"]')!;
  fsItem.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
}

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

async function play(app: AppEntry) {
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

  libraryView.hidden = true;
  playerView.hidden = false;
  menuSheet.hidden = true;
  consoleSheet.hidden = true;
  $('playerTitle').textContent = app.name;
  $<HTMLImageElement>('playerIcon').src = app.icon ?? 'icon.svg';
  $('menuTitle').textContent = app.name;
  document.title = `${app.name} · J2ME4W`;
  history.pushState({ view: 'player' }, '');
  if (coarsePointer() && app.settings.orientation !== 'auto') void player.enterFullscreen();

  await player.start(app, suite, boot, idx);
  syncPlayerButtons();
  app.lastPlayed = Date.now();
  void store.put(app).catch(() => {});
}

function showLibrary() {
  player.stop();
  void player.exitFullscreen();
  playerView.hidden = true;
  libraryView.hidden = false;
  document.title = 'J2ME4W';
  renderLibrary();
}

/** Leaves the player (also pops the history entry pushed by play()). */
function exitToLibrary() {
  if (playerView.hidden) return;
  if (history.state?.view === 'player') {
    exiting = true;
    history.back();
  }
  showLibrary();
}

function openMenu() {
  if (playerView.hidden) return;
  player.releaseKeys();
  syncPlayerButtons();
  menuSheet.hidden = false;
  (menuSheet.querySelector('.sheet-item') as HTMLElement).focus();
}

window.addEventListener('popstate', () => {
  if (exiting) { exiting = false; return; }
  if (playerView.hidden) return;
  // Android back button: first press opens the menu, a second press leaves the game
  if (!menuSheet.hidden || !consoleSheet.hidden) {
    showLibrary();
    return;
  }
  history.pushState({ view: 'player' }, '');
  openMenu();
});

menuSheet.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t === menuSheet) { menuSheet.hidden = true; return; }
  const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;
  menuSheet.hidden = true;
  switch (action) {
    case 'keypad': player.toggleKeypad(); break;
    case 'screenshot': player.screenshot(); toast('Screenshot saved'); break;
    case 'fullscreen': await toggleFullscreen(); break;
    case 'settings': if (player.app) await openSettings(player.app); break;
    case 'log': consoleSheet.hidden = false; logEl.scrollTop = logEl.scrollHeight; break;
    case 'restart': player.restart(); break;
    case 'exit': exitToLibrary(); break;
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

$('overlay').addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'restart') player.restart();
  if (action === 'library') exitToLibrary();
});

async function toggleFullscreen() {
  if (document.fullscreenElement) await player.exitFullscreen();
  else await player.enterFullscreen();
}

$('backBtn').addEventListener('click', exitToLibrary);
$('menuBtn').addEventListener('click', openMenu);
$('floatMenu').addEventListener('click', openMenu);
$('fsBtn').addEventListener('click', () => void toggleFullscreen());
$('kbBtn').addEventListener('click', () => { player.toggleKeypad(); syncPlayerButtons(); });
$('soundBtn').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  global.muted = audio.muted;
  saveGlobal();
  syncPlayerButtons();
});
document.addEventListener('fullscreenchange', () => { syncPlayerButtons(); player.layout(); });

// hardware keyboard
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (playerView.hidden) return;
  if (!menuSheet.hidden || !consoleSheet.hidden) {
    if (e.key === 'Escape') { menuSheet.hidden = true; consoleSheet.hidden = true; e.preventDefault(); }
    return;
  }
  if ((e.key === 'Escape' || e.code === 'KeyM') && !e.repeat) { e.preventDefault(); openMenu(); return; }
  if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); void toggleFullscreen(); return; }
  if (player.keyDown(e)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { if (!playerView.hidden && player.keyUp(e)) e.preventDefault(); });
window.addEventListener('blur', () => player.releaseKeys());

// ------------------------------------------------------------------ settings dialog
const settingsDialog = $<HTMLDialogElement>('settingsDialog');
const form = $<HTMLFormElement>('settingsForm');
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;

function fillSettings(s: AppSettings) {
  const preset = `${s.width}x${s.height}`;
  const sel = field<HTMLSelectElement>('preset');
  sel.value = [...sel.options].some((o) => o.value === preset) ? preset : 'custom';
  field('width').value = String(s.width);
  field('height').value = String(s.height);
  (form.querySelector('.custom-size') as HTMLElement).hidden = sel.value !== 'custom';
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
}

function readSettings(): AppSettings {
  const num = (n: string) => Math.max(0, Math.min(48, parseInt(field(n).value, 10) || 0));
  const sel = field<HTMLSelectElement>('preset').value;
  let [w, h] = sel === 'custom'
    ? [parseInt(field('width').value, 10), parseInt(field('height').value, 10)]
    : sel.split('x').map(Number);
  w = Math.max(64, Math.min(1024, w || 240));
  h = Math.max(64, Math.min(1024, h || 320));
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
  };
}

field<HTMLSelectElement>('preset').addEventListener('change', () => {
  const v = field<HTMLSelectElement>('preset').value;
  (form.querySelector('.custom-size') as HTMLElement).hidden = v !== 'custom';
  if (v !== 'custom') {
    const [w, h] = v.split('x');
    field('width').value = w;
    field('height').value = h;
  }
});
field('keypadOpacity').addEventListener('input', () => {
  field<HTMLOutputElement>('opacityOut').value = `${Math.round(Number(field('keypadOpacity').value) * 100)}%`;
});

const NEEDS_RESTART: (keyof AppSettings)[] = ['width', 'height', 'fontSmall', 'fontMedium', 'fontLarge', 'fontAA', 'sysProps'];

async function openSettings(app: AppEntry) {
  $('settingsTitle').textContent = app.name;
  fillSettings(app.settings);
  player.releaseKeys();
  for (;;) {
    const r = await dialogResult(settingsDialog);
    if (r === 'reset') { fillSettings(DEFAULT_SETTINGS); continue; }
    if (r !== 'save') return;
    break;
  }
  const next = readSettings();
  const restart = NEEDS_RESTART.some((k) => next[k] !== app.settings[k]);
  app.settings = next;
  await store.put(app);
  if (player.app?.id === app.id && !playerView.hidden) {
    if (restart) {
      toast('Restarting with the new settings');
      player.restart();
    } else {
      player.applySettings();
    }
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
    const li = document.createElement('li');
    li.className = 'app-card';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Play ${app.name}`);
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
    sub.textContent = app.builtin ? 'Built-in demo' : [app.vendor, app.version && `v${app.version}`, formatSize(app.size)].filter(Boolean).join(' · ');
    meta.append(name, sub);
    const more = document.createElement('button');
    more.className = 'icon-btn';
    more.setAttribute('aria-label', `Options for ${app.name}`);
    more.innerHTML = '<svg class="ic"><use href="#i-more" /></svg>';
    more.addEventListener('click', (e) => { e.stopPropagation(); void appMenu(app); });
    li.append(img, meta, more);
    li.addEventListener('click', () => { audio.unlock(); void play(app); });
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') void play(app); });
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
    case 'play': void play(app); break;
    case 'settings': await openSettings(app); break;
    case 'rename': {
      const n = await promptBox('Rename', app.name);
      if (n) { app.name = n; await store.put(app); renderLibrary(); }
      break;
    }
    case 'clear':
      if (await confirmBox(`Delete the saved data (records, high scores) of “${app.name}”?`, 'Clear data', true)) {
        toast(`Cleared ${clearAppData(app.id)} record store(s)`);
      }
      break;
    case 'delete':
      if (await confirmBox(`Delete “${app.name}” and its saved data?`, 'Delete', true)) {
        await store.delete(app.id);
        clearAppData(app.id);
        apps = apps.filter((a) => a.id !== app.id);
        renderLibrary();
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
    void play(installed);
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
  const r = await dialogResult($<HTMLDialogElement>('globalDialog'));
  if (r === 'save') { global.proxy = input.value.trim(); saveGlobal(); }
});

// ------------------------------------------------------------------ boot
const DEMO: AppEntry = {
  id: 'demo',
  name: 'J2ME4W Demo',
  vendor: 'j2me4w',
  version: '1.0',
  size: 0,
  icon: null,
  midlets: [],
  addedAt: 0,
  lastPlayed: 0,
  settings: { ...DEFAULT_SETTINGS },
  builtin: true,
};

async function boot() {
  try { $<HTMLSelectElement>('sort').value = localStorage.getItem('j2me4w:sort') ?? 'recent'; } catch { /* ignore */ }
  audio.setMuted(!!global.muted);
  try {
    apps = await store.list();
  } catch (e) {
    toast(`Storage unavailable: ${e}`, 5000);
    apps = [];
  }
  if (!apps.some((a) => a.id === 'demo')) {
    apps.push(DEMO);
    void store.put(DEMO).catch(() => {});
  }
  renderLibrary();
  history.replaceState({ view: 'library' }, '');
  void runtime().catch((e) => toast(String(e), 5000));
}

void boot();
