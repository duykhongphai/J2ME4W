// Browser host: screen, keypad, keyboard/pointer input, storage, audio and file loading.
import './style.css';
import { Emulator, loadSuite, unzip, type Suite } from '../emulator';
import { CanvasFontRenderer, defaultFontSizes } from '../midp/fonts';
import type { RecordStorage } from '../midp/platform';
import { Surface } from '../midp/surface';
import { WebAudioHost } from './audio';
import { ProxyNetHost } from './net';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen');
const ctx = canvas.getContext('2d')!;
const overlay = $<HTMLDivElement>('overlay');
const softLeft = $<HTMLSpanElement>('softLeft');
const softRight = $<HTMLSpanElement>('softRight');
const logEl = $<HTMLPreElement>('log');
const logCount = $<HTMLSpanElement>('logCount');
const appName = $<HTMLHeadingElement>('appName');
const appInfo = $<HTMLParagraphElement>('appInfo');
const sizeSel = $<HTMLSelectElement>('size');
const zoomSel = $<HTMLSelectElement>('zoom');
const crispBox = $<HTMLInputElement>('crisp');
const midletField = $<HTMLLabelElement>('midletField');
const midletSelect = $<HTMLSelectElement>('midletSelect');
const restartBtn = $<HTMLButtonElement>('restart');
const muteBtn = $<HTMLButtonElement>('mute');
const proxyInput = $<HTMLInputElement>('proxy');

const audio = new WebAudioHost();
const netHost = new ProxyNetHost(() => proxyInput.value.trim(), (m) => log(m));
let rt: Map<string, Uint8Array> | null = null;
let emu: Emulator | null = null;
let suite: Suite | null = null;
let imageData: ImageData | null = null;
let errors = 0;

// ------------------------------------------------------------------ settings
const SETTINGS_KEY = 'j2me4w:settings';
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (s.size) sizeSel.value = s.size;
    if (s.zoom) zoomSel.value = s.zoom;
    crispBox.checked = !!s.crisp;
    if (typeof s.proxy === 'string') proxyInput.value = s.proxy;
    if (s.muted) setMuted(true);
  } catch { /* ignore */ }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      size: sizeSel.value, zoom: zoomSel.value, crisp: crispBox.checked, muted: audio.muted, proxy: proxyInput.value.trim(),
    }));
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ console
function log(line: string, err = false) {
  const span = document.createElement('span');
  if (err) { span.className = 'err'; errors++; logCount.textContent = String(errors); logCount.hidden = false; }
  span.textContent = line + '\n';
  logEl.appendChild(span);
  while (logEl.childNodes.length > 800) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
  (err ? console.warn : console.log)(line);
}

// ------------------------------------------------------------------ screen
function screenSize(): [number, number] {
  const [w, h] = sizeSel.value.split('x').map(Number);
  return [w, h];
}

let lastFrame: Surface | null = null;

function applyZoom() {
  const [w, h] = emu ? [emu.platform.width, emu.platform.height] : screenSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    imageData = ctx.createImageData(w, h);
    if (lastFrame && lastFrame.w === w && lastFrame.h === h) present(lastFrame);
  }
  let z: number;
  if (zoomSel.value === 'auto') {
    const maxW = Math.min(window.innerWidth - 64, 720);
    const maxH = window.innerHeight - 360;
    z = Math.max(1, Math.min(maxW / w, maxH / h));
    z = z >= 2 ? Math.floor(z) : Math.max(1, Math.floor(z * 2) / 2);
  } else {
    z = Number(zoomSel.value);
  }
  canvas.style.width = `${w * z}px`;
  canvas.style.height = `${h * z}px`;
  const device = canvas.closest('.device') as HTMLElement;
  device.style.width = `${Math.max(w * z + 44, 260)}px`;
}

function present(s: Surface) {
  lastFrame = s;
  if (!imageData || imageData.width !== s.w || imageData.height !== s.h) imageData = ctx.createImageData(s.w, s.h);
  new Uint32Array(imageData.data.buffer).set(s.px);
  ctx.putImageData(imageData, 0, 0);
}

function clearScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function showOverlay(title: string, sub = '') {
  overlay.hidden = false;
  overlay.querySelector('.overlay-title')!.textContent = title;
  overlay.querySelector('.overlay-sub')!.innerHTML = sub;
}

// ------------------------------------------------------------------ host services
class LocalRecordStorage implements RecordStorage {
  constructor(private prefix: string) {}
  get(n: string) {
    try {
      const v = localStorage.getItem(this.prefix + n);
      if (v == null) return null;
      const bin = atob(v);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  set(n: string, d: Uint8Array) {
    try {
      let bin = '';
      for (let i = 0; i < d.length; i += 4096) bin += String.fromCharCode.apply(null, Array.from(d.subarray(i, i + 4096)));
      localStorage.setItem(this.prefix + n, btoa(bin));
      return true;
    } catch {
      return false;
    }
  }
  delete(n: string) {
    const had = localStorage.getItem(this.prefix + n) != null;
    localStorage.removeItem(this.prefix + n);
    return had;
  }
  list() {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
    }
    return out;
  }
}

async function decodeImage(bytes: Uint8Array): Promise<Surface | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer]));
    const c = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bmp.width, bmp.height)
      : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    const cx = (c as HTMLCanvasElement).getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, bmp.width, bmp.height);
    const s = new Surface(bmp.width, bmp.height, 0);
    s.px.set(new Uint32Array(d.data.buffer));
    return s;
  } catch {
    return null;
  }
}

const textDialog = $<HTMLDialogElement>('textDialog');
const textInput = $<HTMLTextAreaElement>('textInput');
function editText(title: string | null, text: string, maxSize: number, constraints: number): Promise<string | null> {
  return new Promise((resolve) => {
    $<HTMLLabelElement>('textTitle').textContent = title || 'Enter text';
    textInput.value = text;
    textInput.maxLength = maxSize;
    const kind = constraints & 0xffff;
    textInput.inputMode = kind === 2 ? 'numeric' : kind === 5 ? 'decimal' : kind === 3 ? 'tel' : kind === 1 ? 'email' : 'text';
    textDialog.returnValue = '';
    const done = () => {
      textDialog.removeEventListener('close', done);
      resolve(textDialog.returnValue === 'ok' ? textInput.value : null);
      canvas.focus();
    };
    textDialog.addEventListener('close', done);
    textDialog.showModal();
    textInput.focus();
    textInput.select();
  });
}

// ------------------------------------------------------------------ lifecycle
async function getRuntime(): Promise<Map<string, Uint8Array>> {
  if (!rt) {
    const res = await fetch(new URL('rt.jar', document.baseURI));
    if (!res.ok) throw new Error(`Cannot load rt.jar (${res.status})`);
    rt = unzip(new Uint8Array(await res.arrayBuffer()));
  }
  return rt;
}

function stop() {
  lastFrame = null;
  if (emu) {
    emu.stop();
    emu = null;
  }
  audio.closeAll();
}

async function start(s: Suite, midletIndex = 0) {
  stop();
  suite = s;
  const boot = await getRuntime();
  applyZoom();
  clearScreen();
  overlay.hidden = true;
  softLeft.textContent = '';
  softRight.textContent = '';
  const [w, h] = screenSize();
  const m = s.midlets[midletIndex];
  appName.textContent = s.name;
  appInfo.textContent = [s.properties['MIDlet-Vendor'], s.properties['MIDlet-Version'] && 'v' + s.properties['MIDlet-Version'], m?.className]
    .filter(Boolean).join(' · ');
  midletField.hidden = s.midlets.length < 2;
  midletSelect.innerHTML = '';
  s.midlets.forEach((x, i) => midletSelect.add(new Option(x.name, String(i), i === midletIndex, i === midletIndex)));
  restartBtn.disabled = false;
  document.title = `${s.name} · J2ME4W`;

  const e = new Emulator({
    bootClasspath: boot,
    suite: s,
    midletIndex,
    width: w,
    height: h,
    fonts: new CanvasFontRenderer(defaultFontSizes(w), undefined, undefined, crispBox.checked),
    storage: new LocalRecordStorage(`j2me4w:rms:${s.name}:`),
    print: (stream, line) => log(line, stream === 'err'),
    host: {
      present,
      setSoftLabels: (l, r) => { softLeft.textContent = l ?? ''; softRight.textContent = r ?? ''; },
      vibrate: (ms) => { try { navigator.vibrate?.(Math.min(ms, 1000)); } catch { /* ignore */ } },
      editText,
      openUrl: (url) => { if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener'); },
      onFatal: (msg) => showOverlay('MIDlet failed to start', escapeHtml(msg)),
      decodeImage,
      audio,
      net: netHost,
    },
  });
  e.onExit((_code, reason) => {
    if (emu !== e) return;
    audio.closeAll();
    if (!overlay.hidden) return;
    showOverlay(reason === 'MIDlet exited' ? 'MIDlet exited' : 'Stopped', 'Press <b>Restart</b> to run it again');
  });
  emu = e;
  log(`— starting ${m?.className ?? '?'} (${w}×${h})`);
  try {
    e.start();
  } catch (err) {
    showOverlay('Cannot start MIDlet', escapeHtml(String(err)));
    log(String(err), true);
  }
  canvas.focus();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

async function openFiles(files: FileList | File[]) {
  const list = Array.from(files);
  const jarFile = list.find((f) => /\.jar$/i.test(f.name)) ?? list.find((f) => !/\.jad$/i.test(f.name));
  const jadFile = list.find((f) => /\.jad$/i.test(f.name));
  if (!jarFile) {
    showOverlay('A .jad alone is not enough', 'Select the .jar file too (you can pick both at once)');
    return;
  }
  try {
    const jar = new Uint8Array(await jarFile.arrayBuffer());
    const jad = jadFile ? await jadFile.text() : undefined;
    const s = loadSuite(jar, jad);
    if (!s.midlets.length) throw new Error('No MIDlet-1 entry found in the manifest');
    if (s.name === 'MIDlet') s.name = jarFile.name.replace(/\.jar$/i, '');
    await start(s);
  } catch (err) {
    showOverlay('Cannot open this file', escapeHtml(String(err instanceof Error ? err.message : err)));
    log(String(err), true);
  }
}

async function runDemo() {
  try {
    const res = await fetch(new URL('demo.jar', document.baseURI));
    if (!res.ok) throw new Error(`demo.jar not found (${res.status})`);
    await start(loadSuite(new Uint8Array(await res.arrayBuffer())));
  } catch (err) {
    showOverlay('Cannot load the demo', escapeHtml(String(err)));
  }
}

// ------------------------------------------------------------------ input
const KEYMAP: Record<string, number> = {
  ArrowUp: -1, ArrowDown: -2, ArrowLeft: -3, ArrowRight: -4,
  Enter: -5, NumpadEnter: -5, Space: -5,
  KeyQ: -6, F1: -6, BracketLeft: -6,
  KeyW: -7, F2: -7, BracketRight: -7, Escape: -7,
  Backspace: -8, Delete: -8,
  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
  Numpad0: 48, Numpad1: 49, Numpad2: 50, Numpad3: 51, Numpad4: 52, Numpad5: 53, Numpad6: 54, Numpad7: 55, Numpad8: 56, Numpad9: 57,
  NumpadMultiply: 42, NumpadDivide: 35,
};

function keyCodeFor(e: KeyboardEvent): number | undefined {
  if (e.key === '*') return 42;
  if (e.key === '#') return 35;
  return KEYMAP[e.code];
}

function keypadButton(code: number) {
  return document.querySelector<HTMLButtonElement>(`.k[data-key="${code}"]`);
}

window.addEventListener('keydown', (e) => {
  if (textDialog.open) return;
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  const code = keyCodeFor(e);
  if (code === undefined || !emu || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  audio.unlock();
  emu.platform.keyDown(code);
  keypadButton(code)?.classList.add('active');
});
window.addEventListener('keyup', (e) => {
  const code = keyCodeFor(e);
  if (code === undefined || !emu) return;
  emu.platform.keyUp(code);
  keypadButton(code)?.classList.remove('active');
});
window.addEventListener('blur', () => emu?.platform.releaseAllKeys());

for (const btn of document.querySelectorAll<HTMLButtonElement>('.k[data-key]')) {
  const code = Number(btn.dataset.key);
  let delay: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  const down = (ev: PointerEvent) => {
    ev.preventDefault();
    btn.setPointerCapture(ev.pointerId);
    audio.unlock();
    emu?.platform.keyDown(code);
    btn.classList.add('active');
    // held key: the platform turns repeated keyDowns into keyRepeated events
    delay = setTimeout(() => { repeat = setInterval(() => emu?.platform.keyDown(code), 90); }, 400);
  };
  const up = () => {
    if (delay) { clearTimeout(delay); delay = null; }
    if (repeat) { clearInterval(repeat); repeat = null; }
    if (!btn.classList.contains('active')) return;
    btn.classList.remove('active');
    emu?.platform.keyUp(code);
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function canvasPoint(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
}
let pointerDown = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!emu) return;
  audio.unlock();
  pointerDown = true;
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = canvasPoint(e);
  emu.platform.pointer('down', x, y);
});
canvas.addEventListener('pointermove', (e) => {
  if (!emu || !pointerDown) return;
  const [x, y] = canvasPoint(e);
  emu.platform.pointer('move', x, y);
});
const pointerUp = (e: PointerEvent) => {
  if (!emu || !pointerDown) return;
  pointerDown = false;
  const [x, y] = canvasPoint(e);
  emu.platform.pointer('up', x, y);
};
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);

// drag & drop
const wrap = $<HTMLDivElement>('screenWrap');
for (const target of [document.body]) {
  target.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('dragging'); });
  target.addEventListener('dragleave', () => wrap.classList.remove('dragging'));
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('dragging');
    if (e.dataTransfer?.files.length) void openFiles(e.dataTransfer.files);
  });
}

// ------------------------------------------------------------------ controls
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void openFiles(input.files);
  input.value = '';
});
$<HTMLButtonElement>('demo').addEventListener('click', () => { audio.unlock(); void runDemo(); });
restartBtn.addEventListener('click', () => { if (suite) void start(suite, Number(midletSelect.value) || 0); });
midletSelect.addEventListener('change', () => { if (suite) void start(suite, Number(midletSelect.value)); });

function setMuted(m: boolean) {
  audio.setMuted(m);
  muteBtn.setAttribute('aria-pressed', String(m));
  muteBtn.textContent = m ? 'Muted' : 'Sound on';
}
muteBtn.addEventListener('click', () => { setMuted(!audio.muted); saveSettings(); });
proxyInput.addEventListener('change', saveSettings);

for (const el of [sizeSel, crispBox]) {
  el.addEventListener('change', () => {
    saveSettings();
    if (suite) void start(suite, Number(midletSelect.value) || 0);
    else applyZoom();
  });
}
zoomSel.addEventListener('change', () => { saveSettings(); applyZoom(); });
window.addEventListener('resize', () => { if (zoomSel.value === 'auto') applyZoom(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) emu?.platform.releaseAllKeys();
});

loadSettings();
applyZoom();
clearScreen();
void getRuntime().catch((e) => log(String(e), true));
