// Installed MIDlet library: metadata + per-app settings + JAR bytes in IndexedDB.
import type { MIDletInfo } from '../emulator';

export type ScaleMode = 'fit' | 'integer' | 'fill' | 'native';
export type KeypadMode = 'auto' | 'show' | 'hide';
export type KeypadType = 'phone' | 'gamepad';
export type Orientation = 'auto' | 'portrait' | 'landscape';

export interface AppSettings {
  width: number;
  height: number;
  scale: ScaleMode;
  filter: boolean;
  background: string;
  showFps: boolean;
  orientation: Orientation;
  /** Font pixel sizes; 0 = automatic for the screen size. */
  fontSmall: number;
  fontMedium: number;
  fontLarge: number;
  fontAA: boolean;
  keypad: KeypadMode;
  keypadType: KeypadType;
  keypadOpacity: number;
  haptics: boolean;
  pauseWhenHidden: boolean;
  /** "key: value" lines, e.g. "microedition.platform: Nokia6300". */
  sysProps: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  width: 240,
  height: 320,
  scale: 'fit',
  filter: false,
  background: '#000000',
  showFps: false,
  orientation: 'auto',
  fontSmall: 0,
  fontMedium: 0,
  fontLarge: 0,
  fontAA: true,
  keypad: 'auto',
  keypadType: 'phone',
  keypadOpacity: 0.55,
  haptics: true,
  pauseWhenHidden: true,
  sysProps: '',
};

export interface AppEntry {
  id: string;
  name: string;
  vendor: string;
  version: string;
  size: number;
  /** data: URL of the MIDlet icon, if any. */
  icon: string | null;
  midlets: MIDletInfo[];
  addedAt: number;
  lastPlayed: number;
  settings: AppSettings;
  /** Bundled with the site (not stored in IndexedDB, cannot be deleted). */
  builtin?: boolean;
}

export interface StoredJar { jar: Uint8Array; jad?: string }

const DB_NAME = 'j2me4w';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class AppStore {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('apps')) db.createObjectStore('apps', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('jars')) db.createObjectStore('jars');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private async tx(stores: string[], mode: IDBTransactionMode) {
    return (await this.db).transaction(stores, mode);
  }

  async list(): Promise<AppEntry[]> {
    const t = await this.tx(['apps'], 'readonly');
    const all = await req(t.objectStore('apps').getAll() as IDBRequest<AppEntry[]>);
    return all.map((a) => ({ ...a, settings: { ...DEFAULT_SETTINGS, ...a.settings } }));
  }

  async put(entry: AppEntry): Promise<void> {
    const t = await this.tx(['apps'], 'readwrite');
    await req(t.objectStore('apps').put(entry));
  }

  async putWithJar(entry: AppEntry, jar: StoredJar): Promise<void> {
    const t = await this.tx(['apps', 'jars'], 'readwrite');
    t.objectStore('apps').put(entry);
    t.objectStore('jars').put(jar, entry.id);
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('storage aborted (quota?)'));
    });
  }

  async getJar(id: string): Promise<StoredJar | null> {
    const t = await this.tx(['jars'], 'readonly');
    return (await req(t.objectStore('jars').get(id) as IDBRequest<StoredJar | undefined>)) ?? null;
  }

  async delete(id: string): Promise<void> {
    const t = await this.tx(['apps', 'jars'], 'readwrite');
    t.objectStore('apps').delete(id);
    t.objectStore('jars').delete(id);
    await new Promise<void>((resolve) => { t.oncomplete = () => resolve(); });
  }
}

/** localStorage prefix holding an app's RecordStores. */
export const rmsPrefix = (id: string) => `j2me4w:rms:${id}:`;

export function clearAppData(id: string): number {
  const prefix = rmsPrefix(id);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  return keys.length;
}

export function parseSysProps(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
