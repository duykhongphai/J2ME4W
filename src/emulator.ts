// High-level entry point: loads a MIDlet suite and runs it on the VM. Host-agnostic.
import { unzipSync } from 'fflate';
import { VM } from './vm/vm';
import { registerLangNatives } from './vm/natives/lang';
import { registerMidpNatives } from './midp/natives';
import { registerNetNatives } from './midp/net';
import { Platform, type PlatformHost, type RecordStorage } from './midp/platform';
import type { FontRenderer } from './midp/surface';

export interface MIDletInfo { name: string; icon: string; className: string }

export interface Suite {
  files: Map<string, Uint8Array>;
  /** Manifest attributes, overridden by JAD attributes. */
  properties: Record<string, string>;
  midlets: MIDletInfo[];
  name: string;
}

export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)));
}

/** Parses MANIFEST.MF / JAD "Key: value" attributes (with continuation lines). */
export function parseAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let last: string | null = null;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n|\r/)) {
    if (raw.startsWith(' ') && last) { out[last] += raw.slice(1); continue; }
    const i = raw.indexOf(':');
    if (i <= 0) continue;
    last = raw.slice(0, i).trim();
    out[last] = raw.slice(i + 1).trim();
  }
  return out;
}

export function loadSuite(jar: Uint8Array, jad?: string): Suite {
  const files = unzip(jar);
  let manifestText = '';
  for (const [k, v] of files) {
    if (k.toUpperCase() === 'META-INF/MANIFEST.MF') manifestText = new TextDecoder().decode(v);
  }
  const properties = { ...parseAttributes(manifestText), ...(jad ? parseAttributes(jad) : {}) };
  const midlets: MIDletInfo[] = [];
  for (let i = 1; properties[`MIDlet-${i}`]; i++) {
    const parts = properties[`MIDlet-${i}`].split(',').map((s) => s.trim());
    if (parts.length >= 3 && parts[2]) midlets.push({ name: parts[0], icon: parts[1], className: parts[2] });
  }
  if (midlets.length === 0) {
    // No MIDlet-1 attribute: guess a class extending MIDlet is not possible without parsing; look for common names.
    for (const k of files.keys()) {
      const m = /^([^/]*)\.class$/.exec(k);
      if (m && /midlet|main|game/i.test(m[1])) { midlets.push({ name: m[1], icon: '', className: m[1] }); break; }
    }
  }
  return { files, properties, midlets, name: properties['MIDlet-Name'] ?? midlets[0]?.name ?? 'MIDlet' };
}

export interface EmulatorOptions {
  bootClasspath: Map<string, Uint8Array>;
  suite: Suite;
  midletIndex?: number;
  width: number;
  height: number;
  fonts: FontRenderer;
  host: PlatformHost;
  storage?: RecordStorage;
  print?: (stream: 'out' | 'err', line: string) => void;
  systemProperties?: Record<string, string>;
}

export class Emulator {
  readonly vm: VM;
  readonly platform: Platform;
  readonly midlet: MIDletInfo;

  constructor(opts: EmulatorOptions) {
    const midlet = opts.suite.midlets[opts.midletIndex ?? 0];
    if (!midlet) throw new Error('No MIDlet found in this JAR (missing MIDlet-1 attribute)');
    this.midlet = midlet;
    this.vm = new VM({ bootClasspath: opts.bootClasspath, appClasspath: opts.suite.files, print: opts.print });
    registerLangNatives(this.vm);
    this.platform = new Platform(this.vm, {
      width: opts.width,
      height: opts.height,
      fonts: opts.fonts,
      host: opts.host,
      storage: opts.storage,
      appProperties: opts.suite.properties,
      systemProperties: {
        'microedition.platform': 'j2me4w',
        ...opts.systemProperties,
      },
    });
    registerMidpNatives(this.vm, this.platform);
    registerNetNatives(this.vm, this.platform);
  }

  start(): void {
    this.vm.startStatic('j2me4w/Launcher', 'main(Ljava/lang/String;)V', [this.vm.str(this.midlet.className)], 'main');
  }

  stop(): void { this.vm.exit(0, 'stopped'); }

  onExit(fn: (code: number, reason?: string) => void): void { this.vm.exitListeners.push(fn); }
}
