// Debug tool: runs a MIDlet JAR headlessly, prints its console, optionally presses keys and saves a
// screenshot.  Usage: npx tsx test/run-jar.ts <file.jar> [seconds=5] [out.png] [keys...]
// keys: "<ms>:<keycode>" e.g. 2000:-5 presses FIRE two seconds after start.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zlibSync } from 'fflate';
import { Emulator, loadSuite } from '../src/emulator';
import { NullFontRenderer } from '../src/midp/fonts';
import type { Surface } from '../src/midp/surface';
import { NodeNetHost } from './node-net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [jarPath, secs = '5', outPng, ...keys] = process.argv.slice(2);
if (!jarPath) {
  console.error('usage: npx tsx test/run-jar.ts <file.jar> [seconds] [out.png] [ms:keycode ...]');
  process.exit(2);
}

const boot = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(path.join(root, 'public', 'rt.jar'))))));
const suite = loadSuite(new Uint8Array(fs.readFileSync(jarPath)));
console.log(`[run-jar] ${suite.name}: ${suite.midlets.map((m) => m.className).join(', ')}`);
let frame: Surface | null = null;
let frames = 0;
const emu = new Emulator({
  bootClasspath: boot,
  suite,
  width: 240,
  height: 320,
  fonts: new NullFontRenderer(),
  host: {
    present: (s) => { frame = s.clone(); frames++; },
    setSoftLabels: (l, r) => console.log(`[soft] ${l} | ${r}`),
    editText: async (_t, text) => text,
    net: new NodeNetHost((m) => console.log(m)),
  },
  print: (s, l) => (s === 'err' ? console.error : console.log)(l),
});
emu.onExit((code, reason) => console.log(`[run-jar] exit ${code} ${reason ?? ''}`));
emu.start();
for (const k of keys) {
  // "<ms>:<keycode>" or "<ms>:tap:<x>,<y>"
  const parts = k.split(':');
  const ms = Number(parts[0]);
  if (parts[1] === 'tap') {
    const [x, y] = parts[2].split(',').map(Number);
    setTimeout(() => { emu.platform.pointer('down', x, y); setTimeout(() => emu.platform.pointer('up', x, y), 80); }, ms);
  } else {
    const code = Number(parts[1]);
    setTimeout(() => { emu.platform.keyDown(code); setTimeout(() => emu.platform.keyUp(code), 80); }, ms);
  }
}
setTimeout(() => {
  console.log(`[run-jar] ${frames} frames, ${emu.vm.threads.size} threads alive`);
  if (outPng && frame) fs.writeFileSync(outPng, encodePng(frame));
  emu.stop();
  process.exit(0);
}, Number(secs) * 1000);

function encodePng(s: Surface): Uint8Array {
  const raw = new Uint8Array((s.w * 4 + 1) * s.h);
  const px = new Uint8Array(s.px.buffer);
  for (let y = 0; y < s.h; y++) raw.set(px.subarray(y * s.w * 4, (y + 1) * s.w * 4), y * (s.w * 4 + 1) + 1);
  const chunks: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    chunks.push(out);
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, s.w); dv.setUint32(4, s.h);
  ihdr[8] = 8; ihdr[9] = 6;
  chunk('IHDR', ihdr);
  chunk('IDAT', zlibSync(raw));
  chunk('IEND', new Uint8Array(0));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function crc32(b: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
