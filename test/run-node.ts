import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { VM } from '../src/vm/vm';
import { registerLangNatives } from '../src/vm/natives/lang';
import { Emulator, loadSuite } from '../src/emulator';
import { NullFontRenderer } from '../src/midp/fonts';
import { swapRB, type Surface } from '../src/midp/surface';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadJar(file: string): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(file)))));
}

function loadDir(dir: string, base = dir, acc = new Map<string, Uint8Array>()): Map<string, Uint8Array> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) loadDir(p, base, acc);
    else acc.set(path.relative(base, p).replace(/\\/g, '/'), new Uint8Array(fs.readFileSync(p)));
  }
  return acc;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(5);
  }
}

function runMain(boot: Map<string, Uint8Array>, app: Map<string, Uint8Array>, cls: string, timeoutMs = 30000): Promise<string[]> {
  const lines: string[] = [];
  const vm = new VM({ bootClasspath: boot, appClasspath: app, print: (s, l) => lines.push(s === 'err' ? '[err] ' + l : l) });
  registerLangNatives(vm);
  const args = vm.newArray('[Ljava/lang/String;', 0);
  vm.startStatic(cls, 'main([Ljava/lang/String;)V', [args]);
  const start = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (vm.threads.size === 0 || vm.halted || Date.now() - start > timeoutMs) {
        clearInterval(iv);
        if (vm.threads.size) lines.push(`[timeout] ${vm.threads.size} thread(s) still alive`);
        vm.exit(0);
        resolve(lines);
      }
    }, 5);
  });
}

async function coreTests(boot: Map<string, Uint8Array>): Promise<number> {
  const app = loadDir(path.join(root, 'test', 'out', 'vm'));
  const expectedDir = path.join(root, 'test', 'out', 'expected');
  let failed = 0;
  for (const f of fs.readdirSync(expectedDir)) {
    const name = path.basename(f, '.txt');
    const expected = fs.readFileSync(path.join(expectedDir, f), 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
    const t0 = Date.now();
    const actual = await runMain(boot, app, name);
    const ms = Date.now() - t0;
    const n = Math.max(expected.length, actual.length);
    const diffs: string[] = [];
    for (let i = 0; i < n; i++) {
      if (expected[i] !== actual[i]) diffs.push(`  line ${i + 1}\n    expected: ${expected[i]}\n    actual:   ${actual[i]}`);
    }
    if (diffs.length) {
      failed++;
      console.log(`FAIL ${name} (${ms} ms)\n${diffs.slice(0, 15).join('\n')}${diffs.length > 15 ? `\n  ... ${diffs.length - 15} more` : ''}`);
    } else {
      console.log(`ok   ${name} (${expected.length} lines, ${ms} ms)`);
    }
  }
  return failed;
}

async function probeTest(boot: Map<string, Uint8Array>): Promise<number> {
  const suite = loadSuite(new Uint8Array(fs.readFileSync(path.join(root, 'test', 'out', 'probe.jar'))));
  const lines: string[] = [];
  let frame: Surface | null = null;
  let labels: [string | null, string | null] = [null, null];
  const emu = new Emulator({
    bootClasspath: boot,
    suite,
    width: 240,
    height: 320,
    fonts: new NullFontRenderer(),
    host: {
      present: (s) => { frame = s.clone(); },
      setSoftLabels: (l, r) => { labels = [l, r]; },
    },
    print: (s, l) => lines.push(s === 'err' ? '[err] ' + l : l),
  });
  let exited = false;
  emu.onExit(() => { exited = true; });
  const p = emu.platform;
  const has = (l: string) => lines.includes(l);
  const failures: string[] = [];
  const expect = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

  try {
    emu.start();
    await waitFor(() => has('first frame'), 'first frame');
    const px = (x: number, y: number) => swapRB(frame!.px[y * 240 + x]) & 0xffffff;
    expect(px(0, 100) === 0x000080, `background pixel ${px(0, 100).toString(16)}`);
    expect(px(25, 35) === 0xffffff, `square pixel ${px(25, 35).toString(16)}`);

    p.keyDown(-4);
    await sleep(150);
    p.keyUp(-4);
    await waitFor(() => has('keyReleased -4'), 'keyReleased');
    p.keyDown(48);
    p.keyUp(48);
    await waitFor(() => has('menu shown') && lines.some((l) => l.startsWith('loop ended')), 'menu');
    await waitFor(() => labels[1] === 'Exit', 'soft labels');
    p.keyDown(-2); p.keyUp(-2);
    p.keyDown(-5); p.keyUp(-5);
    await waitFor(() => has('selected Beta'), 'list selection');
    p.keyDown(-7); p.keyUp(-7);
    await waitFor(() => exited, 'exit');
  } catch (e) {
    failures.push(String(e));
  }
  emu.stop();

  const rgba: string[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    const v = (((x * 80) << 24) | ((x * 60) << 16) | ((y * 100) << 8) | ((x + y * 4) * 10)) >>> 0;
    rgba.push(v.toString(16).padStart(8, '0'));
  }
  const want = [
    'startApp Probe 42',
    'rms ids=1,2 records=2 enum=1,2, rec=world! size=3',
    'rms deleted ok',
    'rms reopen 1 next=3 stores=1',
    'rms notfound ok',
    `rgba 4x3 false ${rgba.join(' ')} `,
    'pal ffff0000 ff00ff00 800000ff 000a141e 800000ff ff00ff00 ',
    'gray ff000000 ff3c3c3c ff787878 ffb4b4b4 fff0f0f0 ',
    'mutable true ....gg.aa.gg.aa...rrrrrr clip=-4,0,6,4',
    'transforms 3x2:123456 2x3:415263 3x2:654321 2x3:362514 3x2:321654 2x3:635241 3x2:456123 2x3:142536 ',
    'font true true true true',
    'sprite frames=2 pos=9,9 size=3x2 ref=10,10',
    'collide true',
    'canvas 240x320',
    'showNotify',
    'first frame',
    'keyPressed -4 action 5',
    'keyStates 32',
    'keyReleased -4',
    'keyPressed 48 action 0',
    'menu shown',
    'hideNotify',
    'loop ended x>20=true',
    'selected Beta',
    'exit',
  ];
  for (const w of want) expect(has(w), `missing line: ${w}`);
  expect(!lines.some((l) => l.startsWith('[err]') || l.startsWith('FAILED')), 'unexpected error output');

  if (failures.length) {
    console.log(`FAIL ProbeMIDlet\n  ${failures.join('\n  ')}\n  --- output ---\n  ${lines.join('\n  ')}`);
    return 1;
  }
  console.log(`ok   ProbeMIDlet (${want.length} checks)`);
  return 0;
}

async function main() {
  const boot = loadJar(path.join(root, 'public', 'rt.jar'));
  let failed = await coreTests(boot);
  failed += await probeTest(boot);
  process.exit(failed ? 1 : 0);
}

main();
